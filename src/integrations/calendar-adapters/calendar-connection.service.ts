import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@app/common/services/prisma.service';
import { GoogleCalendarAdapter } from './google-calendar.adapter';
import { OutlookCalendarAdapter } from './outlook-calendar.adapter';
import { LocalCalendarAdapter } from './local-calendar.adapter';
import { CalendarAdapter } from './calendar-adapter.interface';
import { OAuthTokenCryptoService } from './oauth-token-crypto.service';
import { PkceService } from './pkce.service';

export interface CalendarConnectionData {
  provider: string;
  externalUserId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes: string[];
}

/**
 * Calendar rows shipped inside a public connection. `syncToken` is a provider
 * delta-sync cursor (it embeds the provider's own sync state for this
 * connection) and `connectionId` is internal wiring, so both are excluded.
 * The previous `calendars: true` returned every column, leaking `syncToken`
 * on GET /api/calendar/connections — closed by Stage 4i.
 */
const PUBLIC_CALENDAR_SELECT = {
  id: true,
  userId: true,
  name: true,
  description: true,
  color: true,
  timezone: true,
  isVisible: true,
  isPrimary: true,
  provider: true,
  externalId: true,
  lastSynced: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Public connection shape. OAuth material (accessToken, refreshToken,
 * syncToken) never leaves the server: the client only needs to know which
 * provider is connected, its scopes, and sync health. `tokenExpiresAt` is kept
 * because the UI needs it to show "needs reconnection" and it is not a secret.
 */
const PUBLIC_CONNECTION_SELECT = {
  id: true,
  userId: true,
  provider: true,
  externalUserId: true,
  scopes: true,
  isActive: true,
  lastSync: true,
  syncError: true,
  createdAt: true,
  updatedAt: true,
  tokenExpiresAt: true,
  calendars: { select: PUBLIC_CALENDAR_SELECT },
} as const;

@Injectable()
export class CalendarConnectionService {
  private readonly logger = new Logger(CalendarConnectionService.name);
  private readonly adapters: Map<string, CalendarAdapter> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAdapter: GoogleCalendarAdapter,
    private readonly outlookAdapter: OutlookCalendarAdapter,
    private readonly localAdapter: LocalCalendarAdapter,
    private readonly jwt: JwtService,
    // C2: this service is the single repository layer for the accessToken /
    // refreshToken columns. Everything persisted here is encrypted, everything
    // read back out is decrypted, so no other code ever sees raw ciphertext
    // and no other code may touch those columns.
    private readonly tokenCrypto: OAuthTokenCryptoService,
    // C7: PKCE store for the Google calendar flow. Optional so existing specs
    // keep constructing the service; when absent, Google auth is refused
    // rather than run without PKCE (see getAuthUrl/handleCallback guards).
    private readonly pkce?: PkceService
  ) {
    this.adapters.set('GOOGLE', this.googleAdapter);
    this.adapters.set('OUTLOOK', this.outlookAdapter);
    this.adapters.set('LOCAL', this.localAdapter);
  }

  getAdapter(provider: string): CalendarAdapter | undefined {
    return this.adapters.get(provider.toUpperCase());
  }

  /**
   * Signed, short-lived CSRF state for the OAuth round trip.
   *
   * The browser returns to a GET callback that is not JWT-authenticated, so the
   * user id has to travel with the request. Signing it (rather than passing it
   * raw) means the callback cannot be used to attach someone else's calendar.
   */
  createOAuthState(userId: string, provider: string): string {
    return this.jwt.sign(
      { sub: userId, calProvider: provider.toUpperCase(), purpose: 'calendar_oauth' },
      { expiresIn: '10m' },
    );
  }

  verifyOAuthState(state: string): { userId: string; provider: string } {
    let payload: any;
    try {
      payload = this.jwt.verify(state);
    } catch {
      throw new UnauthorizedException('Invalid or expired calendar OAuth state');
    }
    if (payload?.purpose !== 'calendar_oauth' || !payload?.sub) {
      throw new UnauthorizedException('Invalid calendar OAuth state');
    }
    return { userId: payload.sub, provider: String(payload.calProvider ?? '') };
  }

  /**
   * Builds the provider authorization URL.
   *
   * C1: `prompt=consent` (which is what makes Google reissue a refresh token)
   * is only requested when we have no stored refresh token for this user —
   * i.e. first connect or a re-auth after the token was lost. Otherwise the
   * user would see the full consent screen on every reconnect.
   */
  async getAuthUrl(userId: string, provider: string, state?: string): Promise<string> {
    const adapter = this.getAdapter(provider);
    if (!adapter) {
      throw new Error(`Unsupported calendar provider: ${provider}`);
    }
    const existing = await this.getConnection(userId, provider);
    const requestConsentPrompt = !existing?.refreshToken;
    const oauthState = state || this.createOAuthState(userId, provider);

    // C7: PKCE for the Google flow. The verifier is minted and stored here
    // (server-side, single-use, 10-minute TTL) and only the S256 challenge
    // goes into the URL. Fail-closed: if the store is unavailable we do not
    // start an auth that cannot be completed safely.
    let pkce: { challenge: string; method: 'S256' } | null = null;
    if (provider.toUpperCase() === 'GOOGLE') {
      if (!this.pkce) {
        throw new BadRequestException(
          'Google calendar sign-in is unavailable: PKCE store is not configured.'
        );
      }
      const challenge = await this.pkce.create(oauthState, userId, provider);
      pkce = { challenge: challenge.challenge, method: 'S256' };
    }

    return adapter.getAuthUrl(userId, oauthState, {
      requestConsentPrompt,
      ...(pkce ? { codeChallenge: pkce.challenge, codeChallengeMethod: pkce.method } : {}),
    });
  }

  async handleCallback(userId: string, provider: string, code: string, state?: string): Promise<void> {
    const adapter = this.getAdapter(provider);
    if (!adapter) {
      throw new Error(`Unsupported calendar provider: ${provider}`);
    }

    // C7: redeem the single-use verifier for Google callbacks. Missing/expired/
    // reused state is rejected here before any token exchange happens.
    let codeVerifier: string | undefined;
    if (provider.toUpperCase() === 'GOOGLE') {
      if (!state || !this.pkce) {
        throw new BadRequestException(
          'Calendar sign-in is missing its security state. Please start the connection again.'
        );
      }
      codeVerifier = await this.pkce.consume(state);
    }

    const tokenData = await adapter.handleCallback(code, codeVerifier);

    await this.prisma.calendarConnection.upsert({
      where: {
        userId_provider: {
          userId,
          provider: provider.toUpperCase() as any,
        },
      },
      update: {
        externalUserId: tokenData.externalUserId,
        // C2: only ciphertext ever reaches the database.
        accessToken: this.tokenCrypto.encrypt(tokenData.accessToken),
        refreshToken: this.tokenCrypto.encrypt(tokenData.refreshToken),
        tokenExpiresAt: tokenData.expiresAt,
        // C1: store what the provider actually granted (validated in the
        // adapter), not what we asked for, so scope checks are truthful.
        scopes: tokenData.scopes,
        isActive: true,
        syncError: null,
        lastSync: new Date(),
      },
      create: {
        userId,
        provider: provider.toUpperCase() as any,
        externalUserId: tokenData.externalUserId,
        accessToken: this.tokenCrypto.encrypt(tokenData.accessToken),
        refreshToken: this.tokenCrypto.encrypt(tokenData.refreshToken),
        tokenExpiresAt: tokenData.expiresAt,
        scopes: tokenData.scopes,
        isActive: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CALENDAR_CONNECTED',
        entityType: 'CalendarConnection',
        details: `Connected ${adapter.providerName} calendar`,
      },
    });
  }

  /**
   * C3: revoke the provider grant first, then remove local rows. A revoke
   * failure is logged (never with token material) and does NOT block the
   * deletion — leaving the row behind would be worse for the user than an
   * orphaned grant we could not cancel.
   */
  async disconnect(userId: string, provider: string): Promise<void> {
    const adapter = this.getAdapter(provider);
    if (adapter) {
      const connection = await this.getConnection(userId, provider);
      if (connection?.accessToken || connection?.refreshToken) {
        try {
          await adapter.disconnect(connection.accessToken ?? '', connection.refreshToken ?? '');
        } catch (error: any) {
          // Belt-and-braces: a provider error could echo token material, so
          // scrub every known token value from the message before logging.
          let message = String(error?.message ?? error);
          for (const token of [connection.accessToken, connection.refreshToken]) {
            if (token) message = message.split(token).join('[redacted]');
          }
          this.logger.warn(
            `Provider token revocation failed for ${provider} (user ${userId}); continuing with local disconnect: ${message}`
          );
        }
      }
    }

    await this.prisma.calendarConnection.deleteMany({
      where: {
        userId,
        provider: provider.toUpperCase() as any,
      },
    });

    await this.prisma.calendar.deleteMany({
      where: {
        userId,
        provider: provider.toUpperCase() as any,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'CALENDAR_DISCONNECTED',
        entityType: 'CalendarConnection',
        details: `Disconnected ${provider} calendar`,
      },
    });
  }

  /**
   * Raw connection row for server-side use with **decrypted** tokens (C2).
   * Public HTTP shapes use getPublicConnection(s), which never select token
   * columns at all.
   */
  async getConnection(userId: string, provider: string) {
    const connection = await this.prisma.calendarConnection.findFirst({
      where: {
        userId,
        provider: provider.toUpperCase() as any,
        isActive: true,
      },
    });
    if (!connection) return connection;
    return {
      ...connection,
      accessToken: this.tokenCrypto.decrypt(connection.accessToken),
      refreshToken: this.tokenCrypto.decrypt(connection.refreshToken),
    };
  }

  /** Token-free single connection for HTTP responses. */
  async getPublicConnection(userId: string, provider: string) {
    return this.prisma.calendarConnection.findFirst({
      where: { userId, provider: provider.toUpperCase() as any, isActive: true },
      select: PUBLIC_CONNECTION_SELECT,
    });
  }

  /** Token-free list for GET /api/calendar/connections. */
  async getPublicConnections(userId: string) {
    return this.prisma.calendarConnection.findMany({
      where: { userId, isActive: true },
      select: PUBLIC_CONNECTION_SELECT,
    });
  }

  async getAllConnections(userId: string) {
    return this.getPublicConnections(userId);
  }

  /**
   * Persist the sidebar show/hide toggle for a Calendar row. The visibility UI
   * used to be mock-only because no route existed; the `isVisible` column has
   * always been in Prisma, so this closes the gap without a migration.
   */
  async setCalendarVisibility(userId: string, calendarId: string, isVisible: boolean) {
    const calendar = await this.prisma.calendar.findFirst({
      where: { id: calendarId, userId },
    });
    if (!calendar) {
      throw new BadRequestException(`Calendar ${calendarId} not found`);
    }
    return this.prisma.calendar.update({
      where: { id: calendarId },
      data: { isVisible },
    });
  }

  async refreshToken(
    userId: string,
    provider: string
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    const connection = await this.getConnection(userId, provider);
    if (!connection || !connection.refreshToken) {
      throw new Error('No refresh token available');
    }

    const adapter = this.getAdapter(provider);
    if (!adapter) {
      throw new Error(`Unsupported calendar provider: ${provider}`);
    }

    const tokens = await adapter.refreshAccessToken(connection.refreshToken);

    await this.prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        // C2: fresh access token is encrypted before it hits the column.
        accessToken: this.tokenCrypto.encrypt(tokens.accessToken),
        tokenExpiresAt: tokens.expiresAt,
      },
    });

    return tokens;
  }

  async getValidAccessToken(userId: string, provider: string): Promise<string> {
    const connection = await this.getConnection(userId, provider);
    if (!connection) {
      throw new Error(`No active ${provider} calendar connection`);
    }

    if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
      const tokens = await this.refreshToken(userId, provider);
      return tokens.accessToken;
    }

    if (!connection.accessToken) {
      throw new Error('No access token available');
    }

    return connection.accessToken;
  }
}

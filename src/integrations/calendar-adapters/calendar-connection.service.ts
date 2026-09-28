import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@app/common/services/prisma.service';
import { GoogleCalendarAdapter } from './google-calendar.adapter';
import { OutlookCalendarAdapter } from './outlook-calendar.adapter';
import { LocalCalendarAdapter } from './local-calendar.adapter';
import { CalendarAdapter } from './calendar-adapter.interface';

export interface CalendarConnectionData {
  provider: string;
  externalUserId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scopes: string[];
}

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
    private readonly jwt: JwtService
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

  getAuthUrl(userId: string, provider: string, state?: string): string {
    const adapter = this.getAdapter(provider);
    if (!adapter) {
      throw new Error(`Unsupported calendar provider: ${provider}`);
    }
    return adapter.getAuthUrl(userId, state || this.createOAuthState(userId, provider));
  }

  async handleCallback(userId: string, provider: string, code: string): Promise<void> {
    const adapter = this.getAdapter(provider);
    if (!adapter) {
      throw new Error(`Unsupported calendar provider: ${provider}`);
    }

    const tokenData = await adapter.handleCallback(code);

    await this.prisma.calendarConnection.upsert({
      where: {
        userId_provider: {
          userId,
          provider: provider.toUpperCase() as any,
        },
      },
      update: {
        externalUserId: tokenData.externalUserId,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        tokenExpiresAt: tokenData.expiresAt,
        scopes: adapter.scopes,
        isActive: true,
        syncError: null,
        lastSync: new Date(),
      },
      create: {
        userId,
        provider: provider.toUpperCase() as any,
        externalUserId: tokenData.externalUserId,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        tokenExpiresAt: tokenData.expiresAt,
        scopes: adapter.scopes,
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

  async disconnect(userId: string, provider: string): Promise<void> {
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

  async getConnection(userId: string, provider: string) {
    return this.prisma.calendarConnection.findFirst({
      where: {
        userId,
        provider: provider.toUpperCase() as any,
        isActive: true,
      },
    });
  }

  /** Token-free single connection for HTTP responses. */
  async getPublicConnection(userId: string, provider: string) {
    return this.prisma.calendarConnection.findFirst({
      where: { userId, provider: provider.toUpperCase() as any, isActive: true },
      select: { ...PUBLIC_CONNECTION_SELECT, calendars: true },
    });
  }

  /** Token-free list for GET /api/calendar/connections. */
  async getPublicConnections(userId: string) {
    return this.prisma.calendarConnection.findMany({
      where: { userId, isActive: true },
      select: { ...PUBLIC_CONNECTION_SELECT, calendars: true },
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
        accessToken: tokens.accessToken,
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

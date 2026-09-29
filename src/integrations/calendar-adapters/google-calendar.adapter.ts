import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseCalendarAdapter } from './base-calendar.adapter';
import {
  CalendarAuthUrlOptions,
  CalendarCallbackResult,
  CalendarEvent,
  WebhookConfig,
  WebhookEvent,
} from './calendar-adapter.interface';

@Injectable()
export class GoogleCalendarAdapter extends BaseCalendarAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  protected readonly _providerName = 'Google Calendar';
  protected readonly _provider = 'GOOGLE';
  // C1 scope minimization (Google Limited Scope policy): event-level CRUD only
  // (no full `calendar` scope), plus bare OIDC `openid`/`email` so the v2
  // userinfo endpoint can resolve the account email for the connection row.
  // `userinfo.profile` and the broad `calendar` scope were removed deliberately.
  protected readonly _scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'openid',
    'email',
  ];

  constructor(private readonly config: ConfigService) {
    super();
    this.clientId = this.config.get<string>('GOOGLE_CLIENT_ID') || '';
    this.clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET') || '';
    this.redirectUri =
      this.config.get<string>('GOOGLE_REDIRECT_URI') ||
      'http://localhost:3000/api/calendar/callback/google';
  }

  getAuthUrl(userId: string, state: string, options?: CalendarAuthUrlOptions): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this._scopes.join(' '),
      state,
      access_type: 'offline',
    });
    // C7: PKCE (S256). Google requires the challenge alongside the code flow;
    // the verifier stays server-side and is sent only on token exchange.
    if (options?.codeChallenge) {
      params.set('code_challenge', options.codeChallenge);
      params.set('code_challenge_method', options.codeChallengeMethod ?? 'S256');
    }
    // prompt=consent is what makes Google issue a refresh token, but it also
    // forces the full consent screen every time. Only send it on first connect
    // or when no refresh token is stored (C1).
    if (options?.requestConsentPrompt) {
      params.set('prompt', 'consent');
    }
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string, codeVerifier?: string): Promise<CalendarCallbackResult> {
    return this.executeWithRetry(async () => {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
          // C7: proves the callback caller is the same client that minted the
          // authorization request. Google rejects a mismatch (or a code that
          // was issued with a challenge but no verifier).
          ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
        }),
      });

      const tokens = (await tokenResponse.json()) as any;

      if (!tokenResponse.ok) {
        throw new Error(`Google OAuth failed: ${tokens.error_description || tokens.error}`);
      }

      // C1: verify Google actually granted every required scope. A partial
      // grant must surface as a clear, user-facing error rather than being
      // persisted and failing later on the first API call.
      const grantedScopes = String(tokens.scope || '')
        .split(' ')
        .map((s) => s.trim())
        .filter(Boolean);
      const requiredScopes = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'];
      const missing = requiredScopes.filter((s) => !grantedScopes.includes(s));
      if (missing.length > 0) {
        throw new Error(
          'Google did not grant the permissions CalAssist needs to connect your calendar. ' +
            'Please retry and click "Allow" on every permission in the consent screen. ' +
            `(missing: ${missing.join(', ')})`
        );
      }

      const userInfo = (await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }).then((r) => r.json())) as any;

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        externalUserId: userInfo.email,
        scopes: grantedScopes,
      };
    }, 'Google OAuth callback');
  }

  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    return this.executeWithRetry(async () => {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const tokens = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${tokens.error_description || tokens.error}`);
      }

      return {
        accessToken: tokens.access_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
      };
    }, 'Google token refresh');
  }

  private async request<T>(
    method: string,
    url: string,
    accessToken: string,
    body?: any
  ): Promise<T> {
    return this.executeWithRetry(async () => {
      const response = await fetch(`https://www.googleapis.com/calendar/v3${url}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Google Calendar API error: ${response.status} ${JSON.stringify(error)}`);
      }

      return response.json() as Promise<T>;
    }, `Google Calendar API ${method} ${url}`);
  }

  private toGoogleEvent(event: CalendarEvent): any {
    return {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: {
        dateTime: event.allDay ? undefined : event.startDate,
        date: event.allDay ? event.startDate.split('T')[0] : undefined,
        timeZone: event.timezone,
      },
      end: {
        dateTime: event.allDay ? undefined : event.endDate,
        date: event.allDay ? event.endDate.split('T')[0] : undefined,
        timeZone: event.timezone,
      },
      recurrence: event.recurrenceRule ? [event.recurrenceRule] : undefined,
      attendees: event.attendees?.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: a.status || 'needsAction',
      })),
      extendedProperties: {
        private: event.metadata ? { metadata: JSON.stringify(event.metadata) } : undefined,
      },
    };
  }

  private fromGoogleEvent(
    googleEvent: any
  ): CalendarEvent & { externalId: string; externalETag: string } {
    return {
      externalId: googleEvent.id,
      externalETag: googleEvent.etag,
      title: googleEvent.summary || 'Untitled',
      description: googleEvent.description,
      location: googleEvent.location,
      startDate: googleEvent.start?.dateTime || googleEvent.start?.date,
      endDate: googleEvent.end?.dateTime || googleEvent.end?.date,
      allDay: !!googleEvent.start?.date,
      timezone: googleEvent.start?.timeZone || 'UTC',
      recurrenceRule: googleEvent.recurrence?.[0],
      exceptionDates: googleEvent.recurringEventId ? [] : undefined,
      attendees: googleEvent.attendees?.map((a: any) => ({
        email: a.email,
        displayName: a.displayName,
        status: a.responseStatus,
      })),
      metadata: googleEvent.extendedProperties?.private?.metadata
        ? JSON.parse(googleEvent.extendedProperties.private.metadata)
        : undefined,
    };
  }

  async createEvent(
    accessToken: string,
    event: CalendarEvent
  ): Promise<{ externalId: string; externalETag: string }> {
    const googleEvent = await this.request<any>(
      'POST',
      '/calendars/primary/events',
      accessToken,
      this.toGoogleEvent(event)
    );
    return { externalId: googleEvent.id, externalETag: googleEvent.etag };
  }

  async updateEvent(
    accessToken: string,
    externalId: string,
    event: Partial<CalendarEvent>
  ): Promise<{ externalETag: string }> {
    const existing = await this.getEvent(accessToken, externalId);
    if (!existing) throw new Error('Event not found');

    const merged = { ...existing, ...event };
    const googleEvent = await this.request<any>(
      'PUT',
      `/calendars/primary/events/${externalId}`,
      accessToken,
      this.toGoogleEvent(merged)
    );
    return { externalETag: googleEvent.etag };
  }

  async deleteEvent(accessToken: string, externalId: string): Promise<void> {
    await this.request<void>('DELETE', `/calendars/primary/events/${externalId}`, accessToken);
  }

  async getEvent(
    accessToken: string,
    externalId: string
  ): Promise<(CalendarEvent & { externalETag: string }) | null> {
    try {
      const googleEvent = await this.request<any>(
        'GET',
        `/calendars/primary/events/${externalId}`,
        accessToken
      );
      return this.fromGoogleEvent(googleEvent);
    } catch (e) {
      return null;
    }
  }

  async listEvents(
    accessToken: string,
    options: { syncToken?: string; timeMin?: string; timeMax?: string }
  ): Promise<{
    events: Array<CalendarEvent & { externalId: string; externalETag: string }>;
    nextSyncToken?: string;
  }> {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: options.timeMin || new Date().toISOString(),
      ...(options.timeMax && { timeMax: options.timeMax }),
      ...(options.syncToken && { syncToken: options.syncToken }),
    });

    const response = await this.request<any>(
      'GET',
      `/calendars/primary/events?${params}`,
      accessToken
    );

    const events = (response.items || []).map((e: any) => this.fromGoogleEvent(e));
    return {
      events,
      nextSyncToken: response.nextSyncToken,
    };
  }

  // Webhook support (C8: Google push notifications — no HMAC anywhere).
  async getWebhookConfig(accessToken: string, userId: string): Promise<WebhookConfig> {
    const baseUrl = this.config.get<string>('WEBHOOK_PUBLIC_URL') || 'https://api.calassist.app';
    return {
      webhookUrl: `${baseUrl}/api/calendar/webhook/google/${userId}`,
      // A random per-channel secret Google echoes back in X-Goog-Channel-Token.
      channelToken: randomBytes(24).toString('base64url'),
      events: ['events.changed'],
    };
  }

  /**
   * Creates a Google watch channel for the primary calendar. Returns the
   * channel id (UUID we generate; Google requires the subscriber to pick it).
   */
  async registerWebhook(
    accessToken: string,
    webhookConfig: WebhookConfig & { channelId?: string }
  ): Promise<string> {
    const channelId = webhookConfig.channelId || crypto.randomUUID();
    await this.request<any>('POST', '/calendars/primary/events/watch', accessToken, {
      id: channelId,
      type: 'web_hook',
      address: webhookConfig.webhookUrl,
      token: webhookConfig.channelToken,
    });
    return channelId;
  }

  async unregisterWebhook(accessToken: string, webhookId: string): Promise<void> {
    await this.request<void>(
      'POST',
      `/channels/stop?channelId=${encodeURIComponent(webhookId)}`,
      accessToken
    );
  }

  // C8: the old verifyWebhookSignature() HMAC helper is gone — Google never
  // signs push payloads, so the check could never succeed. Notification
  // authenticity is enforced by CalendarWebhookService (channel token +
  // channel/resource ids), and freshness by re-fetching with sync tokens.

  async processWebhookEvent(payload: any, signature: string): Promise<any[]> {
    // Google sends no meaningful body (channelKind/resourceId only); actual
    // changes are re-fetched via listEvents(syncToken) by the webhook service.
    return [];
  }

  // Disconnect/Reconnect
  /**
   * C3: revoke the grant at Google BEFORE the caller deletes the connection
   * row. Revokes the refresh token when present (the durable grant) and the
   * access token as well. Throws on failure — with no token material in the
   * message — so CalendarConnectionService can log and continue; a failed
   * revoke must never strand the row.
   */
  async disconnect(accessToken: string, refreshToken: string): Promise<void> {
    const tokens = [refreshToken, accessToken].filter(Boolean);
    if (tokens.length === 0) {
      throw new Error('Cannot revoke Google access: no token available for this connection');
    }
    let lastError: Error | null = null;
    for (const token of tokens) {
      try {
        const response = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }),
        });
        if (!response.ok) {
          lastError = new Error(`Google token revocation failed with status ${response.status}`);
        }
      } catch (e: any) {
        lastError = new Error(`Google token revocation request failed: ${e?.message}`);
      }
    }
    if (lastError) throw lastError;
  }

  async isTokenValid(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: accessToken }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async revokeAccess(refreshToken: string): Promise<void> {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      });
    } catch (e) {
      // Ignore errors on revoke
    }
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseCalendarAdapter } from './base-calendar.adapter';
import { CalendarEvent, WebhookConfig, WebhookEvent } from './calendar-adapter.interface';

@Injectable()
export class AppleCalendarAdapter extends BaseCalendarAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly teamId: string;
  private readonly keyId: string;
  private readonly privateKey: string;

  protected readonly _providerName = 'Apple Calendar';
  protected readonly _provider = 'APPLE';
  protected readonly _scopes = [
    'https://www.icloud.com/auth/calendar',
    'https://www.icloud.com/auth/calendar.events',
  ];

  constructor(private readonly config: ConfigService) {
    super();
    this.clientId = this.config.get<string>('APPLE_CLIENT_ID') || '';
    this.clientSecret = this.config.get<string>('APPLE_CLIENT_SECRET') || '';
    this.teamId = this.config.get<string>('APPLE_TEAM_ID') || '';
    this.keyId = this.config.get<string>('APPLE_KEY_ID') || '';
    this.privateKey = this.config.get<string>('APPLE_PRIVATE_KEY') || '';
    this.redirectUri =
      this.config.get<string>('APPLE_REDIRECT_URI') ||
      'http://localhost:3000/api/calendar/callback/apple';
  }

  getAuthUrl(userId: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this._scopes.join(' '),
      // Signed-JWT state is self-contained; pass it verbatim (see Google adapter).
      state,
      response_mode: 'form_post',
    });
    return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    externalUserId: string;
  }> {
    return this.executeWithRetry(async () => {
      const clientSecret = this.generateClientSecret();

      const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = (await tokenResponse.json()) as any;

      if (!tokenResponse.ok) {
        throw new Error(`Apple OAuth failed: ${tokens.error_description || tokens.error}`);
      }

      // Apple doesn't return user info in token response
      // Would need to use the id_token or call userinfo endpoint
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        externalUserId: tokens.sub || 'apple_user',
      };
    }, 'Apple OAuth callback');
  }

  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    return this.executeWithRetry(async () => {
      const clientSecret = this.generateClientSecret();

      const response = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: clientSecret,
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
    }, 'Apple token refresh');
  }

  private generateClientSecret(): string {
    // Apple requires JWT as client_secret
    // This is a simplified implementation - production would use proper JWT signing
    const header = { alg: 'ES256', kid: this.keyId };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.teamId,
      iat: now,
      exp: now + 3600,
      aud: 'https://appleid.apple.com',
      sub: this.clientId,
    };

    // In production, use proper ES256 signing with the private key
    // This is a placeholder
    return `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
  }

  private async request<T>(
    method: string,
    url: string,
    accessToken: string,
    body?: any
  ): Promise<T> {
    return this.executeWithRetry(async () => {
      const response = await fetch(`https://www.icloud.com${url}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Apple Calendar API error: ${response.status} ${JSON.stringify(error)}`);
      }

      return response.json() as Promise<T>;
    }, `Apple Calendar API ${method} ${url}`);
  }

  private toAppleEvent(event: CalendarEvent): any {
    return {
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      allDay: event.allDay,
      timezone: event.timezone,
      recurrenceRule: event.recurrenceRule,
      attendees: event.attendees?.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        status: a.status || 'needsAction',
      })),
    };
  }

  private fromAppleEvent(
    appleEvent: any
  ): CalendarEvent & { externalId: string; externalETag: string } {
    return {
      externalId: appleEvent.id,
      externalETag: appleEvent.etag || '',
      title: appleEvent.title || 'Untitled',
      description: appleEvent.description,
      location: appleEvent.location,
      startDate: appleEvent.startDate,
      endDate: appleEvent.endDate,
      allDay: appleEvent.allDay || false,
      timezone: appleEvent.timezone || 'UTC',
      recurrenceRule: appleEvent.recurrenceRule,
      attendees: appleEvent.attendees?.map((a: any) => ({
        email: a.email,
        displayName: a.displayName,
        status: a.status || 'needsAction',
      })),
    };
  }

  async createEvent(
    accessToken: string,
    event: CalendarEvent
  ): Promise<{ externalId: string; externalETag: string }> {
    const appleEvent = await this.request<any>(
      'POST',
      '/calendar/v1/calendars/primary/events',
      accessToken,
      this.toAppleEvent(event)
    );
    return { externalId: appleEvent.id, externalETag: appleEvent.etag || '' };
  }

  async updateEvent(
    accessToken: string,
    externalId: string,
    event: Partial<CalendarEvent>
  ): Promise<{ externalETag: string }> {
    const existing = await this.getEvent(accessToken, externalId);
    if (!existing) throw new Error('Event not found');

    const merged = { ...existing, ...event };
    const appleEvent = await this.request<any>(
      'PATCH',
      `/calendar/v1/calendars/primary/events/${externalId}`,
      accessToken,
      this.toAppleEvent(merged)
    );
    return { externalETag: appleEvent.etag || '' };
  }

  async deleteEvent(accessToken: string, externalId: string): Promise<void> {
    await this.request<void>('DELETE', `/calendar/v1/calendars/primary/events/${externalId}`, accessToken);
  }

  async getEvent(
    accessToken: string,
    externalId: string
  ): Promise<(CalendarEvent & { externalId: string; externalETag: string }) | null> {
    try {
      const appleEvent = await this.request<any>(
        'GET',
        `/calendar/v1/calendars/primary/events/${externalId}`,
        accessToken
      );
      return this.fromAppleEvent(appleEvent);
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
      timeMin: options.timeMin || new Date().toISOString(),
      ...(options.timeMax && { timeMax: options.timeMax }),
      ...(options.syncToken && { syncToken: options.syncToken }),
    });

    const response = await this.request<any>(
      'GET',
      `/calendar/v1/calendars/primary/events?${params}`,
      accessToken
    );

    const events = (response.events || []).map((e: any) => this.fromAppleEvent(e));
    return {
      events,
      nextSyncToken: response.nextSyncToken,
    };
  }

  // Webhook support
  async getWebhookConfig(accessToken: string, userId: string): Promise<any> {
    return {
      webhookUrl: `https://api.calassist.app/api/calendar/webhook/apple/${userId}`,
      secret: this.config.get<string>('APPLE_WEBHOOK_SECRET') || 'default-secret',
      events: ['created', 'updated', 'deleted'],
    };
  }

  async registerWebhook(accessToken: string, webhookConfig: any): Promise<string> {
    throw new Error('Webhook registration not implemented yet for Apple Calendar');
  }

  async unregisterWebhook(accessToken: string, webhookId: string): Promise<void> {
    throw new Error('Webhook unregistration not implemented yet for Apple Calendar');
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  async processWebhookEvent(payload: any, signature: string): Promise<any[]> {
    return [];
  }

  async disconnect(accessToken: string, refreshToken: string): Promise<void> {
    // Apple doesn't have a standard revoke endpoint
  }

  async isTokenValid(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch('https://www.icloud.com/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async revokeAccess(refreshToken: string): Promise<void> {
    // Apple doesn't have a standard revoke endpoint
  }
}
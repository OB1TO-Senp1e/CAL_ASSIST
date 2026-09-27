import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseCalendarAdapter } from './base-calendar.adapter';
import { CalendarEvent, WebhookConfig, WebhookEvent } from './calendar-adapter.interface';

@Injectable()
export class GoogleCalendarAdapter extends BaseCalendarAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  protected readonly _providerName = 'Google Calendar';
  protected readonly _provider = 'GOOGLE';
  protected readonly _scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  constructor(private readonly config: ConfigService) {
    super();
    this.clientId = this.config.get<string>('GOOGLE_CLIENT_ID') || '';
    this.clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET') || '';
    this.redirectUri =
      this.config.get<string>('GOOGLE_REDIRECT_URI') ||
      'http://localhost:3000/api/calendar/callback/google';
  }

  getAuthUrl(userId: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this._scopes.join(' '),
      state: `${userId}:${state}`,
      access_type: 'offline',
      prompt: 'consent',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    externalUserId: string;
  }> {
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
        }),
      });

      const tokens = (await tokenResponse.json()) as any;

      if (!tokenResponse.ok) {
        throw new Error(`Google OAuth failed: ${tokens.error_description || tokens.error}`);
      }

      const userInfo = (await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }).then((r) => r.json())) as any;

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        externalUserId: userInfo.email,
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

  // Webhook support
  async getWebhookConfig(accessToken: string, userId: string): Promise<any> {
    return {
      webhookUrl: `https://api.calassist.app/api/calendar/webhook/google/${userId}`,
      secret: this.config.get<string>('GOOGLE_WEBHOOK_SECRET') || 'default-secret',
      events: ['events.changed'],
    };
  }

  async registerWebhook(accessToken: string, webhookConfig: any): Promise<string> {
    // Implementation for Google Calendar push notifications
    throw new Error('Webhook registration not implemented yet');
  }

  async unregisterWebhook(accessToken: string, webhookId: string): Promise<void> {
    throw new Error('Webhook unregistration not implemented yet');
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
    // Process Google Calendar push notification
    return [];
  }

  // Disconnect/Reconnect
  async disconnect(accessToken: string, refreshToken: string): Promise<void> {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: accessToken }),
      });
    } catch (e) {
      // Ignore errors on disconnect
    }
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

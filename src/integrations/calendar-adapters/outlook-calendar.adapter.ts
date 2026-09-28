import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseCalendarAdapter } from './base-calendar.adapter';
import { CalendarEvent, WebhookEvent } from './calendar-adapter.interface';

@Injectable()
export class OutlookCalendarAdapter extends BaseCalendarAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly tenantId: string;

  protected readonly _providerName = 'Outlook Calendar';
  protected readonly _provider = 'OUTLOOK';
  protected readonly _scopes = [
    'https://graph.microsoft.com/calendars.readwrite',
    'https://graph.microsoft.com/calendars.read',
    'https://graph.microsoft.com/user.read',
  ];

  constructor(private readonly config: ConfigService) {
    super();
    this.clientId = this.config.get<string>('MICROSOFT_CLIENT_ID') || '';
    this.clientSecret = this.config.get<string>('MICROSOFT_CLIENT_SECRET') || '';
    this.tenantId = this.config.get<string>('MICROSOFT_TENANT_ID') || 'common';
    this.redirectUri =
      this.config.get<string>('MICROSOFT_REDIRECT_URI') ||
      'http://localhost:3000/api/calendar/callback/outlook';
  }

  getAuthUrl(userId: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this._scopes.join(' '),
      // The state is the server-minted signed JWT (self-contained: it carries
      // the user id), so it must travel verbatim to the callback.
      state,
      prompt: 'consent',
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    externalUserId: string;
  }> {
    return this.executeWithRetry(async () => {
      const tokenResponse = await fetch(
        `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            code,
            redirect_uri: this.redirectUri,
            grant_type: 'authorization_code',
            scope: this._scopes.join(' '),
          }),
        }
      );

      const tokens = (await tokenResponse.json()) as any;

      if (!tokenResponse.ok) {
        throw new Error(`Microsoft OAuth failed: ${tokens.error_description || tokens.error}`);
      }

      const userInfo = (await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }).then((r) => r.json())) as any;

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        externalUserId: userInfo.mail || userInfo.userPrincipalName,
      };
    }, 'Microsoft OAuth callback');
  }

  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    return this.executeWithRetry(async () => {
      const response = await fetch(
        `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: this._scopes.join(' '),
          }),
        }
      );

      const tokens = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${tokens.error_description || tokens.error}`);
      }

      return {
        accessToken: tokens.access_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
      };
    }, 'Microsoft token refresh');
  }

  private async request<T>(
    method: string,
    url: string,
    accessToken: string,
    body?: any
  ): Promise<T> {
    return this.executeWithRetry(async () => {
      const response = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Microsoft Graph API error: ${response.status} ${JSON.stringify(error)}`);
      }

      return response.json() as Promise<T>;
    }, `Microsoft Graph API ${method} ${url}`);
  }

  private toOutlookEvent(event: CalendarEvent): any {
    return {
      subject: event.title,
      body: {
        contentType: 'HTML',
        content: event.description || '',
      },
      location: {
        displayName: event.location,
      },
      start: {
        dateTime: event.allDay ? event.startDate.split('T')[0] : event.startDate,
        timeZone: event.timezone,
      },
      end: {
        dateTime: event.allDay ? event.endDate.split('T')[0] : event.endDate,
        timeZone: event.timezone,
      },
      isAllDay: event.allDay,
      recurrence: event.recurrenceRule
        ? {
            pattern: {
              type: 'relativeMonthly',
              interval: 1,
              month: 0,
              dayOfMonth: 1,
            },
            range: {
              type: 'noEnd',
              startDate: event.startDate.split('T')[0],
            },
          }
        : undefined,
      attendees: event.attendees?.map((a) => ({
        emailAddress: {
          address: a.email,
          name: a.displayName,
        },
        type: 'required',
        status: {
          response: a.status || 'none',
        },
      })),
      extensions: event.metadata
        ? [
            {
              extensionName: 'com.calassist.metadata',
              metadata: JSON.stringify(event.metadata),
            },
          ]
        : undefined,
    };
  }

  private fromOutlookEvent(
    outlookEvent: any
  ): CalendarEvent & { externalId: string; externalETag: string } {
    const metadata = outlookEvent.extensions?.find(
      (e: any) => e.extensionName === 'com.calassist.metadata'
    );
    return {
      externalId: outlookEvent.id,
      externalETag: outlookEvent['@odata.etag'] || '',
      title: outlookEvent.subject || 'Untitled',
      description: outlookEvent.body?.content,
      location: outlookEvent.location?.displayName,
      startDate: outlookEvent.start?.dateTime,
      endDate: outlookEvent.end?.dateTime,
      allDay: outlookEvent.isAllDay || false,
      timezone: outlookEvent.start?.timeZone || 'UTC',
      recurrenceRule: outlookEvent.recurrence ? JSON.stringify(outlookEvent.recurrence) : undefined,
      attendees: outlookEvent.attendees?.map((a: any) => ({
        email: a.emailAddress?.address,
        displayName: a.emailAddress?.name,
        status: a.status?.response,
      })),
      metadata: metadata ? JSON.parse(metadata.metadata) : undefined,
    };
  }

  async createEvent(
    accessToken: string,
    event: CalendarEvent
  ): Promise<{ externalId: string; externalETag: string }> {
    const outlookEvent = await this.request<any>(
      'POST',
      '/me/events',
      accessToken,
      this.toOutlookEvent(event)
    );
    return { externalId: outlookEvent.id, externalETag: outlookEvent['@odata.etag'] || '' };
  }

  async updateEvent(
    accessToken: string,
    externalId: string,
    event: Partial<CalendarEvent>
  ): Promise<{ externalETag: string }> {
    const existing = await this.getEvent(accessToken, externalId);
    if (!existing) throw new Error('Event not found');

    const merged = { ...existing, ...event };
    const outlookEvent = await this.request<any>(
      'PATCH',
      `/me/events/${externalId}`,
      accessToken,
      this.toOutlookEvent(merged)
    );
    return { externalETag: outlookEvent['@odata.etag'] || '' };
  }

  async deleteEvent(accessToken: string, externalId: string): Promise<void> {
    await this.request<void>('DELETE', `/me/events/${externalId}`, accessToken);
  }

  async getEvent(
    accessToken: string,
    externalId: string
  ): Promise<(CalendarEvent & { externalETag: string }) | null> {
    try {
      const outlookEvent = await this.request<any>('GET', `/me/events/${externalId}`, accessToken);
      return this.fromOutlookEvent(outlookEvent);
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
    const filter = [
      `start/dateTime ge ${options.timeMin || new Date().toISOString()}`,
      options.timeMax && `end/dateTime le ${options.timeMax}`,
    ]
      .filter(Boolean)
      .join(' and ');

    const params = new URLSearchParams({
      $filter: filter,
      $orderby: 'start/dateTime',
      $top: '100',
    });

    const response = await this.request<any>('GET', `/me/events?${params}`, accessToken);

    const events = (response.value || []).map((e: any) => this.fromOutlookEvent(e));

    // Microsoft Graph uses delta queries for sync tokens
    const nextSyncToken = response['@odata.deltaLink']?.split('deltatoken=')[1];

    return {
      events,
      nextSyncToken,
    };
  }

  // Webhook support for Microsoft Graph
  async getWebhookConfig(accessToken: string, userId: string): Promise<any> {
    return {
      webhookUrl: `https://api.calassist.app/api/calendar/webhook/outlook/${userId}`,
      secret: this.config.get<string>('MICROSOFT_WEBHOOK_SECRET') || 'default-secret',
      events: ['created', 'updated', 'deleted'],
    };
  }

  async registerWebhook(accessToken: string, webhookConfig: any): Promise<string> {
    throw new Error('Webhook registration not implemented yet for Microsoft Graph');
  }

  async unregisterWebhook(accessToken: string, webhookId: string): Promise<void> {
    throw new Error('Webhook unregistration not implemented yet for Microsoft Graph');
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
    // Process Microsoft Graph webhook
    return [];
  }

  // Disconnect/Reconnect
  async disconnect(accessToken: string, refreshToken: string): Promise<void> {
    try {
      await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          token: accessToken,
        }),
      });
    } catch (e) {
      // Ignore errors on disconnect
    }
  }

  async isTokenValid(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async revokeAccess(refreshToken: string): Promise<void> {
    try {
      await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          token: refreshToken,
        }),
      });
    } catch (e) {
      // Ignore errors on revoke
    }
  }
}

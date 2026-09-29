import { Injectable } from '@nestjs/common';
import { BaseCalendarAdapter } from './base-calendar.adapter';
import {
  CalendarCallbackResult,
  CalendarEvent,
  WebhookConfig,
  WebhookEvent,
} from './calendar-adapter.interface';

@Injectable()
export class LocalCalendarAdapter extends BaseCalendarAdapter {
  protected readonly _providerName = 'Local';
  protected readonly _provider = 'LOCAL';
  protected readonly _scopes = ['local'];

  getAuthUrl(userId: string, state: string): string {
    return `/calendar/local/connect?userId=${userId}&state=${state}`;
  }

  async handleCallback(code: string): Promise<CalendarCallbackResult> {
    return {
      accessToken: `local_token_${Date.now()}`,
      refreshToken: `local_refresh_${Date.now()}`,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      externalUserId: code,
      scopes: ['local'],
    };
  }

  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    return {
      accessToken: `local_token_${Date.now()}`,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
  }

  async createEvent(
    accessToken: string,
    event: CalendarEvent
  ): Promise<{ externalId: string; externalETag: string }> {
    const externalId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return { externalId, externalETag: `etag_${externalId}` };
  }

  async updateEvent(
    accessToken: string,
    externalId: string,
    event: Partial<CalendarEvent>
  ): Promise<{ externalETag: string }> {
    return { externalETag: `etag_${externalId}_updated` };
  }

  async deleteEvent(accessToken: string, externalId: string): Promise<void> {
    this.logger.log(`Local calendar: deleted event ${externalId}`);
  }

  async getEvent(
    accessToken: string,
    externalId: string
  ): Promise<(CalendarEvent & { externalETag: string }) | null> {
    return {
      externalId,
      externalETag: `etag_${externalId}`,
      title: 'Local Event',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 3600000).toISOString(),
      allDay: false,
      timezone: 'UTC',
    };
  }

  async listEvents(
    accessToken: string,
    options: { syncToken?: string; timeMin?: string; timeMax?: string }
  ): Promise<{
    events: Array<CalendarEvent & { externalId: string; externalETag: string }>;
    nextSyncToken?: string;
  }> {
    return {
      events: [],
      nextSyncToken: `sync_${Date.now()}`,
    };
  }

  // Webhook support (no-op for local)
  async getWebhookConfig(accessToken: string, userId: string): Promise<any> {
    return {
      webhookUrl: '',
      secret: '',
      events: [],
    };
  }

  async registerWebhook(accessToken: string, webhookConfig: any): Promise<string> {
    return '';
  }

  async unregisterWebhook(accessToken: string, webhookId: string): Promise<void> {
    // No-op for local
  }

  // C8: removed the old verifyWebhookSignature() stub (it returned true for
  // everything). No signature scheme applies to local calendars.

  async processWebhookEvent(payload: any, signature: string): Promise<any[]> {
    return [];
  }

  // Disconnect/Reconnect
  async disconnect(accessToken: string, refreshToken: string): Promise<void> {
    // No-op for local
  }

  async isTokenValid(accessToken: string): Promise<boolean> {
    return true;
  }

  async revokeAccess(refreshToken: string): Promise<void> {
    // No-op for local
  }
}

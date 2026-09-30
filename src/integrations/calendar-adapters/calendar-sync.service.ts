import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/common/services/prisma.service';
import { CalendarConnectionService } from './calendar-connection.service';

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectionService: CalendarConnectionService
  ) {}

  async syncCalendars(
    userId: string,
    provider: string
  ): Promise<{
    calendarsSynced: number;
    eventsCreated: number;
    eventsUpdated: number;
    eventsDeleted: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let calendarsSynced = 0;
    let eventsCreated = 0;
    let eventsUpdated = 0;
    let eventsDeleted = 0;

    try {
      const connection = await this.connectionService.getConnection(userId, provider);
      if (!connection) {
        throw new Error(`No active ${provider} connection`);
      }

      const accessToken = await this.connectionService.getValidAccessToken(userId, provider);
      const adapter = this.connectionService.getAdapter(provider);

      if (!adapter) {
        throw new Error(`No adapter for provider: ${provider}`);
      }

      // Sync calendars list
      const calendarsResult = await this.syncCalendarsList(
        userId,
        connection,
        adapter,
        accessToken
      );
      calendarsSynced = calendarsResult.count;

      // Sync events for each calendar (DB rows — see syncCalendarsList,
      // Stage 4i: the old code fed raw provider objects into
      // syncCalendarEvents, so calendar.id was an external id used as a FK,
      // and calendar.syncToken never existed).
      for (const calendar of calendarsResult.calendars) {
        const eventsResult = await this.syncCalendarEvents(
          userId,
          calendar,
          adapter,
          accessToken,
          calendar.syncToken
        );
        eventsCreated += eventsResult.created;
        eventsUpdated += eventsResult.updated;
        eventsDeleted += eventsResult.deleted;
      }

      // Delta state lives per Calendar row (adapter.listEvents returns one
      // nextSyncToken per calendar); the connection only tracks sync health.
      await this.prisma.calendarConnection.update({
        where: { id: connection.id },
        data: { lastSync: new Date() },
      });

      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'CALENDAR_SYNC_COMPLETED',
          entityType: 'CalendarConnection',
          entityId: connection.id,
          details: `Synced ${calendarsSynced} calendars: ${eventsCreated} created, ${eventsUpdated} updated, ${eventsDeleted} deleted`,
        },
      });

      return { calendarsSynced, eventsCreated, eventsUpdated, eventsDeleted, errors };
    } catch (error: any) {
      this.logger.error(`Calendar sync failed: ${error.message}`);
      errors.push(error.message);

      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'CALENDAR_SYNC_FAILED',
          entityType: 'CalendarConnection',
          details: `Sync failed: ${error.message}`,
          success: false,
          errorMessage: error.message,
        },
      });

      throw error;
    }
  }

  private async syncCalendarsList(
    userId: string,
    connection: any,
    adapter: any,
    accessToken: string
  ): Promise<{ count: number; calendars: any[] }> {
    // For local/Google/Outlook, we need to fetch the calendar list
    // This is a simplified implementation
    let calendars: any[] = [];

    const provider = connection.provider;

    if (provider === 'GOOGLE') {
      // Google Calendar list API
      const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await response.json()) as any;
      calendars = data.items || [];
    } else if (provider === 'OUTLOOK') {
      const response = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await response.json()) as any;
      calendars = data.value || [];
    } else {
      // Local calendar - single default calendar
      calendars = [{ id: 'local_primary', name: 'Local Calendar', isPrimary: true }];
    }

    const rows: any[] = [];
    for (const cal of calendars) {
      const externalId = String(cal.id ?? cal.externalId ?? '');
      // Local calendars have no stored external id; keep them stable so the
      // composite upsert key does not collide across re-syncs.
      const row = await this.prisma.calendar.upsert({
        where: {
          userId_connectionId_externalId: {
            userId,
            connectionId: connection.id,
            externalId,
          },
        },
        update: {
          name: cal.name || cal.summary || 'Calendar',
          description: cal.description,
          color: cal.backgroundColor || cal.color || '#3b82f6',
          isPrimary: cal.isPrimary || externalId === 'local_primary',
          lastSynced: new Date(),
        },
        create: {
          userId,
          connectionId: connection.id,
          externalId,
          name: cal.name || cal.summary || 'Calendar',
          description: cal.description,
          color: cal.backgroundColor || cal.color || '#3b82f6',
          isPrimary: cal.isPrimary || externalId === 'local_primary',
          provider: connection.provider as any,
          timezone: cal.timeZone || 'UTC',
          lastSynced: new Date(),
        },
        select: { id: true, syncToken: true },
      });
      rows.push(row);
    }

    // Return the DB rows: syncCalendarEvents needs the real Calendar.id (FK)
    // and the persisted per-calendar syncToken for delta sync.
    return { count: rows.length, calendars: rows };
  }

  private async syncCalendarEvents(
    userId: string,
    calendar: any,
    adapter: any,
    accessToken: string,
    syncToken?: string
  ): Promise<{ created: number; updated: number; deleted: number }> {
    let created = 0;
    let updated = 0;
    const deleted = 0;

    const { events, nextSyncToken } = await adapter.listEvents(accessToken, {
      syncToken,
      timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      timeMax: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });

    for (const event of events) {
      try {
        const existingEvent = await this.prisma.event.findFirst({
          where: {
            userId,
            calendarId: calendar.id,
            calendarExternalId: event.externalId,
          },
        });

        if (existingEvent) {
          // Check if changed via ETag
          if (existingEvent.externalETag !== event.externalETag) {
            await this.prisma.event.update({
              where: { id: existingEvent.id },
              data: {
                title: event.title,
                description: event.description,
                location: event.location,
                startDate: new Date(event.startDate),
                endDate: new Date(event.endDate),
                allDay: event.allDay,
                timezone: event.timezone,
                recurrenceRule: event.recurrenceRule,
                exceptionDates: event.exceptionDates || [],
                externalETag: event.externalETag,
              },
            });
            updated++;
          }
        } else {
          await this.prisma.event.create({
            data: {
              userId,
              calendarId: calendar.id,
              calendarExternalId: event.externalId,
              externalETag: event.externalETag,
              title: event.title,
              description: event.description,
              location: event.location,
              startDate: new Date(event.startDate),
              endDate: new Date(event.endDate),
              allDay: event.allDay,
              timezone: event.timezone,
              recurrenceRule: event.recurrenceRule,
              exceptionDates: event.exceptionDates || [],
              source: 'SYNCED',
              status: 'CONFIRMED',
            },
          });
          created++;
        }
      } catch (e) {
        this.logger.warn(`Failed to sync event ${event.externalId}: ${e}`);
      }
    }

    // Handle deleted events (simplified - full implementation would use sync tokens properly)
    // For now, we mark events as deleted if they're not in the sync response but existed before
    // This is a basic implementation - production would use proper delta sync

    // Persist the delta cursor for this calendar so the next sync starts where
    // this one ended (Stage 4i — previously nextSyncToken was discarded and
    // every sync was a full sync).
    if (nextSyncToken) {
      await this.prisma.calendar.update({
        where: { id: calendar.id },
        data: { syncToken: nextSyncToken },
      });
    }

    return { created, updated, deleted };
  }

  async syncAllProviders(userId: string): Promise<Record<string, any>> {
    const connections = await this.connectionService.getAllConnections(userId);
    const results: Record<string, any> = {};

    for (const connection of connections) {
      try {
        results[connection.provider] = await this.syncCalendars(userId, connection.provider);
      } catch (error: any) {
        results[connection.provider] = { error: error.message };
      }
    }

    return results;
  }

  async pushEventToProvider(
    userId: string,
    provider: string,
    calendarId: string,
    event: any
  ): Promise<{ externalId: string; externalETag: string }> {
    const accessToken = await this.connectionService.getValidAccessToken(userId, provider);
    const adapter = this.connectionService.getAdapter(provider);

    if (!adapter) {
      throw new Error(`No adapter for provider: ${provider}`);
    }

    const result = await adapter.createEvent(accessToken, {
      externalId: event.externalId,
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      allDay: event.allDay,
      timezone: event.timezone,
      recurrenceRule: event.recurrenceRule,
      exceptionDates: event.exceptionDates,
    });

    return result;
  }
}

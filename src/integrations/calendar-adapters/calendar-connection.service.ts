import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class CalendarConnectionService {
  private readonly logger = new Logger(CalendarConnectionService.name);
  private readonly adapters: Map<string, CalendarAdapter> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAdapter: GoogleCalendarAdapter,
    private readonly outlookAdapter: OutlookCalendarAdapter,
    private readonly localAdapter: LocalCalendarAdapter
  ) {
    this.adapters.set('GOOGLE', this.googleAdapter);
    this.adapters.set('OUTLOOK', this.outlookAdapter);
    this.adapters.set('LOCAL', this.localAdapter);
  }

  getAdapter(provider: string): CalendarAdapter | undefined {
    return this.adapters.get(provider.toUpperCase());
  }

  getAuthUrl(userId: string, provider: string, state: string): string {
    const adapter = this.getAdapter(provider);
    if (!adapter) {
      throw new Error(`Unsupported calendar provider: ${provider}`);
    }
    return adapter.getAuthUrl(userId, state);
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

  async getAllConnections(userId: string) {
    return this.prisma.calendarConnection.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        calendars: true,
      },
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

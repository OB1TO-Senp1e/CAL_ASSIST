import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Request,
  Param,
  Query,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CalendarConnectionService } from './calendar-connection.service';
import { CalendarSyncService } from './calendar-sync.service';

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(
    private readonly connectionService: CalendarConnectionService,
    private readonly syncService: CalendarSyncService
  ) {}

  @Get('connections')
  async getConnections(@Request() req) {
    return this.connectionService.getPublicConnections(req.user.id);
  }

  @Get('connections/:provider')
  async getConnection(@Request() req, @Param('provider') provider: string) {
    const connection = await this.connectionService.getPublicConnection(req.user.id, provider);
    if (!connection) {
      throw new BadRequestException(`${provider} is not connected`);
    }
    return connection;
  }

  /**
   * Starts the OAuth dance. The state parameter is generated server-side as a
   * short-lived signed token so the unauthenticated callback below can tell
   * whose connection is being created without trusting client input.
   */
  @Get('auth-url/:provider')
  async getAuthUrl(@Request() req, @Param('provider') provider: string) {
    const authUrl = await this.connectionService.getAuthUrl(req.user.id, provider);
    return { authUrl };
  }

  @Post('callback/:provider')
  async handleCallback(
    @Request() req,
    @Param('provider') provider: string,
    @Body() body: { code: string; state: string }
  ) {
    await this.connectionService.handleCallback(req.user.id, provider, body.code, body.state);
    return { success: true, message: `${provider} calendar connected successfully` };
  }

  @Delete('connections/:provider')
  async disconnect(@Request() req, @Param('provider') provider: string) {
    await this.connectionService.disconnect(req.user.id, provider);
    return { success: true, message: `${provider} calendar disconnected` };
  }

  // Static 'sync/all' must be declared before the dynamic 'sync/:provider'
  // route, or Nest matches provider="ALL" first and the Prisma enum lookup 500s.
  @Post('sync/all')
  async syncAllCalendars(@Request() req) {
    return this.syncService.syncAllProviders(req.user.id);
  }

  @Post('sync/:provider')
  async syncCalendar(@Request() req, @Param('provider') provider: string) {
    return this.syncService.syncCalendars(req.user.id, provider);
  }

  @Get('calendars')
  async getCalendars(@Request() req, @Query('provider') provider?: string) {
    const connections = await this.connectionService.getAllConnections(req.user.id);

    if (provider) {
      const connection = connections.find((c) => c.provider === provider.toUpperCase());
      return connection?.calendars || [];
    }

    return connections.flatMap((c) => c.calendars);
  }

  /** PATCH /api/calendar/calendars/:id/visibility — persists Calendar.isVisible. */
  @Patch('calendars/:id/visibility')
  async setCalendarVisibility(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { isVisible: boolean }
  ) {
    if (typeof body?.isVisible !== 'boolean') {
      throw new BadRequestException('isVisible must be a boolean');
    }
    return this.connectionService.setCalendarVisibility(req.user.id, id, body.isVisible);
  }

  // NOTE: The former `@Get('events')` route was removed in Stage 4. It never
  // actually served traffic — the domain CalendarController mounted at
  // `calendar/events` owns GET /api/calendar/events — and it reached into the
  // connection service's private Prisma client to return raw Event rows.
  // `calendar/calendars` here is still the live route behind
  // calendarService.listCalendars().
}

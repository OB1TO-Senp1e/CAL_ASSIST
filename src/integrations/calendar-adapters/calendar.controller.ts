import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Param,
  Query,
  Delete,
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
    return this.connectionService.getAllConnections(req.user.id);
  }

  @Get('connections/:provider')
  async getConnection(@Request() req, @Param('provider') provider: string) {
    return this.connectionService.getConnection(req.user.id, provider);
  }

  @Get('auth-url/:provider')
  async getAuthUrl(
    @Request() req,
    @Param('provider') provider: string,
    @Query('state') state: string
  ) {
    const authUrl = this.connectionService.getAuthUrl(req.user.id, provider, state || 'default');
    return { authUrl };
  }

  @Post('callback/:provider')
  async handleCallback(
    @Request() req,
    @Param('provider') provider: string,
    @Body() body: { code: string; state: string }
  ) {
    await this.connectionService.handleCallback(req.user.id, provider, body.code);
    return { success: true, message: `${provider} calendar connected successfully` };
  }

  @Delete('connections/:provider')
  async disconnect(@Request() req, @Param('provider') provider: string) {
    await this.connectionService.disconnect(req.user.id, provider);
    return { success: true, message: `${provider} calendar disconnected` };
  }

  @Post('sync/:provider')
  async syncCalendar(@Request() req, @Param('provider') provider: string) {
    return this.syncService.syncCalendars(req.user.id, provider);
  }

  @Post('sync/all')
  async syncAllCalendars(@Request() req) {
    return this.syncService.syncAllProviders(req.user.id);
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

  @Get('events')
  async getEvents(
    @Request() req,
    @Query('calendarId') calendarId?: string,
    @Query('timeMin') timeMin?: string,
    @Query('timeMax') timeMax?: string
  ) {
    const where: any = { userId: req.user.id };
    if (calendarId) where.calendarId = calendarId;
    if (timeMin || timeMax) {
      where.startDate = {};
      if (timeMin) where.startDate.gte = new Date(timeMin);
      if (timeMax) where.startDate.lte = new Date(timeMax);
    }

    return this.connectionService['prisma'].event.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });
  }
}

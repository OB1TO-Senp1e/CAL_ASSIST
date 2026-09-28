import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '@app/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CalendarService } from './services/calendar.service';
import {
  CreateEventRequest,
  UpdateEventRequest,
  MoveEventRequest,
  ResizeEventRequest,
  BulkEventRequest,
  CalendarQueryOptions,
  AvailabilityQueryOptions,
  ViewOptions,
  CreateEventSchema,
  UpdateEventSchema,
  MoveEventSchema,
  ResizeEventSchema,
  BulkEventSchema,
} from './interfaces/calendar.interface';

@Controller('calendar/events')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createEvent(
    @Request() req,
    @Body(new ZodValidationPipe(CreateEventSchema)) body: CreateEventRequest,
  ) {
    return this.calendarService.createEvent(req.user.id, body);
  }

  /**
   * Canonical event list. Accepts both query shapes:
   *   startDate/endDate  — the domain CalendarQuerySchema names.
   *   timeMin/timeMax    — Google-Calendar-style aliases that older clients
   *                        and the removed adapter route used. Aliases only
   *                        fill in missing values; explicit start/end wins.
   */
  @Get()
  async getEvents(
    @Request() req,
    @Query() query: CalendarQueryOptions & { timeMin?: string; timeMax?: string },
  ) {
    const { timeMin, timeMax, ...rest } = query;
    return this.calendarService.getEvents(req.user.id, {
      ...rest,
      startDate: rest.startDate ?? timeMin,
      endDate: rest.endDate ?? timeMax,
    });
  }

  @Get('availability')
  async getAvailability(@Request() req, @Query() query: AvailabilityQueryOptions) {
    return this.calendarService.getAvailability(req.user.id, query);
  }

  @Get('day/:date')
  async getDayView(@Request() req, @Param('date') date: string, @Query() options: ViewOptions) {
    return this.calendarService.getDayView(req.user.id, date, options);
  }

  @Get('week/:weekStart')
  async getWeekView(
    @Request() req,
    @Param('weekStart') weekStart: string,
    @Query() options: ViewOptions
  ) {
    return this.calendarService.getWeekView(req.user.id, weekStart, options);
  }

  @Get('month/:year/:month')
  async getMonthView(
    @Request() req,
    @Param('year') year: string,
    @Param('month') month: string,
    @Query() options: ViewOptions
  ) {
    return this.calendarService.getMonthView(
      req.user.id,
      parseInt(year, 10),
      parseInt(month, 10),
      options
    );
  }

  @Get('agenda')
  async getAgendaView(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query() options: ViewOptions
  ) {
    return this.calendarService.getAgendaView(req.user.id, startDate, endDate, options);
  }

  @Get('timezone/convert')
  async convertTimeZone(
    @Request() req,
    @Query('dateTime') dateTime: string,
    @Query('fromTimeZone') fromTimeZone: string,
    @Query('toTimeZone') toTimeZone: string
  ) {
    return this.calendarService.convertTimeZone(dateTime, fromTimeZone, toTimeZone);
  }

  @Get('timezone/info')
  async getTimeZoneInfo(
    @Request() req,
    @Query('timeZone') timeZone: string,
    @Query('date') date?: string
  ) {
    return this.calendarService.getTimeZoneInfo(timeZone, date);
  }

  @Get('timezone/list')
  async getTimeZones(@Request() req) {
    return this.calendarService.getSupportedTimeZones();
  }

  @Get('timezone/search')
  async searchTimeZones(@Request() req, @Query('query') query: string) {
    return this.calendarService.searchTimeZones(query);
  }

  @Get(':id')
  async getEvent(@Request() req, @Param('id') id: string) {
    return this.calendarService.getEvent(req.user.id, id);
  }

  @Patch(':id')
  async updateEvent(
    @Request() req,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateEventSchema)) body: UpdateEventRequest,
  ) {
    return this.calendarService.updateEvent(req.user.id, id, body);
  }

  @Patch(':id/move')
  async moveEvent(
    @Request() req,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MoveEventSchema)) body: MoveEventRequest,
  ) {
    return this.calendarService.moveEvent(req.user.id, id, body);
  }

  @Patch(':id/resize')
  async resizeEvent(
    @Request() req,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResizeEventSchema)) body: ResizeEventRequest,
  ) {
    return this.calendarService.resizeEvent(req.user.id, id, body);
  }

  @Post('bulk')
  async bulkAction(
    @Request() req,
    @Body(new ZodValidationPipe(BulkEventSchema)) body: BulkEventRequest,
  ) {
    return this.calendarService.bulkAction(req.user.id, body);
  }

  @Get(':id/instances')
  async getRecurringInstances(
    @Request() req,
    @Param('id') id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    return this.calendarService.getRecurringInstances(req.user.id, id, startDate, endDate);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEvent(@Request() req, @Param('id') id: string) {
    await this.calendarService.deleteEvent(req.user.id, id);
  }

  @Post('conflicts/check')
  async checkConflicts(
    @Request() req,
    @Body() body: { event: Partial<CreateEventRequest>; excludeEventId?: string }
  ) {
    return this.calendarService.checkConflicts(req.user.id, body.event, body.excludeEventId);
  }
}

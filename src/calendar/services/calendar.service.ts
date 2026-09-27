import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@app/common/services/prisma.service';
import {
  CalendarEvent,
  DateTime,
  RecurrenceRule,
  EventParticipant,
  EventCategory,
  EventStatus,
  TimeSlot,
  UUID,
} from '../domain/calendar-event';
import { RecurrenceEngine } from '../domain/recurrence-engine';
import { TimeZoneEngine } from '../domain/timezone-engine';
import { ConflictDetector, ConflictResult } from './conflict-detector';
import { AvailabilityCalculator } from './availability-calculator';
import { ViewGenerator, ViewOptions } from '../views/view-generator';

export interface CreateEventRequest {
  calendarId: UUID;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  timeZone?: string;
  recurrence?: RecurrenceRule | string;
  category?: EventCategory;
  color?: string;
  participants?: EventParticipant[];
  reminders?: { minutesBefore: number; method: 'EMAIL' | 'PUSH' | 'SMS' | 'POPUP' }[];
}

export interface UpdateEventRequest {
  title?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  timeZone?: string;
  recurrence?: RecurrenceRule | string | null;
  category?: EventCategory;
  color?: string;
  status?: EventStatus;
  participants?: EventParticipant[];
}

export interface MoveEventRequest {
  newStart: string;
  newEnd: string;
  timeZone?: string;
}

export interface ResizeEventRequest {
  newEnd: string;
  timeZone?: string;
}

export interface BulkEventRequest {
  eventIds: UUID[];
  action: 'delete' | 'cancel' | 'confirm' | 'move' | 'resize';
  newStart?: string;
  newEnd?: string;
  timeZone?: string;
}

export interface CalendarQueryOptions {
  startDate?: string;
  endDate?: string;
  status?: EventStatus[];
  category?: EventCategory[];
  limit?: number;
  offset?: number;
}

export interface AvailabilityQueryOptions {
  startDate: string;
  endDate: string;
  durationMinutes: number;
  workingHours?: { start: number; end: number; days: number[] };
  bufferMinutes?: number;
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async createEvent(userId: UUID, request: CreateEventRequest): Promise<CalendarEvent> {
    const start = DateTime.fromISO(request.start, request.timeZone || 'UTC');
    const end = DateTime.fromISO(request.end, request.timeZone || 'UTC');

    if (end.isBefore(start) || end.equals(start)) {
      throw new BadRequestException('End time must be after start time');
    }

    const recurrence =
      typeof request.recurrence === 'string'
        ? RecurrenceEngine.parse(request.recurrence)
        : request.recurrence;

    const eventData = {
      userId,
      calendarId: request.calendarId,
      title: request.title,
      description: request.description,
      location: request.location,
      startDate: start.utc,
      endDate: end.utc,
      allDay: request.allDay || false,
      timezone: request.timeZone || 'UTC',
      recurrenceRule: recurrence ? RecurrenceEngine.toString(recurrence) : undefined,
      status: 'CONFIRMED' as EventStatus,
      category: request.category || 'PERSONAL',
      color: request.color,
    };

    const event = await this.prisma.event.create({
      data: eventData,
    });

    if (request.participants && request.participants.length > 0) {
      await this.addParticipants(event.id, request.participants);
    }

    if (request.reminders && request.reminders.length > 0) {
      await this.addReminders(userId, event.id, request.reminders);
    }

    return this.toCalendarEvent(event);
  }

  async getEvent(userId: UUID, eventId: UUID): Promise<CalendarEvent> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, userId },
      include: {
        eventParticipants: true,
        reminders: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.toCalendarEvent(event);
  }

  async getEvents(userId: UUID, options: CalendarQueryOptions = {}): Promise<CalendarEvent[]> {
    const where: any = { userId };

    if (options.status && options.status.length > 0) {
      where.status = { in: options.status };
    }

    if (options.category && options.category.length > 0) {
      where.category = { in: options.category };
    }

    if (options.startDate || options.endDate) {
      where.startDate = {};
      if (options.startDate) where.startDate.gte = new Date(options.startDate);
      if (options.endDate) where.startDate.lte = new Date(options.endDate);
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { startDate: 'asc' },
      take: options.limit,
      skip: options.offset,
      include: {
        eventParticipants: true,
        reminders: true,
      },
    });

    return events.map((e) => this.toCalendarEvent(e));
  }

  async updateEvent(
    userId: UUID,
    eventId: UUID,
    request: UpdateEventRequest
  ): Promise<CalendarEvent> {
    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Event not found');
    }

    const start = request.start
      ? DateTime.fromISO(request.start, request.timeZone || existing.timezone)
      : null;
    const end = request.end
      ? DateTime.fromISO(request.end, request.timeZone || existing.timezone)
      : null;

    if (start && end && (end.isBefore(start) || end.equals(start))) {
      throw new BadRequestException('End time must be after start time');
    }

    const recurrence =
      typeof request.recurrence === 'string'
        ? RecurrenceEngine.parse(request.recurrence)
        : request.recurrence;

    const updateData: any = {};
    if (request.title) updateData.title = request.title;
    if (request.description !== undefined) updateData.description = request.description;
    if (request.location !== undefined) updateData.location = request.location;
    if (start) updateData.startDate = start.utc;
    if (end) updateData.endDate = end.utc;
    if (request.allDay !== undefined) updateData.allDay = request.allDay;
    if (request.timeZone) updateData.timezone = request.timeZone;
    if (recurrence) updateData.recurrenceRule = RecurrenceEngine.toString(recurrence);
    else if (request.recurrence === null) updateData.recurrenceRule = null;
    if (request.category) updateData.category = request.category;
    if (request.color !== undefined) updateData.color = request.color;
    if (request.status) updateData.status = request.status;

    const event = await this.prisma.event.update({
      where: { id: eventId },
      data: updateData,
      include: {
        eventParticipants: true,
        reminders: true,
      },
    });

    if (request.participants) {
      await this.replaceParticipants(eventId, request.participants);
    }

    return this.toCalendarEvent(event);
  }

  async moveEvent(userId: UUID, eventId: UUID, request: MoveEventRequest): Promise<CalendarEvent> {
    const newStart = DateTime.fromISO(request.newStart, request.timeZone);
    const newEnd = DateTime.fromISO(request.newEnd, request.timeZone);

    if (newEnd.isBefore(newStart) || newEnd.equals(newStart)) {
      throw new BadRequestException('End time must be after start time');
    }

    const duration = newEnd.diffInMinutes(newStart);
    const original = await this.getEvent(userId, eventId);
    const originalDuration = original.end.diffInMinutes(original.start);

    if (Math.abs(duration - originalDuration) > 1) {
      throw new BadRequestException(
        'Event duration cannot change during move. Use resize instead.'
      );
    }

    return this.updateEvent(userId, eventId, {
      start: request.newStart,
      end: request.newEnd,
      timeZone: request.timeZone,
    });
  }

  async resizeEvent(
    userId: UUID,
    eventId: UUID,
    request: ResizeEventRequest
  ): Promise<CalendarEvent> {
    const newEnd = DateTime.fromISO(request.newEnd, request.timeZone);
    const original = await this.getEvent(userId, eventId);

    if (newEnd.isBefore(original.start) || newEnd.equals(original.start)) {
      throw new BadRequestException('End time must be after start time');
    }

    return this.updateEvent(userId, eventId, {
      end: request.newEnd,
      timeZone: request.timeZone,
    });
  }

  async deleteEvent(userId: UUID, eventId: UUID): Promise<void> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    await this.prisma.event.delete({ where: { id: eventId } });
  }

  async checkConflicts(
    userId: UUID,
    event: Partial<CreateEventRequest>,
    excludeEventId?: UUID
  ): Promise<ConflictResult> {
    const start = DateTime.fromISO(event.start!, event.timeZone || 'UTC');
    const end = DateTime.fromISO(event.end!, event.timeZone || 'UTC');

    const existingEvents = await this.getEvents(userId, {
      startDate: start.toISOString(),
      endDate: end.addDays(1).toISOString(),
    });

    const newEvent: CalendarEvent = {
      id: excludeEventId || 'new',
      userId,
      calendarId: event.calendarId || '',
      title: event.title || '',
      start,
      end,
      allDay: event.allDay || false,
      timeZone: event.timeZone || 'UTC',
      recurrence:
        typeof event.recurrence === 'string'
          ? (RecurrenceEngine.parse(event.recurrence) ?? undefined)
          : event.recurrence,
      status: 'CONFIRMED',
      category: 'PERSONAL',
      participants: [],
      reminders: [],
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    };

    return ConflictDetector.detectConflicts(newEvent, existingEvents, {
      checkRecurrences: true,
    });
  }

  async getAvailability(userId: UUID, options: AvailabilityQueryOptions): Promise<TimeSlot[]> {
    const events = await this.getEvents(userId, {
      startDate: options.startDate,
      endDate: options.endDate,
      status: ['CONFIRMED', 'TENTATIVE'],
    });

    const workingHours = options.workingHours || {
      start: 9,
      end: 17,
      days: [1, 2, 3, 4, 5],
    };

    return AvailabilityCalculator.calculateAvailability(events, {
      ...options,
      workingHours,
      timeZone: 'UTC',
      minSlotDuration: options.durationMinutes,
    });
  }

  async getDayView(userId: UUID, date: string, options: Partial<ViewOptions> = {}): Promise<any> {
    const events = await this.getEvents(userId, {
      startDate: date,
      endDate: date,
    });

    const viewOptions: ViewOptions = {
      timeZone: options.timeZone || 'UTC',
      workingHours: options.workingHours || { start: 9, end: 17, days: [1, 2, 3, 4, 5] },
      showDeclined: options.showDeclined,
      showTentative: options.showTentative,
      showCancelled: options.showCancelled,
    };

    return ViewGenerator.generateDayView(events, DateTime.fromISO(date), viewOptions);
  }

  async getWeekView(
    userId: UUID,
    weekStart: string,
    options: Partial<ViewOptions> = {}
  ): Promise<any> {
    const start = DateTime.fromISO(weekStart);
    const end = start.addDays(6);

    const events = await this.getEvents(userId, {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });

    const viewOptions: ViewOptions = {
      timeZone: options.timeZone || 'UTC',
      workingHours: options.workingHours || { start: 9, end: 17, days: [1, 2, 3, 4, 5] },
      showDeclined: options.showDeclined,
      showTentative: options.showTentative,
      showCancelled: options.showCancelled,
    };

    return ViewGenerator.generateWeekView(events, start, viewOptions);
  }

  async getMonthView(
    userId: UUID,
    year: number,
    month: number,
    options: Partial<ViewOptions> = {}
  ): Promise<any> {
    const start = DateTime.fromISO(`${year}-${String(month + 1).padStart(2, '0')}-01`);
    const end =
      month === 11
        ? DateTime.fromISO(`${year + 1}-01-01`).addDays(-1)
        : DateTime.fromISO(`${year}-${String(month + 2).padStart(2, '0')}-01`).addDays(-1);

    const events = await this.getEvents(userId, {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });

    const viewOptions: ViewOptions = {
      timeZone: options.timeZone || 'UTC',
      workingHours: options.workingHours || { start: 9, end: 17, days: [1, 2, 3, 4, 5] },
      showDeclined: options.showDeclined,
      showTentative: options.showTentative,
      showCancelled: options.showCancelled,
    };

    return ViewGenerator.generateMonthView(events, year, month, viewOptions);
  }

  async getAgendaView(
    userId: UUID,
    startDate: string,
    endDate: string,
    options: Partial<ViewOptions> = {}
  ): Promise<CalendarEvent[]> {
    const events = await this.getEvents(userId, {
      startDate,
      endDate,
    });

    const viewOptions: ViewOptions = {
      timeZone: options.timeZone || 'UTC',
      workingHours: options.workingHours || { start: 9, end: 17, days: [1, 2, 3, 4, 5] },
      showDeclined: options.showDeclined,
      showTentative: options.showTentative,
      showCancelled: options.showCancelled,
    };

    return ViewGenerator.generateAgendaView(
      events,
      DateTime.fromISO(startDate),
      DateTime.fromISO(endDate),
      viewOptions
    );
  }

  async convertTimeZone(
    dateTime: string,
    fromTimeZone: string,
    toTimeZone: string
  ): Promise<string> {
    const dt = DateTime.fromISO(dateTime, fromTimeZone);
    const converted = TimeZoneEngine.convertTime(dt, fromTimeZone, toTimeZone);
    return converted.toISOString();
  }

  async getTimeZoneInfo(timeZone: string, date?: string): Promise<any> {
    const dt = date ? DateTime.fromISO(date) : DateTime.now(timeZone);
    return TimeZoneEngine.getTimeZoneInfo(timeZone, dt);
  }

  async getSupportedTimeZones(): Promise<string[]> {
    return TimeZoneEngine.getAllTimeZones();
  }

  async searchTimeZones(query: string): Promise<string[]> {
    return TimeZoneEngine.findTimeZone(query);
  }

  async addParticipants(eventId: UUID, participants: EventParticipant[]): Promise<void> {
    await this.prisma.eventParticipant.createMany({
      data: participants.map((p) => ({
        eventId,
        email: p.email,
        displayName: p.displayName,
        status: p.status,
        role: p.role,
      })),
      skipDuplicates: true,
    });
  }

  async replaceParticipants(eventId: UUID, participants: EventParticipant[]): Promise<void> {
    await this.prisma.eventParticipant.deleteMany({ where: { eventId } });
    if (participants.length > 0) {
      await this.addParticipants(eventId, participants);
    }
  }

  async addReminders(
    userId: UUID,
    eventId: UUID,
    reminders: { minutesBefore: number; method: string }[]
  ): Promise<void> {
    await this.prisma.reminder.createMany({
      data: reminders.map((r) => ({
        userId,
        eventId,
        timeType: 'MINUTES_BEFORE',
        timeValue: r.minutesBefore,
        method: r.method as any,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }

  async getRecurringInstances(
    userId: UUID,
    eventId: UUID,
    startDate: string,
    endDate: string
  ): Promise<CalendarEvent[]> {
    const masterEvent = await this.getEvent(userId, eventId);

    if (!masterEvent.recurrence) {
      return [masterEvent];
    }

    const instances = RecurrenceEngine.getOccurrencesInRange(
      masterEvent.recurrence,
      masterEvent.start,
      masterEvent.end,
      DateTime.fromISO(startDate),
      DateTime.fromISO(endDate),
      masterEvent.timeZone,
      masterEvent.exceptionDates || []
    );

    return instances.map((instance, index) => ({
      ...masterEvent,
      id: `${masterEvent.id}_instance_${index}`,
      start: instance.start,
      end: instance.end,
      recurrence: undefined,
      recurrenceId: masterEvent.id,
    }));
  }

  async bulkAction(
    userId: UUID,
    request: BulkEventRequest
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const eventId of request.eventIds) {
      try {
        switch (request.action) {
          case 'delete':
            await this.deleteEvent(userId, eventId);
            break;
          case 'cancel':
            await this.updateEvent(userId, eventId, { status: 'CANCELLED' });
            break;
          case 'confirm':
            await this.updateEvent(userId, eventId, { status: 'CONFIRMED' });
            break;
          case 'move':
            if (request.newStart && request.newEnd) {
              await this.moveEvent(userId, eventId, {
                newStart: request.newStart,
                newEnd: request.newEnd,
                timeZone: request.timeZone,
              });
            } else {
              throw new BadRequestException('Move action requires newStart and newEnd');
            }
            break;
          case 'resize':
            if (request.newEnd) {
              await this.resizeEvent(userId, eventId, {
                newEnd: request.newEnd,
                timeZone: request.timeZone,
              });
            } else {
              throw new BadRequestException('Resize action requires newEnd');
            }
            break;
        }
        success++;
      } catch (error) {
        failed++;
        console.error(`Bulk action failed for event ${eventId}:`, error);
      }
    }

    return { success, failed };
  }

  private toCalendarEvent(prismaEvent: any): CalendarEvent {
    return {
      id: prismaEvent.id,
      userId: prismaEvent.userId,
      calendarId: prismaEvent.calendarId,
      title: prismaEvent.title,
      description: prismaEvent.description,
      location: prismaEvent.location,
      start: DateTime.fromISO(prismaEvent.startDate.toISOString(), prismaEvent.timezone),
      end: DateTime.fromISO(prismaEvent.endDate.toISOString(), prismaEvent.timezone),
      allDay: prismaEvent.allDay,
      timeZone: prismaEvent.timezone,
      recurrence: prismaEvent.recurrenceRule
        ? (RecurrenceEngine.parse(prismaEvent.recurrenceRule) ?? undefined)
        : undefined,
      exceptionDates: prismaEvent.exceptionDates?.map((d: Date) =>
        DateTime.fromISO(d.toISOString())
      ),
      recurrenceId: prismaEvent.recurrenceId,
      status: prismaEvent.status,
      category: prismaEvent.category,
      color: prismaEvent.color,
      participants:
        prismaEvent.eventParticipants?.map((p: any) => ({
          id: p.id,
          email: p.email,
          displayName: p.displayName,
          status: p.status,
          role: p.role,
          responseAt: p.responseAt ? DateTime.fromISO(p.responseAt.toISOString()) : undefined,
        })) || [],
      organizer: prismaEvent.organizer
        ? {
            id: prismaEvent.organizer.id,
            email: prismaEvent.organizer.email,
            displayName: prismaEvent.organizer.displayName,
            status: prismaEvent.organizer.status,
            role: 'ORGANIZER',
          }
        : undefined,
      reminders:
        prismaEvent.reminders?.map((r: any) => ({
          id: r.id,
          eventId: r.eventId,
          minutesBefore: r.minutesBefore,
          method: r.method,
          triggered: r.triggered,
        })) || [],
      metadata: prismaEvent.metadata,
      createdAt: DateTime.fromISO(prismaEvent.createdAt.toISOString()),
      updatedAt: DateTime.fromISO(prismaEvent.updatedAt.toISOString()),
      deletedAt: prismaEvent.deletedAt
        ? DateTime.fromISO(prismaEvent.deletedAt.toISOString())
        : undefined,
    };
  }
}

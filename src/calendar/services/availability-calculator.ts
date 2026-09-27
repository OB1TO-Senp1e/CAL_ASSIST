import { CalendarEvent, TimeSlot, DateTime, Duration } from '../domain/calendar-event';

export interface AvailabilityOptions {
  workingHours: { start: number; end: number; days: number[] };
  timeZone: string;
  bufferMinutes?: number;
  minSlotDuration?: number;
  maxResults?: number;
  includeWeekends?: boolean;
}

export interface BusyPeriod {
  start: DateTime;
  end: DateTime;
  eventId: string;
  eventTitle: string;
  isAllDay: boolean;
}

export class AvailabilityCalculator {
  static calculateAvailability(events: CalendarEvent[], options: AvailabilityOptions): TimeSlot[] {
    const {
      workingHours,
      timeZone,
      bufferMinutes = 15,
      minSlotDuration = 30,
      maxResults = 50,
      includeWeekends = false,
    } = options;

    const now = DateTime.now(timeZone);
    const endDate = now.addDays(30);
    const slots: TimeSlot[] = [];

    let currentDate = now.startOfDay();

    while (currentDate.isBefore(endDate) && slots.length < maxResults) {
      const dayOfWeek = currentDate.toDate().getDay();

      if (!includeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        currentDate = currentDate.addDays(1);
        continue;
      }

      if (!workingHours.days.includes(dayOfWeek)) {
        currentDate = currentDate.addDays(1);
        continue;
      }

      const daySlots = this.getDayAvailability(
        events,
        currentDate,
        workingHours,
        timeZone,
        bufferMinutes,
        minSlotDuration
      );
      slots.push(...daySlots);

      currentDate = currentDate.addDays(1);
    }

    return slots.slice(0, maxResults);
  }

  private static getDayAvailability(
    events: CalendarEvent[],
    date: DateTime,
    workingHours: { start: number; end: number },
    timeZone: string,
    bufferMinutes: number,
    minSlotDuration: number
  ): TimeSlot[] {
    const dayStart = date.addMinutes(workingHours.start * 60);
    const dayEnd = date.addMinutes(workingHours.end * 60);

    const targetDateStr = date.toISOString().split('T')[0];

    const dayEvents = events
      .filter((e) => {
        if (e.status === 'CANCELLED') return false;
        const eventDate = e.start.toISOString().split('T')[0];
        return eventDate === targetDateStr;
      })
      .sort((a, b) => a.start.utc.getTime() - b.start.utc.getTime());

    const busyPeriods: BusyPeriod[] = dayEvents.map((e) => ({
      start: e.start,
      end: e.end.addMinutes(bufferMinutes),
      eventId: e.id,
      eventTitle: e.title,
      isAllDay: e.allDay,
    }));

    const slots: TimeSlot[] = [];
    let currentStart = dayStart;

    for (const busy of busyPeriods) {
      if (currentStart.isBefore(busy.start)) {
        const duration = currentStart.diffInMinutes(busy.start);
        if (duration >= minSlotDuration) {
          slots.push({
            start: currentStart,
            end: busy.start,
            available: true,
          });
        }
      }

      if (busy.end.isAfter(currentStart)) {
        currentStart = busy.end;
      }
    }

    if (currentStart.isBefore(dayEnd)) {
      const duration = currentStart.diffInMinutes(dayEnd);
      if (duration >= minSlotDuration) {
        slots.push({
          start: currentStart,
          end: dayEnd,
          available: true,
        });
      }
    }

    return slots;
  }

  static findNextAvailableSlot(
    events: CalendarEvent[],
    fromDate: DateTime,
    durationMinutes: number,
    options: AvailabilityOptions
  ): TimeSlot | null {
    const allSlots = this.calculateAvailability(events, {
      ...options,
      minSlotDuration: durationMinutes,
      maxResults: 100,
    });

    return (
      allSlots.find((slot) => slot.start.isAfter(fromDate) || slot.start.equals(fromDate)) || null
    );
  }

  static getBusyPeriods(
    events: CalendarEvent[],
    startDate: DateTime,
    endDate: DateTime,
    timeZone: string
  ): BusyPeriod[] {
    return events
      .filter((e) => {
        if (e.status === 'CANCELLED') return false;
        return e.start.isBefore(endDate) && e.end.isAfter(startDate);
      })
      .map((e) => ({
        start: e.start,
        end: e.end,
        eventId: e.id,
        eventTitle: e.title,
        isAllDay: e.allDay,
      }))
      .sort((a, b) => a.start.utc.getTime() - b.start.utc.getTime());
  }

  static calculateFreeBusy(
    events: CalendarEvent[],
    startDate: DateTime,
    endDate: DateTime,
    timeZone: string
  ): { free: TimeSlot[]; busy: BusyPeriod[] } {
    const busy = this.getBusyPeriods(events, startDate, endDate, timeZone);
    const free: TimeSlot[] = [];

    if (busy.length === 0) {
      free.push({ start: startDate, end: endDate, available: true });
      return { free, busy };
    }

    let current = startDate;

    for (const period of busy) {
      if (current.isBefore(period.start)) {
        free.push({ start: current, end: period.start, available: true });
      }
      current = period.end.isAfter(current) ? period.end : current;
    }

    if (current.isBefore(endDate)) {
      free.push({ start: current, end: endDate, available: true });
    }

    return { free, busy };
  }

  static getWorkingHoursForDate(
    events: CalendarEvent[],
    date: DateTime,
    defaultWorkingHours: { start: number; end: number }
  ): { start: number; end: number } {
    const dayEvents = events.filter((e) => {
      const eventDate = e.start.toISOString().split('T')[0];
      return eventDate === date.toISOString().split('T')[0] && e.category === 'WORK';
    });

    if (dayEvents.length === 0) {
      return defaultWorkingHours;
    }

    const earliestStart = Math.min(...dayEvents.map((e) => e.start.toDate().getHours()));
    const latestEnd = Math.max(...dayEvents.map((e) => e.end.toDate().getHours()));

    return {
      start: Math.max(0, earliestStart - 1),
      end: Math.min(23, latestEnd + 1),
    };
  }

  static getOptimalMeetingTime(
    attendeesEvents: Map<string, CalendarEvent[]>,
    durationMinutes: number,
    options: AvailabilityOptions,
    preferredHours?: { start: number; end: number }
  ): TimeSlot | null {
    const allAttendeeEvents = Array.from(attendeesEvents.values()).flat();

    const now = DateTime.now(options.timeZone);
    const endDate = now.addDays(14);

    let currentDate = now.startOfDay();

    while (currentDate.isBefore(endDate)) {
      const dayOfWeek = currentDate.toDate().getDay();
      if (!options.workingHours.days.includes(dayOfWeek)) {
        currentDate = currentDate.addDays(1);
        continue;
      }

      const dayStart = currentDate.addMinutes(options.workingHours.start * 60);
      const dayEnd = currentDate.addMinutes(options.workingHours.end * 60);

      const dayEvents = allAttendeeEvents.filter((e) => {
        const eventDate = e.start.toISOString().split('T')[0];
        return eventDate === currentDate.toISOString().split('T')[0] && e.status !== 'CANCELLED';
      });

      const slots = this.findSlotsInDay(
        dayEvents,
        dayStart,
        dayEnd,
        durationMinutes,
        options.bufferMinutes || 15
      );

      if (preferredHours) {
        const preferredSlots = slots.filter(
          (s) =>
            s.start.toDate().getHours() >= preferredHours.start &&
            s.end.toDate().getHours() <= preferredHours.end
        );
        if (preferredSlots.length > 0) return preferredSlots[0];
      }

      if (slots.length > 0) return slots[0];

      currentDate = currentDate.addDays(1);
    }

    return null;
  }

  private static findSlotsInDay(
    events: CalendarEvent[],
    dayStart: DateTime,
    dayEnd: DateTime,
    durationMinutes: number,
    bufferMinutes: number
  ): TimeSlot[] {
    const sortedEvents = events.sort((a, b) => a.start.utc.getTime() - b.start.utc.getTime());

    const slots: TimeSlot[] = [];
    let currentStart = dayStart;

    for (const event of sortedEvents) {
      const eventEnd = event.end.addMinutes(bufferMinutes);

      if (currentStart.isBefore(event.start)) {
        const duration = currentStart.diffInMinutes(event.start);
        if (duration >= durationMinutes) {
          slots.push({ start: currentStart, end: event.start, available: true });
        }
      }

      if (eventEnd.isAfter(currentStart)) {
        currentStart = eventEnd;
      }
    }

    if (currentStart.isBefore(dayEnd)) {
      const duration = currentStart.diffInMinutes(dayEnd);
      if (duration >= durationMinutes) {
        slots.push({ start: currentStart, end: dayEnd, available: true });
      }
    }

    return slots;
  }
}

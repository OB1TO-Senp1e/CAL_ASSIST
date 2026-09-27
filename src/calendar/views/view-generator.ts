import {
  CalendarEvent,
  DayView,
  WeekView,
  MonthView,
  TimeSlot,
  DateTime,
} from '../domain/calendar-event';
import { ConflictDetector } from '../services/conflict-detector';
import { AvailabilityCalculator } from '../services/availability-calculator';
import { RecurrenceEngine } from '../domain/recurrence-engine';

export interface ViewOptions {
  timeZone: string;
  workingHours: { start: number; end: number; days: number[] };
  showDeclined?: boolean;
  showTentative?: boolean;
  showCancelled?: boolean;
}

export class ViewGenerator {
  static generateDayView(events: CalendarEvent[], date: DateTime, options: ViewOptions): DayView {
    const targetDateStr = date.toISOString().split('T')[0];

    const dayEvents = events.filter((e) => {
      if (!this.shouldShowEvent(e, options)) return false;

      const eventDate = e.start.toISOString().split('T')[0];
      const isRecurringInstance = this.isEventOnDate(e, targetDateStr);

      return eventDate === targetDateStr || isRecurringInstance;
    });

    const allDayEvents = dayEvents.filter((e) => e.allDay);
    const timedEvents = dayEvents.filter((e) => !e.allDay);

    const sortedTimedEvents = timedEvents.sort(
      (a, b) => a.start.utc.getTime() - b.start.utc.getTime()
    );

    const timeSlots = this.generateTimeSlots(sortedTimedEvents, date, options.workingHours);

    return {
      date,
      events: sortedTimedEvents,
      allDayEvents,
      timeSlots,
      workingHours: {
        start: options.workingHours.start,
        end: options.workingHours.end,
      },
    };
  }

  static generateWeekView(
    events: CalendarEvent[],
    weekStart: DateTime,
    options: ViewOptions
  ): WeekView {
    const weekEnd = weekStart.addDays(6).endOfDay();
    const days: DayView[] = [];

    for (let i = 0; i < 7; i++) {
      const day = weekStart.addDays(i);
      const dayView = this.generateDayView(events, day, options);
      days.push(dayView);
    }

    return {
      weekStart,
      weekEnd,
      days,
    };
  }

  static generateMonthView(
    events: CalendarEvent[],
    year: number,
    month: number,
    options: ViewOptions
  ): MonthView {
    const monthStart = DateTime.fromISO(`${year}-${String(month + 1).padStart(2, '0')}-01`);
    const monthEnd =
      month === 11
        ? DateTime.fromISO(`${year + 1}-01-01`).addDays(-1)
        : DateTime.fromISO(`${year}-${String(month + 2).padStart(2, '0')}-01`).addDays(-1);

    const weeks: WeekView[] = [];
    const eventsByDate = new Map<string, CalendarEvent[]>();

    let currentWeekStart = monthStart.startOfDay();
    while (currentWeekStart.toDate().getDay() !== 1) {
      currentWeekStart = currentWeekStart.addDays(-1);
    }

    while (currentWeekStart.isBefore(monthEnd)) {
      const weekView = this.generateWeekView(events, currentWeekStart, options);
      weeks.push(weekView);

      for (const day of weekView.days) {
        const dateStr = day.date.toISOString().split('T')[0];
        const dayEvents = day.events.concat(day.allDayEvents);
        if (dayEvents.length > 0) {
          eventsByDate.set(dateStr, dayEvents);
        }
      }

      currentWeekStart = currentWeekStart.addDays(7);
    }

    return {
      month,
      year,
      weeks,
      eventsByDate,
    };
  }

  static generateAgendaView(
    events: CalendarEvent[],
    startDate: DateTime,
    endDate: DateTime,
    options: ViewOptions
  ): CalendarEvent[] {
    return events
      .filter((e) => {
        if (!this.shouldShowEvent(e, options)) return false;

        const isRecurring =
          e.recurrence && RecurrenceEngine.isRecurring({ recurrence: e.recurrence });
        if (isRecurring && e.recurrence) {
          const instances = RecurrenceEngine.getOccurrencesInRange(
            e.recurrence,
            e.start,
            e.end,
            startDate,
            endDate,
            e.timeZone,
            e.exceptionDates || []
          );
          return instances.length > 0;
        }

        return e.start.isBefore(endDate) && e.end.isAfter(startDate);
      })
      .sort((a, b) => a.start.utc.getTime() - b.start.utc.getTime());
  }

  static generateTimelineView(
    events: CalendarEvent[],
    date: DateTime,
    options: ViewOptions
  ): { time: string; events: CalendarEvent[] }[] {
    const dayView = this.generateDayView(events, date, options);
    const timeline: { time: string; events: CalendarEvent[] }[] = [];

    for (const slot of dayView.timeSlots) {
      if (!slot.available && slot.conflictingEvents) {
        timeline.push({
          time: this.formatTimeRange(slot.start, slot.end),
          events: slot.conflictingEvents,
        });
      }
    }

    return timeline;
  }

  private static generateTimeSlots(
    events: CalendarEvent[],
    date: DateTime,
    workingHours: { start: number; end: number }
  ): TimeSlot[] {
    const dayStart = date.addMinutes(workingHours.start * 60);
    const dayEnd = date.addMinutes(workingHours.end * 60);

    const slots: TimeSlot[] = [];
    const slotDuration = 30; // 30-minute slots

    let current = dayStart;
    while (current.isBefore(dayEnd)) {
      const slotEnd = current.addMinutes(slotDuration);
      const conflictingEvents = events.filter(
        (e) => e.start.isBefore(slotEnd) && e.end.isAfter(current)
      );

      slots.push({
        start: current,
        end: slotEnd,
        available: conflictingEvents.length === 0,
        conflictingEvents: conflictingEvents.length > 0 ? conflictingEvents : undefined,
      });

      current = slotEnd;
    }

    return slots;
  }

  private static shouldShowEvent(event: CalendarEvent, options: ViewOptions): boolean {
    if (event.status === 'CANCELLED' && !options.showCancelled) return false;
    if (event.status === 'TENTATIVE' && !options.showTentative) return false;
    if (event.status === 'NEEDS_ACTION' && !options.showDeclined) return false;
    return true;
  }

  private static isEventOnDate(event: CalendarEvent, dateStr: string): boolean {
    if (!event.recurrence) return false;

    const instances = RecurrenceEngine.getOccurrencesInRange(
      event.recurrence,
      event.start,
      event.end,
      DateTime.fromISO(dateStr + 'T00:00:00'),
      DateTime.fromISO(dateStr + 'T23:59:59'),
      event.timeZone,
      event.exceptionDates || []
    );

    return instances.length > 0;
  }

  private static formatTimeRange(start: DateTime, end: DateTime): string {
    const formatTime = (dt: DateTime) => {
      const hours = dt.toDate().getHours();
      const minutes = dt.toDate().getMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
    };

    return `${formatTime(start)} - ${formatTime(end)}`;
  }
}

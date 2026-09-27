import { CalendarEvent, TimeSlot, DateTime } from '../domain/calendar-event';

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: ConflictDetail[];
  severity: 'NONE' | 'WARNING' | 'ERROR';
}

export interface ConflictDetail {
  eventId: string;
  eventTitle: string;
  conflictType: 'OVERLAP' | 'CONTAINS' | 'ADJACENT' | 'RECURRENCE_OVERLAP';
  overlapMinutes: number;
  suggestion?: string;
}

export interface ConflictCheckOptions {
  ignoreCancelled?: boolean;
  ignoreTentative?: boolean;
  bufferMinutes?: number;
  checkRecurrences?: boolean;
  recurrenceRangeDays?: number;
}

export class ConflictDetector {
  static async detectConflicts(
    newEvent: CalendarEvent,
    existingEvents: CalendarEvent[],
    options: ConflictCheckOptions = {}
  ): Promise<ConflictResult> {
    const {
      ignoreCancelled = true,
      ignoreTentative = false,
      bufferMinutes = 0,
      checkRecurrences = true,
      recurrenceRangeDays = 365,
    } = options;

    const filteredEvents = existingEvents.filter((e) => {
      if (e.id === newEvent.id) return false;
      if (ignoreCancelled && e.status === 'CANCELLED') return false;
      if (ignoreTentative && e.status === 'TENTATIVE') return false;
      return true;
    });

    const conflicts: ConflictDetail[] = [];

    for (const existing of filteredEvents) {
      const conflict = this.checkEventConflict(newEvent, existing, bufferMinutes);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    if (checkRecurrences && newEvent.recurrence) {
      const recurrenceConflicts = await this.checkRecurrenceConflicts(
        newEvent,
        filteredEvents,
        recurrenceRangeDays,
        bufferMinutes
      );
      conflicts.push(...recurrenceConflicts);
    }

    const severity =
      conflicts.length > 0
        ? conflicts.some((c) => c.conflictType === 'OVERLAP')
          ? 'ERROR'
          : 'WARNING'
        : 'NONE';

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
      severity,
    };
  }

  private static checkEventConflict(
    eventA: CalendarEvent,
    eventB: CalendarEvent,
    bufferMinutes: number
  ): ConflictDetail | null {
    const startA = eventA.start.utc.getTime();
    const endA = eventA.end.utc.getTime() + bufferMinutes * 60 * 1000;
    const startB = eventB.start.utc.getTime();
    const endB = eventB.end.utc.getTime() + bufferMinutes * 60 * 1000;

    if (eventA.allDay && eventB.allDay) {
      const dateA = eventA.start.toISOString().split('T')[0];
      const dateB = eventB.start.toISOString().split('T')[0];
      if (dateA === dateB) {
        return {
          eventId: eventB.id,
          eventTitle: eventB.title,
          conflictType: 'OVERLAP',
          overlapMinutes: 24 * 60,
          suggestion: 'Both events are all-day on the same date',
        };
      }
      return null;
    }

    if (eventA.allDay || eventB.allDay) {
      const allDayEvent = eventA.allDay ? eventA : eventB;
      const timedEvent = eventA.allDay ? eventB : eventA;

      const allDayDate = allDayEvent.start.toISOString().split('T')[0];
      const timedDate = timedEvent.start.toISOString().split('T')[0];

      if (allDayDate === timedDate) {
        return {
          eventId: timedEvent.id,
          eventTitle: timedEvent.title,
          conflictType: 'OVERLAP',
          overlapMinutes: timedEvent.end.diffInMinutes(timedEvent.start),
          suggestion: `All-day event "${allDayEvent.title}" conflicts with timed event`,
        };
      }
      return null;
    }

    const overlapStart = Math.max(startA, startB);
    const overlapEnd = Math.min(endA, endB);
    const overlapMs = overlapEnd - overlapStart;

    if (overlapMs > 0) {
      const overlapMinutes = Math.round(overlapMs / (1000 * 60));

      let conflictType: ConflictDetail['conflictType'] = 'OVERLAP';
      if (startA <= startB && endA >= endB) {
        conflictType = 'CONTAINS';
      } else if (startB <= startA && endB >= endA) {
        conflictType = 'CONTAINS';
      } else if (overlapMs < 60 * 1000) {
        conflictType = 'ADJACENT';
      }

      return {
        eventId: eventB.id,
        eventTitle: eventB.title,
        conflictType,
        overlapMinutes,
        suggestion: this.generateSuggestion(eventA, eventB, overlapMinutes),
      };
    }

    if (overlapMs === 0 || overlapMs > -bufferMinutes * 60 * 1000) {
      return {
        eventId: eventB.id,
        eventTitle: eventB.title,
        conflictType: 'ADJACENT',
        overlapMinutes: 0,
        suggestion: 'Events are back-to-back with no buffer',
      };
    }

    return null;
  }

  private static async checkRecurrenceConflicts(
    newEvent: CalendarEvent,
    existingEvents: CalendarEvent[],
    rangeDays: number,
    bufferMinutes: number
  ): Promise<ConflictDetail[]> {
    if (!newEvent.recurrence) return [];

    const conflicts: ConflictDetail[] = [];
    const rangeStart = newEvent.start;
    const rangeEnd = rangeStart.addDays(rangeDays);

    for (const existing of existingEvents) {
      if (existing.recurrence) {
        const recurConflicts = await this.checkRecurrenceVsRecurrence(
          newEvent,
          existing,
          rangeStart,
          rangeEnd,
          bufferMinutes
        );
        conflicts.push(...recurConflicts);
      } else {
        const singleConflicts = await this.checkRecurrenceVsSingle(
          newEvent,
          existing,
          rangeStart,
          rangeEnd,
          bufferMinutes
        );
        conflicts.push(...singleConflicts);
      }
    }

    return conflicts;
  }

  private static async checkRecurrenceVsSingle(
    recurringEvent: CalendarEvent,
    singleEvent: CalendarEvent,
    rangeStart: DateTime,
    rangeEnd: DateTime,
    bufferMinutes: number
  ): Promise<ConflictDetail[]> {
    const conflicts: ConflictDetail[] = [];

    if (!recurringEvent.recurrence) return conflicts;

    const instances = await this.getRecurrenceInstancesInRange(
      recurringEvent,
      rangeStart,
      rangeEnd
    );

    for (const instance of instances) {
      const tempEvent: CalendarEvent = {
        ...recurringEvent,
        id: `${recurringEvent.id}_${instance.start.toISOString()}`,
        start: instance.start,
        end: instance.end,
        recurrence: undefined,
      };

      const conflict = this.checkEventConflict(tempEvent, singleEvent, bufferMinutes);
      if (conflict) {
        conflict.eventId = recurringEvent.id;
        conflict.eventTitle = `${recurringEvent.title} (recurring)`;
        conflict.conflictType = 'RECURRENCE_OVERLAP';
        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  private static async checkRecurrenceVsRecurrence(
    eventA: CalendarEvent,
    eventB: CalendarEvent,
    rangeStart: DateTime,
    rangeEnd: DateTime,
    bufferMinutes: number
  ): Promise<ConflictDetail[]> {
    const conflicts: ConflictDetail[] = [];

    if (!eventA.recurrence || !eventB.recurrence) return conflicts;

    const instancesA = await this.getRecurrenceInstancesInRange(eventA, rangeStart, rangeEnd);
    const instancesB = await this.getRecurrenceInstancesInRange(eventB, rangeStart, rangeEnd);

    for (const instanceA of instancesA) {
      for (const instanceB of instancesB) {
        const tempA: CalendarEvent = {
          ...eventA,
          id: `${eventA.id}_${instanceA.start.toISOString()}`,
          start: instanceA.start,
          end: instanceA.end,
          recurrence: undefined,
        };
        const tempB: CalendarEvent = {
          ...eventB,
          id: `${eventB.id}_${instanceB.start.toISOString()}`,
          start: instanceB.start,
          end: instanceB.end,
          recurrence: undefined,
        };

        const conflict = this.checkEventConflict(tempA, tempB, bufferMinutes);
        if (conflict) {
          conflict.eventId = eventB.id;
          conflict.eventTitle = `${eventB.title} (recurring)`;
          conflict.conflictType = 'RECURRENCE_OVERLAP';
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  private static async getRecurrenceInstancesInRange(
    event: CalendarEvent,
    rangeStart: DateTime,
    rangeEnd: DateTime
  ): Promise<{ start: DateTime; end: DateTime }[]> {
    if (!event.recurrence) return [];

    const { RecurrenceEngine } = await import('../domain/recurrence-engine');
    return RecurrenceEngine.getOccurrencesInRange(
      event.recurrence,
      event.start,
      event.end,
      rangeStart,
      rangeEnd,
      event.timeZone,
      event.exceptionDates || []
    ).map((i) => ({ start: i.start, end: i.end }));
  }

  private static generateSuggestion(
    eventA: CalendarEvent,
    eventB: CalendarEvent,
    overlapMinutes: number
  ): string {
    if (overlapMinutes >= 60) {
      return `Significant overlap (${overlapMinutes} min). Consider rescheduling one event.`;
    }
    if (overlapMinutes > 0) {
      return `Minor overlap (${overlapMinutes} min). Events may need adjustment.`;
    }
    return 'Events are adjacent. Consider adding buffer time.';
  }

  static findAvailableSlots(
    events: CalendarEvent[],
    workingHours: { start: number; end: number },
    date: DateTime,
    durationMinutes: number,
    bufferMinutes: number = 0,
    timeZone: string = 'UTC'
  ): TimeSlot[] {
    const dayStart = date.startOfDay().addMinutes(workingHours.start * 60);
    const dayEnd = date.startOfDay().addMinutes(workingHours.end * 60);

    const dayEvents = events
      .filter((e) => {
        const eventDate = e.start.toISOString().split('T')[0];
        const targetDate = date.toISOString().split('T')[0];
        return eventDate === targetDate && e.status !== 'CANCELLED';
      })
      .sort((a, b) => a.start.utc.getTime() - b.start.utc.getTime());

    const slots: TimeSlot[] = [];
    let currentStart = dayStart;

    for (const event of dayEvents) {
      const eventStart = event.start;
      const eventEnd = event.end.addMinutes(bufferMinutes);

      if (currentStart.isBefore(eventStart)) {
        const slotDuration = currentStart.diffInMinutes(eventStart);
        if (slotDuration >= durationMinutes) {
          slots.push({
            start: currentStart,
            end: eventStart,
            available: true,
          });
        }
      }

      currentStart = eventEnd.isAfter(currentStart) ? eventEnd : currentStart;
    }

    if (currentStart.isBefore(dayEnd)) {
      const slotDuration = currentStart.diffInMinutes(dayEnd);
      if (slotDuration >= durationMinutes) {
        slots.push({
          start: currentStart,
          end: dayEnd,
          available: true,
        });
      }
    }

    return slots;
  }
}

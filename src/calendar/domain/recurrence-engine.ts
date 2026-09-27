import { DateTime, RecurrenceRule, Duration } from '../domain/calendar-event';

export interface RecurrenceExpansionOptions {
  startDate: DateTime;
  endDate: DateTime;
  timeZone: string;
  maxInstances?: number;
}

export interface RecurrenceInstance {
  start: DateTime;
  end: DateTime;
  isException: boolean;
  originalStart?: DateTime;
}

export class RecurrenceEngine {
  static parse(rruleString: string): RecurrenceRule | null {
    if (!rruleString) return null;

    const rule: Partial<RecurrenceRule> = {
      frequency: 'WEEKLY',
      interval: 1,
    };

    const parts = rruleString.split(';');
    for (const part of parts) {
      const [key, value] = part.split('=');
      switch (key.toUpperCase()) {
        case 'FREQ':
          rule.frequency = value as RecurrenceRule['frequency'];
          break;
        case 'INTERVAL':
          rule.interval = parseInt(value, 10);
          break;
        case 'BYDAY':
          rule.byDay = value.split(',').map((d) => this.parseDay(d.trim()));
          break;
        case 'BYMONTHDAY':
          rule.byMonthDay = value.split(',').map((d) => parseInt(d, 10));
          break;
        case 'BYMONTH':
          rule.byMonth = value.split(',').map((d) => parseInt(d, 10));
          break;
        case 'COUNT':
          rule.count = parseInt(value, 10);
          break;
        case 'UNTIL':
          rule.until = value;
          break;
        case 'WKST':
          rule.weekStart = this.parseDay(value);
          break;
      }
    }

    return rule as RecurrenceRule;
  }

  private static parseDay(day: string): number {
    const days: Record<string, number> = {
      SU: 0,
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
      SA: 6,
      SUN: 0,
      MON: 1,
      TUE: 2,
      WED: 3,
      THU: 4,
      FRI: 5,
      SAT: 6,
    };
    return days[day.toUpperCase()] ?? 0;
  }

  static toString(rule: RecurrenceRule): string {
    const parts: string[] = [];

    parts.push(`FREQ=${rule.frequency}`);

    if (rule.interval > 1) {
      parts.push(`INTERVAL=${rule.interval}`);
    }

    if (rule.byDay && rule.byDay.length > 0) {
      const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
      parts.push(`BYDAY=${rule.byDay.map((d) => dayNames[d]).join(',')}`);
    }

    if (rule.byMonthDay && rule.byMonthDay.length > 0) {
      parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
    }

    if (rule.byMonth && rule.byMonth.length > 0) {
      parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
    }

    if (rule.count) {
      parts.push(`COUNT=${rule.count}`);
    }

    if (rule.until) {
      parts.push(`UNTIL=${rule.until.replace(/[-:]/g, '').split('.')[0]}Z`);
    }

    if (rule.weekStart !== undefined) {
      const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
      parts.push(`WKST=${dayNames[rule.weekStart]}`);
    }

    return parts.join(';');
  }

  static expand(
    rule: RecurrenceRule,
    eventStart: DateTime,
    eventEnd: DateTime,
    options: RecurrenceExpansionOptions
  ): RecurrenceInstance[] {
    const instances: RecurrenceInstance[] = [];
    const duration = eventEnd.diffInMinutes(eventStart);
    const maxInstances = options.maxInstances || 1000;

    let current = eventStart.startOfDay();
    const endBoundary = options.endDate;
    const untilDate = rule.until ? DateTime.fromISO(rule.until) : endBoundary;
    const limit = current.isBefore(untilDate) ? untilDate : endBoundary;

    let count = 0;

    while (current.isBefore(limit) && count < maxInstances) {
      if (this.matchesRule(current, rule, eventStart)) {
        const instanceStart = new DateTime(
          new Date(
            current.utc.getTime() +
              (eventStart.utc.getTime() - eventStart.startOfDay().utc.getTime())
          ),
          options.timeZone
        );
        const instanceEnd = instanceStart.addMinutes(duration);

        if (instanceStart.isBefore(options.endDate) && instanceEnd.isAfter(options.startDate)) {
          instances.push({
            start: instanceStart,
            end: instanceEnd,
            isException: false,
            originalStart: instanceStart,
          });
          count++;
        }
      }

      current = this.nextOccurrence(current, rule);
    }

    return instances;
  }

  private static matchesRule(
    date: DateTime,
    rule: RecurrenceRule,
    originalStart: DateTime
  ): boolean {
    switch (rule.frequency) {
      case 'DAILY':
        return this.matchesDaily(date, rule, originalStart);
      case 'WEEKLY':
        return this.matchesWeekly(date, rule, originalStart);
      case 'MONTHLY':
        return this.matchesMonthly(date, rule, originalStart);
      case 'YEARLY':
        return this.matchesYearly(date, rule, originalStart);
      default:
        return false;
    }
  }

  private static matchesDaily(
    date: DateTime,
    rule: RecurrenceRule,
    originalStart: DateTime
  ): boolean {
    const diffDays = Math.floor(date.diffInMinutes(originalStart) / (24 * 60));
    return diffDays % rule.interval === 0;
  }

  private static matchesWeekly(
    date: DateTime,
    rule: RecurrenceRule,
    originalStart: DateTime
  ): boolean {
    const dayOfWeek = date.toDate().getDay();

    if (rule.byDay && rule.byDay.length > 0) {
      return rule.byDay.includes(dayOfWeek);
    }

    const diffWeeks = Math.floor(date.diffInMinutes(originalStart) / (7 * 24 * 60));
    return (
      diffWeeks % rule.interval === 0 && date.toDate().getDay() === originalStart.toDate().getDay()
    );
  }

  private static matchesMonthly(
    date: DateTime,
    rule: RecurrenceRule,
    originalStart: DateTime
  ): boolean {
    const dayOfMonth = date.toDate().getDate();

    if (rule.byMonthDay && rule.byMonthDay.length > 0) {
      return rule.byMonthDay.includes(dayOfMonth);
    }

    const diffMonths =
      (date.toDate().getFullYear() - originalStart.toDate().getFullYear()) * 12 +
      date.toDate().getMonth() -
      originalStart.toDate().getMonth();
    return diffMonths % rule.interval === 0 && dayOfMonth === originalStart.toDate().getDate();
  }

  private static matchesYearly(
    date: DateTime,
    rule: RecurrenceRule,
    originalStart: DateTime
  ): boolean {
    if (rule.byMonth && rule.byMonth.length > 0) {
      const month = date.toDate().getMonth() + 1;
      if (!rule.byMonth.includes(month)) return false;
    }

    const diffYears = date.toDate().getFullYear() - originalStart.toDate().getFullYear();
    return (
      diffYears % rule.interval === 0 &&
      date.toDate().getMonth() === originalStart.toDate().getMonth() &&
      date.toDate().getDate() === originalStart.toDate().getDate()
    );
  }

  private static nextOccurrence(date: DateTime, rule: RecurrenceRule): DateTime {
    switch (rule.frequency) {
      case 'DAILY':
        return date.addDays(rule.interval);
      case 'WEEKLY':
        return date.addDays(7 * rule.interval);
      case 'MONTHLY':
        return this.addMonths(date, rule.interval);
      case 'YEARLY':
        return this.addMonths(date, 12 * rule.interval);
      default:
        return date.addDays(1);
    }
  }

  private static addMonths(date: DateTime, months: number): DateTime {
    const d = new Date(date.utc);
    d.setMonth(d.getMonth() + months);
    return new DateTime(d, date.timeZone);
  }

  static getOccurrencesInRange(
    rule: RecurrenceRule,
    eventStart: DateTime,
    eventEnd: DateTime,
    rangeStart: DateTime,
    rangeEnd: DateTime,
    timeZone: string,
    exceptionDates: DateTime[] = []
  ): RecurrenceInstance[] {
    const instances = this.expand(rule, eventStart, eventEnd, {
      startDate: rangeStart,
      endDate: rangeEnd,
      timeZone,
    });

    return instances.filter((instance) => {
      const instanceDateStr = instance.start.toISOString().split('T')[0];
      return !exceptionDates.some((ex) => ex.toISOString().split('T')[0] === instanceDateStr);
    });
  }

  static isRecurring(event: { recurrence?: RecurrenceRule; recurrenceRule?: string }): boolean {
    return !!(event.recurrence || event.recurrenceRule);
  }
}

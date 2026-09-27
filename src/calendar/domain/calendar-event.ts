export type UUID = string;

export interface TimeZone {
  id: string;
  offset: number;
  dstOffset: number;
  abbreviation: string;
}

export class DateTime {
  private readonly _utc: Date;
  private readonly _timeZone: string;

  constructor(date: Date | string | number, timeZone: string = 'UTC') {
    this._utc = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    this._timeZone = timeZone;
  }

  get utc(): Date {
    return new Date(this._utc.getTime());
  }

  get timeZone(): string {
    return this._timeZone;
  }

  toISOString(): string {
    return this._utc.toISOString();
  }

  toLocalString(): string {
    return this._utc.toLocaleString('en-US', { timeZone: this._timeZone });
  }

  toDate(): Date {
    return new Date(this._utc.getTime());
  }

  static now(timeZone: string = 'UTC'): DateTime {
    return new DateTime(new Date(), timeZone);
  }

  static fromISO(isoString: string, timeZone: string = 'UTC'): DateTime {
    return new DateTime(new Date(isoString), timeZone);
  }

  addMinutes(minutes: number): DateTime {
    return new DateTime(new Date(this._utc.getTime() + minutes * 60 * 1000), this._timeZone);
  }

  addHours(hours: number): DateTime {
    return this.addMinutes(hours * 60);
  }

  addDays(days: number): DateTime {
    return this.addHours(days * 24);
  }

  isBefore(other: DateTime): boolean {
    return this._utc.getTime() < other._utc.getTime();
  }

  isAfter(other: DateTime): boolean {
    return this._utc.getTime() > other._utc.getTime();
  }

  equals(other: DateTime): boolean {
    return this._utc.getTime() === other._utc.getTime();
  }

  diffInMinutes(other: DateTime): number {
    return Math.abs(this._utc.getTime() - other._utc.getTime()) / (1000 * 60);
  }

  startOfDay(): DateTime {
    const date = new Date(this._utc);
    date.setUTCHours(0, 0, 0, 0);
    return new DateTime(date, this._timeZone);
  }

  endOfDay(): DateTime {
    const date = new Date(this._utc);
    date.setUTCHours(23, 59, 59, 999);
    return new DateTime(date, this._timeZone);
  }

  withTimeZone(timeZone: string): DateTime {
    return new DateTime(this._utc, timeZone);
  }
}

export class Duration {
  private readonly _minutes: number;

  constructor(minutes: number) {
    this._minutes = minutes;
  }

  static fromMinutes(minutes: number): Duration {
    return new Duration(minutes);
  }

  static fromHours(hours: number): Duration {
    return new Duration(hours * 60);
  }

  static fromDays(days: number): Duration {
    return new Duration(days * 24 * 60);
  }

  get minutes(): number {
    return this._minutes;
  }

  get hours(): number {
    return this._minutes / 60;
  }

  get days(): number {
    return this._minutes / (24 * 60);
  }

  add(other: Duration): Duration {
    return new Duration(this._minutes + other._minutes);
  }

  subtract(other: Duration): Duration {
    return new Duration(this._minutes - other._minutes);
  }
}

export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay?: number[];
  byMonthDay?: number[];
  byMonth?: number[];
  count?: number;
  until?: string;
  weekStart?: number;
}

export interface EventParticipant {
  id?: UUID;
  email: string;
  displayName?: string;
  status: 'NEEDS_ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'DELEGATED';
  role: 'REQUIRED' | 'OPTIONAL' | 'ORGANIZER';
  responseAt?: DateTime;
}

export type EventCategory =
  | 'PERSONAL'
  | 'WORK'
  | 'MEETING'
  | 'APPOINTMENT'
  | 'REMINDER'
  | 'HOLIDAY'
  | 'BIRTHDAY'
  | 'TRAVEL'
  | 'FOCUS_TIME'
  | 'CUSTOM';

export type EventStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' | 'NEEDS_ACTION';

export interface CalendarEvent {
  id: UUID;
  userId: UUID;
  calendarId: UUID;
  title: string;
  description?: string;
  location?: string;
  start: DateTime;
  end: DateTime;
  allDay: boolean;
  timeZone: string;
  recurrence?: RecurrenceRule;
  exceptionDates?: DateTime[];
  recurrenceId?: string;
  status: EventStatus;
  category: EventCategory;
  color?: string;
  participants: EventParticipant[];
  organizer?: EventParticipant;
  reminders: Reminder[];
  metadata?: Record<string, any>;
  createdAt: DateTime;
  updatedAt: DateTime;
  deletedAt?: DateTime;
}

export interface Reminder {
  id: UUID;
  eventId: UUID;
  minutesBefore: number;
  method: 'EMAIL' | 'PUSH' | 'SMS' | 'POPUP';
  triggered: boolean;
}

export interface TimeSlot {
  start: DateTime;
  end: DateTime;
  available: boolean;
  conflictingEvents?: CalendarEvent[];
}

export interface DayView {
  date: DateTime;
  events: CalendarEvent[];
  allDayEvents: CalendarEvent[];
  timeSlots: TimeSlot[];
  workingHours: { start: number; end: number };
}

export interface WeekView {
  weekStart: DateTime;
  weekEnd: DateTime;
  days: DayView[];
}

export interface MonthView {
  month: number;
  year: number;
  weeks: WeekView[];
  eventsByDate: Map<string, CalendarEvent[]>;
}

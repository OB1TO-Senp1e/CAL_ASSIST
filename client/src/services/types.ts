/**
 * Shared API types.
 *
 * Every field is copied from the backend source, not invented — the cited file is
 * authoritative. Stage 3 swaps the data source, not these types.
 */

/** `AuthResponse` — src/auth/auth.service.ts */
export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

/** `UsersService.findById` select — src/users/users.service.ts (GET /api/users/me) */
export interface Profile extends AuthUser {
  createdAt: string;
  updatedAt: string;
  preferences?: unknown[];
  goals?: unknown[];
  projects?: unknown[];
}

/* ─────────────────────────── Calendar ───────────────────────────
 * Enums mirror prisma/schema.prisma verbatim. `EventCategory` is NOT on the
 * Prisma `Event` model (it exists only in the zod schema and the calendar
 * domain layer — see BUILD_LOG "backend contract mismatches"), so it is typed
 * as present here and normalised on the way in.
 */

/** prisma/schema.prisma `enum EventStatus` */
export type EventStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' | 'NEEDS_ACTION';

/** prisma/schema.prisma `enum EventSource` */
export type EventSource = 'USER' | 'AI_GENERATED' | 'IMPORTED' | 'SYSTEM';

/** prisma/schema.prisma `enum EventVisibility` */
export type EventVisibility = 'PRIVATE' | 'PUBLIC' | 'SHARED';

/** src/calendar/domain/calendar-event.ts `EventCategory` */
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

/** prisma/schema.prisma `enum CalendarProvider` */
export type CalendarProvider = 'LOCAL' | 'GOOGLE' | 'OUTLOOK' | 'APPLE';

/** prisma/schema.prisma `enum ParticipantStatus` / `ParticipantRole` */
export type ParticipantStatus = 'NEEDS_ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'DELEGATED';
export type ParticipantRole = 'REQUIRED' | 'OPTIONAL' | 'ORGANIZER';

export interface EventParticipantDTO {
  id?: string;
  email: string;
  displayName?: string | null;
  status: ParticipantStatus;
  role: ParticipantRole;
  responseAt?: string | null;
}

export interface ReminderDTO {
  id: string;
  eventId: string;
  minutesBefore: number;
  method: 'EMAIL' | 'PUSH' | 'SMS' | 'POPUP';
  triggered: boolean;
}

/**
 * Event as the calendar endpoints should return it.
 *
 * NOTE ON `start` / `end`: the real service returns `DateTime` class instances
 * (`src/calendar/domain/calendar-event.ts`), which have no `toJSON()`, so over
 * the wire they currently arrive as `{_utc, _timeZone}`. `normalizeEvent()`
 * accepts either that, a Date-like, or an ISO string, so Stage 3 does not break
 * whichever way the backend ends up serialising. See BUILD_LOG: Stage 4 item.
 */
export interface CalendarEventDTO {
  id: string;
  userId: string;
  calendarId: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  /** ISO 8601. */
  start: string;
  /** ISO 8601. */
  end: string;
  allDay: boolean;
  timeZone: string;
  status: EventStatus;
  /** Defaults to 'PERSONAL' when the backend omits it (it currently does). */
  category: EventCategory;
  color?: string | null;
  /** RRULE string; the service returns a parsed object under `recurrence`. */
  recurrenceRule?: string | null;
  exceptionDates?: string[];
  source: EventSource;
  visibility: EventVisibility;
  participants: EventParticipantDTO[];
  reminders: ReminderDTO[];
  createdAt: string;
  updatedAt: string;
}

/** prisma/schema.prisma `model Calendar` (calendar list endpoint). */
export interface CalendarDTO {
  id: string;
  userId: string;
  connectionId: string | null;
  name: string;
  description?: string | null;
  /** Hex, Prisma default `#3b82f6`. Snapped to a palette hue for display. */
  color: string | null;
  timezone: string;
  isVisible: boolean;
  isPrimary: boolean;
  provider: CalendarProvider;
  externalId?: string | null;
  lastSynced?: string | null;
}

/** `src/calendar/domain/calendar-event.ts` WorkingHours inside DayView. */
export interface WorkingHours {
  start: number;
  end: number;
}

/** `src/calendar/views/view-generator.ts` DayView */
export interface DayViewDTO {
  date: string;
  events: CalendarEventDTO[];
  allDayEvents: CalendarEventDTO[];
  workingHours: WorkingHours;
}

/** `src/calendar/views/view-generator.ts` WeekView */
export interface WeekViewDTO {
  weekStart: string;
  weekEnd: string;
  days: DayViewDTO[];
}

/** `src/calendar/views/view-generator.ts` MonthView (Map → plain object). */
export interface MonthViewDTO {
  year: number;
  /** 0-indexed, matching the service's `generateMonthView(year, month, …)`. */
  month: number;
  weeks: WeekViewDTO[];
  /** date `YYYY-MM-DD` → events */
  eventsByDate: Record<string, CalendarEventDTO[]>;
}

/** POST /api/calendar/events — `CreateEventSchema` */
export interface CreateEventInput {
  calendarId?: string | null;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  timeZone?: string;
  category?: EventCategory;
  color?: string;
  recurrenceRule?: string;
  participants?: Pick<EventParticipantDTO, 'email' | 'displayName' | 'status' | 'role'>[];
}

/** PATCH /api/calendar/events/:id — `UpdateEventSchema` + `status` */
export type UpdateEventInput = Partial<CreateEventInput> & { status?: EventStatus };

/** PATCH /api/calendar/events/:id/resize — `ResizeEventSchema` */
export interface ResizeEventInput {
  newEnd: string;
  timeZone?: string;
}

/** POST /api/calendar/events/bulk — `BulkEventSchema` */
export interface BulkEventInput {
  eventIds: string[];
  action: 'delete' | 'cancel' | 'confirm' | 'move' | 'resize';
  newStart?: string;
  newEnd?: string;
  timeZone?: string;
}

/** `GET /api/calendar/events/conflicts/check` response — ConflictDetector. */
export interface ConflictDTO {
  type: 'OVERLAP' | 'CONTAINS' | 'ADJACENT' | 'RECURRENCE_OVERLAP';
  eventA: string;
  eventB: string;
  overlapMinutes: number;
}

import { z } from 'zod';

/**
 * Canonical C-01 — spec §6 "Provider Interface" verbatim (spec lines 57-66) plus the
 * provider-neutral conference shape from the same section.
 *
 * This is NOT the older `CalendarAdapter` contract (`calendar-adapter.interface.ts`):
 * that one is OAuth/webhook/event-sync oriented and carries `accessToken` through every
 * call. `CalendarProvider` is the coordination-layer surface the Availability/Meeting
 * engines bind to — calendar discovery, event CRUD, availability queries — with no
 * credential arguments (the connection layer supplies them; audit D5 + spec §5).
 *
 * Naming reconciliation (also recorded in COORDINATION_PROGRESS.md):
 * - `CalendarProvider` is ALSO the name of a Prisma enum (`schema.prisma:1350`, mirrored
 *   by `client/src/services/types.ts`). No `src/` file imports that enum today, so the
 *   spec-mandated interface name is safe here — but a future file must not import both
 *   symbols unaliased into the same scope.
 * - Auxiliary types are `Provider*`-prefixed because the spec's literal helper names
 *   (`CreateEventInput`, `UpdateEventInput`) already exist in
 *   `src/ai/assistant/interfaces/tool-schemas.ts`, and `AvailabilityQuerySchema` already
 *   exists in `src/calendar/interfaces/calendar.interface.ts`. A single scope importing
 *   both sets would be a duplicate-identifier error. Mapping to spec §6 stays traceable:
 *     spec §6              this file
 *     Calendar             ProviderCalendar
 *     CalendarEvent        ProviderEvent
 *     EventQuery           EventQuery
 *     CreateEventInput     CreateProviderEventInput
 *     UpdateEventInput     UpdateProviderEventInput
 *     AvailabilityQuery    ProviderAvailabilityQuery
 *     AvailabilityResult   AvailabilityResult
 *
 * Limitation, stated rather than faked: working-hours bounds are evaluated on UTC
 * wall-clock (matching `src/calendar/domain/calendar-event.ts`, whose `DateTime` stores a
 * timezone label but computes in UTC). True per-timezone hour math belongs to the
 * availability-engine cut (C-05), not to C-01.
 */

export const CALENDAR_PROVIDER = 'CALENDAR_PROVIDER';
/**
 * DI token future cuts bind a `CalendarProvider` to (C-06 availability engine resolves one
 * per connection). C-01 deliberately does NOT register an implementation in
 * `CalendarAdaptersModule`: doing so would ship the mock as a production default.
 */

export const ProviderCalendarSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  timezone: z.string().default('UTC'),
  isPrimary: z.boolean().default(false),
});
export type ProviderCalendar = z.infer<typeof ProviderCalendarSchema>;

export const ProviderParticipantSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  status: z
    .enum(['NEEDS_ACTION', 'ACCEPTED', 'DECLINED', 'TENTATIVE', 'DELEGATED'])
    .default('NEEDS_ACTION'),
  role: z.enum(['REQUIRED', 'OPTIONAL', 'ORGANIZER']).default('REQUIRED'),
});
export type ProviderParticipant = z.infer<typeof ProviderParticipantSchema>;

/** Array form, so adapters can normalise a whole attendee list (defaults applied). */
export const ProviderParticipantListSchema = z.array(ProviderParticipantSchema);

/**
 * Spec §6 line 66, verbatim: "conference: { enabled: boolean; provider: 'google_meet' |
 * 'none' | string }". The union collapses to `string` at the type level by design — the
 * contract must stay provider-neutral; C-03/C-04 mint the Google Meet link behind it.
 */
export const ProviderConferenceSchema = z.object({
  enabled: z.boolean(),
  provider: z.string(),
  conferenceId: z.string().optional(),
  joinUrl: z.string().url().optional(),
});
export type ProviderConference = z.infer<typeof ProviderConferenceSchema>;

export const ProviderEventStatusSchema = z.enum([
  'CONFIRMED',
  'TENTATIVE',
  'CANCELLED',
  'NEEDS_ACTION',
]);
export type ProviderEventStatus = z.infer<typeof ProviderEventStatusSchema>;

export const ProviderEventSchema = z.object({
  id: z.string().min(1),
  calendarId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  allDay: z.boolean().default(false),
  timezone: z.string().default('UTC'),
  status: ProviderEventStatusSchema.default('CONFIRMED'),
  participants: z.array(ProviderParticipantSchema).default([]),
  conference: ProviderConferenceSchema.optional(),
  recurrenceRule: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProviderEvent = z.infer<typeof ProviderEventSchema>;

export const EventQuerySchema = z
  .object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    calendarIds: z.array(z.string().min(1)).optional(),
    /** Implementations default to "everything except CANCELLED". */
    statuses: z.array(ProviderEventStatusSchema).optional(),
  })
  .refine((q) => q.endDate > q.startDate, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  });
export type EventQuery = z.infer<typeof EventQuerySchema>;

export const CreateProviderEventInputSchema = z
  .object({
    calendarId: z.string().min(1).optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    location: z.string().optional(),
    start: z.string().datetime(),
    end: z.string().datetime(),
    allDay: z.boolean().default(false),
    timezone: z.string().default('UTC'),
    participants: z.array(ProviderParticipantSchema).default([]),
    conference: ProviderConferenceSchema.optional(),
    recurrenceRule: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  })
  .refine((e) => e.end > e.start, { message: 'end must be after start', path: ['end'] });
export type CreateProviderEventInput = z.input<typeof CreateProviderEventInputSchema>;

export const UpdateProviderEventInputSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  timezone: z.string().optional(),
  status: ProviderEventStatusSchema.optional(),
  participants: z.array(ProviderParticipantSchema).optional(),
  conference: ProviderConferenceSchema.optional(),
  recurrenceRule: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});
export type UpdateProviderEventInput = z.infer<typeof UpdateProviderEventInputSchema>;

export const ProviderWorkingHoursSchema = z.object({
  start: z.number().int().min(0).max(23),
  end: z.number().int().min(0).max(23),
  /** 0 = Sunday … 6 = Saturday, matching `AvailabilityQuerySchema` in src/calendar. */
  days: z.array(z.number().int().min(0).max(6)),
});
export type ProviderWorkingHours = z.infer<typeof ProviderWorkingHoursSchema>;

export const ProviderAvailabilityQuerySchema = z
  .object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    durationMinutes: z.number().int().positive(),
    bufferMinutes: z.number().int().nonnegative().default(15),
    workingHours: ProviderWorkingHoursSchema.optional(),
    timezone: z.string().default('UTC'),
    limit: z.number().int().positive().max(100).default(20),
  })
  .refine((q) => q.endDate > q.startDate, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  });
export type ProviderAvailabilityQuery = z.input<typeof ProviderAvailabilityQuerySchema>;

export const AvailabilitySlotSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  /**
   * Spec §11: "Return multiple candidate slots with explanations"; §8: "Expose
   * human-readable reasons instead of opaque scores". Deterministic strings, not AI prose.
   */
  reasons: z.array(z.string().min(1)).min(1),
  /** Ids of events that would overlap the slot without its buffer, if any. */
  conflicts: z.array(z.string()).default([]),
});
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

export const AvailabilityResultSchema = z.object({
  slots: z.array(AvailabilitySlotSchema),
  requestedDurationMinutes: z.number().int().positive(),
  window: z.object({ startDate: z.string().datetime(), endDate: z.string().datetime() }),
  timezone: z.string(),
  /** True when the scan stopped early because `limit` was reached. */
  truncated: z.boolean(),
});
export type AvailabilityResult = z.infer<typeof AvailabilityResultSchema>;

/** Base class so callers can catch provider failures without importing each adapter. */
export class CalendarProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarProviderError';
  }
}

export class EventNotFoundError extends CalendarProviderError {
  constructor(eventId: string, providerName: string) {
    super(`Event ${eventId} not found in ${providerName}`);
    this.name = 'EventNotFoundError';
  }
}

/** Spec §6 — the six methods verbatim, plus the provider's display name. */
export interface CalendarProvider {
  readonly providerName: string;
  listCalendars(): Promise<ProviderCalendar[]>;
  listEvents(query: EventQuery): Promise<ProviderEvent[]>;
  createEvent(input: CreateProviderEventInput): Promise<ProviderEvent>;
  updateEvent(id: string, input: UpdateProviderEventInput): Promise<ProviderEvent>;
  deleteEvent(id: string): Promise<void>;
  findAvailability(input: ProviderAvailabilityQuery): Promise<AvailabilityResult>;
}

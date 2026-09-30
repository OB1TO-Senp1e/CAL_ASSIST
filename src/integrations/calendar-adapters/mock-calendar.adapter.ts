import { Injectable } from '@nestjs/common';
import {
  AvailabilityResult,
  AvailabilitySlot,
  CalendarProvider,
  CalendarProviderError,
  CreateProviderEventInput,
  EventNotFoundError,
  EventQuery,
  ProviderAvailabilityQuery,
  ProviderAvailabilityQuerySchema,
  ProviderCalendar,
  ProviderEvent,
  ProviderParticipantListSchema,
  ProviderWorkingHours,
  UpdateProviderEventInput,
} from './calendar-provider.interface';

/**
 * Canonical C-01 mock (spec §3 "Suggested structure": `mock-calendar.adapter.ts`;
 * Appendix A step 1: "Create calendar provider interface and mock adapter").
 *
 * Determinism rules this class MUST keep (no wall-clock or RNG leaks):
 * - ids come from a monotonic counter (`mock-cal-1`, `mock-evt-1`, …), never
 *   `Date.now()`/`Math.random()` — unlike `LocalCalendarAdapter`, whose ids change every
 *   call and therefore cannot anchor a shared contract suite;
 * - "now" is an injected clock defaulting to a fixed instant, so `createdAt`/`updatedAt`
 *   are stable across runs;
 * - availability scanning is pure arithmetic over the stored events; no timers.
 *
 * The mock is in-memory only. It performs no DB, network, or OAuth work (C-03/C-04 own
 * Google; §5/R3 stays untouched by C-01).
 */

/** Fixed default instant: keeps every default-constructed mock byte-identical. */
export const MOCK_FIXED_NOW = '2026-01-01T00:00:00.000Z';

export interface MockCalendarAdapterOptions {
  /** Calendars returned by `listCalendars()`. Default: one primary calendar. */
  calendars?: ProviderCalendar[];
  /** Events pre-seeded into the store. Default: empty. */
  events?: ProviderEvent[];
  /** Clock used for `createdAt`/`updatedAt`. Default: `MOCK_FIXED_NOW`. */
  now?: () => string;
}

const MINUTE_MS = 60_000;

@Injectable()
export class MockCalendarAdapter implements CalendarProvider {
  readonly providerName = 'MockCalendarAdapter';

  private readonly calendars: ProviderCalendar[];
  private readonly events = new Map<string, ProviderEvent>();
  private readonly clock: () => string;
  private calendarSeq = 0;
  private eventSeq = 0;

  constructor(options: MockCalendarAdapterOptions = {}) {
    this.clock = options.now ?? ((): string => MOCK_FIXED_NOW);
    this.calendars = options.calendars?.length
      ? options.calendars.map((calendar) => ({ ...calendar }))
      : [{ id: 'mock-cal-1', name: 'Primary', timezone: 'UTC', isPrimary: true }];
    for (const event of options.events ?? []) {
      this.events.set(event.id, { ...event });
    }
    // Keep the counters ahead of any seeded id so seeds can never be overwritten.
    this.eventSeq = Math.max(0, ...[...this.events.keys()].map(MockCalendarAdapter.seqOf));
    this.calendarSeq = Math.max(
      0,
      ...this.calendars.map((calendar) => MockCalendarAdapter.seqOf(calendar.id))
    );
  }

  /** Extracts the trailing integer of a `prefix-N` id; 0 when absent. */
  private static seqOf(id: string): number {
    const match = /(\d+)$/.exec(id);
    return match ? Number(match[1]) : 0;
  }

  /** Applies `ProviderParticipantListSchema` defaults (status/role) to stored participants. */
  private static normalizeParticipants(
    input: CreateProviderEventInput['participants']
  ): ProviderEvent['participants'] {
    return ProviderParticipantListSchema.parse(input ?? []);
  }

  nextCalendarId(): string {
    this.calendarSeq += 1;
    return `mock-cal-${this.calendarSeq}`;
  }

  nextEventId(): string {
    this.eventSeq += 1;
    return `mock-evt-${this.eventSeq}`;
  }

  async listCalendars(): Promise<ProviderCalendar[]> {
    return this.calendars.map((calendar) => ({ ...calendar }));
  }

  async listEvents(query: EventQuery): Promise<ProviderEvent[]> {
    if (query.endDate <= query.startDate) {
      throw new CalendarProviderError('listEvents: endDate must be after startDate');
    }
    const statuses = query.statuses ?? ['CONFIRMED', 'TENTATIVE', 'NEEDS_ACTION'];
    const windowStart = Date.parse(query.startDate);
    const windowEnd = Date.parse(query.endDate);
    const matches: ProviderEvent[] = [];
    for (const event of this.events.values()) {
      if (!statuses.includes(event.status)) continue;
      if (query.calendarIds && !query.calendarIds.includes(event.calendarId)) continue;
      const start = Date.parse(event.start);
      const end = Date.parse(event.end);
      // Half-open overlap: touching boundaries do not count.
      if (start < windowEnd && end > windowStart) {
        matches.push({ ...event });
      }
    }
    matches.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
    return matches;
  }

  async createEvent(input: CreateProviderEventInput): Promise<ProviderEvent> {
    if (input.end <= input.start) {
      throw new CalendarProviderError('createEvent: end must be after start');
    }
    const calendarId = input.calendarId ?? this.calendars[0]?.id;
    if (!calendarId) {
      throw new CalendarProviderError(
        'createEvent: no calendar available and no calendarId provided'
      );
    }
    const timestamp = this.clock();
    const event: ProviderEvent = {
      id: this.nextEventId(),
      calendarId,
      title: input.title,
      description: input.description,
      location: input.location,
      start: input.start,
      end: input.end,
      allDay: input.allDay ?? false,
      timezone: input.timezone ?? 'UTC',
      status: 'CONFIRMED',
      participants: MockCalendarAdapter.normalizeParticipants(input.participants),
      conference: input.conference ? { ...input.conference } : undefined,
      recurrenceRule: input.recurrenceRule,
      metadata: input.metadata ? { ...input.metadata } : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.events.set(event.id, event);
    return { ...event };
  }

  async updateEvent(id: string, input: UpdateProviderEventInput): Promise<ProviderEvent> {
    const existing = this.events.get(id);
    if (!existing) {
      throw new EventNotFoundError(id, this.providerName);
    }
    const start = input.start ?? existing.start;
    const end = input.end ?? existing.end;
    if (end <= start) {
      throw new CalendarProviderError('updateEvent: end must be after start');
    }
    const updated: ProviderEvent = {
      ...existing,
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      location: input.location ?? existing.location,
      start,
      end,
      allDay: input.allDay ?? existing.allDay,
      timezone: input.timezone ?? existing.timezone,
      status: input.status ?? existing.status,
      participants: input.participants
        ? ProviderParticipantListSchema.parse(input.participants)
        : existing.participants,
      conference: input.conference ? { ...input.conference } : existing.conference,
      recurrenceRule: input.recurrenceRule ?? existing.recurrenceRule,
      metadata: input.metadata ? { ...input.metadata } : existing.metadata,
      updatedAt: this.clock(),
    };
    this.events.set(id, updated);
    return { ...updated };
  }

  async deleteEvent(id: string): Promise<void> {
    if (!this.events.delete(id)) {
      throw new EventNotFoundError(id, this.providerName);
    }
  }

  /**
   * Deterministic candidate-slot scan (spec §11: hard constraints enforced in application
   * code; human-readable reasons, no opaque scores). Steps forward through the window in
   * `durationMinutes` increments, skips slots blocked by busy time, buffers, or working
   * hours, and stops at `limit`.
   */
  async findAvailability(input: ProviderAvailabilityQuery): Promise<AvailabilityResult> {
    const query = ProviderAvailabilityQuerySchema.parse(input);
    const busy = await this.listEvents({ startDate: query.startDate, endDate: query.endDate });

    const windowStart = Date.parse(query.startDate);
    const windowEnd = Date.parse(query.endDate);
    const durationMs = query.durationMinutes * MINUTE_MS;
    const bufferMs = query.bufferMinutes * MINUTE_MS;

    const slots: AvailabilitySlot[] = [];
    let truncated = false;
    for (let cursor = windowStart; cursor + durationMs <= windowEnd; cursor += durationMs) {
      const slotStart = cursor;
      const slotEnd = cursor + durationMs;
      const paddedStart = slotStart - bufferMs;
      const paddedEnd = slotEnd + bufferMs;

      const blockedByIds = busy
        .filter(
          (event) => Date.parse(event.start) < paddedEnd && Date.parse(event.end) > paddedStart
        )
        .map((event) => event.id);
      if (blockedByIds.length > 0) continue;

      const hours = this.workingHoursReason(slotStart, slotEnd, query.workingHours);
      if (!hours.ok) continue;

      slots.push({
        start: new Date(slotStart).toISOString(),
        end: new Date(slotEnd).toISOString(),
        durationMinutes: query.durationMinutes,
        reasons: [
          `No conflicting events within the ${query.bufferMinutes}-minute buffer`,
          hours.message,
        ],
        conflicts: [],
      });
      if (slots.length >= query.limit) {
        truncated = true;
        break;
      }
    }

    return {
      slots,
      requestedDurationMinutes: query.durationMinutes,
      window: { startDate: query.startDate, endDate: query.endDate },
      timezone: query.timezone,
      truncated,
    };
  }

  private workingHoursReason(
    slotStart: number,
    slotEnd: number,
    workingHours?: ProviderWorkingHours
  ): { ok: boolean; message: string } {
    if (!workingHours) {
      return { ok: true, message: 'No working-hours constraint applied' };
    }
    const start = new Date(slotStart);
    const end = new Date(slotEnd);
    const day = start.getUTCDay();
    if (!workingHours.days.includes(day)) {
      return { ok: false, message: `Day ${day} is outside working days` };
    }
    const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
    const endMinutes = end.getUTCHours() * 60 + end.getUTCMinutes();
    if (startMinutes < workingHours.start * 60 || endMinutes > workingHours.end * 60) {
      return { ok: false, message: 'Slot falls outside working hours' };
    }
    return {
      ok: true,
      message: `Within working hours ${workingHours.start}:00-${workingHours.end}:00 UTC`,
    };
  }
}

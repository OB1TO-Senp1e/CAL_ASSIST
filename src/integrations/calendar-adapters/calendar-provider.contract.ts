import {
  AvailabilityResultSchema,
  CalendarProvider,
  EventQuery,
  ProviderCalendarSchema,
  ProviderEvent,
  ProviderEventSchema,
} from './calendar-provider.interface';

/**
 * Canonical C-01 — shared contract suite (spec §22 "Testing & Acceptance Criteria";
 * Appendix B: "deterministic services validate").
 *
 * This is NOT a `.spec.ts` file on purpose: Jest's `testRegex: '.*\\.spec\\.ts$'`
 * (`jest.config.js`) would collect it as a suite with zero tests and fail it. It exports
 * `describeCalendarProviderContract()`, which any `CalendarProvider` implementation runs
 * by passing a factory. `calendar-provider.contract.spec.ts` is the runner.
 *
 * What the contract asserts (shape + round-trip only, so a future Google adapter can
 * inherit it):
 *   1. every method of the spec §6 surface exists and is async;
 *   2. `listCalendars()` yields schema-valid `ProviderCalendar[]`;
 *   3. create → list → update → delete round-trips through `listEvents()`;
 *   4. `listEvents()` honours the time window and the `calendarIds` filter;
 *   5. `findAvailability()` returns a schema-valid `AvailabilityResult` whose slots are
 *      explained (spec §11: reasons, not opaque scores);
 *   6. mutating an unknown event id is a loud failure, never a silent success — the
 *      Appendix-B rule that execution must not fabricate outcomes (audit R3).
 */

/** Seeds one provider event in canonical (Zod-shaped) form. */
export function contractEvent(overrides: Partial<ProviderEvent> = {}): ProviderEvent {
  const base = {
    id: 'seed-evt-1',
    calendarId: 'seed-cal-1',
    title: 'Seeded busy block',
    start: '2026-03-02T10:00:00.000Z',
    end: '2026-03-02T11:00:00.000Z',
    allDay: false,
    timezone: 'UTC',
    status: 'CONFIRMED' as const,
    participants: [],
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  };
  return ProviderEventSchema.parse({ ...base, ...overrides });
}

export interface ProviderContractContext {
  /** Fresh provider per test so suites cannot leak state into each other. */
  create(): CalendarProvider | Promise<CalendarProvider>;
  /** A calendar id the implementation knows about (used by `createEvent`). */
  calendarId: string;
}

export function describeCalendarProviderContract(
  providerName: string,
  context: ProviderContractContext
): void {
  describe(`${providerName}: CalendarProvider contract (spec §6)`, () => {
    let provider: CalendarProvider;

    beforeEach(async () => {
      provider = await context.create();
    });

    it('exposes all six spec §6 methods and a provider name', () => {
      expect(typeof provider.providerName).toBe('string');
      expect(provider.providerName.length).toBeGreaterThan(0);
      for (const method of [
        'listCalendars',
        'listEvents',
        'createEvent',
        'updateEvent',
        'deleteEvent',
        'findAvailability',
      ] as const) {
        expect(typeof provider[method]).toBe('function');
      }
    });

    it('listCalendars() returns schema-valid calendars', async () => {
      const calendars = await provider.listCalendars();
      expect(Array.isArray(calendars)).toBe(true);
      expect(calendars.length).toBeGreaterThan(0);
      for (const calendar of calendars) {
        expect(ProviderCalendarSchema.safeParse(calendar).success).toBe(true);
      }
    });

    it('createEvent() returns a valid event that listEvents() can find', async () => {
      const created = await provider.createEvent({
        calendarId: context.calendarId,
        title: 'Contract check',
        start: '2026-03-03T09:00:00.000Z',
        end: '2026-03-03T09:45:00.000Z',
        participants: [],
      });
      expect(ProviderEventSchema.safeParse(created).success).toBe(true);
      expect(created.title).toBe('Contract check');

      const found = await provider.listEvents({
        startDate: '2026-03-03T00:00:00.000Z',
        endDate: '2026-03-04T00:00:00.000Z',
      });
      expect(found.map((event) => event.id)).toContain(created.id);
    });

    it('listEvents() excludes events outside the window and filters by calendar', async () => {
      const inside = await provider.listEvents({
        startDate: '2026-03-02T09:00:00.000Z',
        endDate: '2026-03-02T12:00:00.000Z',
        calendarIds: [context.calendarId],
      });
      for (const event of inside) {
        expect(Date.parse(event.start)).toBeLessThan(Date.parse('2026-03-02T12:00:00.000Z'));
        expect(Date.parse(event.end)).toBeGreaterThan(Date.parse('2026-03-02T09:00:00.000Z'));
      }

      const other = await provider.listEvents({
        startDate: '2026-03-02T09:00:00.000Z',
        endDate: '2026-03-02T12:00:00.000Z',
        calendarIds: ['calendar-nobody-owns'],
      });
      expect(other).toHaveLength(0);
    });

    it('listEvents() rejects an inverted window instead of returning everything', async () => {
      const query: EventQuery = {
        startDate: '2026-03-04T00:00:00.000Z',
        endDate: '2026-03-03T00:00:00.000Z',
      };
      await expect(provider.listEvents(query)).rejects.toThrow();
    });

    it('updateEvent() persists the change and returns the new state', async () => {
      const created = await provider.createEvent({
        calendarId: context.calendarId,
        title: 'Before rename',
        start: '2026-03-05T09:00:00.000Z',
        end: '2026-03-05T09:30:00.000Z',
        participants: [],
      });
      const updated = await provider.updateEvent(created.id, { title: 'After rename' });
      expect(updated.title).toBe('After rename');
      expect(updated.id).toBe(created.id);

      const listed = await provider.listEvents({
        startDate: '2026-03-05T00:00:00.000Z',
        endDate: '2026-03-06T00:00:00.000Z',
      });
      expect(listed.find((event) => event.id === created.id)?.title).toBe('After rename');
    });

    it('deleteEvent() removes the event from subsequent listings', async () => {
      const created = await provider.createEvent({
        calendarId: context.calendarId,
        title: 'Doomed',
        start: '2026-03-06T09:00:00.000Z',
        end: '2026-03-06T09:30:00.000Z',
        participants: [],
      });
      await provider.deleteEvent(created.id);
      const listed = await provider.listEvents({
        startDate: '2026-03-06T00:00:00.000Z',
        endDate: '2026-03-07T00:00:00.000Z',
      });
      expect(listed.map((event) => event.id)).not.toContain(created.id);
    });

    it('deleteEvent() on an unknown id fails loudly (Appendix B / R3)', async () => {
      await expect(provider.deleteEvent('evt-does-not-exist')).rejects.toThrow();
    });

    it('updateEvent() on an unknown id fails loudly (Appendix B / R3)', async () => {
      await expect(
        provider.updateEvent('evt-does-not-exist', { title: 'ghost' })
      ).rejects.toThrow();
    });

    it('findAvailability() returns a schema-valid, explained result', async () => {
      const result = await provider.findAvailability({
        startDate: '2026-03-02T00:00:00.000Z',
        endDate: '2026-03-02T23:00:00.000Z',
        durationMinutes: 30,
        bufferMinutes: 0,
        timezone: 'UTC',
        limit: 5,
      });
      expect(AvailabilityResultSchema.safeParse(result).success).toBe(true);
      expect(result.requestedDurationMinutes).toBe(30);
      expect(result.window).toEqual({
        startDate: '2026-03-02T00:00:00.000Z',
        endDate: '2026-03-02T23:00:00.000Z',
      });
      for (const slot of result.slots) {
        expect(slot.reasons.length).toBeGreaterThan(0);
        expect(Date.parse(slot.end) - Date.parse(slot.start)).toBe(30 * 60_000);
      }
    });

    it('findAvailability() never offers a slot overlapping a busy event', async () => {
      const busy = contractEvent();
      await provider.createEvent({
        calendarId: context.calendarId,
        title: busy.title,
        start: busy.start,
        end: busy.end,
        participants: [],
      });

      const result = await provider.findAvailability({
        startDate: '2026-03-02T09:00:00.000Z',
        endDate: '2026-03-02T12:00:00.000Z',
        durationMinutes: 60,
        bufferMinutes: 0,
        timezone: 'UTC',
        limit: 20,
      });
      expect(result.slots.length).toBeGreaterThan(0);
      for (const slot of result.slots) {
        const overlaps =
          Date.parse(slot.start) < Date.parse(busy.end) &&
          Date.parse(slot.end) > Date.parse(busy.start);
        expect(overlaps).toBe(false);
      }
    });

    it('findAvailability() respects workingHours when supplied', async () => {
      const result = await provider.findAvailability({
        startDate: '2026-03-02T00:00:00.000Z',
        endDate: '2026-03-02T23:00:00.000Z',
        durationMinutes: 45,
        bufferMinutes: 0,
        workingHours: { start: 9, end: 12, days: [1, 2, 3, 4, 5] },
        timezone: 'UTC',
        limit: 50,
      });
      expect(result.slots.length).toBeGreaterThan(0);
      for (const slot of result.slots) {
        const start = new Date(slot.start);
        const end = new Date(slot.end);
        expect([1, 2, 3, 4, 5]).toContain(start.getUTCDay());
        expect(start.getUTCHours() * 60 + start.getUTCMinutes()).toBeGreaterThanOrEqual(9 * 60);
        expect(end.getUTCHours() * 60 + end.getUTCMinutes()).toBeLessThanOrEqual(12 * 60);
      }
    });

    it('is deterministic: two identical instances return identical results', async () => {
      const first = await context.create();
      const second = await context.create();
      const query: EventQuery = {
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T00:00:00.000Z',
      };
      expect(await first.listEvents(query)).toEqual(await second.listEvents(query));
      expect(await first.listCalendars()).toEqual(await second.listCalendars());
    });
  });
}

import { MockCalendarAdapter } from './mock-calendar.adapter';
import { EventNotFoundError, EventQuery, ProviderEvent } from './calendar-provider.interface';
import { contractEvent, describeCalendarProviderContract } from './calendar-provider.contract';

/**
 * Canonical C-01 — runner for the shared CalendarProvider contract suite
 * (spec §6, §22; Appendix A step 1) against `MockCalendarAdapter`, plus the
 * mock-specific determinism guarantees the contract helper deliberately does not
 * enforce (id sequencing and buffer arithmetic), and the negative fixtures that
 * prove the suite has teeth.
 *
 * C-01 scope discipline: the pre-existing `CalendarAdapter` implementations
 * (Google/Outlook/Apple/Local) are event/OAuth-oriented and do NOT implement
 * `CalendarProvider` — bridging them is C-03/C-04 work and must not be faked here.
 */

describe('CalendarProvider contract suite', () => {
  describeCalendarProviderContract('MockCalendarAdapter', {
    create: () => new MockCalendarAdapter(),
    calendarId: 'mock-cal-1',
  });
});

describe('MockCalendarAdapter specifics', () => {
  let provider: MockCalendarAdapter;

  beforeEach(() => {
    provider = new MockCalendarAdapter();
  });

  it('mints sequential, collision-free ids (no Date.now/Math.random)', async () => {
    const first = await provider.createEvent({
      title: 'One',
      start: '2026-04-01T09:00:00.000Z',
      end: '2026-04-01T09:30:00.000Z',
      participants: [],
    });
    const second = await provider.createEvent({
      title: 'Two',
      start: '2026-04-01T10:00:00.000Z',
      end: '2026-04-01T10:30:00.000Z',
      participants: [],
    });
    expect(first.id).toBe('mock-evt-1');
    expect(second.id).toBe('mock-evt-2');
    expect(first.createdAt).toBe(second.createdAt);
  });

  it('never overwrites seeded ids: counters start beyond the seed range', async () => {
    const seed: ProviderEvent = contractEvent({ id: 'seed-evt-42' });
    const seeded = new MockCalendarAdapter({ events: [seed] });
    const created = await seeded.createEvent({
      calendarId: 'seed-cal-1',
      title: 'Post-seed',
      start: '2026-05-01T09:00:00.000Z',
      end: '2026-05-01T09:30:00.000Z',
      participants: [],
    });
    expect(created.id).toBe('mock-evt-43');
    expect(
      (
        await seeded.listEvents({
          startDate: '2026-03-02T00:00:00.000Z',
          endDate: '2026-03-03T00:00:00.000Z',
        })
      ).map((e) => e.id)
    ).toContain('seed-evt-42');
  });

  it('returns copies, so callers cannot mutate the store through results', async () => {
    const calendars = await provider.listCalendars();
    calendars[0].name = 'Mutated';
    expect((await provider.listCalendars())[0].name).toBe('Primary');
  });

  it('applies bufferMinutes around busy events', async () => {
    const seeded = new MockCalendarAdapter({
      calendars: [{ id: 'seed-cal-1', name: 'Seed', timezone: 'UTC', isPrimary: true }],
      events: [contractEvent()],
    });
    const result = await seeded.findAvailability({
      startDate: '2026-03-02T09:00:00.000Z',
      endDate: '2026-03-02T12:00:00.000Z',
      durationMinutes: 60,
      bufferMinutes: 15,
      timezone: 'UTC',
      limit: 10,
    });
    // Busy 10:00-11:00 + 15-min buffer blocks 09:00-10:00 (adjacent) and 11:00-12:00;
    // only 10:00-11:00 itself is inside busy time anyway, so the window is fully blocked.
    expect(result.slots).toHaveLength(0);
  });

  it('honours limit and reports truncation', async () => {
    const result = await provider.findAvailability({
      startDate: '2026-03-02T00:00:00.000Z',
      endDate: '2026-03-02T23:00:00.000Z',
      durationMinutes: 60,
      bufferMinutes: 0,
      timezone: 'UTC',
      limit: 3,
    });
    expect(result.slots).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('throws EventNotFoundError (a CalendarProviderError) for unknown ids', async () => {
    await expect(provider.deleteEvent('mock-evt-999')).rejects.toBeInstanceOf(EventNotFoundError);
    await expect(provider.updateEvent('mock-evt-999', { title: 'x' })).rejects.toBeInstanceOf(
      EventNotFoundError
    );
  });

  it('rejects an inverted event window rather than scanning everything', async () => {
    await expect(
      provider.listEvents({
        startDate: '2026-03-05T00:00:00.000Z',
        endDate: '2026-03-04T00:00:00.000Z',
      })
    ).rejects.toThrow(/endDate must be after startDate/);
  });

  it('defaults new events to the first calendar when calendarId is omitted', async () => {
    const created = await provider.createEvent({
      title: 'No calendar given',
      start: '2026-06-01T09:00:00.000Z',
      end: '2026-06-01T09:15:00.000Z',
      participants: [],
    });
    expect(created.calendarId).toBe('mock-cal-1');
  });
});

/**
 * Teeth check: the contract suite must actually reject a non-compliant provider.
 * The suite's "listEvents() rejects an inverted window" test asserts
 * `rejects.toThrow()`; a provider that ignores the inverted window resolves instead,
 * so that assertion would fail against it. This proves the expectation discriminates
 * rather than passing vacuously. (The broken provider is not run through the whole
 * suite here — a nested failing suite would break the build.)
 */
describe('CalendarProvider contract suite has teeth', () => {
  it('a provider that ignores an inverted window resolves, where the suite demands rejection', async () => {
    const lenientListEvents = async (_query: EventQuery): Promise<ProviderEvent[]> => [];

    await expect(
      lenientListEvents({
        startDate: '2026-03-04T00:00:00.000Z',
        endDate: '2026-03-03T00:00:00.000Z',
      })
    ).resolves.toEqual([]);

    // The compliant provider under test does the opposite, which is what the suite pins:
    await expect(
      new MockCalendarAdapter().listEvents({
        startDate: '2026-03-04T00:00:00.000Z',
        endDate: '2026-03-03T00:00:00.000Z',
      })
    ).rejects.toThrow();
  });
});

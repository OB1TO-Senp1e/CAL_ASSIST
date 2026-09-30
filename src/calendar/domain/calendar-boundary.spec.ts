import { DateTime } from './calendar-event';
import { CreateEventSchema, EntityIdSchema } from '../interfaces/calendar.interface';

/**
 * Stage 4j boundary guards.
 *
 * Both pin regressions that were observed live (see BUILD_LOG "3b addendum"):
 *  1. `DateTime` must serialise as a bare ISO-8601 string, never the default
 *     enumerable `{ _utc, _timeZone }` shape.
 *  2. Event ids at the zod boundary are Prisma CUIDs (and later external
 *     provider ids), so nothing may re-introduce `z.string().uuid()`.
 */
describe('DateTime JSON boundary', () => {
  it('serialises as a bare ISO string via JSON.stringify', () => {
    const dt = new DateTime('2026-09-27T12:16:49.442Z', 'UTC');
    expect(JSON.stringify({ start: dt })).toBe('{"start":"2026-09-27T12:16:49.442Z"}');
  });

  it('keeps the Luxon-like wrapper out of nested structures', () => {
    const payload = {
      events: [
        {
          start: new DateTime('2026-10-01T09:00:00Z'),
          end: new DateTime('2026-10-01T10:00:00Z', 'Asia/Kolkata'),
        },
      ],
      weekStart: new DateTime('2026-09-28T00:00:00Z'),
    };
    const json = JSON.stringify(payload);
    expect(json).not.toMatch('_utc');
    expect(json).not.toMatch('_timeZone');
    expect(json).toMatch('"2026-10-01T09:00:00.000Z"');
  });

  it('toJSON agrees with toISOString', () => {
    const dt = new DateTime('2026-01-15T08:30:00.000Z', 'America/New_York');
    expect(dt.toJSON()).toBe(dt.toISOString());
  });
});

describe('CreateEventSchema id boundary', () => {
  const base = {
    title: 'ok',
    start: '2026-10-06T10:00:00.000Z',
    end: '2026-10-06T11:00:00.000Z',
  };

  it('accepts a Prisma CUID calendarId', () => {
    const result = CreateEventSchema.safeParse({
      ...base,
      calendarId: 'cmukpzq8d00048wuochimvc2g',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an external/provider calendarId', () => {
    const result = CreateEventSchema.safeParse({ ...base, calendarId: 'local_primary' });
    expect(result.success).toBe(true);
  });

  it('accepts an omitted calendarId (Event.calendarId is nullable)', () => {
    expect(CreateEventSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty-string calendarId', () => {
    expect(CreateEventSchema.safeParse({ ...base, calendarId: '' }).success).toBe(false);
  });

  it('EntityIdSchema bounds ids without asserting a UUID flavour', () => {
    expect(EntityIdSchema.safeParse('a'.repeat(65)).success).toBe(false);
    // A UUID still passes — the schema asserts presence, not flavour.
    expect(EntityIdSchema.safeParse('3f2504e0-4f89-11d3-9a0c-0305e82c3301').success).toBe(true);
  });
});

/**
 * Minimal RRULE support for the calendar.
 *
 * The backend stores recurrence as an RFC 5545 string in `Event.recurrenceRule`
 * and parses it with `RecurrenceEngine` (src/calendar/domain/recurrence-engine.ts).
 * Stage 2 needs to *render* recurring events on the grid, so this expands a rule
 * into concrete occurrences for the visible range.
 *
 * Scope: FREQ (DAILY|WEEKLY|MONTHLY|YEARLY), INTERVAL, COUNT, UNTIL, BYDAY.
 * EXDATE comes from the DTO's `exceptionDates`, not the rule string.
 *
 * ASSUMPTION (documented, not verified against RecurrenceEngine): BYDAY uses the
 * JavaScript convention 0=Sunday..6=Saturday. Seed data avoids BYDAY so this is
 * never exercised, and Stage 3 replaces this with the server's expansion via
 * GET /api/calendar/events/:id/instances.
 */
import dayjs, { type Dayjs } from 'dayjs';
import type { CalendarEventDTO } from '@/services/types';

export interface ParsedRRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay?: number[];
  count?: number;
  until?: string;
}

const FREQ_ALIASES: Record<string, ParsedRRule['freq']> = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
};

/** Also accepts the object form the backend uses (`{frequency, interval, byDay…}`). */
export function parseRRule(rule: unknown): ParsedRRule | null {
  if (!rule) return null;

  if (typeof rule === 'object') {
    const r = rule as Record<string, unknown>;
    const freq = typeof r.frequency === 'string' ? FREQ_ALIASES[r.frequency.toUpperCase()] : undefined;
    if (!freq) return null;
    return {
      freq,
      interval: typeof r.interval === 'number' && r.interval > 0 ? r.interval : 1,
      byDay: Array.isArray(r.byDay) ? (r.byDay as number[]) : undefined,
      count: typeof r.count === 'number' ? r.count : undefined,
      until: typeof r.until === 'string' ? r.until : undefined,
    };
  }

  if (typeof rule !== 'string') return null;
  const body = rule.trim().replace(/^RRULE:/i, '');
  if (!body) return null;

  const parts = new Map<string, string>();
  for (const chunk of body.split(';')) {
    const [k, v] = chunk.split('=');
    if (k && v) parts.set(k.trim().toUpperCase(), v.trim());
  }

  const freq = FREQ_ALIASES[(parts.get('FREQ') ?? '').toUpperCase()];
  if (!freq) return null;

  const interval = Number.parseInt(parts.get('INTERVAL') ?? '1', 10);
  const count = parts.has('COUNT') ? Number.parseInt(parts.get('COUNT') as string, 10) : undefined;

  let until: string | undefined;
  const rawUntil = parts.get('UNTIL');
  if (rawUntil) {
    const parsed = dayjs(rawUntil);
    if (parsed.isValid()) until = parsed.toISOString();
  }

  let byDay: number[] | undefined;
  const rawByDay = parts.get('BYDAY');
  if (rawByDay) {
    const map: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    byDay = rawByDay
      .split(',')
      .map((d) => map[d.trim().slice(-2).toUpperCase()])
      .filter((n): n is number => typeof n === 'number');
  }

  return { freq, interval: Number.isFinite(interval) && interval > 0 ? interval : 1, byDay, count, until };
}

export interface Occurrence {
  start: Dayjs;
  end: Dayjs;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Object form → RFC 5545 string (what the backend's `recurrenceRule` stores). */
export function toRRuleString(rule: ParsedRRule): string {
  const parts = [`FREQ=${rule.freq}`, `INTERVAL=${rule.interval}`];
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${dayjs(rule.until).format('YYYYMMDD[T]HHmmss[Z]')}`);
  if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.map((d) => DAYS[d]).join(',')}`);
  return `RRULE:${parts.join(';')}`;
}

/** Seed data writes rules as strings, so keep a small builder for that too. */
export function weeklyRule(days: number[]): string {
  return toRRuleString({ freq: 'WEEKLY', interval: 1, byDay: days });
}

export function dailyRule(count?: number): string {
  return toRRuleString({ freq: 'DAILY', interval: 1, count });
}

export function monthlyRule(interval = 1): string {
  return toRRuleString({ freq: 'MONTHLY', interval });
}

/**
 * Expand one event into the occurrences that intersect [rangeStart, rangeEnd].
 * Non-recurring events yield at most one occurrence.
 */
export function expandOccurrences(
  event: CalendarEventDTO,
  rangeStart: Dayjs,
  rangeEnd: Dayjs,
  max = 400,
): Occurrence[] {
  const start = dayjs(event.start);
  const durationMs = Math.max(0, dayjs(event.end).diff(start));
  if (!start.isValid()) return [];

  const exDates = new Set(
    (event.exceptionDates ?? []).map((d) => dayjs(d).startOf('day').format('YYYY-MM-DD')),
  );

  const emit = (s: Dayjs): Occurrence | null => {
    if (s.isValid() === false) return null;
    const e = s.add(durationMs, 'millisecond');
    if (e.isBefore(rangeStart) || s.isAfter(rangeEnd)) return null;
    if (exDates.has(s.startOf('day').format('YYYY-MM-DD'))) return null;
    return { start: s, end: e };
  };

  const rule = parseRRule(event.recurrenceRule);
  if (!rule) {
    const one = emit(start);
    return one ? [one] : [];
  }

  const until = rule.until ? dayjs(rule.until) : null;
  const out: Occurrence[] = [];
  const iterations = rule.count ?? Number.POSITIVE_INFINITY;

  let cursor = start;
  for (let i = 0; i < iterations && out.length < max; i += 1) {
    if (until && cursor.isAfter(until)) break;
    if (cursor.isAfter(rangeEnd)) break;

    if (rule.freq === 'WEEKLY' && rule.byDay?.length) {
      // Expand the week that starts on the cursor's Monday.
      const weekStart = cursor.subtract((cursor.day() + 6) % 7, 'day');
      for (const dow of rule.byDay) {
        const offset = (dow + 6) % 7; // Sunday(0) → 6, Monday(1) → 0 …
        const candidate = weekStart.add(offset, 'day').hour(cursor.hour()).minute(cursor.minute());
        const occ = emit(candidate);
        if (occ) out.push(occ);
      }
      cursor = cursor.add(rule.interval, 'week');
    } else {
      const occ = emit(cursor);
      if (occ) out.push(occ);
      const unit = rule.freq === 'DAILY' ? 'day' : rule.freq === 'WEEKLY' ? 'week' : rule.freq === 'MONTHLY' ? 'month' : 'year';
      cursor = cursor.add(rule.interval, unit);
    }
  }

  return out.sort((a, b) => a.start.valueOf() - b.start.valueOf());
}

export const RRULE_MONTHS = MONTHS;

/**
 * Date/time helpers for calendar surfaces.
 *
 * Two jobs:
 *   1. `toIso()` / `normalizeEvent()` — tolerate every shape the backend might
 *      send for a date (ISO string, Date, or a serialised `DateTime` class
 *      instance `{_utc,_timeZone}`; see services/types.ts).
 *   2. ISO-week range maths (weeks start Monday, per DESIGN_SYSTEM.md §Assumptions).
 */
import dayjs, { type Dayjs } from 'dayjs';

export const DATE_FORMAT = 'YYYY-MM-DD';

/** Coerce anything date-ish the API may return into an ISO string. */
export function toIso(value: unknown): string {
  if (typeof value === 'string') {
    const d = dayjs(value);
    return d.isValid() ? d.toISOString() : '';
  }
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    // Serialised `DateTime` instance from the backend domain layer.
    const maybe = value as { _utc?: unknown; utc?: unknown };
    const inner = maybe._utc ?? maybe.utc;
    if (inner) return toIso(inner);
  }
  return '';
}

/** Monday-start week containing `d`. */
export function startOfIsoWeek(d: Dayjs): Dayjs {
  return d.subtract((d.day() + 6) % 7, 'day').startOf('day');
}

export function isoWeekDays(weekStart: Dayjs): Dayjs[] {
  return Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));
}

/** Minutes since local midnight. */
export function minutesOfDay(d: Dayjs): number {
  return d.hour() * 60 + d.minute();
}

export function formatTime(iso: string): string {
  return dayjs(iso).format('h:mm A');
}

/** "9:00 – 10:30 AM" — the meridiem is printed once when both ends share it. */
export function formatRange(startIso: string, endIso: string): string {
  const s = dayjs(startIso);
  const e = dayjs(endIso);
  return s.format('h:mm') === e.format('h:mm')
    ? s.format('h:mm A')
    : s.format('h:mm A') + ' – ' + e.format('h:mm A');
}

/** Human duration for a block: "45m", "1h", "1h 30m". */
export function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.max(0, dayjs(endIso).diff(dayjs(startIso), 'minute'));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** True when two [start,end) ranges intersect. */
export function overlaps(aStart: Dayjs, aEnd: Dayjs, bStart: Dayjs, bEnd: Dayjs): boolean {
  return aStart.isBefore(bEnd) && bStart.isBefore(aEnd);
}

/** Dayjs → minutes from the top of `day`, clamped to [0, 1440]. */
export function offsetMinutes(day: Dayjs, value: Dayjs): number {
  return Math.max(0, Math.min(1440, value.diff(day.startOf('day'), 'minute')));
}

/** Round a date to the nearest `step` minutes (drag/drop snapping). */
export function snapTo(d: Dayjs, step = 15): Dayjs {
  const rounded = Math.round(d.minute() / step) * step;
  return d.startOf('hour').add(rounded, 'minute');
}

/**
 * Lay out overlapping events into columns within a single day.
 *
 * Classic "expand to widest cluster, then slice" pass: events that overlap
 * transitively form a cluster; within a cluster each event takes the first
 * column whose previous occupant has ended.
 */
export interface LayoutItem<T> {
  item: T;
  start: Dayjs;
  end: Dayjs;
  /** Column index within the cluster. */
  col: number;
  /** Column count of the cluster — drives width. */
  cols: number;
}

export function layoutDay<T>(
  items: T[],
  getStart: (t: T) => Dayjs,
  getEnd: (t: T) => Dayjs,
): LayoutItem<T>[] {
  const sorted = items
    .map((item) => ({ item, start: getStart(item), end: getEnd(item) }))
    .sort((a, b) => a.start.valueOf() - b.start.valueOf() || b.end.valueOf() - a.end.valueOf());

  const out: LayoutItem<T>[] = [];
  let cluster: LayoutItem<T>[] = [];
  let clusterEnd: Dayjs | null = null;

  const flush = () => {
    if (cluster.length === 0) return;
    const cols = Math.max(...cluster.map((c) => c.col)) + 1;
    cluster.forEach((c) => {
      c.cols = cols;
      out.push(c);
    });
    cluster = [];
    clusterEnd = null;
  };

  for (const entry of sorted) {
    if (clusterEnd && entry.start.isBefore(clusterEnd) === false) flush();
    const taken = new Set(cluster.filter((c) => c.end.isAfter(entry.start)).map((c) => c.col));
    let col = 0;
    while (taken.has(col)) col += 1;
    const placed: LayoutItem<T> = { ...entry, col, cols: 1 };
    cluster.push(placed);
    clusterEnd = clusterEnd && clusterEnd.isAfter(placed.end) ? clusterEnd : placed.end;
  }
  flush();

  return out;
}

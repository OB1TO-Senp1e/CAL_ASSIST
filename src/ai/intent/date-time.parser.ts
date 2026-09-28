import * as chrono from 'chrono-node';
import { IntentType } from './interfaces/intent.interface';

export interface ConsumedSpan {
  index: number;
  end: number;
  text: string;
}

export interface ParsedDateTime {
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  durationMinutes?: number;
  priority?: number;
  isQuery: boolean;
  cleanTitle: string;
}

const MAX_TITLE_LENGTH = 200;
const MAX_DURATION_MINUTES = 24 * 60;
const DEFAULT_START_HOUR = 9;
const DURATION_PHRASE =
  /\b(?:for|lasting|approx(?:imately)?|about)?\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|m\b|hours?|hrs?|h\b)(?!\w)/i;
const DUE_PREFIX = /\b(?:due\s+to|due|deadline|target(?:ed)?(?:\s+by)?|by)\s*[:\-]?\s+/i;
const HIGH_PRIORITY = /\b(urgent|asap|highest priority|top priority|critical|high priority)\b/i;
const MEDIUM_PRIORITY = /\b(medium priority|normal priority)\b/i;
const LOW_PRIORITY = /\b(low(?:est)? priority|not urgent|no rush|whenever|backlog)\b/i;
const QUERY_PATTERNS: RegExp[] = [
  /\b(what|whats|what's|which|show|list|how many|do i|am i|can you tell me)\b[^?!.]*\b(schedule|scheduled|agenda|meetings?|appointments?|events?|plans?|tasks?|todos?|to-dos?|commitments?|availability|conflicts?)\b/i,
  /\b(what(?:\s+do)?\s+i\s+have|do\s+i\s+have|am\s+i|whats|what's)\b[^?!.]*\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|next week|weekend)\b/i,
  /\bhow (busy|free|packed|full)\b/i,
  /\b(whats|what's|when is|when's)\b[^?!]*\b(next|upcoming|following)\b/i,
];
const WRITE_OVERRIDES =
  /\b(create|add|schedule|book|reschedule|cancel|delete|remove|move|shift|postpone|remind me|set up|block)\b/i;

interface ChronoHit {
  start: Date;
  end?: Date;
  index: number;
  text: string;
  hasTime: boolean;
}

function squash(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function chronoHits(text: string, reference: Date): ChronoHit[] {
  const duration = DURATION_PHRASE.exec(text);
  const durationSpan = duration
    ? { start: duration.index, end: duration.index + duration[0].length }
    : undefined;

  return chrono
    .parse(text, reference, { forwardDate: false })
    .filter((result) => result.start.isCertain('day') || result.start.isCertain('hour'))
    .filter((result) => {
      if (!durationSpan) return true;
      const resultEnd = result.index + result.text.length;
      return resultEnd <= durationSpan.start || result.index >= durationSpan.end;
    })
    .map((result) => ({
      start: result.start.date(),
      end:
        result.end && (result.end.isCertain('hour') || result.end.isCertain('day'))
          ? result.end.date()
          : undefined,
      index: result.index,
      text: result.text,
      hasTime: result.start.isCertain('hour'),
    }));
}

export function parseDurationMinutes(text: string): number | undefined {
  const match = DURATION_PHRASE.exec(String(text ?? ''));
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const minutes = /^h/i.test(match[2]) ? value * 60 : value;
  const rounded = Math.round(minutes);
  return rounded > 0 ? Math.min(rounded, MAX_DURATION_MINUTES) : undefined;
}

export function parsePriority(text: string): number | undefined {
  const lower = String(text ?? '').toLowerCase();
  if (HIGH_PRIORITY.test(lower)) return 8;
  if (MEDIUM_PRIORITY.test(lower)) return 5;
  if (LOW_PRIORITY.test(lower)) return 2;
  return undefined;
}

export function isScheduleQuery(text: string): boolean {
  const lower = String(text ?? '').toLowerCase();
  return !WRITE_OVERRIDES.test(lower) && QUERY_PATTERNS.some((pattern) => pattern.test(lower));
}

export function parseDateTimePhrase(text: string, reference: Date = new Date()): ParsedDateTime {
  const original = String(text ?? '');
  const lower = original.toLowerCase();
  const durationMinutes = parseDurationMinutes(original);
  const priority = parsePriority(original);
  const isQuery = isScheduleQuery(original);
  const consumed: ConsumedSpan[] = [];
  const mark = (index: number, phrase: string): void => {
    if (phrase) consumed.push({ index, end: index + phrase.length, text: phrase });
  };

  const hits = chronoHits(original, reference);
  for (const hit of hits) mark(hit.index, hit.text);

  const durationMatch = DURATION_PHRASE.exec(lower);
  if (durationMatch) mark(durationMatch.index, durationMatch[0]);

  const priorityPattern =
    priority === 8 ? HIGH_PRIORITY : priority === 5 ? MEDIUM_PRIORITY : LOW_PRIORITY;
  const priorityMatch = priorityPattern.exec(lower);
  if (priorityMatch) mark(priorityMatch.index, priorityMatch[0]);

  let dueDate: string | undefined;
  let dueSpan: { start: number; end: number } | undefined;
  const dueMatch = DUE_PREFIX.exec(lower);
  if (dueMatch) {
    const tailStart = dueMatch.index + dueMatch[0].length;
    const dueHit = chronoHits(original.slice(tailStart), reference).sort(
      (a, b) => b.start.getTime() - a.start.getTime()
    )[0];
    if (dueHit) {
      dueDate = (
        dueHit.hasTime ? dueHit.start : withHour(dueHit.start, DEFAULT_START_HOUR)
      ).toISOString();
      mark(dueMatch.index, original.slice(dueMatch.index, tailStart));
      mark(tailStart + dueHit.index, dueHit.text);
      dueSpan = {
        start: tailStart + dueHit.index,
        end: tailStart + dueHit.index + dueHit.text.length,
      };
    }
  }

  const openHits = hits
    .filter(
      (hit) => !dueSpan || hit.index + hit.text.length <= dueSpan.start || hit.index >= dueSpan.end
    )
    .sort((a, b) => a.index - b.index);

  let startDate: string | undefined;
  let endDate: string | undefined;
  if (openHits.length > 0) {
    const primary = openHits[0];
    const start = primary.hasTime ? primary.start : withHour(primary.start, DEFAULT_START_HOUR);
    startDate = start.toISOString();

    const rangeEnd = primary.end;
    const separateEnd = openHits.length > 1 ? openHits[openHits.length - 1].start : undefined;
    if (rangeEnd && rangeEnd.getTime() > start.getTime()) {
      endDate = rangeEnd.toISOString();
    } else if (separateEnd && separateEnd.getTime() > start.getTime()) {
      endDate = separateEnd.toISOString();
    } else if (durationMinutes !== undefined) {
      endDate = new Date(start.getTime() + durationMinutes * 60_000).toISOString();
    } else if (primary.hasTime) {
      endDate = new Date(start.getTime() + 60 * 60_000).toISOString();
    }
  }

  return {
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    ...(priority !== undefined ? { priority } : {}),
    isQuery,
    cleanTitle: titleFromRemainder(removeSpans(original, consumed)),
  };
}

function withHour(date: Date, hour: number): Date {
  const copy = new Date(date.getTime());
  copy.setHours(hour, 0, 0, 0);
  return copy;
}

function removeSpans(original: string, spans: ConsumedSpan[]): string {
  if (spans.length === 0) return original;
  const sorted = [...spans].sort((a, b) => a.index - b.index || b.end - a.end);
  const merged: Array<{ index: number; end: number }> = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.index <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ index: span.index, end: span.end });
    }
  }
  let output = '';
  let cursor = 0;
  for (const span of merged) {
    output += original.slice(cursor, span.index);
    cursor = span.end;
  }
  return output + original.slice(cursor);
}

export function titleFromRemainder(remainder: string): string {
  let title = squash(remainder);
  title = title.replace(/^(?:and|that|which|is|are|for|at|on|by|in|to|the)\b[\s,:]*/i, '');
  title = squash(
    title.replace(/[,\s]*(?:for|at|on|by|in|to|with|due|until|till|from|lasting|and)[,\s]+$/i, '')
  );
  title = squash(title.replace(/^[\s,:.\-–—()]+/, ''));
  return title.length > MAX_TITLE_LENGTH ? title.slice(0, MAX_TITLE_LENGTH).trim() : title;
}

export function readOnlyIntentForQuery(text: string): IntentType {
  const lower = String(text ?? '').toLowerCase();
  if (/\b(conflicts?|double-?booked?|overlaps?)\b/.test(lower)) return 'CHECK_CONFLICTS';
  if (/\b(free|available|availability|open|opening|slot|gap)\b/.test(lower)) {
    return 'QUERY_AVAILABILITY';
  }
  return 'GET_RECOMMENDATIONS';
}

export function mergeDateTimeIntoEntities(
  entities: Record<string, unknown>,
  text: string,
  reference: Date = new Date()
): { entities: Record<string, unknown>; parsed: ParsedDateTime } {
  const parsed = parseDateTimePhrase(text, reference);
  const merged: Record<string, unknown> = { ...(entities ?? {}) };

  for (const field of ['startDate', 'endDate', 'dueDate'] as const) {
    if (parsed[field]) merged[field] = parsed[field];
  }
  if (parsed.durationMinutes !== undefined) merged.durationMinutes = parsed.durationMinutes;
  if (parsed.priority !== undefined) merged.priority = parsed.priority;
  if (parsed.isQuery) merged.isQuery = true;

  if (typeof merged.priority === 'string') {
    const priority = Number(merged.priority);
    if (Number.isInteger(priority) && priority >= 0 && priority <= 10) {
      merged.priority = priority;
    } else {
      const normalizedPriority = parsePriority(merged.priority);
      if (normalizedPriority !== undefined) merged.priority = normalizedPriority;
      else delete merged.priority;
    }
  }

  const modelTitle = typeof merged.title === 'string' ? squash(merged.title) : '';
  if (parsed.cleanTitle) {
    if (!modelTitle || modelTitle.toLowerCase() === squash(text).toLowerCase()) {
      merged.title = stripCommandPrefix(parsed.cleanTitle);
    } else {
      const cleaned = stripCommandPrefix(modelTitle);
      if (cleaned) merged.title = cleaned;
    }
  }
  return { entities: merged, parsed };
}

function stripCommandPrefix(value: string): string {
  let title = squash(value);
  title = title.replace(
    /^(?:(?:please|kindly|hey|hi|okay|ok|can you|could you)\s+)*(?:create|make|add|set up|schedule|book|plan|block|remind me to|remind me|new)\b[\s,:]*/i,
    ''
  );
  title = title.replace(/^(?:a|an|the|my|our|new|quick|brief)\b[\s,:]*/i, '');
  title = title.replace(
    /^(?:goals?|objectives?|okrs?|projects?|initiatives?|to-?dos?|tasks?|events?|meetings?|appointments?|reminders?)\b[\s,:]*/i,
    ''
  );
  return titleFromRemainder(title);
}

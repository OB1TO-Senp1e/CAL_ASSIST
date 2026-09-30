/**
 * TS-side design tokens: the pieces of the design system that must be computed
 * in JS (calendar color assignment, level scales). All values resolve to CSS
 * variables declared in src/index.css so light/dark mode stays automatic.
 *
 * Enum sources (verified against the backend, do not invent new members):
 *   TimeBlockType   — prisma/schema.prisma  enum TimeBlockType
 *   EventStatus     — prisma/schema.prisma  enum EventStatus
 *   Level           — src/ai/assistant/interfaces/assistant-tools.interface.ts ToolConfirmationLevelSchema
 *                     src/commitments/commitment.types.ts riskLevel
 *                     src/daily-experience/daily-experience.types.ts RiskLevelSchema
 *   EventCategory   — prisma/schema.prisma enum EventCategory
 *                     (mirrored by src/calendar/domain/calendar-event.ts)
 */
import type { EventCategory } from '@/services/types';

export type TimeBlockType =
  | 'FOCUS'
  | 'MEETING'
  | 'TRAVEL'
  | 'BREAK'
  | 'PERSONAL'
  | 'BUFFER'
  | 'DEADLINE'
  | 'ROUTINE';

export type EventStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' | 'NEEDS_ACTION';

export type Level = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/* ───────────── Calendar palette ─────────────
 * Hues (OKLCH degrees) at matched lightness/chroma. Hue 300 (violet) is
 * deliberately ABSENT: it belongs to the AI layer only, so a user's calendar
 * can never be mistaken for an AI proposal.
 */
export const CALENDAR_HUES = {
  iris: 268,
  sky: 232,
  teal: 188,
  lime: 138,
  amber: 78,
  coral: 32,
  rose: 355,
  slate: 265, // rendered with low chroma
} as const;

export type CalendarHueName = keyof typeof CALENDAR_HUES;

export interface CalendarColor {
  /** Rail / dot / drag handle. */
  solid: string;
  /** Card fill. */
  soft: string;
  /** Text on the soft fill. */
  ink: string;
}

export function calendarColor(name: CalendarHueName): CalendarColor {
  const h = CALENDAR_HUES[name];
  const chroma = (v: string) => (name === 'slate' ? `calc(${v} * 0.25)` : v);
  return {
    solid: `oklch(var(--cal-l-solid) ${chroma('var(--cal-c-solid)')} ${h})`,
    soft: `oklch(var(--cal-l-soft) ${chroma('var(--cal-c-soft)')} ${h})`,
    ink: `oklch(var(--cal-l-ink) ${chroma('var(--cal-c-ink)')} ${h})`,
  };
}

/** Default color per TimeBlockType, used when a block has no owning calendar color. */
export const TIME_BLOCK_TYPE_HUE: Record<TimeBlockType, CalendarHueName> = {
  FOCUS: 'iris',
  MEETING: 'sky',
  ROUTINE: 'teal',
  BREAK: 'lime',
  TRAVEL: 'amber',
  DEADLINE: 'coral',
  PERSONAL: 'rose',
  BUFFER: 'slate',
};

/**
 * Fallback hue per EventCategory (src/calendar/domain/calendar-event.ts).
 * Only used when the owning calendar has no colour: the calendar is what the
 * user actually chooses, so it normally wins. Violet stays excluded (AI only).
 */
export const EVENT_CATEGORY_HUE: Record<EventCategory, CalendarHueName> = {
  PERSONAL: 'rose',
  WORK: 'iris',
  MEETING: 'sky',
  APPOINTMENT: 'teal',
  REMINDER: 'slate',
  HOLIDAY: 'lime',
  BIRTHDAY: 'coral',
  TRAVEL: 'amber',
  FOCUS_TIME: 'iris',
  CUSTOM: 'slate',
};

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  PERSONAL: 'Personal',
  WORK: 'Work',
  MEETING: 'Meeting',
  APPOINTMENT: 'Appointment',
  REMINDER: 'Reminder',
  HOLIDAY: 'Holiday',
  BIRTHDAY: 'Birthday',
  TRAVEL: 'Travel',
  FOCUS_TIME: 'Focus time',
  CUSTOM: 'Custom',
};

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  CONFIRMED: 'Confirmed',
  TENTATIVE: 'Tentative',
  NEEDS_ACTION: 'Needs action',
  CANCELLED: 'Cancelled',
};

export const TIME_BLOCK_TYPE_LABEL: Record<TimeBlockType, string> = {
  FOCUS: 'Focus',
  MEETING: 'Meeting',
  ROUTINE: 'Routine',
  BREAK: 'Break',
  TRAVEL: 'Travel',
  DEADLINE: 'Deadline',
  PERSONAL: 'Personal',
  BUFFER: 'Buffer',
};

/**
 * Snap an arbitrary user/provider color (Calendar.color, default "#3b82f6") to
 * the nearest palette hue, so synced Google/Outlook colors stay harmonious.
 */
export function snapToCalendarHue(hex: string | null | undefined): CalendarHueName {
  const hue = hexToOklchHue(hex ?? '');
  if (hue === null) return 'slate';
  let best: CalendarHueName = 'iris';
  let bestDist = Infinity;
  (Object.keys(CALENDAR_HUES) as CalendarHueName[]).forEach((name) => {
    if (name === 'slate') return;
    const d = Math.min(Math.abs(CALENDAR_HUES[name] - hue), 360 - Math.abs(CALENDAR_HUES[name] - hue));
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  });
  return best;
}

/** sRGB hex → OKLCH hue in degrees. Returns null for invalid or near-grey input. */
export function hexToOklchHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s;
  if (Math.hypot(A, B) < 0.02) return null;
  const deg = (Math.atan2(B, A) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/* ───────────── Event status treatment ─────────────
 * Status is conveyed by SHAPE (border style, opacity, strike), never by a new
 * color — color is reserved for "which calendar / what kind of time".
 */
export const EVENT_STATUS_CLASS: Record<EventStatus, string> = {
  CONFIRMED: '',
  TENTATIVE: 'border border-dashed border-current/40 bg-[length:8px_8px]',
  NEEDS_ACTION: 'outline outline-1 outline-dashed outline-current/50',
  CANCELLED: 'opacity-50 line-through',
};

/* ───────────── Level scale ─────────────
 * One scale for AI confirmation level, commitment risk, and daily risk, so the
 * user learns a single visual language for "how much should I care".
 */
export const LEVEL_META: Record<Level, { label: string; dot: string; text: string; soft: string }> = {
  NONE: { label: 'None', dot: 'bg-level-none', text: 'text-level-none', soft: 'bg-muted' },
  LOW: { label: 'Low', dot: 'bg-level-low', text: 'text-level-low', soft: 'bg-info-soft' },
  MEDIUM: { label: 'Medium', dot: 'bg-level-medium', text: 'text-level-medium', soft: 'bg-warning-soft' },
  HIGH: { label: 'High', dot: 'bg-level-high', text: 'text-level-high', soft: 'bg-warning-soft' },
  CRITICAL: { label: 'Critical', dot: 'bg-level-critical', text: 'text-level-critical', soft: 'bg-destructive/10' },
};

/** Confirmation levels that MUST show an explicit confirm step before executing. */
export const REQUIRES_CONFIRMATION: ReadonlySet<Level> = new Set(['MEDIUM', 'HIGH', 'CRITICAL']);

/* ───────────── Calendar grid geometry (mirrors CSS vars) ───────────── */
export const HOUR_HEIGHT_PX = 48;
export const WORKDAY_START_HOUR = 8;
export const WORKDAY_END_HOUR = 18;

/* ───────────── Event colour resolution ─────────────
 * Precedence (DESIGN_SYSTEM.md §Colour): which calendar an event belongs to is
 * what the user chose, so it wins; the category is only a fallback. Violet is
 * never reachable here — AI proposals are the only violet in the product.
 */
export function eventColor(
  calendarColorHex: string | null | undefined,
  category: EventCategory,
): CalendarHueName {
  const snapped = snapToCalendarHue(calendarColorHex);
  // snapToCalendarHue returns 'slate' when the input is missing or near-grey, so
  // treat slate as "no usable calendar colour" and fall through to the category.
  return snapped === 'slate' ? EVENT_CATEGORY_HUE[category] : snapped;
}

/** A calendar's own colour, for the visibility rail (no category fallback). */
export function calendarSwatch(calendarColorHex: string | null | undefined): CalendarHueName {
  return snapToCalendarHue(calendarColorHex);
}

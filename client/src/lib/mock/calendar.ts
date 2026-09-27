/**
 * Mock calendar data (Stage 2).
 *
 * Shapes match `CalendarEventDTO` / `CalendarDTO` exactly so Stage 3 only swaps
 * the source. Stored in localStorage alongside the mock user database.
 *
 * Anchor: seed events are generated relative to "the current week" at first run
 * and cached, so the grid is populated the moment you open it regardless of the
 * day you happen to be building. `resetMockCalendar()` re-anchors.
 */
import dayjs from 'dayjs';
import type { CalendarDTO, CalendarEventDTO, EventCategory, EventSource, EventStatus } from '@/services/types';
import { dailyRule, weeklyRule } from '@/lib/rrule';

const EVENTS_KEY = 'calassist-mock-events';
const CALENDARS_KEY = 'calassist-mock-calendars';
const VERSION = 3;

/** Prisma `Calendar.color` defaults are hex; these are the ones the mock ships. */
export const MOCK_CALENDARS: CalendarDTO[] = [
  {
    id: 'cal_personal',
    userId: 'usr_demo',
    connectionId: null,
    name: 'Personal',
    description: 'Default calendar',
    color: '#3b82f6', // blue → snaps to sky
    timezone: 'America/Los_Angeles',
    isVisible: true,
    isPrimary: true,
    provider: 'LOCAL',
    externalId: null,
  },
  {
    id: 'cal_work',
    userId: 'usr_demo',
    connectionId: null,
    name: 'Work',
    description: 'Team calendar',
    color: '#6366f1', // indigo → snaps to iris
    timezone: 'America/Los_Angeles',
    isVisible: true,
    isPrimary: false,
    provider: 'LOCAL',
    externalId: null,
  },
  {
    id: 'cal_focus',
    userId: 'usr_demo',
    connectionId: null,
    name: 'Focus',
    description: 'Deep work blocks',
    color: '#14b8a6', // teal
    timezone: 'America/Los_Angeles',
    isVisible: true,
    isPrimary: false,
    provider: 'LOCAL',
    externalId: null,
  },
  {
    id: 'cal_travel',
    userId: 'usr_demo',
    connectionId: null,
    name: 'Travel',
    description: 'Commutes and trips',
    color: '#f59e0b', // amber
    timezone: 'America/Los_Angeles',
    isVisible: true,
    isPrimary: false,
    provider: 'LOCAL',
    externalId: null,
  },
];

interface SeedSpec {
  /** Day offset from this week's Monday (0 = Monday). */
  day: number;
  startHour: number;
  startMin?: number;
  minutes: number;
  title: string;
  calendarId: string;
  category: EventCategory;
  status?: EventStatus;
  location?: string;
  description?: string;
  recurrenceRule?: string;
  allDay?: boolean;
  source?: EventSource;
  /** Guests, as bare emails → rendered as participants with a status. */
  guests?: string[];
}

const SEED: SeedSpec[] = [
  // ── Monday
  { day: 0, startHour: 9, minutes: 30, title: 'Weekly planning', calendarId: 'cal_work', category: 'MEETING', recurrenceRule: weeklyRule([1]), location: 'Zoom', guests: ['sam@example.com', 'dana@example.com'] },
  { day: 0, startHour: 11, minutes: 90, title: 'Deep work — API design', calendarId: 'cal_focus', category: 'FOCUS_TIME' },
  { day: 0, startHour: 13, startMin: 30, minutes: 45, title: 'Lunch with Priya', calendarId: 'cal_personal', category: 'PERSONAL', location: 'Cafe Miel' },
  { day: 0, startHour: 15, minutes: 60, title: 'Design review', calendarId: 'cal_work', category: 'MEETING', status: 'TENTATIVE', guests: ['dana@example.com'] },

  // ── Tuesday
  { day: 1, startHour: 8, minutes: 30, title: 'Standup', calendarId: 'cal_work', category: 'MEETING', recurrenceRule: dailyRule(20) },
  { day: 1, startHour: 9, minutes: 120, title: 'Compile the quarter plan', calendarId: 'cal_focus', category: 'FOCUS_TIME' },
  { day: 1, startHour: 14, minutes: 60, title: '1:1 with Sam', calendarId: 'cal_work', category: 'MEETING', guests: ['sam@example.com'] },

  // ── Wednesday
  { day: 2, startHour: 8, minutes: 30, title: 'Standup', calendarId: 'cal_work', category: 'MEETING' },
  { day: 2, startHour: 10, minutes: 90, title: 'Roadmap workshop', calendarId: 'cal_work', category: 'MEETING', location: 'Room 4', guests: ['sam@example.com', 'dana@example.com', 'lee@example.com'] },
  { day: 2, startHour: 13, minutes: 60, title: 'Focus — documentation', calendarId: 'cal_focus', category: 'FOCUS_TIME' },
  { day: 2, startHour: 16, minutes: 30, title: 'Physio', calendarId: 'cal_personal', category: 'APPOINTMENT', location: 'Northside Clinic' },

  // ── Thursday
  { day: 3, startHour: 8, minutes: 30, title: 'Standup', calendarId: 'cal_work', category: 'MEETING' },
  { day: 3, startHour: 9, startMin: 30, minutes: 45, title: 'Client call — Northwind', calendarId: 'cal_work', category: 'MEETING', location: 'Zoom', guests: ['lee@example.com'] },
  { day: 3, startHour: 11, minutes: 60, title: 'Commute', calendarId: 'cal_travel', category: 'TRAVEL' },
  { day: 3, startHour: 12, minutes: 90, title: 'Offsite prep', calendarId: 'cal_focus', category: 'FOCUS_TIME' },

  // ── Friday
  { day: 4, startHour: 8, minutes: 30, title: 'Standup', calendarId: 'cal_work', category: 'MEETING' },
  { day: 4, startHour: 10, minutes: 60, title: 'Sprint review', calendarId: 'cal_work', category: 'MEETING', status: 'NEEDS_ACTION', guests: ['sam@example.com'] },
  { day: 4, startHour: 13, minutes: 60, title: 'Retro', calendarId: 'cal_work', category: 'MEETING' },
  { day: 4, startHour: 15, minutes: 45, title: 'Inbox zero', calendarId: 'cal_focus', category: 'FOCUS_TIME' },

  // ── Sunday (weekend, off-hours)
  { day: 6, startHour: 10, minutes: 120, title: 'Long run', calendarId: 'cal_personal', category: 'PERSONAL' },

  // ── All-day
  { day: 2, startHour: 0, minutes: 1440, title: 'Dana out of office', calendarId: 'cal_work', category: 'WORK', allDay: true },
  { day: 4, startHour: 0, minutes: 1440, title: 'Release 2.4', calendarId: 'cal_work', category: 'WORK', allDay: true },

  // ── An unconfirmed AI proposal, so the violet `.proposal` treatment is
  //    validated against real rendered UI rather than only described. 2c replaces
  //    this with live proposals arriving from the assistant thread.
  { day: 4, startHour: 14, minutes: 90, title: 'Deep work — Q4 planning', calendarId: 'cal_focus', category: 'FOCUS_TIME', source: 'AI_GENERATED', status: 'NEEDS_ACTION' },
];

function buildSeedEvents(): CalendarEventDTO[] {
  const monday = dayjs().subtract((dayjs().day() + 6) % 7, 'day').startOf('day');
  const now = new Date().toISOString();

  return SEED.map((spec, i) => {
    const start = monday.add(spec.day, 'day').add(spec.startHour, 'hour').add(spec.startMin ?? 0, 'minute');
    const end = start.add(spec.minutes, 'minute');
    return {
      id: `evt_seed_${i}`,
      userId: 'usr_demo',
      calendarId: spec.calendarId,
      title: spec.title,
      description: spec.description ?? null,
      location: spec.location ?? null,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: spec.allDay ?? false,
      timeZone: 'America/Los_Angeles',
      status: spec.status ?? 'CONFIRMED',
      category: spec.category,
      color: null,
      recurrenceRule: spec.recurrenceRule ?? null,
      exceptionDates: [],
      source: spec.source ?? 'USER',
      visibility: 'PRIVATE',
      participants: (spec.guests ?? []).map((email, gi) => ({
        id: `part_${i}_${gi}`,
        email,
        displayName: email.split('@')[0].replace(/^\w/, (c) => c.toUpperCase()),
        status: gi === 0 ? 'ACCEPTED' : 'NEEDS_ACTION',
        role: 'REQUIRED',
      })),
      reminders: [],
      createdAt: now,
      updatedAt: now,
    } satisfies CalendarEventDTO;
  });
}

function readVersioned<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { version: number; data: T[] };
    if (parsed.version !== VERSION || !Array.isArray(parsed.data)) return fallback;
    return parsed.data;
  } catch {
    return fallback;
  }
}

function writeVersioned<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify({ version: VERSION, data }));
  } catch {
    /* ignore */
  }
}

export function loadEvents(): CalendarEventDTO[] {
  const stored = readVersioned<CalendarEventDTO>(EVENTS_KEY, []);
  if (stored.length > 0) return stored;
  const seeded = buildSeedEvents();
  writeVersioned(EVENTS_KEY, seeded);
  return seeded;
}

export function saveEvents(events: CalendarEventDTO[]): void {
  writeVersioned(EVENTS_KEY, events);
}

export function loadCalendars(): CalendarDTO[] {
  const stored = readVersioned<CalendarDTO>(CALENDARS_KEY, []);
  if (stored.length > 0) return stored;
  writeVersioned(CALENDARS_KEY, MOCK_CALENDARS);
  return MOCK_CALENDARS;
}

export function saveCalendars(calendars: CalendarDTO[]): void {
  writeVersioned(CALENDARS_KEY, calendars);
}

/** Re-anchor the seed data to the current week (developer reset). */
export function resetMockCalendar(): void {
  writeVersioned(EVENTS_KEY, buildSeedEvents());
  writeVersioned(CALENDARS_KEY, MOCK_CALENDARS);
}

/** Mirror of the backend's cuid-ish ids, so created rows look native. */
export function mockId(prefix = 'c'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

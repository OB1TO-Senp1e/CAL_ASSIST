/**
 * Calendar service facade.
 *
 * Components call `calendarService`; Stage 2 backs it with the mock store, Stage 3
 * flips `USE_MOCK` off and the same call sites hit NestJS. Endpoint paths come
 * from src/calendar/calendar.controller.ts and
 * src/integrations/calendar-adapters/calendar.controller.ts.
 *
 * Divergence from the raw backend response is confined to `normalizeEvent()`:
 * the service currently returns `DateTime` class instances (no `toJSON`), so
 * dates arrive as `{_utc,_timeZone}` and `category`/`source` are absent from the
 * Prisma model. Normalising here means Stage 3 does not break either way.
 */
import dayjs, { type Dayjs } from 'dayjs';
import api from './api';
import type {
  BulkEventInput,
  CalendarDTO,
  CalendarEventDTO,
  CreateEventInput,
  MonthViewDTO,
  EventStatus,
  UpdateEventInput,
  WeekViewDTO,
} from './types';
import { USE_MOCK } from './auth';
import { loadCalendars, loadEvents, mockId, saveCalendars, saveEvents } from '@/lib/mock/calendar';
import { expandOccurrences } from '@/lib/rrule';
import { toIso } from '@/lib/datetime';
import { latency } from '@/lib/mock/db';

/** Coerce a raw API event into `CalendarEventDTO` (see header comment). */
export function normalizeEvent(raw: Record<string, unknown>): CalendarEventDTO {
  const event = raw as Partial<CalendarEventDTO> & {
    timezone?: string;
    recurrenceRule?: string | null;
    recurrence?: unknown;
    eventParticipants?: CalendarEventDTO['participants'];
  };

  let recurrenceRule = event.recurrenceRule ?? null;
  if (!recurrenceRule && event.recurrence) {
    recurrenceRule = typeof event.recurrence === 'string' ? event.recurrence : null;
  }

  return {
    id: String(raw.id ?? ''),
    userId: String(raw.userId ?? ''),
    calendarId: (raw.calendarId as string | null) ?? null,
    title: String(raw.title ?? ''),
    description: (raw.description as string | null) ?? null,
    location: (raw.location as string | null) ?? null,
    start: toIso(event.start),
    end: toIso(event.end),
    allDay: Boolean(raw.allDay),
    timeZone: event.timezone ?? event.timeZone ?? 'UTC',
    status: (raw.status as EventStatus) ?? 'CONFIRMED',
    // Not on the Prisma Event model today; default rather than crash the grid.
    category: (raw.category as CalendarEventDTO['category']) ?? 'PERSONAL',
    color: (raw.color as string | null) ?? null,
    recurrenceRule,
    exceptionDates: ((raw.exceptionDates as unknown[]) ?? []).map(toIso).filter(Boolean),
    source: (raw.source as CalendarEventDTO['source']) ?? 'USER',
    visibility: (raw.visibility as CalendarEventDTO['visibility']) ?? 'PRIVATE',
    participants: event.participants ?? event.eventParticipants ?? [],
    reminders: (raw.reminders as CalendarEventDTO['reminders']) ?? [],
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
  };
}

/* ───────────── Mock implementations ───────────── */

function mockOverlapping(start: Dayjs, end: Dayjs, excludeId?: string): CalendarEventDTO[] {
  const events = loadEvents();
  const rangeEnd = end.add(1, 'day');
  return events.filter((event) => {
    if (event.id === excludeId || event.allDay) return false;
    return expandOccurrences(event, start.subtract(1, 'day'), rangeEnd).some(
      (o) => o.start.isBefore(end) && start.isBefore(o.end),
    );
  });
}

async function mockList(start: Dayjs, end: Dayjs): Promise<CalendarEventDTO[]> {
  await latency();
  return loadEvents().filter((event) =>
    expandOccurrences(event, start, end).length > 0,
  );
}

async function mockWeek(weekStart: Dayjs): Promise<WeekViewDTO> {
  const start = weekStart.startOf('day');
  const end = start.add(6, 'day').endOf('day');
  const events = await mockList(start, end);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = start.add(i, 'day');
    const dayStart = date.startOf('day');
    const dayEnd = date.endOf('day');
    const forDay = events
      .map((event) => ({ event, occ: expandOccurrences(event, dayStart, dayEnd).find((o) => o.start.isSame(date, 'day')) }))
      .filter((x) => x.occ)
      .map(({ event, occ }) => ({ ...event, start: occ!.start.toISOString(), end: occ!.end.toISOString() }));

    return {
      date: date.toISOString(),
      events: forDay.filter((e) => !e.allDay),
      allDayEvents: forDay.filter((e) => e.allDay),
      workingHours: { start: 9, end: 17 },
    };
  });
  return { weekStart: start.toISOString(), weekEnd: end.toISOString(), days };
}

async function mockMonth(year: number, month: number): Promise<MonthViewDTO> {
  await latency();
  const monthStart = dayjs(new Date(year, month, 1));
  const gridStart = monthStart.subtract((monthStart.day() + 6) % 7, 'day');
  const gridEnd = gridStart.add(41, 'day').endOf('day');
  const events = loadEvents();

  const eventsByDate: Record<string, CalendarEventDTO[]> = {};
  for (let d = gridStart; d.isBefore(gridEnd); d = d.add(1, 'day')) {
    const dayStart = d.startOf('day');
    const dayEnd = d.endOf('day');
    const forDay: CalendarEventDTO[] = [];
    for (const event of events) {
      const occ = expandOccurrences(event, dayStart, dayEnd).find((o) => o.start.isSame(dayStart, 'day'));
      if (occ) forDay.push({ ...event, start: occ.start.toISOString(), end: occ.end.toISOString() });
    }
    if (forDay.length > 0) eventsByDate[dayStart.format('YYYY-MM-DD')] = forDay;
  }

  return { year, month, weeks: [], eventsByDate };
}

async function mockAgenda(start: Dayjs, end: Dayjs): Promise<CalendarEventDTO[]> {
  const events = await mockList(start, end);
  const flattened: CalendarEventDTO[] = [];
  for (const event of events) {
    for (const occ of expandOccurrences(event, start, end)) {
      flattened.push({ ...event, start: occ.start.toISOString(), end: occ.end.toISOString() });
    }
  }
  return flattened.sort((a, b) => a.start.localeCompare(b.start));
}

/* ───────────── Public API ───────────── */

export const calendarService = {
  async listCalendars(): Promise<CalendarDTO[]> {
    if (USE_MOCK) {
      await latency(80, 200);
      return loadCalendars();
    }
    const { data } = await api.get<CalendarDTO[]>('/api/calendar/calendars');
    return data;
  },

  async setCalendarVisible(id: string, isVisible: boolean): Promise<CalendarDTO[]> {
    if (USE_MOCK) {
      const next = loadCalendars().map((c) => (c.id === id ? { ...c, isVisible } : c));
      saveCalendars(next);
      return next;
    }
    await api.patch(`/api/calendar/calendars/${id}`, { isVisible });
    return this.listCalendars();
  },

  /** GET /api/calendar/events?startDate&endDate */
  async listEvents(start: Dayjs, end: Dayjs): Promise<CalendarEventDTO[]> {
    if (USE_MOCK) return mockList(start, end);
    const { data } = await api.get<Record<string, unknown>[]>('/api/calendar/events', {
      params: { startDate: start.toISOString(), endDate: end.toISOString() },
    });
    return data.map(normalizeEvent);
  },

  /** GET /api/calendar/events/week/:weekStart */
  async weekView(weekStart: Dayjs): Promise<WeekViewDTO> {
    if (USE_MOCK) return mockWeek(weekStart);
    const { data } = await api.get<WeekViewDTO>(`/api/calendar/events/week/${weekStart.format('YYYY-MM-DD')}`);
    return data;
  },

  /** GET /api/calendar/events/month/:year/:month — month is 1-based on the wire. */
  async monthView(year: number, month: number): Promise<MonthViewDTO> {
    if (USE_MOCK) return mockMonth(year, month);
    const { data } = await api.get<MonthViewDTO>(`/api/calendar/events/month/${year}/${month + 1}`);
    return data;
  },

  /** GET /api/calendar/events/agenda?startDate&endDate */
  async agenda(start: Dayjs, end: Dayjs): Promise<CalendarEventDTO[]> {
    if (USE_MOCK) return mockAgenda(start, end);
    const { data } = await api.get<Record<string, unknown>[]>('/api/calendar/events/agenda', {
      params: { startDate: start.toISOString(), endDate: end.toISOString() },
    });
    return data.map(normalizeEvent);
  },

  /** POST /api/calendar/events */
  async createEvent(input: CreateEventInput): Promise<CalendarEventDTO> {
    if (USE_MOCK) {
      await latency();
      const now = new Date().toISOString();
      const event: CalendarEventDTO = {
        id: mockId('evt_'),
        userId: 'usr_demo',
        calendarId: input.calendarId ?? null,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        start: input.start,
        end: input.end,
        allDay: input.allDay ?? false,
        timeZone: input.timeZone ?? 'America/Los_Angeles',
        status: 'CONFIRMED',
        category: input.category ?? 'PERSONAL',
        color: input.color ?? null,
        recurrenceRule: input.recurrenceRule ?? null,
        exceptionDates: [],
        source: 'USER',
        visibility: 'PRIVATE',
        participants: (input.participants ?? []).map((p, i) => ({
          id: `part_new_${i}`,
          email: p.email,
          displayName: p.displayName ?? null,
          status: p.status ?? 'NEEDS_ACTION',
          role: p.role ?? 'REQUIRED',
        })),
        reminders: [],
        createdAt: now,
        updatedAt: now,
      };
      saveEvents([...loadEvents(), event]);
      return event;
    }
    const { data } = await api.post<Record<string, unknown>>('/api/calendar/events', input);
    return normalizeEvent(data);
  },

  /** PATCH /api/calendar/events/:id */
  async updateEvent(id: string, input: UpdateEventInput): Promise<CalendarEventDTO> {
    if (USE_MOCK) {
      await latency(160, 320);
      const events = loadEvents();
      const index = events.findIndex((e) => e.id === id);
      if (index < 0) throw new Error('Event not found');
      const merged: CalendarEventDTO = {
        ...events[index],
        ...input,
        description: input.description ?? events[index].description,
        participants: input.participants
          ? input.participants.map((p, i) => ({
              id: `part_upd_${i}`,
              email: p.email,
              displayName: p.displayName ?? null,
              status: p.status ?? 'NEEDS_ACTION',
              role: p.role ?? 'REQUIRED',
            }))
          : events[index].participants,
        updatedAt: new Date().toISOString(),
      };
      events[index] = merged;
      saveEvents(events);
      return merged;
    }
    const { data } = await api.patch<Record<string, unknown>>(`/api/calendar/events/${id}`, input);
    return normalizeEvent(data);
  },

  /** PATCH /api/calendar/events/:id/move — what drag/drop calls. */
  async moveEvent(id: string, newStart: string, newEnd: string): Promise<CalendarEventDTO> {
    if (USE_MOCK) return this.updateEvent(id, { start: newStart, end: newEnd });
    const { data } = await api.patch<Record<string, unknown>>(`/api/calendar/events/${id}/move`, {
      newStart,
      newEnd,
    });
    return normalizeEvent(data);
  },

  /** PATCH /api/calendar/events/:id/resize — what the bottom handle calls. */
  async resizeEvent(id: string, newEnd: string): Promise<CalendarEventDTO> {
    if (USE_MOCK) return this.updateEvent(id, { end: newEnd });
    const { data } = await api.patch<Record<string, unknown>>(`/api/calendar/events/${id}/resize`, { newEnd });
    return normalizeEvent(data);
  },

  /** DELETE /api/calendar/events/:id — 204, no body. */
  async deleteEvent(id: string): Promise<void> {
    if (USE_MOCK) {
      await latency(160, 320);
      saveEvents(loadEvents().filter((e) => e.id !== id));
      return;
    }
    await api.delete(`/api/calendar/events/${id}`);
  },

  /** POST /api/calendar/events/bulk */
  async bulk(input: BulkEventInput): Promise<void> {
    if (USE_MOCK) {
      await latency();
      const ids = new Set(input.eventIds);
      if (input.action === 'delete') {
        saveEvents(loadEvents().filter((e) => !ids.has(e.id)));
        return;
      }
      const status: EventStatus | null =
        input.action === 'cancel' ? 'CANCELLED' : input.action === 'confirm' ? 'CONFIRMED' : null;
      if (status) {
        saveEvents(loadEvents().map((e) => (ids.has(e.id) ? { ...e, status } : e)));
      }
      return;
    }
    await api.post('/api/calendar/events/bulk', input);
  },

  /** POST /api/calendar/events/conflicts/check */
  async checkConflicts(start: Dayjs, end: Dayjs, excludeId?: string): Promise<CalendarEventDTO[]> {
    if (USE_MOCK) {
      await latency(120, 260);
      return mockOverlapping(start, end, excludeId);
    }
    const { data } = await api.post<Record<string, unknown>[]>('/api/calendar/events/conflicts/check', {
      event: { start: start.toISOString(), end: end.toISOString() },
      excludeEventId: excludeId,
    });
    return data.map(normalizeEvent);
  },
};

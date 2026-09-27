import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useShell } from '@/components/layout/shell-context';
import { useHotkeys } from '@/lib/hotkeys';
import { startOfIsoWeek } from '@/lib/datetime';
import { calendarService } from '@/services/calendar';
import type { CalendarDTO, CalendarEventDTO, EventCategory, EventStatus } from '@/services/types';
import { CalendarRail } from '@/components/calendar/CalendarRail';
import { TimeGrid, type TimeGridDay } from '@/components/calendar/TimeGrid';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { AgendaList } from '@/components/calendar/AgendaList';
import { EventDetailDialog } from '@/components/calendar/EventDetailDialog';
import { EventEditorDialog, type EventEditorValues } from '@/components/calendar/EventEditorDialog';

/**
 * Calendar — the primary surface (DESIGN_SYSTEM.md §Inspirations, Notion Calendar).
 *
 * Four views (day/week/month/agenda) over one range query, so switching views is
 * instant and costs nothing. The data layer returns plain `CalendarEventDTO[]`
 * for the visible range and each view expands recurrences itself, which keeps the
 * service surface as small as the real backend's.
 *
 * All four states are handled explicitly: loading (skeleton that mirrors the
 * grid), error (retry, non-destructive), empty (floats over the grid rather than
 * replacing it — an empty week is still a week), populated.
 *
 * Assumptions: weeks start Monday (ISO-8601); phones open in Day view, because
 * seven columns at 390px are unreadable.
 */
type ViewMode = 'day' | 'week' | 'month' | 'agenda';

const VIEWS: { id: ViewMode; label: string; key: string }[] = [
  { id: 'day', label: 'Day', key: 'D' },
  { id: 'week', label: 'Week', key: 'W' },
  { id: 'month', label: 'Month', key: 'M' },
  { id: 'agenda', label: 'Agenda', key: 'A' },
];

const ALL_CATEGORIES = ['PERSONAL', 'WORK', 'MEETING', 'APPOINTMENT', 'REMINDER', 'HOLIDAY', 'BIRTHDAY', 'TRAVEL', 'FOCUS_TIME', 'CUSTOM'] as const satisfies readonly EventCategory[];
const ALL_STATUSES = ['CONFIRMED', 'TENTATIVE', 'NEEDS_ACTION', 'CANCELLED'] as const satisfies readonly EventStatus[];

export function CalendarPage() {
  const [anchor, setAnchor] = useState(() => dayjs());
  const [view, setView] = useState<ViewMode>(() => (window.innerWidth < 640 ? 'day' : 'week'));
  const { setAssistantOpen } = useShell();

  const [calendars, setCalendars] = useState<CalendarDTO[]>([]);
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [categories, setCategories] = useState<EventCategory[]>([...ALL_CATEGORIES]);
  const [statuses, setStatuses] = useState<EventStatus[]>([...ALL_STATUSES]);

  const [selected, setSelected] = useState<CalendarEventDTO | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEventDTO | null>(null);
  const [editorDefaults, setEditorDefaults] = useState<{ start: Dayjs; end: Dayjs } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* ───────── Visible range per view ───────── */

  const range = useMemo(() => {
    if (view === 'day') return { start: anchor.startOf('day'), end: anchor.endOf('day') };
    if (view === 'week') {
      const start = startOfIsoWeek(anchor);
      return { start, end: start.add(6, 'day').endOf('day') };
    }
    if (view === 'month') {
      const monthStart = anchor.startOf('month');
      const start = monthStart.subtract((monthStart.day() + 6) % 7, 'day');
      return { start, end: start.add(41, 'day').endOf('day') };
    }
    // Agenda reads forward from the anchor, two weeks at a time.
    return { start: anchor.startOf('day'), end: anchor.add(13, 'day').endOf('day') };
  }, [anchor, view]);

  const rangeKey = `${range.start.toISOString()}|${range.end.toISOString()}`;

  /* ───────── Data ───────── */

  useEffect(() => {
    let cancelled = false;
    calendarService
      .listCalendars()
      .then((next) => {
        if (!cancelled) setCalendars(next);
      })
      .catch(() => {
        /* Calendar list failing should not blank the grid. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    calendarService
      .listEvents(range.start, range.end)
      .then((next) => {
        if (cancelled) return;
        setEvents(next);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setEvents([]);
        setError(e instanceof Error ? e.message : 'Could not load your calendar.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, reloadKey]);

  /** Filtering is view state only — nothing is mutated. */
  const visibleEvents = useMemo(() => {
    const visibleCalendarIds = new Set(calendars.filter((c) => c.isVisible).map((c) => c.id));
    return events.filter(
      (event) =>
        (event.calendarId === null || visibleCalendarIds.has(event.calendarId)) &&
        categories.includes(event.category) &&
        statuses.includes(event.status),
    );
  }, [events, calendars, categories, statuses]);

  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);

  /* ───────── Navigation ───────── */

  const step = view === 'day' ? 'day' : view === 'month' ? 'month' : 'week';
  const go = useCallback((delta: number) => setAnchor((a) => a.add(delta, step)), [step]);
  const goToday = useCallback(() => setAnchor(dayjs()), []);

  const days: TimeGridDay[] = useMemo(() => {
    if (view === 'day') return [{ date: anchor, workingHours: { start: 9, end: 17 } }];
    const start = startOfIsoWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => ({ date: start.add(i, 'day'), workingHours: { start: 9, end: 17 } }));
  }, [anchor, view]);

  const rangeLabel = useMemo(() => {
    if (view === 'day') return anchor.format('dddd, MMM D');
    if (view === 'month') return anchor.format('MMMM YYYY');
    if (view === 'agenda') return `${range.start.format('MMM D')} – ${range.end.format('MMM D, YYYY')}`;
    const s = days[0].date;
    const e = days[days.length - 1].date;
    return s.month() === e.month()
      ? `${s.format('MMM D')} – ${e.format('D, YYYY')}`
      : `${s.format('MMM D')} – ${e.format('MMM D, YYYY')}`;
  }, [anchor, view, days, range]);

  useHotkeys({
    t: goToday,
    j: () => go(1),
    k: () => go(-1),
    arrowright: () => go(1),
    arrowleft: () => go(-1),
    d: () => setView('day'),
    w: () => setView('week'),
    m: () => setView('month'),
    a: () => setView('agenda'),
    n: () => openCreate(range.start.add(9, 'hour')),
  });

  /* ───────── Mutations ───────── */

  const openCreate = useCallback((start: Dayjs, end?: Dayjs) => {
    if (!calendarService.canCreateEvent) {
      setError('Event creation is unavailable until the backend category/color schema mismatch is fixed.');
      return;
    }
    setEditing(null);
    const from = start;
    const to = end ?? from.add(1, 'hour');
    setEditorDefaults({ start: from, end: to });
    setSaveError(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((event: CalendarEventDTO) => {
    setEditing(event);
    setEditorDefaults(null);
    setSaveError(null);
    setDetailOpen(false);
    setEditorOpen(true);
  }, []);

  const handleSave = useCallback(
    async (values: EventEditorValues) => {
      setSaving(true);
      setSaveError(null);
      try {
        const payload = {
          calendarId: values.calendarId,
          title: values.title,
          description: values.description || undefined,
          location: values.location || undefined,
          start: values.start,
          end: values.end,
          allDay: values.allDay,
          category: values.category,
          recurrenceRule: values.recurrenceRule ?? undefined,
        };
        if (editing) {
          const updated = await calendarService.updateEvent(editing.id, {
            ...payload,
            status: values.status,
          });
          setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        } else {
          const created = await calendarService.createEvent(payload);
          setEvents((prev) => [...prev, created]);
        }
        setEditorOpen(false);
        setEditing(null);
      } catch (e: unknown) {
        setSaveError(e instanceof Error ? e.message : 'Could not save the event.');
      } finally {
        setSaving(false);
      }
    },
    [editing],
  );

  /** Optimistic move: apply locally, call the API, revert on failure. */
  const handleMove = useCallback(async (event: CalendarEventDTO, newStart: Dayjs, newEnd: Dayjs) => {
    const previous = event;
    setEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, start: newStart.toISOString(), end: newEnd.toISOString() } : e)),
    );
    try {
      const updated = await calendarService.moveEvent(event.id, newStart.toISOString(), newEnd.toISOString());
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (e) {
      setEvents((prev) => prev.map((x) => (x.id === previous.id ? previous : x)));
      setError(e instanceof Error ? e.message : 'Could not move that event.');
      throw e;
    }
  }, []);

  const handleResize = useCallback(async (event: CalendarEventDTO, newEnd: Dayjs) => {
    const previous = event;
    setEvents((prev) =>
      prev.map((e) => (e.id === event.id ? { ...e, end: newEnd.toISOString() } : e)),
    );
    try {
      const updated = await calendarService.resizeEvent(event.id, newEnd.toISOString());
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (e) {
      setEvents((prev) => prev.map((x) => (x.id === previous.id ? previous : x)));
      setError(e instanceof Error ? e.message : 'Could not resize that event.');
      throw e;
    }
  }, []);

  const handleDelete = useCallback(async (event: CalendarEventDTO) => {
    setBusy(true);
    try {
      await calendarService.deleteEvent(event.id);
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
      setDetailOpen(false);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that event.');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSetStatus = useCallback(async (event: CalendarEventDTO, status: EventStatus) => {
    setBusy(true);
    try {
      const updated = await calendarService.updateEvent(event.id, { status });
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setSelected(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that event.');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDuplicate = useCallback(
    async (event: CalendarEventDTO) => {
      setBusy(true);
      try {
        const created = await calendarService.createEvent({
          calendarId: event.calendarId,
          title: `${event.title} (copy)`,
          description: event.description ?? undefined,
          location: event.location ?? undefined,
          start: dayjs(event.start).add(1, 'day').toISOString(),
          end: dayjs(event.end).add(1, 'day').toISOString(),
          category: event.category,
          recurrenceRule: event.recurrenceRule ?? undefined,
        });
        setEvents((prev) => [...prev, created]);
        setDetailOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not duplicate that event.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  /**
   * Accepting an assistant proposal converts it into the user's own event: it
   * keeps its slot but becomes CONFIRMED, drops the violet treatment (source
   * flips to USER) and stops being marked NEEDS_ACTION. The change of state *is*
   * the confirmation (DESIGN_SYSTEM.md §AI presence, point 4).
   */
  const handleAcceptProposal = useCallback(async (event: CalendarEventDTO) => {
    setBusy(true);
    try {
      const updated = await calendarService.updateEvent(event.id, { status: 'CONFIRMED' });
      const accepted = { ...updated, source: 'USER' as const };
      setEvents((prev) => prev.map((e) => (e.id === accepted.id ? accepted : e)));
      setSelected(accepted);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept that proposal.');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleRejectProposal = useCallback(async (event: CalendarEventDTO) => {
    setBusy(true);
    try {
      await calendarService.deleteEvent(event.id);
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
      setDetailOpen(false);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reject that proposal.');
    } finally {
      setBusy(false);
    }
  }, []);

  const toggleCalendar = useCallback(
    (id: string) => {
      const current = calendars.find((c) => c.id === id);
      if (!current) return;
      const next = calendars.map((c) => (c.id === id ? { ...c, isVisible: !c.isVisible } : c));
      setCalendars(next);
      calendarService.setCalendarVisible(id, !current.isVisible).catch(() => setCalendars(calendars));
    },
    [calendars],
  );

  const toggle = <T,>(list: T[], value: T, set: (next: T[]) => void) => {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const conflictCheck = useCallback(
    (start: Dayjs, end: Dayjs, excludeId?: string) => calendarService.checkConflicts(start, end, excludeId),
    [],
  );

  const isEmpty = !loading && !error && visibleEvents.length === 0;

  /* ───────── Render ───────── */

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <PageHeader title="Calendar" icon={<CalendarDays />}>
        <div className="mr-auto ml-2 hidden min-w-0 items-center gap-1 sm:flex">
          <Button variant="outline" size="sm" onClick={goToday} title="Today (T)">
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => go(-1)} aria-label="Previous" title="Previous (K)">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => go(1)} aria-label="Next" title="Next (J)">
            <ChevronRight />
          </Button>
          <span className="tabular ml-1 truncate text-sm font-medium whitespace-nowrap">{rangeLabel}</span>
        </div>

        <div role="tablist" aria-label="Calendar view" className="flex h-row-sm items-center rounded-md bg-muted p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              title={`${v.label} (${v.key})`}
              className={cn(
                'h-full rounded-sm px-2 text-xs font-medium transition-colors duration-(--dur-instant)',
                view === v.id ? 'bg-card text-foreground shadow-e1' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <Button size="sm" disabled={!calendarService.canCreateEvent} title={!calendarService.canCreateEvent ? 'Event creation is unavailable in the current backend.' : 'New event (N)'} onClick={() => openCreate(dayjs().add(1, 'hour').startOf('hour'))}>
          <Plus />
          <span className="hidden sm:inline">Event</span>
        </Button>
      </PageHeader>

      {/* Mobile date nav + view switcher (the header collapses below sm) */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 lg:hidden">
        <Button variant="ghost" size="icon-sm" onClick={() => go(-1)} aria-label="Previous">
          <ChevronLeft />
        </Button>
        <button
          type="button"
          onClick={goToday}
          className="tabular flex-1 truncate text-center text-sm font-medium"
          title="Jump to today"
        >
          {rangeLabel}
        </button>
        <Button variant="ghost" size="icon-sm" onClick={() => go(1)} aria-label="Next">
          <ChevronRight />
        </Button>
      </div>

      {/* Error: visible, non-destructive, retryable. The grid stays usable. */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{error}</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-destructive hover:bg-destructive/10"
          >
            <RefreshCw />
            Retry
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <CalendarRail
          anchor={anchor}
          onPickDay={(day) => setAnchor(day)}
          calendars={calendars}
          canToggleCalendar={calendarService.canToggleCalendarVisibility}
          onToggleCalendar={toggleCalendar}
          categories={categories}
          onToggleCategory={(c) => toggle(categories, c, setCategories)}
          statuses={statuses}
          onToggleStatus={(s) => toggle(statuses, s, setStatuses)}
        />

        <div className="relative flex min-w-0 flex-1 flex-col">
          {loading ? (
            <CalendarSkeleton view={view} />
          ) : (
            <>
              {(view === 'day' || view === 'week') && (
                <TimeGrid
                  days={days}
                  events={visibleEvents}
                  calendars={calendars}
                  onCreateAt={openCreate}
                  onSelectEvent={(event) => {
                    setSelected(event);
                    setDetailOpen(true);
                  }}
                  onMoveEvent={handleMove}
                  onResizeEvent={handleResize}
                  overlay={
                    isEmpty ? (
                      <EmptyHint
                        onAsk={() => setAssistantOpen(true)}
                        onCreate={() => openCreate(dayjs().add(1, 'hour').startOf('hour'))}
                      />
                    ) : undefined
                  }
                />
              )}

              {view === 'month' && (
                <MonthGrid
                  anchor={anchor}
                  events={visibleEvents}
                  calendars={calendars}
                  onSelectEvent={(event) => {
                    setSelected(event);
                    setDetailOpen(true);
                  }}
                  onSelectDay={(day) => {
                    setAnchor(day);
                    setView('day');
                  }}
                  onCreateAt={(day) => openCreate(day.add(9, 'hour'))}
                />
              )}

              {view === 'agenda' && (
                <AgendaList
                  events={visibleEvents}
                  calendars={calendars}
                  rangeStart={range.start}
                  rangeEnd={range.end}
                  onSelectEvent={(event) => {
                    setSelected(event);
                    setDetailOpen(true);
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      <EventDetailDialog
        event={selected}
        calendars={calendars}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelected(null);
        }}
        onEdit={openEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onSetStatus={handleSetStatus}
        onAcceptProposal={handleAcceptProposal}
        onRejectProposal={handleRejectProposal}
        busy={busy}
        canDuplicate={calendarService.canCreateEvent}
        canAcceptProposal={calendarService.canAcceptProposal}
      />

      <EventEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) {
            setEditing(null);
            setSaveError(null);
          }
        }}
        calendars={calendars}
        event={editing}
        defaultStart={editorDefaults?.start}
        defaultEnd={editorDefaults?.end}
        onSave={handleSave}
        onCheckConflicts={conflictCheck}
        saving={saving}
        saveError={saveError}
        canCreate={calendarService.canCreateEvent}
        categoryWritable={calendarService.canPersistCategory}
      />
    </div>
  );
}

/** Skeleton that mirrors the grid's anatomy so the layout does not jump. */
function CalendarSkeleton({ view }: { view: ViewMode }) {
  if (view === 'month') {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px p-px" aria-busy="true">
        {Array.from({ length: 42 }, (_, i) => (
          <Skeleton key={i} className="h-full min-h-16 rounded-sm" />
        ))}
      </div>
    );
  }
  if (view === 'agenda') {
    return (
      <div className="space-y-2 p-5" aria-busy="true">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <div className="grid h-12 shrink-0 grid-cols-7 gap-px border-b border-border p-1">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-full rounded-sm" />
        ))}
      </div>
      <div className="flex-1 space-y-2 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-sm" />
        ))}
      </div>
    </div>
  );
}

/**
 * Empty state floats *over* the grid instead of replacing it: an empty week is
 * still a week, and the grid is the most useful thing to keep on screen.
 */
function EmptyHint({ onAsk, onCreate }: { onAsk: () => void; onCreate: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-lg border border-border bg-popover/95 py-2 pr-2 pl-3 shadow-e3 backdrop-blur-md">
        <p className="text-xs whitespace-nowrap text-muted-foreground">Nothing scheduled here yet</p>
        <Button size="sm" variant="outline" onClick={onCreate}>
          <Plus />
          Add event
        </Button>
        <button
          type="button"
          onClick={onAsk}
          className="flex h-row-sm shrink-0 items-center gap-1.5 rounded-md bg-ai-soft px-2 text-xs font-medium text-ai-soft-foreground transition-colors hover:bg-ai hover:text-ai-foreground"
        >
          <span aria-hidden>✦</span>
          Plan with Assistant
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { cn } from '@/lib/utils';
import { HOUR_HEIGHT_PX, WORKDAY_END_HOUR, WORKDAY_START_HOUR, calendarColor, eventColor } from '@/lib/design-tokens';
import { expandOccurrences } from '@/lib/rrule';
import { layoutDay, minutesOfDay, snapTo } from '@/lib/datetime';
import type { CalendarDTO, CalendarEventDTO } from '@/services/types';
import { EventCard } from './EventCard';

/**
 * Day/week time grid with drag-to-move and drag-to-resize.
 *
 * Geometry from design tokens: 1 hour = `--hour-height` (48px), gutter =
 * `--gutter-width`. Off-hours are washed with `surface-sunken` so "planable"
 * time reads instantly (DESIGN_SYSTEM.md §Density, §Colour).
 *
 * Interaction model: pointer events (not HTML5 DnD) because the grid needs
 * 15-minute snapping and a live ghost — DnD's drag image cannot do either.
 * A move under THRESHOLD px is treated as a click, so selecting an event never
 * requires a separate hit target.
 *
 * Optimistic: the event moves locally on drop, then the service is called; a
 * failure reverts and surfaces the error (no silent corruption of the plan).
 */
const SNAP_MINUTES = 15;
const DRAG_THRESHOLD_PX = 3;

export interface TimeGridDay {
  date: Dayjs;
  workingHours?: { start: number; end: number };
}

interface DragState {
  eventId: string;
  mode: 'move' | 'resize';
  /** Pointer offset into the event, so it does not jump to the cursor. */
  grabOffsetMin: number;
  startMin: number;
  durationMin: number;
  dayIndex: number;
  moved: boolean;
}

export function TimeGrid({
  days,
  events,
  calendars,
  onCreateAt,
  onSelectEvent,
  onMoveEvent,
  onResizeEvent,
  overlay,
}: {
  days: TimeGridDay[];
  events: CalendarEventDTO[];
  calendars: CalendarDTO[];
  onCreateAt?: (start: Dayjs, end: Dayjs) => void;
  onSelectEvent?: (event: CalendarEventDTO) => void;
  onMoveEvent?: (event: CalendarEventDTO, newStart: Dayjs, newEnd: Dayjs) => Promise<void>;
  onResizeEvent?: (event: CalendarEventDTO, newEnd: Dayjs) => Promise<void>;
  overlay?: ReactNode;
}) {
  const [now, setNow] = useState(() => dayjs());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [ghost, setGhost] = useState<{ dayIndex: number; startMin: number; durationMin: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(dayjs()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Open scrolled to one hour before the working day, like every good calendar.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (WORKDAY_START_HOUR - 1) * HOUR_HEIGHT_PX - 8;
  }, []);

  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);

  /** Events expanded to concrete occurrences and bucketed per day. */
  const byDay = useMemo(() => {
    return days.map((day) => {
      const dayStart = day.date.startOf('day');
      const dayEnd = day.date.endOf('day');
      const occ = events
        .map((event) => {
          const hit = expandOccurrences(event, dayStart, dayEnd).find((o) => o.start.isSame(day.date, 'day'));
          return hit ? { event, start: hit.start, end: hit.end } : null;
        })
        .filter((x): x is { event: CalendarEventDTO; start: Dayjs; end: Dayjs } => x !== null);

      return {
        dayStart,
        allDay: occ.filter((o) => o.event.allDay),
        timed: layoutDay(occ, (o) => o.start, (o) => o.end),
      };
    });
  }, [days, events]);

  const nowMinutes = minutesOfDay(now);
  const cols = `var(--gutter-width) repeat(${days.length}, minmax(0, 1fr))`;

  /* ───────── Drag & drop ───────── */

  const minuteFromPointer = useCallback((clientY: number, dayIndex: number): number => {
    const grid = gridRef.current;
    if (!grid) return 0;
    const column = grid.querySelector<HTMLElement>(`[data-day-index="${dayIndex}"]`);
    if (!column) return 0;
    const rect = column.getBoundingClientRect();
    return ((clientY - rect.top) / HOUR_HEIGHT_PX) * 60;
  }, []);

  const dayIndexFromPointer = useCallback((clientX: number): number | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    for (let i = 0; i < days.length; i += 1) {
      const column = grid.querySelector<HTMLElement>(`[data-day-index="${i}"]`);
      if (!column) continue;
      const rect = column.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) return i;
    }
    return null;
  }, [days.length]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const dayIndex = dayIndexFromPointer(e.clientX) ?? drag.dayIndex;
      const pointerMin = minuteFromPointer(e.clientY, dayIndex);

      if (!drag.moved) {
        const delta = Math.abs(pointerMin - drag.startMin);
        if (delta < DRAG_THRESHOLD_PX) return;
      }

      let startMin: number;
      if (drag.mode === 'move') {
        startMin = snapTo(dayjs().startOf('day').add(pointerMin - drag.grabOffsetMin, 'minute'), SNAP_MINUTES).diff(
          dayjs().startOf('day'),
          'minute',
        );
        startMin = Math.max(0, Math.min(1440 - drag.durationMin, startMin));
      } else {
        const rawEnd = snapTo(dayjs().startOf('day').add(pointerMin, 'minute'), SNAP_MINUTES).diff(dayjs().startOf('day'), 'minute');
        startMin = drag.startMin;
        const duration = Math.max(SNAP_MINUTES, Math.min(1440 - startMin, rawEnd - startMin));
        setDrag((d) => (d ? { ...d, moved: true } : d));
        setGhost({ dayIndex, startMin, durationMin: duration });
        return;
      }

      setDrag((d) => (d ? { ...d, moved: true } : d));
      setGhost({ dayIndex, startMin, durationMin: drag.durationMin });
    };

    const onUp = async () => {
      const current = drag;
      const g = ghost;
      setDrag(null);
      setGhost(null);
      if (!current.moved || !g) return;

      const targetDay = days[g.dayIndex].date.startOf('day');
      const newStart = targetDay.add(g.startMin, 'minute');
      const newEnd = newStart.add(g.durationMin, 'minute');
      const event = events.find((e) => e.id === current.eventId);
      if (!event) return;

      try {
        if (current.mode === 'move') await onMoveEvent?.(event, newStart, newEnd);
        else await onResizeEvent?.(event, newEnd);
      } catch {
        /* The page surfaces the failure; the grid simply keeps server truth. */
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, ghost, days, events, onMoveEvent, onResizeEvent, dayIndexFromPointer, minuteFromPointer]);

  function beginDrag(e: React.PointerEvent, event: CalendarEventDTO, mode: 'move' | 'resize', dayIndex: number) {
    if (!event.calendarId) return;
    const startMin = minutesOfDay(dayjs(event.start));
    const endMin = minutesOfDay(dayjs(event.end));
    const pointerMin = minuteFromPointer(e.clientY, dayIndex);
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      eventId: event.id,
      mode,
      grabOffsetMin: pointerMin - startMin,
      startMin,
      durationMin: Math.max(SNAP_MINUTES, endMin - startMin),
      dayIndex,
      moved: false,
    });
  }

  function handleColumnPointerDown(e: React.PointerEvent, dayIndex: number) {
    if (e.button !== 0) return;
    const startMin = Math.floor(minuteFromPointer(e.clientY, dayIndex) / 30) * 30;
    const day = days[dayIndex].date.startOf('day');
    onCreateAt?.(day.add(startMin, 'minute'), day.add(startMin + 60, 'minute'));
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Day header */}
      <div className="grid shrink-0 border-b border-border" style={{ gridTemplateColumns: cols }}>
        <div className="flex items-end justify-end pr-2 pb-1 text-2xs text-subtle-foreground">
          {dayjs().format('[GMT]Z').replace(':00', '')}
        </div>
        {days.map((d) => {
          const isToday = d.date.isSame(now, 'day');
          const isWeekend = d.date.day() === 0 || d.date.day() === 6;
          return (
            <div
              key={d.date.toISOString()}
              className="flex min-w-0 flex-col items-center gap-0.5 border-l border-border px-1 py-1.5 sm:flex-row sm:items-baseline sm:gap-1.5 sm:px-2 sm:py-2"
            >
              <span
                className={cn(
                  'text-2xs font-medium uppercase tracking-wide',
                  isToday ? 'text-primary' : isWeekend ? 'text-subtle-foreground' : 'text-muted-foreground',
                )}
              >
                <span className="sm:hidden">{d.date.format('dd')}</span>
                <span className="hidden sm:inline">{d.date.format('ddd')}</span>
              </span>
              <span
                className={cn(
                  'tabular grid h-6 min-w-6 place-items-center rounded-md px-1 text-base font-semibold',
                  isToday ? 'bg-primary text-primary-foreground' : isWeekend && 'text-muted-foreground',
                )}
              >
                {d.date.format('D')}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day lane */}
      <div className="grid shrink-0 border-b border-border" style={{ gridTemplateColumns: cols }}>
        <div className="flex items-center justify-end pr-2 text-2xs text-subtle-foreground">all-day</div>
        {byDay.map((bucket, i) => (
          <div key={i} className="min-h-7 space-y-0.5 border-l border-border p-0.5">
            {bucket.allDay.map(({ event }) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelectEvent?.(event)}
                title={event.title}
                className={cn(
                  'flex h-4 w-full items-center gap-1 truncate rounded-xs px-1 text-left text-2xs font-medium transition-colors',
                  event.source === 'AI_GENERATED' && 'proposal border border-dashed',
                )}
                style={
                  event.source === 'AI_GENERATED'
                    ? undefined
                    : (() => {
                        const p = calendarColor(eventColor(calendarById.get(event.calendarId ?? '')?.color, event.category));
                        return { background: p.soft, color: p.ink, borderLeft: `2px solid ${p.solid}` };
                      })()
                }
              >
                <span className="truncate">{event.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Scrollable grid */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div ref={gridRef} className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_HEIGHT_PX }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="tabular absolute right-2 -translate-y-1/2 text-2xs text-subtle-foreground"
                style={{ top: h * HOUR_HEIGHT_PX }}
              >
                {h === 0 ? '' : dayjs().hour(h).minute(0).format('h A')}
              </span>
            ))}
          </div>

          {days.map((d, dayIndex) => {
            const wh = d.workingHours ?? { start: WORKDAY_START_HOUR, end: WORKDAY_END_HOUR };
            const isWeekend = d.date.day() === 0 || d.date.day() === 6;
            const isToday = d.date.isSame(now, 'day');
            const bucket = byDay[dayIndex];

            return (
              <div
                key={d.date.toISOString()}
                data-day-index={dayIndex}
                onPointerDown={(e) => handleColumnPointerDown(e, dayIndex)}
                className="relative border-l border-border"
              >
                {isWeekend ? (
                  <div className="absolute inset-0 bg-surface-sunken" />
                ) : (
                  <>
                    <div className="absolute inset-x-0 top-0 bg-surface-sunken" style={{ height: wh.start * HOUR_HEIGHT_PX }} />
                    <div className="absolute inset-x-0 bottom-0 bg-surface-sunken" style={{ top: wh.end * HOUR_HEIGHT_PX }} />
                  </>
                )}

                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute inset-x-0" style={{ top: h * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}>
                    <div className="absolute inset-x-0 top-0 border-t border-border" />
                    <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/60" />
                  </div>
                ))}

                {/* Drag ghost: where the event will land. */}
                {ghost && ghost.dayIndex === dayIndex && (
                  <div
                    className="proposal pointer-events-none absolute inset-x-0.5 z-20 rounded-sm transition-all duration-(--dur-instant)"
                    style={{ top: (ghost.startMin / 60) * HOUR_HEIGHT_PX, height: (ghost.durationMin / 60) * HOUR_HEIGHT_PX }}
                  />
                )}

                {/* Events */}
                {bucket.timed.map(({ item, start, end, col, cols: clusterCols }) => {
                  const event = item.event;
                  const top = (minutesOfDay(start) / 60) * HOUR_HEIGHT_PX;
                  const height = Math.max(18, ((end.diff(start, 'minute') || 30) / 60) * HOUR_HEIGHT_PX);
                  const active = drag?.eventId === event.id;
                  return (
                    <div
                      key={`${event.id}-${start.valueOf()}`}
                      onPointerDown={(e) => beginDrag(e, event, 'move', dayIndex)}
                      className={cn('absolute z-10 px-px', active && 'z-30 opacity-60')}
                      style={{
                        top,
                        height,
                        left: `${(col / clusterCols) * 100}%`,
                        width: `${(1 / clusterCols) * 100}%`,
                      }}
                    >
                      <EventCard
                        event={event}
                        calendarColorHex={calendarById.get(event.calendarId ?? '')?.color}
                        className="h-full cursor-grab active:cursor-grabbing"
                        onClick={onSelectEvent}
                      />
                      {/* Resize handle */}
                      <button
                        type="button"
                        aria-label={`Resize ${event.title}`}
                        onPointerDown={(e) => beginDrag(e, event, 'resize', dayIndex)}
                        className="absolute inset-x-1 bottom-0 h-1.5 cursor-ns-resize rounded-full opacity-0 transition-opacity duration-(--dur-instant) hover:opacity-100 focus-visible:opacity-100"
                        style={{ background: 'currentColor' }}
                      />
                    </div>
                  );
                })}

                {isToday && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT_PX }}
                    aria-label={`Now, ${now.format('h:mm A')}`}
                  >
                    <span className="-ml-1 size-2 rounded-full bg-now" />
                    <span className="h-px flex-1 bg-now" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {overlay}
    </div>
  );
}

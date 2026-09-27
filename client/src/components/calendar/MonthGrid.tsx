import { useMemo } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { cn } from '@/lib/utils';
import { expandOccurrences } from '@/lib/rrule';
import { calendarColor, eventColor } from '@/lib/design-tokens';
import type { CalendarDTO, CalendarEventDTO } from '@/services/types';

/**
 * Month view: a 6×7 grid (Monday-first) where each cell lists up to `MAX_CHIPS`
 * events and a "+N more" that switches to that day.
 *
 * Colour = which calendar; status stays shape-encoded (see EventCard). The
 * current month is at full strength; leading/trailing days are muted so the
 * month boundary is legible without a heavier border.
 */
const MAX_CHIPS = 3;

export function MonthGrid({
  anchor,
  events,
  calendars,
  onSelectEvent,
  onSelectDay,
  onCreateAt,
}: {
  anchor: Dayjs;
  events: CalendarEventDTO[];
  calendars: CalendarDTO[];
  onSelectEvent?: (event: CalendarEventDTO) => void;
  onSelectDay?: (day: Dayjs) => void;
  onCreateAt?: (start: Dayjs) => void;
}) {
  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const today = dayjs().startOf('day');

  const weeks = useMemo(() => {
    const monthStart = anchor.startOf('month');
    const gridStart = monthStart.subtract((monthStart.day() + 6) % 7, 'day');
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => gridStart.add(w * 7 + d, 'day')),
    );
  }, [anchor]);

  const eventsFor = useMemo(() => {
    return (day: Dayjs): CalendarEventDTO[] => {
      const dayStart = day.startOf('day');
      const dayEnd = day.endOf('day');
      const out: CalendarEventDTO[] = [];
      for (const event of events) {
        const occ = expandOccurrences(event, dayStart, dayEnd).find((o) => o.start.isSame(dayStart, 'day'));
        if (occ) out.push({ ...event, start: occ.start.toISOString(), end: occ.end.toISOString() });
      }
      // All-day first, then by start time — the order people scan a month cell.
      return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
    };
  }, [events]);

  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, i) => gridStart(anchor).add(i, 'day').format('ddd')),
    [anchor],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-border">
        {weekdayLabels.map((label) => (
          <div key={label} className="px-2 py-1.5 text-2xs font-medium tracking-wide text-subtle-foreground uppercase">
            {label}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {weeks.flat().map((day) => {
          const inMonth = day.month() === anchor.month();
          const isToday = day.isSame(today, 'day');
          const isWeekend = day.day() === 0 || day.day() === 6;
          const dayEvents = eventsFor(day);
          const extra = dayEvents.length - MAX_CHIPS;

          return (
            <div
              key={day.toISOString()}
              role="gridcell"
              aria-label={day.format('dddd, MMMM D')}
              className={cn(
                'group/cell relative flex min-h-0 min-w-0 flex-col gap-0.5 border-r border-b border-border p-1 last:border-r-0',
                !inMonth && 'bg-surface-sunken/60',
                isWeekend && inMonth && 'bg-surface-sunken/40',
              )}
            >
              <div className="flex shrink-0 items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelectDay?.(day)}
                  className={cn(
                    'tabular grid h-5 min-w-5 place-items-center rounded-md px-1 text-2xs font-semibold transition-colors',
                    isToday
                      ? 'bg-primary text-primary-foreground'
                      : inMonth
                        ? 'text-foreground hover:bg-accent'
                        : 'text-subtle-foreground hover:bg-accent',
                  )}
                >
                  {day.format('D')}
                </button>
                <button
                  type="button"
                  onClick={() => onCreateAt?.(day)}
                  aria-label={`Add event on ${day.format('MMMM D')}`}
                  className="grid size-5 place-items-center rounded-md text-subtle-foreground opacity-0 transition-opacity duration-(--dur-instant) group-hover/cell:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                >
                  +
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-px overflow-hidden">
                {dayEvents.slice(0, MAX_CHIPS).map((event) => {
                  const isAi = event.source === 'AI_GENERATED';
                  const palette = calendarColor(eventColor(calendarById.get(event.calendarId ?? '')?.color, event.category));
                  return (
                    <button
                      key={`${event.id}-${event.start}`}
                      type="button"
                      onClick={() => onSelectEvent?.(event)}
                      title={`${event.title}${event.allDay ? '' : ` · ${dayjs(event.start).format('h:mm A')}`}`}
                      className={cn(
                        'flex h-4 w-full shrink-0 items-center gap-1 truncate rounded-xs px-1 text-left text-2xs font-medium transition-colors hover:brightness-95',
                        event.status === 'CANCELLED' && 'opacity-50 line-through',
                        event.status === 'TENTATIVE' && 'border border-dashed border-current/40',
                        isAi && 'proposal border border-dashed',
                      )}
                      style={isAi ? undefined : { background: palette.soft, color: palette.ink }}
                    >
                      {!event.allDay && (
                        <span className="tabular shrink-0 opacity-70">{dayjs(event.start).format('H:mm')}</span>
                      )}
                      <span className="truncate">{event.title}</span>
                    </button>
                  );
                })}

                {extra > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectDay?.(day)}
                    className="shrink-0 rounded-xs px-1 text-left text-2xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    +{extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Monday of the week containing `d` (month cells are Monday-first, like the week grid). */
function gridStart(d: Dayjs): Dayjs {
  const monthStart = d.startOf('month');
  return monthStart.subtract((monthStart.day() + 6) % 7, 'day');
}

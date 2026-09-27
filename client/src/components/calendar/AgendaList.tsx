import { useEffect, useMemo, useRef } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarRange, Clock, MapPin, Repeat, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calendarColor, eventColor } from '@/lib/design-tokens';
import { expandOccurrences } from '@/lib/rrule';
import { formatRange } from '@/lib/datetime';
import type { CalendarDTO, CalendarEventDTO } from '@/services/types';

/**
 * Agenda: a flat, chronological list grouped by day — the view you use when you
 * want to *read* the plan rather than see it. Occurrences are expanded, so a
 * recurring standup appears once per day.
 *
 * Days with nothing planned are omitted (that is the point of an agenda), and
 * today is marked so the list has an anchor.
 */
export function AgendaList({
  events,
  calendars,
  rangeStart,
  rangeEnd,
  onSelectEvent,
}: {
  events: CalendarEventDTO[];
  calendars: CalendarDTO[];
  rangeStart: Dayjs;
  rangeEnd: Dayjs;
  onSelectEvent?: (event: CalendarEventDTO) => void;
}) {
  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const now = dayjs();

  const occurrences = useMemo(() => {
    const out: { event: CalendarEventDTO; start: Dayjs; end: Dayjs }[] = [];
    for (const event of events) {
      for (const occ of expandOccurrences(event, rangeStart, rangeEnd)) {
        out.push({ event, start: occ.start, end: occ.end });
      }
    }
    return out.sort((a, b) => a.start.valueOf() - b.start.valueOf());
  }, [events, rangeStart, rangeEnd]);

  const groups = useMemo(() => {
    const map = new Map<string, { day: Dayjs; items: typeof occurrences }>();
    for (const occ of occurrences) {
      const key = occ.start.format('YYYY-MM-DD');
      if (!map.has(key)) map.set(key, { day: occ.start.startOf('day'), items: [] });
      map.get(key)!.items.push(occ);
    }
    return [...map.values()];
  }, [occurrences]);

  const todayRef = useRef<HTMLDivElement>(null);

  // Land on today when the agenda opens in an otherwise long list.
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  if (groups.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8 text-center">
        <div className="max-w-xs">
          <div className="mx-auto mb-3 grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-e1">
            <CalendarRange className="size-4" />
          </div>
          <h2 className="text-sm font-medium">Nothing scheduled</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            No events between {rangeStart.format('MMM D')} and {rangeEnd.format('MMM D, YYYY')}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-5">
        {groups.map((group) => {
          const isToday = group.day.isSame(now, 'day');
          return (
            <section key={group.day.toISOString()} ref={isToday ? todayRef : undefined} className="mb-6 last:mb-2">
              <header
                className={cn(
                  'sticky top-0 z-10 -mx-1 mb-2 flex items-baseline gap-2 bg-background/90 px-1 py-1 backdrop-blur-sm',
                )}
              >
                <h2 className={cn('text-sm font-semibold', isToday && 'text-primary')}>
                  {group.day.format('dddd')}
                </h2>
                <span className="tabular text-2xs text-muted-foreground">{group.day.format('MMM D')}</span>
                {isToday && (
                  <span className="rounded-xs bg-primary/10 px-1.5 py-px text-2xs font-medium text-primary">Today</span>
                )}
              </header>

              <ul className="space-y-1">
                {group.items.map(({ event, start, end }) => {
                  const isAi = event.source === 'AI_GENERATED';
                  const palette = calendarColor(eventColor(calendarById.get(event.calendarId ?? '')?.color, event.category));
                  const calendar = calendarById.get(event.calendarId ?? '');
                  return (
                    <li key={`${event.id}-${start.toISOString()}`}>
                      <button
                        type="button"
                        onClick={() => onSelectEvent?.(event)}
                        className={cn(
                          'group/row flex w-full items-start gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors duration-(--dur-instant) hover:border-border-strong hover:bg-accent/40',
                          event.status === 'CANCELLED' && 'opacity-60',
                          event.status === 'TENTATIVE' && 'border-dashed',
                          isAi && 'proposal',
                        )}
                      >
                        <span
                          className="mt-0.5 w-1 shrink-0 self-stretch rounded-full"
                          style={{ background: isAi ? 'var(--ai)' : palette.solid }}
                          aria-hidden
                        />
                        <span className="w-16 shrink-0 pt-px">
                          <span className="tabular block text-2xs font-medium">
                            {event.allDay ? 'All day' : dayjs(start).format('h:mm A')}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-sm font-medium', event.status === 'CANCELLED' && 'line-through')}>
                            {event.title}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs text-muted-foreground">
                            {calendar && (
                              <span className="inline-flex items-center gap-1">
                                <span className="size-1.5 rounded-full" style={{ background: palette.solid }} aria-hidden />
                                {calendar.name}
                              </span>
                            )}
                            {!event.allDay && (
                              <span className="tabular inline-flex items-center gap-1">
                                <Clock className="size-2.5" />
                                {formatRange(start.toISOString(), end.toISOString())}
                              </span>
                            )}
                            {event.location && (
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <MapPin className="size-2.5 shrink-0" />
                                <span className="truncate">{event.location}</span>
                              </span>
                            )}
                            {event.participants.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Users className="size-2.5" />
                                {event.participants.length}
                              </span>
                            )}
                            {event.recurrenceRule && (
                              <span className="inline-flex items-center gap-1">
                                <Repeat className="size-2.5" />
                                Repeats
                              </span>
                            )}
                          </span>
                        </span>
                        {event.status !== 'CONFIRMED' && (
                          <span
                            className={cn(
                              'shrink-0 rounded-xs px-1.5 py-px text-2xs font-medium',
                              event.status === 'NEEDS_ACTION' ? 'bg-warning-soft text-level-high' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {event.status === 'NEEDS_ACTION' ? 'Needs action' : event.status === 'TENTATIVE' ? 'Tentative' : 'Cancelled'}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

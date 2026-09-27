import { useEffect, useRef, useState, type ReactNode } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { cn } from '@/lib/utils';
import { HOUR_HEIGHT_PX, WORKDAY_END_HOUR, WORKDAY_START_HOUR } from '@/lib/design-tokens';

/**
 * Time grid for day/week views. Geometry comes from design tokens
 * (--hour-height, --gutter-width). Mirrors backend WeekView/DayView
 * (src/calendar/domain/calendar-event.ts): `days[]` each with
 * `workingHours: { start, end }` and an all-day lane.
 *
 * Stage 1: renders structure only. Stage 2b adds event layout, drag/drop.
 */
export interface WeekGridDay {
  date: Dayjs;
  workingHours?: { start: number; end: number };
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = window.setInterval(() => setNow(dayjs()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function hourLabel(h: number) {
  if (h === 0) return '';
  return dayjs().hour(h).minute(0).format('h A');
}

export function WeekGrid({
  days,
  allDayContent,
  overlay,
}: {
  days: WeekGridDay[];
  allDayContent?: (day: WeekGridDay) => ReactNode;
  overlay?: ReactNode;
}) {
  const now = useNow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cols = `var(--gutter-width) repeat(${days.length}, minmax(0, 1fr))`;

  // Open scrolled to one hour before the working day, like every good calendar.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (WORKDAY_START_HOUR - 1) * HOUR_HEIGHT_PX - 8;
  }, []);

  const nowMinutes = now.hour() * 60 + now.minute();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Day header row */}
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
        {days.map((d) => (
          <div key={d.date.toISOString()} className="min-h-7 border-l border-border p-0.5">
            {allDayContent?.(d)}
          </div>
        ))}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_HEIGHT_PX }}>
          {/* Gutter */}
          <div className="relative">
            {HOURS.map((h) => (
              <span
                key={h}
                className="tabular absolute right-2 -translate-y-1/2 text-2xs text-subtle-foreground"
                style={{ top: h * HOUR_HEIGHT_PX }}
              >
                {hourLabel(h)}
              </span>
            ))}
          </div>

          {days.map((d) => {
            const wh = d.workingHours ?? { start: WORKDAY_START_HOUR, end: WORKDAY_END_HOUR };
            const isWeekend = d.date.day() === 0 || d.date.day() === 6;
            const isToday = d.date.isSame(now, 'day');
            return (
              <div key={d.date.toISOString()} className="relative border-l border-border">
                {/* Off-hours wash: sunken surface outside working hours (whole day on weekends). */}
                {isWeekend ? (
                  <div className="absolute inset-0 bg-surface-sunken" />
                ) : (
                  <>
                    <div className="absolute inset-x-0 top-0 bg-surface-sunken" style={{ height: wh.start * HOUR_HEIGHT_PX }} />
                    <div
                      className="absolute inset-x-0 bottom-0 bg-surface-sunken"
                      style={{ top: wh.end * HOUR_HEIGHT_PX }}
                    />
                  </>
                )}
                {/* Hour + half-hour rules */}
                {HOURS.map((h) => (
                  <div key={h} className="absolute inset-x-0" style={{ top: h * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}>
                    <div className="absolute inset-x-0 top-0 border-t border-border" />
                    <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/60" />
                  </div>
                ))}
                {/* Now indicator */}
                {isToday && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
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

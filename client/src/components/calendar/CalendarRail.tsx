import { useMemo } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calendarColor, calendarSwatch, EVENT_CATEGORY_LABEL, EVENT_STATUS_LABEL } from '@/lib/design-tokens';
import type { CalendarDTO, EventCategory, EventStatus } from '@/services/types';

/**
 * Calendar rail: mini-month navigator, calendar visibility, and the two filters
 * that actually matter when a week looks crowded — category and status.
 *
 * Visibility and filters are *view* state (they never mutate data), so a user can
 * hide a noisy calendar without unsubscribing from it.
 */
export function CalendarRail({
  anchor,
  onPickDay,
  calendars,
  onToggleCalendar,
  categories,
  onToggleCategory,
  statuses,
  onToggleStatus,
}: {
  anchor: Dayjs;
  onPickDay: (day: Dayjs) => void;
  calendars: CalendarDTO[];
  onToggleCalendar: (id: string) => void;
  categories: EventCategory[];
  onToggleCategory: (category: EventCategory) => void;
  statuses: EventStatus[];
  onToggleStatus: (status: EventStatus) => void;
}) {
  const activeCategories = useMemo(() => new Set(categories), [categories]);
  const activeStatuses = useMemo(() => new Set(statuses), [statuses]);
  const allCategories = Object.keys(EVENT_CATEGORY_LABEL) as EventCategory[];
  const allStatuses = Object.keys(EVENT_STATUS_LABEL) as EventStatus[];

  return (
    <aside
      aria-label="Calendars and filters"
      className="hidden w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface-sunken/50 p-3 lg:flex"
    >
      <MiniMonth anchor={anchor} onPickDay={onPickDay} />

      <section>
        <h3 className="mb-1.5 px-1 text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Calendars</h3>
        <ul className="space-y-px">
          {calendars.map((calendar) => {
            const hue = calendarSwatch(calendar.color);
            const palette = calendarColor(hue);
            return (
              <li key={calendar.id}>
                <button
                  type="button"
                  onClick={() => onToggleCalendar(calendar.id)}
                  aria-pressed={calendar.isVisible}
                  className="flex h-row-sm w-full items-center gap-2 rounded-md px-1.5 text-sm transition-colors duration-(--dur-instant) hover:bg-accent"
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: palette.solid }} aria-hidden />
                  <span className={cn('min-w-0 flex-1 truncate text-left', !calendar.isVisible && 'text-subtle-foreground')}>
                    {calendar.name}
                  </span>
                  {calendar.isPrimary && (
                    <span className="shrink-0 text-2xs text-subtle-foreground">primary</span>
                  )}
                  <span className="shrink-0 text-subtle-foreground" aria-hidden>
                    {calendar.isVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="mb-1.5 px-1 text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Type</h3>
        <div className="flex flex-wrap gap-1 px-1">
          {allCategories.map((category) => {
            const on = activeCategories.has(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => onToggleCategory(category)}
                aria-pressed={on}
                className={cn(
                  'rounded-xs border px-1.5 py-0.5 text-2xs font-medium transition-colors duration-(--dur-instant)',
                  on
                    ? 'border-border-strong bg-card text-foreground shadow-e1'
                    : 'border-transparent bg-muted text-subtle-foreground hover:text-foreground',
                )}
              >
                {EVENT_CATEGORY_LABEL[category]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 px-1 text-2xs text-subtle-foreground">
          {categories.length === allCategories.length ? 'Showing every type' : `${categories.length} of ${allCategories.length} types`}
        </p>
      </section>

      <section>
        <h3 className="mb-1.5 px-1 text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Status</h3>
        <div className="flex flex-wrap gap-1 px-1">
          {allStatuses.map((status) => {
            const on = activeStatuses.has(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => onToggleStatus(status)}
                aria-pressed={on}
                className={cn(
                  'rounded-xs border px-1.5 py-0.5 text-2xs font-medium transition-colors duration-(--dur-instant)',
                  on
                    ? 'border-border-strong bg-card text-foreground shadow-e1'
                    : 'border-transparent bg-muted text-subtle-foreground hover:text-foreground',
                )}
              >
                {EVENT_STATUS_LABEL[status]}
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

/** Compact month picker. Day is the only granularity the rail needs. */
function MiniMonth({ anchor, onPickDay }: { anchor: Dayjs; onPickDay: (day: Dayjs) => void }) {
  const cursor = anchor.startOf('month');
  const today = dayjs().startOf('day');

  const gridStart = cursor.subtract((cursor.day() + 6) % 7, 'day');
  const days = Array.from({ length: 42 }, (_, i) => gridStart.add(i, 'day'));

  return (
    <section>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-medium">{cursor.format('MMMM YYYY')}</span>
        <span className="text-2xs text-subtle-foreground">navigator</span>
      </div>
      <div className="grid grid-cols-7 gap-px px-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="grid h-5 place-items-center text-2xs font-medium text-subtle-foreground">
            {d}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = day.month() === cursor.month();
          const isToday = day.isSame(today, 'day');
          const isSelected = day.isSame(anchor, 'day');
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onPickDay(day)}
              aria-label={day.format('dddd, MMMM D')}
              aria-current={isToday ? 'date' : undefined}
              className={cn(
                'tabular grid h-6 place-items-center rounded-md text-2xs font-medium transition-colors duration-(--dur-instant)',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : isToday
                    ? 'bg-primary/10 text-primary'
                    : inMonth
                      ? 'text-foreground hover:bg-accent'
                      : 'text-subtle-foreground/70 hover:bg-accent',
              )}
            >
              {day.format('D')}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between px-1">
        <span className="inline-flex items-center gap-0.5 text-2xs text-subtle-foreground">
          <ChevronLeft className="size-3" /> prev week
        </span>
        <span className="inline-flex items-center gap-0.5 text-2xs text-subtle-foreground">
          next week <ChevronRight className="size-3" />
        </span>
      </div>
    </section>
  );
}

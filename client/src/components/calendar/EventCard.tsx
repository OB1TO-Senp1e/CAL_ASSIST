import type { CSSProperties } from 'react';
import { Bell, Lock, MapPin, Repeat, Sparkles, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EVENT_STATUS_CLASS, calendarColor, eventColor } from '@/lib/design-tokens';
import type { CalendarEventDTO } from '@/services/types';
import { formatDuration, formatRange } from '@/lib/datetime';

/**
 * An event on the grid. Colour = which calendar (DESIGN_SYSTEM.md §Colour);
 * status is shown by SHAPE (dashed / outline / strikethrough), never by a new
 * hue, so colour stays free to mean "which calendar".
 *
 * AI-authored events (`source: 'AI_GENERATED'`) wear the `.proposal` treatment —
 * dashed violet — because violet is reserved for the assistant and the user must
 * be able to tell their own data from a suggestion at a glance.
 */
export interface EventCardProps {
  event: CalendarEventDTO;
  /** Owner calendar's hex colour, if known. */
  calendarColorHex?: string | null;
  /** Compact = month cell chip (one line, no time). */
  variant?: 'block' | 'chip';
  onClick?: (event: CalendarEventDTO) => void;
  className?: string;
  style?: CSSProperties;
}

export function EventCard({ event, calendarColorHex, variant = 'block', onClick, className, style }: EventCardProps) {
  const hue = eventColor(calendarColorHex, event.category);
  const palette = calendarColor(hue);
  const statusClass = EVENT_STATUS_CLASS[event.status];
  const isAi = event.source === 'AI_GENERATED';
  const isChip = variant === 'chip';

  const meta = [
    event.recurrenceRule ? { icon: Repeat, label: 'Repeats' } : null,
    event.participants.length > 0 ? { icon: Users, label: `${event.participants.length}` } : null,
    event.location ? { icon: MapPin, label: event.location } : null,
    event.reminders.length > 0 ? { icon: Bell, label: `${event.reminders.length}` } : null,
    event.visibility === 'PRIVATE' ? { icon: Lock, label: 'Private' } : null,
  ].filter(Boolean) as { icon: typeof Bell; label: string }[];

  const interactive = Boolean(onClick);

  return (
    <button
      type="button"
      style={{ ...style, ...(isAi ? {} : { background: palette.soft, color: palette.ink, borderColor: palette.solid }) }}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onClick?.(event);
            }
          : undefined
      }
      title={
        isChip
          ? event.title
          : `${event.title} · ${formatRange(event.start, event.end)}${event.location ? ` · ${event.location}` : ''}`
      }
      aria-label={
        isChip
          ? event.title
          : `${event.title}, ${formatRange(event.start, event.end)}, ${event.status.toLowerCase().replace('_', ' ')}`
      }
      className={cn(
        'group/event relative w-full overflow-hidden text-left transition-colors duration-(--dur-instant)',
        isChip ? 'flex h-4 items-center gap-1 rounded-xs px-1' : 'rounded-sm border-l-2 px-1.5 py-1',
        isAi && 'proposal',
        isAi && 'border border-dashed',
        statusClass,
        interactive && !isChip && 'hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        interactive && isChip && 'hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'select-none',
        className,
      )}
    >
      {isChip ? (
        <>
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: isAi ? 'var(--ai)' : palette.solid }} aria-hidden />
          <span className="truncate text-2xs leading-none font-medium">{event.title}</span>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1">
            {isAi && <Sparkles className="size-2.5 shrink-0 opacity-80" aria-label="Suggested by the assistant" />}
            <span className="truncate text-2xs leading-tight font-medium">{event.title}</span>
          </span>
          <span className="tabular mt-px flex items-center gap-1 truncate text-2xs leading-tight opacity-75">
            {!event.allDay && formatRange(event.start, event.end)}
            {event.allDay && 'All day'}
            {meta.length > 0 && <span className="opacity-70">· {meta[0].label}</span>}
          </span>
        </>
      )}
    </button>
  );
}

/** All-day lane chip — one line, no time (the lane is already "all day"). */
export function AllDayChip({
  event,
  calendarColorHex,
  onClick,
}: {
  event: CalendarEventDTO;
  calendarColorHex?: string | null;
  onClick?: (event: CalendarEventDTO) => void;
}) {
  return <EventCard event={event} calendarColorHex={calendarColorHex} variant="chip" onClick={onClick} />;
}

/**
 * Hover card body — shared by the grid tooltip and the month cell so an event
 * reads the same everywhere. Duration is included because it is the number
 * people actually reason about when planning.
 */
export function EventSummary({ event }: { event: CalendarEventDTO }) {
  return (
    <div className="space-y-1">
      <p className="text-2xs font-medium">{event.title}</p>
      <p className="tabular text-2xs text-muted-foreground">
        {formatRange(event.start, event.end)} · {formatDuration(event.start, event.end)}
      </p>
    </div>
  );
}

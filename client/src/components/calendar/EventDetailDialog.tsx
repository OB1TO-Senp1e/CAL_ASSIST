import { useMemo, type ReactElement, type ReactNode } from 'react';
import dayjs from 'dayjs';
import {
  Bell,
  Calendar as CalendarIcon,
  Check,
  Clock,
  Copy,
  Lock,
  MapPin,
  Pencil,
  Repeat,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EVENT_CATEGORY_LABEL, EVENT_STATUS_LABEL, calendarColor, eventColor } from '@/lib/design-tokens';
import { formatDuration, formatRange } from '@/lib/datetime';
import { parseRRule } from '@/lib/rrule';
import type { CalendarDTO, CalendarEventDTO } from '@/services/types';

/**
 * Event detail — a dialog, not a route.
 *
 * The calendar stays visible behind it, because the point of opening an event is
 * usually to reason about it *in the context of the week*. Editing is a separate
 * mode so a read never risks a stray write.
 *
 * AI-authored events (`source: 'AI_GENERATED'`) get explicit Accept / Reject
 * instead of Save / Delete: the assistant proposed them, so the user is
 * approving or discarding a proposal, not editing their own data.
 */
export function EventDetailDialog({
  event,
  calendars,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onDuplicate,
  onSetStatus,
  onAcceptProposal,
  onRejectProposal,
  busy,
  canDuplicate = true,
  canAcceptProposal = true,
}: {
  event: CalendarEventDTO | null;
  calendars: CalendarDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (event: CalendarEventDTO) => void;
  onDelete?: (event: CalendarEventDTO) => void;
  onDuplicate?: (event: CalendarEventDTO) => void;
  onSetStatus?: (event: CalendarEventDTO, status: CalendarEventDTO['status']) => void;
  onAcceptProposal?: (event: CalendarEventDTO) => void;
  onRejectProposal?: (event: CalendarEventDTO) => void;
  busy?: boolean;
  canDuplicate?: boolean;
  canAcceptProposal?: boolean;
}) {
  const calendar = useMemo(
    () => calendars.find((c) => c.id === event?.calendarId) ?? null,
    [calendars, event?.calendarId],
  );

  if (!event) return null;

  const isAi = event.source === 'AI_GENERATED';
  const palette = calendarColor(eventColor(calendar?.color, event.category));
  const rule = parseRRule(event.recurrenceRule);
  const accepted = event.participants.filter((p) => p.status === 'ACCEPTED');
  const pending = event.participants.filter((p) => p.status === 'NEEDS_ACTION' || p.status === 'TENTATIVE');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-2.5 pr-6">
            <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: isAi ? 'var(--ai)' : palette.solid }} aria-hidden />
            <div className="min-w-0 flex-1">
              <DialogTitle className={cn('text-base', event.status === 'CANCELLED' && 'line-through opacity-70')}>
                {event.title}
              </DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {isAi && (
                  <Badge variant="ai">
                    <Sparkles className="size-2.5" />
                    Assistant proposal
                  </Badge>
                )}
                {event.status !== 'CONFIRMED' && (
                  <Badge variant={event.status === 'NEEDS_ACTION' ? 'warning' : 'neutral'}>
                    {EVENT_STATUS_LABEL[event.status]}
                  </Badge>
                )}
                <Badge variant="outline">{EVENT_CATEGORY_LABEL[event.category]}</Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <dl className="space-y-2.5 text-sm">
          <Row icon={<Clock />} label="When">
            <span className="tabular">{dayjs(event.start).format('ddd, MMM D · h:mm A')}</span>
            {!event.allDay && (
              <span className="tabular block text-2xs text-muted-foreground">
                {formatRange(event.start, event.end)} · {formatDuration(event.start, event.end)}
              </span>
            )}
            {event.timeZone && <span className="block text-2xs text-subtle-foreground">{event.timeZone}</span>}
          </Row>

          {calendar && (
            <Row icon={<CalendarIcon />} label="Calendar">
              {calendar.name}
              {calendar.provider !== 'LOCAL' && (
                <span className="ml-1 text-2xs text-subtle-foreground">({calendar.provider.toLowerCase()})</span>
              )}
            </Row>
          )}

          {event.location && (
            <Row icon={<MapPin />} label="Location">
              {event.location}
            </Row>
          )}

          {rule && (
            <Row icon={<Repeat />} label="Repeats">
              {`${rule.freq.charAt(0)}${rule.freq.slice(1).toLowerCase()}`}
              {rule.interval > 1 && ` every ${rule.interval}`}
              {rule.byDay?.length ? ` on ${rule.byDay.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}` : ''}
              {rule.until && ` until ${dayjs(rule.until).format('MMM D, YYYY')}`}
              {rule.count && ` · ${rule.count} times`}
            </Row>
          )}

          {event.participants.length > 0 && (
            <Row icon={<UserRound />} label={`Guests (${event.participants.length})`}>
              <ul className="space-y-0.5">
                {event.participants.map((p) => (
                  <li key={p.email} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        p.status === 'ACCEPTED'
                          ? 'bg-success'
                          : p.status === 'DECLINED'
                            ? 'bg-destructive'
                            : 'bg-level-medium',
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{p.displayName || p.email}</span>
                    <span className="text-2xs text-subtle-foreground">{p.status.toLowerCase().replace('_', ' ')}</span>
                  </li>
                ))}
              </ul>
              {pending.length > 0 && (
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  {pending.length} still to respond · {accepted.length} accepted
                </span>
              )}
            </Row>
          )}

          {event.reminders.length > 0 && (
            <Row icon={<Bell />} label="Reminders">
              {event.reminders
                .map((r) => `${r.minutesBefore} min before (${r.method.toLowerCase()})`)
                .join(' · ')}
            </Row>
          )}

          {event.visibility === 'PRIVATE' && (
            <Row icon={<Lock />} label="Visibility">
              Private
            </Row>
          )}

          {event.description && (
            <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap">
              {event.description}
            </div>
          )}
        </dl>

        <div className="flex flex-wrap items-center gap-1.5">
          {isAi ? (
            <>
              <Button size="sm" disabled={busy || !canAcceptProposal} title={!canAcceptProposal ? 'The backend cannot persist an AI proposal as a user event yet.' : undefined} onClick={() => onAcceptProposal?.(event)}>
                <Check />
                Accept
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onRejectProposal?.(event)}>
                <X />
                Reject
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto" disabled={busy} onClick={() => onEdit?.(event)}>
                <Pencil />
                Adjust
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onEdit?.(event)}>
                <Pencil />
                Edit
              </Button>
              {event.status !== 'CONFIRMED' && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onSetStatus?.(event, 'CONFIRMED')}>
                  <Check />
                  Confirm
                </Button>
              )}
              <Button variant="ghost" size="sm" disabled={busy || !canDuplicate} title={!canDuplicate ? 'Event creation is unavailable until the backend schema is corrected.' : undefined} onClick={() => onDuplicate?.(event)}>
                <Copy />
                Duplicate
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto"
                disabled={busy}
                onClick={() => onDelete?.(event)}
              >
                <Trash2 />
                Delete
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon, label, children }: { icon: ReactElement; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <dt className="flex w-20 shrink-0 items-start gap-1.5 pt-px text-2xs font-medium text-subtle-foreground">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

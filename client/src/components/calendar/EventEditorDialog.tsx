import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox, Field, Select, Textarea } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EVENT_CATEGORY_LABEL } from '@/lib/design-tokens';
import { formatRange } from '@/lib/datetime';
import type { CalendarDTO, CalendarEventDTO, ConflictDTO, EventCategory, EventStatus } from '@/services/types';

/**
 * Create / edit an event.
 *
 * `datetime-local` inputs are used deliberately: they are the platform control,
 * they respect the OS locale, and they cannot be got subtly wrong the way a
 * bespoke picker can. Values are converted to ISO at the boundary.
 *
 * Conflict check runs on save and, when it finds overlaps, the user is told
 * exactly what collides *before* the write — the backend never silently
 * double-books, and neither does the UI.
 */
export interface EventEditorValues {
  title: string;
  calendarId: string | null;
  start: string;
  end: string;
  allDay: boolean;
  category: EventCategory;
  location: string;
  description: string;
  recurrenceRule: string | null;
  status: EventStatus;
}

const RECURRENCE_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'RRULE:FREQ=DAILY;INTERVAL=1', label: 'Every day' },
  { value: 'RRULE:FREQ=WEEKLY;INTERVAL=1', label: 'Every week' },
  { value: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR', label: 'Every weekday' },
  { value: 'RRULE:FREQ=MONTHLY;INTERVAL=1', label: 'Every month' },
  { value: 'RRULE:FREQ=YEARLY;INTERVAL=1', label: 'Every year' },
];

function toLocalInput(iso: string): string {
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DDTHH:mm') : '';
}

function fromLocalInput(value: string): string {
  const d = dayjs(value);
  return d.isValid() ? d.toISOString() : new Date().toISOString();
}

export function EventEditorDialog({
  open,
  onOpenChange,
  calendars,
  event,
  defaultStart,
  defaultEnd,
  onSave,
  onCheckConflicts,
  saving,
  saveError,
  canCreate = true,
  categoryWritable = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendars: CalendarDTO[];
  event: CalendarEventDTO | null;
  defaultStart?: dayjs.Dayjs;
  defaultEnd?: dayjs.Dayjs;
  onSave: (values: EventEditorValues) => Promise<void>;
  onCheckConflicts?: (start: dayjs.Dayjs, end: dayjs.Dayjs, excludeId?: string) => Promise<ConflictDTO[]>;
  saving?: boolean;
  saveError?: string | null;
  canCreate?: boolean;
  categoryWritable?: boolean;
}) {
  const [values, setValues] = useState<EventEditorValues>(() => emptyValues(calendars, defaultStart, defaultEnd));
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDTO[]>([]);
  const [checking, setChecking] = useState(false);

  // Re-seed whenever the dialog opens so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setConflicts([]);
    setValues(event ? fromEvent(event) : emptyValues(calendars, defaultStart, defaultEnd));
  }, [open, event, calendars, defaultStart, defaultEnd]);

  const isAi = event?.source === 'AI_GENERATED';
  const startDay = useMemo(() => dayjs(values.start), [values.start]);
  const endDay = useMemo(() => dayjs(values.end), [values.end]);
  const invalidRange = startDay.isValid() && endDay.isValid() && !endDay.isAfter(startDay);

  // Debounced conflict probe: tells the user about collisions while they type.
  useEffect(() => {
    if (!open || !onCheckConflicts || !startDay.isValid() || !endDay.isValid() || invalidRange) {
      setConflicts([]);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const id = window.setTimeout(() => {
      onCheckConflicts(startDay, endDay, event?.id)
        .then((next) => {
          if (!cancelled) setConflicts(next);
        })
        .catch(() => {
          if (!cancelled) setConflicts([]);
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [open, onCheckConflicts, startDay, endDay, invalidRange, event?.id]);

  function patch(next: Partial<EventEditorValues>) {
    setValues((v) => ({ ...v, ...next }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!event && !canCreate) {
      setError('Event creation is unavailable until the backend calendar schema is corrected.');
      return;
    }
    if (!values.title.trim()) {
      setError('Give the event a title.');
      return;
    }
    if (invalidRange) {
      setError('The end time must be after the start time.');
      return;
    }
    setError(null);
    await onSave({ ...values, title: values.title.trim() });
  }

  const isEdit = Boolean(event);
  const title = isAi ? 'Review suggestion' : isEdit ? 'Edit event' : 'New event';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isAi && <Sparkles className="size-4 text-ai" />}
            {title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3.5">
          {(error || saveError) && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error ?? saveError}</span>
            </div>
          )}

          <Field label="Title" htmlFor="ev-title">
            <Input
              id="ev-title"
              value={values.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Design review"
              autoFocus
              disabled={saving}
            />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Starts" htmlFor="ev-start">
              <Input
                id="ev-start"
                type="datetime-local"
                value={toLocalInput(values.start)}
                onChange={(e) => patch({ start: fromLocalInput(e.target.value) })}
                disabled={saving || values.allDay}
              />
            </Field>
            <Field label="Ends" htmlFor="ev-end">
              <Input
                id="ev-end"
                type="datetime-local"
                value={toLocalInput(values.end)}
                onChange={(e) => patch({ end: fromLocalInput(e.target.value) })}
                aria-invalid={invalidRange}
                disabled={saving || values.allDay}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={values.allDay}
              onChange={(e) => patch({ allDay: e.target.checked })}
              disabled={saving}
            />
            All day
          </label>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Calendar" htmlFor="ev-calendar">
              <Select
                id="ev-calendar"
                value={values.calendarId ?? ''}
                onChange={(e) => patch({ calendarId: e.target.value })}
                disabled={saving}
              >
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type" htmlFor="ev-category" hint={!categoryWritable ? 'Category metadata is not persisted by the current backend.' : undefined}>
              <Select
                id="ev-category"
                value={values.category}
                onChange={(e) => patch({ category: e.target.value as EventCategory })}
                disabled={saving || !categoryWritable}
              >
                {(Object.keys(EVENT_CATEGORY_LABEL) as EventCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {EVENT_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Repeats" htmlFor="ev-recurrence">
            <Select
              id="ev-recurrence"
              value={values.recurrenceRule ?? ''}
              onChange={(e) => patch({ recurrenceRule: e.target.value || null })}
              disabled={saving}
            >
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Location" htmlFor="ev-location">
            <Input
              id="ev-location"
              value={values.location}
              onChange={(e) => patch({ location: e.target.value })}
              placeholder="Room 4, Zoom…"
              disabled={saving}
            />
          </Field>

          <Field label="Notes" htmlFor="ev-notes">
            <Textarea
              id="ev-notes"
              value={values.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Agenda, links, anything worth keeping with the event."
              disabled={saving}
            />
          </Field>

          {/* Conflict disclosure — shown before the write, never after. */}
          {checking && (
            <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Spinner className="size-3" />
              Checking for conflicts…
            </p>
          )}
          {!checking && conflicts.length > 0 && (
            <div className="rounded-lg border border-level-medium/40 bg-warning-soft px-3 py-2">
              <p className="flex items-center gap-1.5 text-2xs font-medium text-level-high">
                <AlertTriangle className="size-3.5" />
                Overlaps {conflicts.length} existing event{conflicts.length > 1 ? 's' : ''}
              </p>
              <ul className="mt-1 space-y-0.5">
                {conflicts.slice(0, 3).map((conflict) => (
                  <li key={conflict.eventB} className="tabular truncate text-2xs text-level-high/90">
                    {conflict.eventBTitle ?? conflict.eventB} · {conflict.overlapMinutes} min · {conflict.type.toLowerCase().replace('_', ' ')}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-2xs text-level-high/80">You can still save — the plan will be double-booked.</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || (!isEdit && !canCreate)}>
              {saving ? (
                <>
                  <Spinner className="size-3.5" />
                  Saving…
                </>
              ) : isAi ? (
                'Accept & save'
              ) : isEdit ? (
                'Save changes'
              ) : (
                'Create event'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function fromEvent(event: CalendarEventDTO): EventEditorValues {
  return {
    title: event.title,
    calendarId: event.calendarId,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    category: event.category,
    location: event.location ?? '',
    description: event.description ?? '',
    recurrenceRule: event.recurrenceRule ?? null,
    status: event.status,
  };
}

function emptyValues(
  calendars: CalendarDTO[],
  start?: dayjs.Dayjs,
  end?: dayjs.Dayjs,
): EventEditorValues {
  const from = start ?? dayjs().add(1, 'hour').startOf('hour');
  const to = end ?? from.add(1, 'hour');
  const primary = calendars.find((c) => c.isPrimary) ?? calendars[0];
  return {
    title: '',
    calendarId: primary?.id ?? null,
    start: from.toISOString(),
    end: to.toISOString(),
    allDay: false,
    category: 'PERSONAL',
    location: '',
    description: '',
    recurrenceRule: null,
    status: 'CONFIRMED',
  };
}

import { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { PageHeader } from '@/components/layout/PageHeader';
import { useShell } from '@/components/layout/shell-context';
import { WeekGrid, type WeekGridDay } from '@/components/calendar/WeekGrid';
import { useHotkeys, modKeyLabel } from '@/lib/hotkeys';

/**
 * Stage 1 reference screen: validates tokens against a real calendar surface.
 * View modes mirror the backend view endpoints (/api/calendar/events/day|week|month|agenda).
 * Only Week is rendered in Stage 1; Day/Month/Agenda + events + drag/drop land in Stage 2b.
 *
 * Assumption: weeks start Monday (ISO-8601). Becomes a user preference later.
 */
type ViewMode = 'day' | 'week' | 'month' | 'agenda';
const VIEWS: { id: ViewMode; label: string; key: string }[] = [
  { id: 'day', label: 'Day', key: 'D' },
  { id: 'week', label: 'Week', key: 'W' },
  { id: 'month', label: 'Month', key: 'M' },
  { id: 'agenda', label: 'Agenda', key: 'A' },
];

function startOfIsoWeek(d: Dayjs) {
  const dow = (d.day() + 6) % 7; // Monday = 0
  return d.subtract(dow, 'day').startOf('day');
}

export function CalendarPage() {
  const [anchor, setAnchor] = useState(() => dayjs());
  // Assumption: phones open in Day view — seven columns at 390px are unreadable.
  const [view, setView] = useState<ViewMode>(() => (window.innerWidth < 640 ? 'day' : 'week'));
  const { setAssistantOpen } = useShell();

  const days: WeekGridDay[] = useMemo(() => {
    const start = view === 'day' ? anchor.startOf('day') : startOfIsoWeek(anchor);
    const count = view === 'day' ? 1 : 7;
    return Array.from({ length: count }, (_, i) => ({
      date: start.add(i, 'day'),
      workingHours: { start: 9, end: 17 },
    }));
  }, [anchor, view]);

  const step = view === 'day' ? 'day' : view === 'month' ? 'month' : 'week';
  const rangeLabel = (() => {
    if (view === 'day') return anchor.format('dddd, MMM D');
    if (view === 'month') return anchor.format('MMMM YYYY');
    const s = days[0].date;
    const e = days[days.length - 1].date;
    return s.month() === e.month() ? `${s.format('MMM D')} – ${e.format('D, YYYY')}` : `${s.format('MMM D')} – ${e.format('MMM D, YYYY')}`;
  })();

  useHotkeys({
    t: () => setAnchor(dayjs()),
    j: () => setAnchor((a) => a.add(1, step)),
    k: () => setAnchor((a) => a.subtract(1, step)),
    arrowright: () => setAnchor((a) => a.add(1, step)),
    arrowleft: () => setAnchor((a) => a.subtract(1, step)),
    d: () => setView('day'),
    w: () => setView('week'),
    m: () => setView('month'),
    a: () => setView('agenda'),
  });

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <PageHeader title="Calendar" icon={<CalendarDays />}>
        <div className="mr-auto ml-3 hidden min-w-0 items-center gap-1 sm:flex">
          <Button variant="outline" size="sm" onClick={() => setAnchor(dayjs())} title="Today (T)">
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setAnchor((a) => a.subtract(1, step))} aria-label="Previous" title="Previous (K)">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setAnchor((a) => a.add(1, step))} aria-label="Next" title="Next (J)">
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
        <Button size="sm" title="New event (C)" className="hidden sm:inline-flex" disabled>
          <Plus /> Event
        </Button>
      </PageHeader>

      {/* Mobile date nav */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 sm:hidden">
        <Button variant="ghost" size="icon-sm" onClick={() => setAnchor((a) => a.subtract(1, step))} aria-label="Previous">
          <ChevronLeft />
        </Button>
        <span className="tabular flex-1 text-center text-sm font-medium">{rangeLabel}</span>
        <Button variant="ghost" size="icon-sm" onClick={() => setAnchor((a) => a.add(1, step))} aria-label="Next">
          <ChevronRight />
        </Button>
      </div>

      {view === 'day' || view === 'week' ? (
        <WeekGrid
          days={days}
          overlay={
            <EmptyHint
              onAsk={() => setAssistantOpen(true)}
            />
          }
        />
      ) : (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="max-w-xs">
            <p className="text-sm font-medium">{view === 'month' ? 'Month' : 'Agenda'} view</p>
            <p className="mt-1 text-xs text-muted-foreground">Arrives with the full calendar build (Stage 2b).</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Empty state: floats above the grid instead of replacing it — an empty week is
 * still a week, and the grid itself is the most useful thing to see.
 */
function EmptyHint({ onAsk }: { onAsk: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-border bg-popover/95 py-2 pr-2 pl-3 shadow-e3 backdrop-blur-md">
        <p className="text-xs whitespace-nowrap text-muted-foreground">Nothing scheduled yet</p>
        <button
          type="button"
          onClick={onAsk}
          className="flex h-row-sm shrink-0 items-center gap-1.5 rounded-md bg-ai-soft px-2 text-xs font-medium text-ai-soft-foreground transition-colors hover:bg-ai hover:text-ai-foreground"
        >
          <Sparkles className="size-3.5" />
          Plan with Assistant
          <Kbd className="border-ai-border bg-transparent text-current">{modKeyLabel}J</Kbd>
        </button>
      </div>
    </div>
  );
}

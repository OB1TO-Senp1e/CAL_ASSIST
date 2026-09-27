import { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import dayjs from 'dayjs';

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-eyebrow mb-2">Plan with intention</p>
          <h1 className="page-title">Calendar</h1>
          <p className="mt-2 text-sm text-muted-foreground">See your time and make space for what matters.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-sm">
            <button
              aria-label="Previous month"
              onClick={() => setCurrentDate(dayjs(currentDate).subtract(1, view).toDate())}
              className="rounded-lg p-2 transition hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-28 px-2 text-center text-sm font-medium">
              {dayjs(currentDate).format(view === 'month' ? 'MMMM YYYY' : 'MMM D, YYYY')}
            </span>
            <button
              aria-label="Next month"
              onClick={() => setCurrentDate(dayjs(currentDate).add(1, view).toDate())}
              className="rounded-lg p-2 transition hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="rounded-xl border bg-card px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-muted"
          >
            Today
          </button>
        </div>
      </header>
      
      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4 md:px-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CalendarIcon className="h-4 w-4 text-primary" />
            Calendar view
          </div>
          <div className="flex gap-1 rounded-xl bg-muted p-1">
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
          </div>
        </div>
        <div className="grid min-h-72 place-items-center p-8 text-center">
          <div className="max-w-sm">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <h2 className="font-semibold tracking-tight">Your calendar is ready to take shape</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Calendar events will appear here as they’re added to your schedule.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

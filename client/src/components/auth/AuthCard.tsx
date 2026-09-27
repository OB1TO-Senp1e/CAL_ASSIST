import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Shell for the unauthenticated surfaces (sign in / create account).
 *
 * Split layout: the form is the only interactive thing on the page, so it gets
 * the full attention of the left column; the right column is a calm product
 * statement built from the same tokens as the app (three stacked blocks echo the
 * wordmark's "time block" mark — no illustration, no stock imagery).
 *
 * The right column is hidden below `lg`: on phones the form is the page.
 */
export function AuthCard({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <main className="flex w-full flex-col px-5 py-8 sm:px-8 lg:w-[30rem] lg:shrink-0 lg:px-12">
        <div className="flex items-center justify-between">
          <Link
            to="/architecture"
            className="flex h-row-sm items-center gap-2 rounded-md px-1 text-sm font-semibold tracking-tight"
          >
            <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
              <rect x="2" y="2" width="16" height="4.5" rx="1.5" className="fill-primary" />
              <rect x="2" y="8" width="10" height="4.5" rx="1.5" className="fill-primary/55" />
              <rect x="2" y="14" width="13" height="4" rx="1.5" className="fill-ai/70" />
            </svg>
            CalAssist
          </Link>
          <Link
            to="/architecture"
            className="flex h-row-sm items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-(--dur-instant) hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Architecture
          </Link>
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="mx-auto w-full max-w-sm">
            <p className="text-2xs font-medium tracking-wide text-subtle-foreground uppercase">{eyebrow}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

            <div className="mt-7">{children}</div>

            <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
          </div>
        </div>
      </main>

      {/* Product statement — desktop only. */}
      <aside className="relative hidden flex-1 items-center justify-center overflow-hidden border-l border-border bg-surface-sunken lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:48px_48px]"
        />
        <div className="relative max-w-md px-12">
          <p className="text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Personal time OS</p>
          <p className="mt-3 text-2xl leading-snug font-semibold tracking-tight text-balance">
            Your calendar, your goals and your assistant — one surface.
          </p>
          <ul className="mt-8 space-y-3.5 text-sm">
            {[
              ['Intent → schedule', 'Say what you need; the assistant proposes the blocks.'],
              ['Nothing moves silently', 'Anything consequential waits for your confirmation.'],
              ['Reality-aware', 'Deviation is detected and the plan is recompiled.'],
            ].map(([head, body]) => (
              <li key={head} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>
                  <span className="font-medium">{head}</span>
                  <span className="block text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

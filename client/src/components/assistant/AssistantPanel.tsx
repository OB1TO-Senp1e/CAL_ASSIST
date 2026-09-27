import { useEffect, useRef } from 'react';
import { ArrowUp, CalendarPlus, ListChecks, Route, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd } from '@/components/ui/kbd';
import { Badge } from '@/components/ui/badge';
import { useShell } from '@/components/layout/shell-context';

/**
 * The ambient AI layer (DESIGN_SYSTEM.md §AI presence).
 *
 * Stage 1 ships the container, empty state, and composer so the violet AI
 * tokens are validated in real UI. Stage 2c fills in the message thread,
 * streaming, tool-call disclosure, and proposal confirm/reject cards.
 *
 * Starter prompts map to real assistant tools (src/ai/assistant/interfaces/
 * tool-schemas.ts): plan_day, create_schedule_proposal, detect_conflicts.
 */
const STARTERS = [
  { icon: Route, label: 'Plan my day', hint: 'plan_day' },
  { icon: CalendarPlus, label: 'Find 2 hours for deep work this week', hint: 'create_schedule_proposal' },
  { icon: ListChecks, label: 'Any conflicts tomorrow?', hint: 'detect_conflicts' },
];

export function AssistantPanel() {
  const { assistantOpen, setAssistantOpen } = useShell();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (assistantOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [assistantOpen]);

  return (
    <aside
      aria-label="Assistant"
      aria-hidden={!assistantOpen}
      className={cn(
        // Mobile: full-screen sheet. Desktop: docked column that pushes content (never covers the calendar).
        'fixed inset-0 z-40 flex flex-col bg-card transition-[transform,opacity] duration-(--dur-base) ease-(--ease-out-quick)',
        'lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-assistant lg:shrink-0 lg:border-l lg:border-border lg:transition-none',
        assistantOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0 lg:hidden',
      )}
    >
      <header className="flex h-topbar shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="grid size-6 place-items-center rounded-md bg-ai-soft text-ai-soft-foreground">
          <Sparkles className="size-3.5" />
        </span>
        <span className="text-base font-semibold tracking-tight">Assistant</span>
        <Badge variant="ai" className="ml-1">
          Preview
        </Badge>
        <button
          type="button"
          onClick={() => setAssistantOpen(false)}
          className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close assistant"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex flex-1 flex-col justify-end overflow-y-auto p-4">
        <div className="space-y-4">
          <div>
            <p className="text-lg font-semibold tracking-tight">What should your time look like?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Describe an outcome. I&rsquo;ll propose changes&thinsp;—&thinsp;nothing touches your calendar until you
              confirm it.
            </p>
          </div>
          <ul className="space-y-1">
            {STARTERS.map(({ icon: Icon, label, hint }) => (
              <li key={hint}>
                <button
                  type="button"
                  onClick={() => {
                    if (inputRef.current) {
                      inputRef.current.value = label;
                      inputRef.current.focus();
                    }
                  }}
                  className="group/starter flex w-full items-center gap-2.5 rounded-md border border-border px-2.5 py-2 text-left text-sm transition-colors hover:border-ai-border hover:bg-ai-soft"
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground group-hover/starter:text-ai-soft-foreground" />
                  <span className="flex-1">{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <form
        className="shrink-0 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <div className="rounded-lg border border-input bg-background shadow-e1 transition-colors focus-within:border-ai-border focus-within:ring-2 focus-within:ring-ai/20">
          <textarea
            ref={inputRef}
            rows={2}
            placeholder="Ask, plan, or reschedule…"
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-subtle-foreground focus-visible:outline-none"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="flex items-center gap-1 text-2xs text-subtle-foreground">
              <Kbd>↵</Kbd> send <Kbd>⇧↵</Kbd> newline
            </span>
            <button
              type="submit"
              disabled
              title="Conversation arrives in Stage 2c"
              className="grid size-7 place-items-center rounded-md bg-ai text-ai-foreground disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}

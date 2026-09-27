import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Kbd } from '@/components/ui/kbd';
import { TOOL_CATEGORY_LABEL, TOOL_LABEL } from '@/lib/mock/assistant';
import { ProposalCard } from './ProposalCard';
import type { ActionState } from '@/contexts/AssistantContext';
import type { ChatMessage, ProposedAction } from '@/services/types';

/**
 * The conversation itself. Rendered identically in the docked panel and on the
 * full-page Assistant screen, so a thread never looks different depending on
 * which one you opened it in.
 *
 * Four roles are visually distinct by construction (DESIGN_SYSTEM.md §AI
 * presence): the user is a plain right-aligned bubble, the assistant is the only
 * violet voice in the product, SYSTEM lines are receipts (centred, quiet), and
 * TOOL lines are collapsed machinery the user can expand if they care.
 */

const STARTERS = [
  { label: 'Plan my day', hint: 'plan_day' },
  { label: 'Find 2 hours for deep work this week', hint: 'create_schedule_proposal' },
  { label: 'Any conflicts in the next week?', hint: 'detect_conflicts' },
  { label: 'What should I focus on first?', hint: 'explain_schedule' },
];

function clock(iso: string): string {
  return dayjs(iso).format('HH:mm');
}

function relative(iso: string): string {
  const then = dayjs(iso);
  if (then.isSame(dayjs(), 'day')) return then.format('HH:mm');
  if (then.isSame(dayjs().subtract(1, 'day'), 'day')) return `Yesterday ${then.format('HH:mm')}`;
  return then.format('D MMM, HH:mm');
}

export interface AssistantThreadProps {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  actionStates: Record<string, ActionState>;
  onConfirm: (action: ProposedAction, modifiedInput?: Record<string, unknown>) => void;
  onReject: (action: ProposedAction) => void;
  onStarter: (text: string) => void;
  onRetry?: () => void;
  /** Roomier type/spacing on the full-page surface. */
  size?: 'panel' | 'page';
  className?: string;
}

export function AssistantThread({
  messages,
  loading,
  sending,
  error,
  actionStates,
  onConfirm,
  onReject,
  onStarter,
  onRetry,
  size = 'panel',
  className,
}: AssistantThreadProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the tail, but never yank the view if the user has scrolled up to read.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (pinned.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, sending]);

  const empty = !loading && messages.length === 0;
  const pad = size === 'page' ? 'px-4 py-5 md:px-8' : 'p-4';

  return (
    <div
      ref={scroller}
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}
      aria-live="polite"
      aria-busy={loading || sending}
    >
      <div className={cn('mx-auto w-full', size === 'page' && 'max-w-3xl', pad)}>
        {error && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span className="flex-1">{error}</span>
            {onRetry && (
              <Button size="xs" variant="ghost" className="text-destructive" onClick={onRetry}>
                <RefreshCw className="size-3" />
                Retry
              </Button>
            )}
          </div>
        )}

        {loading && messages.length === 0 && <ThreadSkeleton />}

        {empty && <EmptyState onStarter={onStarter} size={size} />}

        <ol className="space-y-4">
          {messages
            .filter((m) => m.role !== 'TOOL')
            .map((message) => (
              <li key={message.id}>
                <Turn
                  message={message}
                  actionStates={actionStates}
                  onConfirm={onConfirm}
                  onReject={onReject}
                  size={size}
                />
              </li>
            ))}
        </ol>

        {sending && <Thinking size={size} />}
        <div ref={endRef} className="h-px" />
      </div>
    </div>
  );
}

function Turn({
  message,
  actionStates,
  onConfirm,
  onReject,
  size,
}: {
  message: ChatMessage;
  actionStates: Record<string, ActionState>;
  onConfirm: AssistantThreadProps['onConfirm'];
  onReject: AssistantThreadProps['onReject'];
  size: 'panel' | 'page';
}) {
  const [showReasoning, setShowReasoning] = useState(false);
  const wide = size === 'page';

  if (message.role === 'USER') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div
          className={cn(
            'max-w-[85%] rounded-lg rounded-br-sm bg-secondary px-3 py-2 text-secondary-foreground',
            wide ? 'text-sm' : 'text-sm',
            message.failed && 'border border-destructive/40 bg-destructive/10 text-destructive',
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <span className="px-1 text-2xs text-subtle-foreground">
          {message.pending ? 'Sending…' : message.failed ? 'Not delivered' : clock(message.createdAt)}
        </span>
      </div>
    );
  }

  if (message.role === 'SYSTEM') {
    return (
      <div className="flex items-center justify-center gap-1.5 py-0.5 text-2xs text-muted-foreground">
        <CheckCircle2 className="size-3" />
        <span>{message.content}</span>
      </div>
    );
  }

  const actions = message.proposedActions ?? [];
  const hasToolCalls = (message.toolCalls?.length ?? 0) > 0;

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-ai-soft text-ai-soft-foreground">
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">Assistant</span>
          <span className="text-2xs text-subtle-foreground">{relative(message.createdAt)}</span>
          {typeof message.confidence === 'number' && (
            <Badge variant="outline" className="ml-auto tabular">
              {Math.round(message.confidence * 100)}% confident
            </Badge>
          )}
        </div>

        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>

        {hasToolCalls && (
          <ToolCallDisclosure
            names={(message.toolCalls ?? []).map((t) => t.name)}
            collapsible={actions.length > 0}
            defaultOpen={actions.length === 0}
          />
        )}

        {actions.length > 0 && (
          <div className="space-y-2">
            {actions.map((action) => (
              <ProposalCard
                key={action.id}
                action={action}
                state={actionStates[action.id] ?? 'pending'}
                onConfirm={onConfirm}
                onReject={onReject}
              />
            ))}
          </div>
        )}

        {message.reasoning && (
          <div>
            <button
              type="button"
              onClick={() => setShowReasoning((v) => !v)}
              aria-expanded={showReasoning}
              className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={cn('size-3 transition-transform', showReasoning && 'rotate-90')} />
              Why this?
            </button>
            {showReasoning && (
              <p className="mt-1.5 rounded-md border border-border bg-surface-sunken px-2.5 py-2 text-2xs leading-relaxed text-muted-foreground">
                {message.reasoning}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Collapsed machinery: which tools the assistant consulted. */
function ToolCallDisclosure({
  names,
  collapsible,
  defaultOpen,
}: {
  names: string[];
  collapsible: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const unique = useMemo(() => Array.from(new Set(names)), [names]);

  if (!collapsible) {
    return (
      <ul className="flex flex-wrap gap-1">
        {unique.map((name) => (
          <li key={name}>
            <Badge variant="ai" className="gap-1">
              <Wrench className="size-2.5" />
              {TOOL_LABEL[name] ?? name}
            </Badge>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface-sunken">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-2xs text-muted-foreground hover:text-foreground"
      >
        <Wrench className="size-3" />
        <span className="flex-1 text-left">
          Used {unique.length} tool{unique.length === 1 ? '' : 's'}
        </span>
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <ul className="space-y-1 border-t border-border px-2.5 py-1.5">
          {unique.map((name) => (
            <li key={name} className="flex items-center justify-between text-2xs">
              <span className="font-mono text-foreground">{name}</span>
              <span className="text-subtle-foreground">
                {TOOL_CATEGORY_LABEL[categoryOf(name)]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function categoryOf(name: string): keyof typeof TOOL_CATEGORY_LABEL {
  const map: Record<string, keyof typeof TOOL_CATEGORY_LABEL> = {
    create_event: 'CALENDAR',
    update_event: 'CALENDAR',
    delete_event: 'CALENDAR',
    move_event: 'CALENDAR',
    create_task: 'TASKS',
    update_task: 'TASKS',
    create_goal: 'GOALS',
    create_project: 'PROJECTS',
    create_schedule_proposal: 'SCHEDULING',
    plan_day: 'SCHEDULING',
    find_availability: 'AVAILABILITY',
    detect_conflicts: 'CONFLICTS',
    explain_schedule: 'INSIGHTS',
  };
  return map[name] ?? 'CALENDAR';
}

function Thinking({ size }: { size: 'panel' | 'page' }) {
  return (
    <div className="mt-4 flex gap-2.5" aria-label="Assistant is thinking">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-ai-soft text-ai-soft-foreground">
        <Sparkles className="size-3.5" />
      </span>
      <div className="w-full max-w-xs space-y-1.5">
        <p className="text-2xs font-medium text-ai-soft-foreground">Thinking…</p>
        <div className={cn('ai-shimmer h-2.5 rounded-sm', size === 'page' ? 'w-4/5' : 'w-3/5')} />
        <div className="ai-shimmer h-2.5 w-2/5 rounded-sm" />
      </div>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="flex justify-end">
        <Skeleton className="h-9 w-3/5 rounded-lg" />
      </div>
      <div className="flex gap-2.5">
        <Skeleton className="size-6 shrink-0 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  onStarter,
  size,
}: {
  onStarter: (text: string) => void;
  size: 'panel' | 'page';
}) {
  return (
    <div className={cn('flex flex-col justify-center', size === 'page' ? 'min-h-[45vh]' : 'min-h-[50vh]')}>
      <div className="mb-4">
        <p className={cn('font-semibold tracking-tight', size === 'page' ? 'text-2xl' : 'text-lg')}>
          What should your time look like?
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe an outcome. I&rsquo;ll propose changes&thinsp;—&thinsp;nothing touches your calendar
          until you confirm it.
        </p>
      </div>
      <ul className={cn('grid gap-1.5', size === 'page' && 'sm:grid-cols-2')}>
        {STARTERS.map(({ label, hint }) => (
          <li key={hint}>
            <button
              type="button"
              onClick={() => onStarter(label)}
              className="group/starter flex w-full items-center gap-2.5 rounded-md border border-border px-2.5 py-2 text-left text-sm transition-colors hover:border-ai-border hover:bg-ai-soft"
            >
              <Info className="size-3.5 shrink-0 text-muted-foreground group-hover/starter:text-ai-soft-foreground" />
              <span className="flex-1">{label}</span>
              <Kbd className="opacity-0 transition-opacity group-hover/starter:opacity-100">{hint}</Kbd>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-1.5 text-2xs text-subtle-foreground">
        <Sparkles className="size-3" />
        Every proposal is dashed violet until you confirm it.
      </p>
    </div>
  );
}

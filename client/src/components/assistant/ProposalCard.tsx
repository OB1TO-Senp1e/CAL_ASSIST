import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Pencil, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LEVEL_META, type Level } from '@/lib/design-tokens';
import { TOOL_CATEGORY_LABEL, TOOL_LABEL } from '@/lib/mock/assistant';
import type { ProposedAction } from '@/services/types';

/**
 * A single proposed action from the assistant.
 *
 * This is the one place in the product where the user is asked to authorise a
 * change, so it is deliberately explicit: what will happen, which tool does it,
 * how risky it is (`confirmationLevel` from the tool definition), how large the
 * blast radius is (`estimatedImpact` from the orchestrator's own buckets), and
 * whether it can be undone (`reversible`).
 *
 * The visual contract comes from Stage 1: `.proposal` (dashed violet) means "not
 * real yet". It stops being dashed the moment the action is applied.
 */
export interface ProposalCardProps {
  action: ProposedAction;
  /** 'pending' shows the buttons; 'applied'/'rejected' collapse to a receipt. */
  state?: 'pending' | 'applied' | 'rejected' | 'working';
  onConfirm?: (action: ProposedAction, modifiedInput?: Record<string, unknown>) => void;
  onReject?: (action: ProposedAction) => void;
  className?: string;
}

/** Top-level primitive fields the user can reasonably edit in place. */
function editableEntries(input: Record<string, unknown>) {
  return Object.entries(input).filter(
    ([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v),
  );
}

function nestedEntries(input: Record<string, unknown>) {
  return Object.entries(input).filter(([, v]) => v !== null && typeof v === 'object');
}

function label(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Render an ISO datetime as a readable local string; leave other values alone. */
function displayValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /Date$|date$/i.test(key) && !Number.isNaN(Date.parse(value))) {
    const d = new Date(value);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return String(value);
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1', className)}>
      {children}
    </div>
  );
}

export function ProposalCard({
  action,
  state = 'pending',
  onConfirm,
  onReject,
  className,
}: ProposalCardProps) {
  const [adjusting, setAdjusting] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});

  const level = action.confirmationLevel as Level;
  const meta = LEVEL_META[level];
  const editable = useMemo(() => editableEntries(action.input), [action.input]);
  const nested = useMemo(() => nestedEntries(action.input), [action.input]);

  const busy = state === 'working';
  const settled = state === 'applied' || state === 'rejected';

  function buildModified(): Record<string, unknown> {
    const out: Record<string, unknown> = { ...action.input };
    for (const [key, value] of Object.entries(draft)) {
      const original = action.input[key];
      if (typeof original === 'number') {
        const n = Number(value);
        out[key] = Number.isNaN(n) ? original : n;
      } else if (typeof original === 'boolean') {
        out[key] = value === true || value === 'true';
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  return (
    <section
      aria-label={`Proposed action: ${action.description}`}
      className={cn(
        'proposal rounded-lg p-3',
        settled && 'border-solid opacity-70',
        className,
      )}
    >
      <header className="flex items-start gap-2">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm bg-ai text-ai-foreground">
          {state === 'applied' ? (
            <Check className="size-3" />
          ) : state === 'rejected' ? (
            <X className="size-3" />
          ) : (
            <Pencil className="size-3" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{action.description}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs">
            <Badge variant="ai">{TOOL_LABEL[action.toolName] ?? action.toolName}</Badge>
            <span className="text-ai-soft-foreground/70">
              {TOOL_CATEGORY_LABEL[action.toolName ? categoryOf(action.toolName) : 'CALENDAR']}
            </span>
          </p>
        </div>
        <span
          className={cn('flex shrink-0 items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-medium', meta.soft, meta.text)}
          title={`Confirmation level: ${meta.label}`}
        >
          <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
          {meta.label}
        </span>
      </header>

      <dl className="mt-2.5 rounded-md border border-ai-border/40 bg-card/50 px-2.5 py-1.5 text-xs">
        {editable.map(([key, value]) =>
          adjusting ? (
            <Row key={key}>
              <dt className="shrink-0 text-muted-foreground">{label(key)}</dt>
              <dd className="min-w-0 flex-1 text-right">
                {typeof value === 'boolean' ? (
                  <select
                    value={String(draft[key] ?? value)}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    className="w-full rounded-sm border border-input bg-background px-1.5 py-0.5 text-right text-xs"
                    aria-label={label(key)}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    type={typeof value === 'number' ? 'number' : 'text'}
                    defaultValue={value === null || value === undefined ? '' : String(value)}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    className="w-full rounded-sm border border-input bg-background px-1.5 py-0.5 text-right text-xs"
                    aria-label={label(key)}
                  />
                )}
              </dd>
            </Row>
          ) : (
            <Row key={key}>
              <dt className="shrink-0 text-muted-foreground">{label(key)}</dt>
              <dd className="truncate text-right font-medium tabular">{displayValue(key, value)}</dd>
            </Row>
          ),
        )}
        {nested.map(([key, value]) => (
          <Row key={key}>
            <dt className="shrink-0 text-muted-foreground">{label(key)}</dt>
            <dd className="truncate text-right font-mono text-2xs text-muted-foreground">
              {Array.isArray(value) ? `${value.length} item${value.length === 1 ? '' : 's'}` : 'object'}
            </dd>
          </Row>
        ))}
      </dl>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ai-soft-foreground/80">
        <span className="flex items-center gap-1">
          <AlertTriangle className="size-3" />
          Impact: {action.estimatedImpact.toLowerCase()}
        </span>
        <span className="flex items-center gap-1">
          {action.reversible ? (
            <>
              <RotateCcw className="size-3" />
              Can be undone
            </>
          ) : (
            <>
              <ShieldAlert className="size-3" />
              Cannot be undone
            </>
          )}
        </span>
      </p>

      {!settled && (
        <footer className="mt-3 flex items-center gap-1.5">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              onConfirm?.(action, adjusting && Object.keys(draft).length > 0 ? buildModified() : undefined)
            }
          >
            <Check className="size-3.5" />
            {adjusting ? 'Save & apply' : 'Confirm'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            aria-pressed={adjusting}
            onClick={() => {
              setAdjusting((a) => !a);
              setDraft({});
            }}
          >
            <Pencil className="size-3.5" />
            {adjusting ? 'Cancel edit' : 'Adjust'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            className="ml-auto text-muted-foreground"
            onClick={() => onReject?.(action)}
          >
            Reject
          </Button>
        </footer>
      )}

      {settled && (
        <p className="mt-2 text-2xs font-medium">
          {state === 'applied' ? 'Applied to your calendar.' : 'Rejected — nothing was changed.'}
        </p>
      )}
    </section>
  );
}

/** Map a tool name back to its category using the real registry. */
function categoryOf(toolName: string): keyof typeof TOOL_CATEGORY_LABEL {
  // Imported lazily to keep this module's import graph flat.
  const found = TOOL_CATEGORY_BY_TOOL[toolName];
  return (found ?? 'CALENDAR') as keyof typeof TOOL_CATEGORY_LABEL;
}

/** Built from the same source as the backend ToolRegistry (see lib/mock/assistant). */
const TOOL_CATEGORY_BY_TOOL: Record<string, string> = {
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

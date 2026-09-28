import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowRight, CalendarClock, Check, CheckCircle2, ChevronRight, Clock3, FileClock, GitBranch, LoaderCircle, Plus, RefreshCw, Search as SearchIcon, Sparkles, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { workService } from '@/services/work';
import { operationsService } from '@/services/operations';
import { USE_MOCK, authService } from '@/services/auth';
import { aiConsentService, type AiConsentStatus } from '@/services/aiConsent';
import { useAuth } from '@/contexts/AuthContext';
import { knowledgeService } from '@/services/knowledge';
import { integrationsService } from '@/services/integrations';
import { calendarService } from '@/services/calendar';
import { COMMANDS } from '@/lib/commands';
import dayjs from 'dayjs';
import type { TaskDTO } from '@/services/types';
import type { CalendarProvider } from '@/services/types';
import type { CalendarEventDTO } from '@/services/types';
import type { CommitmentDTO, CommitmentRiskDTO, CommitmentSource, CommitmentStatus, CompilePreferencesDTO, DeviationDTO, InterventionDTO, MeetingExtractionDTO, MeetingPreparationDTO, MeetingType, MemoryConflictDTO, MemoryEntryDTO, MemoryScope, MemoryType, NotificationPreferencesDTO, PermissionPolicyDTO, PermissionTemplateDTO, ProactivePreferencesDTO, RealityCheckDTO, ReplanOptionsDTO, RuleConflictDTO, RuleDTO, RulePreviewDTO, ScheduleProposalDTO, UserPermissionDTO } from '@/services/workflow-types';

function todayValue(offset = 0) {
  const date = new Date(); date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function isoDate(value: string) { return value ? new Date(`${value}T12:00:00.000Z`).toISOString() : ''; }
function shortDate(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value)); }
function clock(value: string) { return operationsService.clock(value); }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Try again.'; }

function LoadRows() {
  return <div className="divide-y divide-border">{[0, 1, 2, 3].map((row) => <div className="flex items-center gap-3 py-4" key={row}><Skeleton className="size-4" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-56 max-w-full" /><Skeleton className="h-2.5 w-80 max-w-full" /></div></div>)}</div>;
}

function StatusBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warning' | 'danger' | 'success' | 'ai' }) {
  const variant = tone === 'danger' ? 'destructive' : tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : tone === 'ai' ? 'ai' : 'neutral';
  return <Badge variant={variant}>{children}</Badge>;
}

function WorkFrame({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col"><PageHeader title={title} icon={icon}>{action}</PageHeader><div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-5xl px-4 pb-8 pt-4 md:px-6">{children}</div></div></div>;
}

function ErrorLine({ message, retry }: { message: string; retry: () => void }) {
  return <div className="my-3 flex items-center justify-between gap-3 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs" role="alert"><span>{message}</span><Button size="sm" variant="outline" onClick={retry}>Retry</Button></div>;
}

const DEFAULT_PREFERENCES: CompilePreferencesDTO = {
  workingHoursStart: '09:00', workingHoursEnd: '17:00', preferredFocusBlockDuration: 90,
  maxFocusBlockDuration: 180, minBreakDuration: 15, maxDailyHours: 8, preferredBreakInterval: 90,
  energyPeakHours: [{ start: '09:00', end: '11:00' }, { start: '14:00', end: '16:00' }],
  bufferBetweenTasks: 10, travelBufferDefault: 15, protectFocusTime: true, allowWeekendScheduling: false,
  taskOrderingStrategy: 'BALANCED',
};

export function CompilerPage() {
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [goals, setGoals] = useState<Array<{ id: string; title: string }>>([]);
  const [proposals, setProposals] = useState<ScheduleProposalDTO[]>([]);
  const [proposal, setProposal] = useState<ScheduleProposalDTO | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [goalId, setGoalId] = useState('');
  const [start, setStart] = useState(todayValue());
  const [end, setEnd] = useState(todayValue());
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [strategy, setStrategy] = useState<CompilePreferencesDTO['taskOrderingStrategy']>('BALANCED');
  const [selectedAlternative, setSelectedAlternative] = useState('');
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [taskRows, goalRows, saved] = await Promise.all([workService.listTasks(), workService.listGoals(), operationsService.listProposals()]);
      setTasks(taskRows.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status)));
      setGoals(goalRows);
      setSelectedIds(taskRows.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status)).map((task) => task.id));
      setProposals(saved);
    } catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const goalTasks = tasks.filter((task) => !goalId || task.goalId === goalId);
  const activeBlocks = useMemo(() => {
    if (!proposal) return [];
    return proposal.alternatives.find((alternative) => alternative.id === selectedAlternative)?.blocks ?? proposal.proposedBlocks;
  }, [proposal, selectedAlternative]);

  async function compile() {
    setCompiling(true); setError(null);
    try {
      const chosen = tasks.filter((task) => selectedIds.includes(task.id) && (!goalId || task.goalId === goalId));
      const next = await operationsService.compile(chosen, { start, end, timezone, preferences: { ...DEFAULT_PREFERENCES, taskOrderingStrategy: strategy } });
      setProposal(next); setSelectedAlternative(''); setProposals(await operationsService.listProposals());
    } catch (cause) { setError(errorText(cause)); }
    finally { setCompiling(false); }
  }

  async function apply(status: 'APPLIED' | 'REJECTED') {
    if (!proposal) return;
    if (status === 'APPLIED') {
      // PATCH /proposals/:id/apply writes real TimeBlocks server-side.
      const applied = await operationsService.applyProposal(proposal.id);
      setProposal(applied);
    } else {
      await operationsService.setProposalStatus(proposal.id, status);
      setProposal({ ...proposal, status });
    }
    setProposals(await operationsService.listProposals());
    setConfirmApply(false);
  }

  return <WorkFrame title="Time Compiler" icon={<CalendarClock />} action={<Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="size-3.5" />Refresh</Button>}>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div><h2 className="text-sm font-semibold">Build a schedule proposal</h2><p className="mt-1 text-xs text-muted-foreground">Choose the work and planning window. Nothing is applied until you review it.</p></div>
      <StatusBadge tone="ai">Proposal only</StatusBadge>
    </div>
    {error && <ErrorLine message={error} retry={() => void load()} />}
    {loading ? <LoadRows /> : <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-label="Choose tasks" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
          <h3 className="text-xs font-semibold">Tasks <span className="font-normal text-muted-foreground">{selectedIds.length} selected</span></h3>
          <div className="flex gap-2">
            <Select aria-label="Filter by goal" className="w-44" value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">All goals</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</Select>
            <Select aria-label="Task ordering" className="w-36" value={strategy} onChange={(event) => setStrategy(event.target.value as CompilePreferencesDTO['taskOrderingStrategy'])}>{(['BALANCED', 'PRIORITY', 'DEADLINE', 'DEPENDENCY', 'ENERGY'] as const).map((value) => <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>)}</Select>
          </div>
        </div>
        {goalTasks.length === 0 ? <p className="py-10 text-center text-xs text-muted-foreground">No schedulable tasks in this selection.</p> : <ul className="divide-y divide-border">{goalTasks.map((task) => <li key={task.id} className="flex items-center gap-3 py-3">
          <input type="checkbox" checked={selectedIds.includes(task.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, task.id] : ids.filter((id) => id !== task.id))} aria-label={`Select ${task.title}`} className="size-3.5 accent-primary" />
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{task.title}</p><p className="mt-1 text-2xs text-muted-foreground">{task.estimatedDurationMin ?? 90} min · priority {task.priority}/10{task.dueDate ? ` · due ${shortDate(task.dueDate)}` : ''}</p></div>
          <StatusBadge tone={task.priority >= 8 ? 'warning' : 'neutral'}>{task.priority >= 8 ? 'High' : 'Normal'}</StatusBadge>
        </li>)}</ul>}
      </section>
      <aside className="space-y-4 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        <h3 className="text-xs font-semibold">Planning window</h3>
        <div className="grid grid-cols-2 gap-3"><Field label="From" htmlFor="compile-from"><Input id="compile-from" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></Field><Field label="Through" htmlFor="compile-through"><Input id="compile-through" type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} /></Field></div>
        <Field label="Timezone" htmlFor="compile-zone"><Input id="compile-zone" value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field>
        <div className="flex items-start gap-2 border-l-2 border-primary/50 bg-muted/50 px-3 py-2 text-2xs text-muted-foreground"><Clock3 className="mt-0.5 size-3 shrink-0" /><span>Working hours {DEFAULT_PREFERENCES.workingHoursStart}–{DEFAULT_PREFERENCES.workingHoursEnd}; {DEFAULT_PREFERENCES.bufferBetweenTasks}-minute task buffer.</span></div>
        <Button className="w-full" onClick={() => void compile()} disabled={compiling || selectedIds.length === 0 || !start || !end || end < start}>{compiling ? <><LoaderCircle className="size-3.5 animate-spin" />Compiling…</> : <><Sparkles className="size-3.5" />Generate proposal</>}</Button>
        {proposals.length > 0 && <div className="border-t border-border pt-3"><p className="mb-2 text-2xs font-medium text-muted-foreground">Recent proposals</p><ul className="space-y-1">{proposals.slice(0, 3).map((item) => <li key={item.id}><button type="button" onClick={() => { setProposal(item); setSelectedAlternative(''); }} className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-2xs hover:bg-accent"><span>{shortDate(item.timeRange.start)}</span><StatusBadge tone={item.status === 'APPLIED' ? 'success' : 'neutral'}>{item.status}</StatusBadge></button></li>)}</ul></div>}
      </aside>
    </div>}

    {proposal && <section className="mt-6 border-t border-border pt-4" aria-label="Schedule proposal review">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Schedule review</h2><StatusBadge tone={proposal.status === 'APPLIED' ? 'success' : proposal.status === 'REJECTED' ? 'danger' : 'ai'}>{proposal.status}</StatusBadge></div><p className="mt-1 text-xs text-muted-foreground">{shortDate(proposal.timeRange.start)} · {activeBlocks.length} task blocks · {proposal.metrics.totalTaskMinutes} scheduled minutes</p></div><div className="flex gap-2">{proposal.status === 'READY' && <><Button size="sm" variant="outline" onClick={() => void apply('REJECTED')}><X className="size-3.5" />Discard</Button><Button size="sm" onClick={() => setConfirmApply(true)}><Check className="size-3.5" />Apply plan</Button></>}</div></div>
      {proposal.alternatives.length > 0 && <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Schedule alternatives"><button type="button" aria-pressed={!selectedAlternative} onClick={() => setSelectedAlternative('')} className={cn('rounded-sm border px-2.5 py-1.5 text-2xs', !selectedAlternative ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground')}>Recommended</button>{proposal.alternatives.map((alternative) => <button type="button" key={alternative.id} aria-pressed={selectedAlternative === alternative.id} onClick={() => setSelectedAlternative(alternative.id)} className={cn('rounded-sm border px-2.5 py-1.5 text-2xs', selectedAlternative === alternative.id ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground')}>{alternative.name} · {alternative.estimatedCompletionRate}%</button>)}</div>}
      {selectedAlternative && proposal.alternatives.find((item) => item.id === selectedAlternative) && <div className="mt-3 grid gap-2 text-2xs sm:grid-cols-2"><p className="text-status-success">+ {proposal.alternatives.find((item) => item.id === selectedAlternative)?.pros.join(' · ')}</p><p className="text-status-warning">− {proposal.alternatives.find((item) => item.id === selectedAlternative)?.cons.join(' · ')}</p></div>}
      {proposal.unsatisfiedConstraints.map((constraint) => <p key={constraint.description} className="mt-3 flex items-center gap-2 text-2xs text-status-warning"><AlertTriangle className="size-3" />{constraint.description}</p>)}
      {activeBlocks.length === 0 && <p className="mt-3 border-l-2 border-status-warning bg-status-warning/5 px-3 py-2 text-2xs text-status-warning">No proposed blocks were produced for this request. Select more schedulable tasks or widen the planning window.</p>}
      <ol className="mt-4 divide-y divide-border border-y border-border">{activeBlocks.length ? activeBlocks.map((block) => <li key={block.id} className="flex items-center gap-3 py-2.5 text-xs"><span className="w-24 shrink-0 font-mono tabular-nums text-muted-foreground">{clock(block.startTime)}–{clock(block.endTime)}</span><span className="min-w-0 flex-1 truncate font-medium">{block.title}</span><span className="text-2xs text-muted-foreground">{block.durationMinutes}m</span></li>) : <li className="py-6 text-center text-xs text-muted-foreground">{USE_MOCK ? 'No blocks fit this window. Expand the working window or choose more time.' : 'The backend returned no proposed blocks for this request.'}</li>}</ol>
      <p className="mt-3 text-2xs text-muted-foreground">{proposal.reasoning.join(' ')}</p>
    </section>}
    <Dialog open={confirmApply} onOpenChange={setConfirmApply}><DialogContent><DialogHeader><DialogTitle>Apply this schedule?</DialogTitle><DialogDescription>{USE_MOCK ? 'This confirms the selected mock proposal. Stage 2 does not write calendar blocks.' : 'Applying writes the proposed blocks as real Time Blocks on your schedule. This cannot be undone from here.'}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmApply(false)}>Review more</Button><Button onClick={() => void apply('APPLIED')}>Confirm proposal</Button></DialogFooter></DialogContent></Dialog>
  </WorkFrame>;
}

const COMMITMENT_STATUSES: CommitmentStatus[] = ['PENDING', 'IN_PROGRESS', 'OVERDUE', 'COMPLETED', 'CANCELLED'];
function riskTone(level: CommitmentRiskDTO['riskLevel']): 'neutral' | 'warning' | 'danger' | 'success' { return level === 'CRITICAL' || level === 'HIGH' ? 'danger' : level === 'MEDIUM' ? 'warning' : level === 'NONE' ? 'success' : 'neutral'; }

export function CommitmentsPage() {
  const [rows, setRows] = useState<CommitmentDTO[]>([]);
  const [risks, setRisks] = useState<CommitmentRiskDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | CommitmentStatus>('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CommitmentDTO | null>(null);
  const [selected, setSelected] = useState<CommitmentDTO | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() { setLoading(true); setError(null); try { const [commitments, assessments] = await Promise.all([operationsService.listCommitments(), operationsService.commitmentRisks()]); setRows(commitments); setRisks(assessments); } catch (cause) { setError(errorText(cause)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  const visible = rows.filter((row) => filter === 'ALL' || row.status === filter);
  const selectedRisk = selected ? risks.find((risk) => risk.commitmentId === selected.id) : undefined;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const payload = { object: String(form.get('object') ?? '').trim(), description: String(form.get('description') ?? '').trim() || undefined, person: String(form.get('person') ?? '').trim() || undefined, deadline: isoDate(String(form.get('deadline') ?? '')), source: String(form.get('source') ?? 'USER_INPUT') as CommitmentSource };
    try { if (editing) await operationsService.updateCommitment(editing.id, { object: payload.object, description: payload.description, person: payload.person, deadline: payload.deadline }); else await operationsService.createCommitment(payload); setFormOpen(false); setEditing(null); await load(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }

  async function changeStatus(row: CommitmentDTO, status: CommitmentStatus) { await operationsService.updateCommitment(row.id, { status }); setSelected(null); await load(); }
  async function remove(row: CommitmentDTO) { if (!window.confirm(`Delete “${row.object}”?`)) return; await operationsService.deleteCommitment(row.id); setSelected(null); await load(); }

  return <WorkFrame title="Commitments" icon={<FileClock />} action={<Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-3.5" />New commitment</Button>}>
    <div className="grid grid-cols-3 border-b border-border pb-4"><div><p className="text-2xs text-muted-foreground">Open</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : rows.filter((row) => ['PENDING', 'IN_PROGRESS'].includes(row.status)).length}</p></div><div><p className="text-2xs text-muted-foreground">Past due</p><p className="mt-1 text-lg font-semibold tabular-nums text-destructive">{loading ? '—' : rows.filter((row) => row.status === 'OVERDUE' || new Date(row.deadline) < new Date() && !['COMPLETED', 'CANCELLED'].includes(row.status)).length}</p></div><div><p className="text-2xs text-muted-foreground">High risk</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : risks.filter((risk) => ['HIGH', 'CRITICAL'].includes(risk.riskLevel)).length}</p></div></div>
    <div className="flex gap-1 overflow-x-auto border-b border-border py-3" role="group" aria-label="Filter commitments">{(['ALL', ...COMMITMENT_STATUSES] as const).map((status) => <button type="button" key={status} onClick={() => setFilter(status)} aria-pressed={filter === status} className={cn('shrink-0 rounded-sm px-2 py-1 text-2xs', filter === status ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>{status === 'ALL' ? 'All' : status.replace('_', ' ')}</button>)}</div>
    {error && <ErrorLine message={error} retry={() => void load()} />}
    {loading ? <LoadRows /> : visible.length === 0 ? <div className="grid min-h-56 place-items-center text-center"><div><h2 className="text-sm font-medium">No commitments in this view</h2><p className="mt-1 text-xs text-muted-foreground">Create a commitment to track a promise and its deadline.</p><Button size="sm" className="mt-3" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-3.5" />Add commitment</Button></div></div> : <ul className="divide-y divide-border">{visible.map((row) => { const risk = risks.find((item) => item.commitmentId === row.id); return <li key={row.id}>
      <button type="button" onClick={() => setSelected(row)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-accent/40">
        <span className={cn('size-2 shrink-0 rounded-full', row.status === 'COMPLETED' ? 'bg-status-success' : risk?.riskLevel === 'CRITICAL' || risk?.riskLevel === 'HIGH' ? 'bg-status-critical' : risk?.riskLevel === 'MEDIUM' ? 'bg-status-warning' : 'bg-primary')} />
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{row.object}</span><span className="mt-1 block truncate text-2xs text-muted-foreground">{row.person ? `to ${row.person} · ` : ''}{row.description || 'No notes'} · {row.source.replace('_', ' ').toLowerCase()}</span></span>
        <span className="hidden sm:inline"><StatusBadge tone={risk ? riskTone(risk.riskLevel) : 'neutral'}>{risk?.riskLevel ?? row.status}</StatusBadge></span>
        <span className={cn('w-24 shrink-0 text-right text-2xs tabular-nums', new Date(row.deadline) < new Date() && !['COMPLETED', 'CANCELLED'].includes(row.status) && 'font-medium text-destructive')}>{shortDate(row.deadline)}</span><ChevronRight className="size-3.5 text-muted-foreground" />
      </button>
    </li>; })}</ul>}
    <Dialog open={formOpen} onOpenChange={(open) => { if (!open && !saving) setFormOpen(false); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Edit commitment' : 'New commitment'}</DialogTitle><DialogDescription>Track the promise and its due date.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => void save(event)}>
      <Field label="Committed action" htmlFor="commitment-object"><Input id="commitment-object" name="object" required maxLength={500} defaultValue={editing?.object ?? ''} autoFocus /></Field>
      <Field label="Notes" htmlFor="commitment-description"><Textarea id="commitment-description" name="description" maxLength={2000} defaultValue={editing?.description ?? ''} /></Field>
<Field label="Promised to" htmlFor="commitment-person"><Input id="commitment-person" name="person" maxLength={200} placeholder="Optional — who is this for?" defaultValue={editing?.person ?? ''} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Deadline" htmlFor="commitment-deadline"><Input id="commitment-deadline" name="deadline" type="date" required defaultValue={editing ? editing.deadline.slice(0, 10) : todayValue(1)} /></Field>{!editing && <Field label="Source" htmlFor="commitment-source"><Select id="commitment-source" name="source" defaultValue="USER_INPUT"><option value="USER_INPUT">You stated this</option><option value="AI_INFERRED">AI inference</option><option value="EMAIL_EXTRACTED">Email extracted</option></Select></Field>}</div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create commitment'}</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="sm:max-w-lg">{selected && <><DialogHeader><div className="flex gap-2"><StatusBadge>{selected.status.replace('_', ' ')}</StatusBadge><StatusBadge tone={riskTone(selectedRisk?.riskLevel ?? 'NONE')}>{selectedRisk?.riskLevel ?? 'NONE'} risk</StatusBadge></div><DialogTitle className="pt-1">{selected.object}</DialogTitle><DialogDescription>{selected.description || 'No additional notes.'}</DialogDescription></DialogHeader><dl className="grid grid-cols-2 gap-4 border-y border-border py-4 text-xs"><div><dt className="text-muted-foreground">Deadline</dt><dd className="mt-1 font-medium">{shortDate(selected.deadline)}</dd></div><div><dt className="text-muted-foreground">Source</dt><dd className="mt-1 font-medium">{selected.source.replace('_', ' ')}{selected.confidence !== undefined ? ` · ${Math.round(selected.confidence * 100)}% sure` : ''}</dd></div>{selected.person && <div><dt className="text-muted-foreground">Promised to</dt><dd className="mt-1 font-medium">{selected.person}{selected.personEmail ? ` (${selected.personEmail})` : ''}</dd></div>}{selected.relatedEntityId && <div><dt className="text-muted-foreground">Linked to</dt><dd className="mt-1 font-medium">{selected.relatedEntityType ?? 'ITEM'}</dd></div>}{selected.context && <div className="col-span-2"><dt className="text-muted-foreground">Extracted from</dt><dd className="mt-1 italic">{selected.context}</dd></div>}<div className="col-span-2"><dt className="text-muted-foreground">Risk assessment</dt><dd className="mt-1">{selectedRisk?.details ?? 'No current deadline risk.'}</dd><dd className="mt-1 text-muted-foreground">{selectedRisk?.recommendation}</dd></div></dl><DialogFooter className="sm:justify-between"><Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove(selected)}><Trash2 className="size-3.5" />Delete</Button><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setEditing(selected); setSelected(null); setFormOpen(true); }}>Edit</Button>{selected.status !== 'COMPLETED' && <Button onClick={() => void changeStatus(selected, 'COMPLETED')}><Check className="size-3.5" />Complete</Button>}</div></DialogFooter></>}</DialogContent></Dialog>
  </WorkFrame>;
}

function deviationTone(severity: DeviationDTO['severity']): 'neutral' | 'warning' | 'danger' { return severity === 'CRITICAL' || severity === 'HIGH' ? 'danger' : severity === 'MEDIUM' ? 'warning' : 'neutral'; }
const TRIGGER_BY_DEVIATION: Record<DeviationDTO['type'], ReplanOptionsDTO['trigger']> = { TASK_OVERRUN: 'TASK_OVERRUN', TASK_UNDERRUN: 'MANUAL', MEETING_LATE: 'MEETING_LATE', MEETING_EARLY: 'MANUAL', TASK_POSTPONED: 'TASK_POSTPONED', TASK_CANCELLED: 'TASK_CANCELLED', DEADLINE_APPROACHING: 'DEADLINE_APPROACHING', DEPENDENCY_INCOMPLETE: 'DEPENDENCY_INCOMPLETE', UNALLOCATED_WORK: 'MANUAL', SCHEDULE_DRIFT: 'SCHEDULE_DRIFT', FOCUS_TIME_INTERRUPTED: 'SCHEDULE_DRIFT', BREAK_SKIPPED: 'SCHEDULE_DRIFT', TRAVEL_DELAY: 'MEETING_LATE' };

export function RealityPage() {
  const [result, setResult] = useState<RealityCheckDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [recommendation, setRecommendation] = useState<RealityCheckDTO['recommendations'][number] | null>(null);
  const [replan, setReplan] = useState<ReplanOptionsDTO | null>(null);
  const [optionId, setOptionId] = useState('');
  const [confirmApply, setConfirmApply] = useState(false);
  const [applying, setApplying] = useState(false);

  async function load() { setLoading(true); setError(null); try { setResult(await operationsService.realityCheck()); } catch (cause) { setError(errorText(cause)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  const deviations = (result?.deviations ?? []).filter((deviation) => includeResolved || !deviation.resolvedAt);
  const selectedOption = replan?.options.find((item) => item.id === optionId);

  async function createReplan(item: RealityCheckDTO['recommendations'][number]) {
    if (!result) return;
    const deviation = result.deviations.find((row) => row.id === item.deviationId);
    if (!deviation) return;
    setRecommendation(item); setError(null);
    try {
      const options = await operationsService.generateReplan(item.description, { id: deviation.entityId, title: deviation.title, type: deviation.entityType === 'PROJECT' ? 'GOAL' : deviation.entityType === 'TIME_BLOCK' ? 'TASK' : deviation.entityType }, TRIGGER_BY_DEVIATION[deviation.type]);
      setReplan(options); setOptionId(options.recommendedOptionId ?? options.options[0]?.id ?? '');
    } catch (cause) { setError(errorText(cause)); }
  }

  async function applyReplan() {
    if (!selectedOption || !recommendation || !replan) return;
    setApplying(true);
    try { await operationsService.executeReplan(replan, selectedOption.id); if (USE_MOCK) await operationsService.updateRecommendation(recommendation.id, 'ACCEPTED'); setConfirmApply(false); setReplan(null); setRecommendation(null); await load(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setApplying(false); }
  }

  return <WorkFrame title="Reality & Replanning" icon={<GitBranch />} action={<Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="size-3.5" />Run check</Button>}>
    <div className="grid grid-cols-2 border-b border-border pb-4 sm:grid-cols-4">{[['Deviations', result?.summary.totalDeviations], ['High impact', result?.summary.highCount], ['Critical', result?.summary.criticalCount], ['Actions to review', result?.summary.actionableRecommendations]].map(([label, value]) => <div key={String(label)}><p className="text-2xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : value}</p></div>)}</div>
    {error && <ErrorLine message={error} retry={() => void load()} />}
    <div className="flex items-center justify-between gap-3 border-b border-border py-3"><div><h2 className="text-sm font-semibold">Detected deviations</h2><p className="mt-1 text-2xs text-muted-foreground">Findings are compared against the plan; proposed changes always wait for review.</p></div><label className="flex items-center gap-2 text-2xs text-muted-foreground"><input type="checkbox" checked={includeResolved} onChange={(event) => setIncludeResolved(event.target.checked)} className="size-3.5 accent-primary" />Include resolved</label></div>
    {loading ? <LoadRows /> : deviations.length === 0 ? <div className="grid min-h-56 place-items-center text-center"><div><CheckCircle2 className="mx-auto size-5 text-status-success" /><h3 className="mt-2 text-sm font-medium">Nothing needs attention</h3><p className="mt-1 text-xs text-muted-foreground">No unresolved deviations were found for this check.</p></div></div> : <ul className="divide-y divide-border">{deviations.map((deviation) => {
      const analysis = result?.impactAnalyses.find((item) => item.deviationId === deviation.id);
      const recs = result?.recommendations.filter((item) => item.deviationId === deviation.id && item.status === 'PENDING') ?? [];
      return <li key={deviation.id} className="py-4"><div className="flex flex-wrap items-start gap-3"><div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-border bg-card"><AlertTriangle className="size-3.5 text-muted-foreground" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-semibold">{deviation.title}</h3><StatusBadge tone={deviationTone(deviation.severity)}>{deviation.severity}</StatusBadge>{deviation.resolvedAt && <StatusBadge tone="success">Resolved</StatusBadge>}</div><p className="mt-1 text-xs text-muted-foreground">{deviation.description}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground"><span>{deviation.type.replace(/_/g, ' ')}</span><span>Plan {deviation.plannedValue} {deviation.unit.toLowerCase()} · actual {deviation.actualValue} {deviation.unit.toLowerCase()}</span><span>Impact {analysis?.overallImpactLevel.toLowerCase() ?? 'unknown'} · {Math.round((analysis?.confidence ?? 0) * 100)}% confidence</span></div>{!USE_MOCK && <p className="mt-2 text-2xs text-muted-foreground">Acknowledging or resolving here persists to the deviation state the next reality check reads.</p>}<div className="mt-3 flex flex-wrap gap-2">{recs.map((item) => <Button key={item.id} size="sm" variant="outline" onClick={() => void createReplan(item)}><ArrowRight className="size-3.5" />{item.title}</Button>)}<Button size="sm" variant="ghost" onClick={() => void operationsService.updateDeviation(deviation.id, 'acknowledge').then(load)}>{deviation.acknowledgedAt ? 'Seen' : 'Acknowledge'}</Button>{!deviation.resolvedAt && <Button size="sm" variant="ghost" onClick={() => void operationsService.updateDeviation(deviation.id, 'resolve').then(load)}>Resolve</Button>}</div></div></div></li>;
    })}</ul>}
    <section className="mt-6 border-t border-border pt-4"><div className="flex items-center gap-2"><ArrowDown className="size-3.5 text-muted-foreground" /><h2 className="text-xs font-semibold">Schedule drift</h2></div><p className="mt-2 text-xs text-muted-foreground">This week, 3 of 5 planned focus blocks were completed. Two missed blocks are reflected in the deviations above.</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-3/5 rounded-full bg-primary" /></div></section>

    <Dialog open={Boolean(replan)} onOpenChange={(open) => { if (!open) { setReplan(null); setRecommendation(null); } }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Review re-plan options</DialogTitle><DialogDescription>{replan?.reason} Select an option; nothing moves until you confirm.</DialogDescription></DialogHeader>
      {replan && <div className="space-y-2">{replan.options.map((option) => <button type="button" key={option.id} onClick={() => setOptionId(option.id)} aria-pressed={option.id === optionId} className={cn('w-full rounded-md border p-3 text-left transition-colors', option.id === optionId ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50')}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">{option.label}</span><span className="text-2xs text-muted-foreground">{Math.round(option.confidence * 100)}% confidence · {option.estimatedEffortMinutes} min effort</span></div><p className="mt-1 text-xs text-muted-foreground">{option.description}</p><div className="mt-2 flex flex-wrap gap-2">{option.tradeoffs.map((tradeoff) => <span key={tradeoff.description} className={cn('text-2xs', tradeoff.impact === 'POSITIVE' ? 'text-status-success' : tradeoff.impact === 'NEGATIVE' ? 'text-status-warning' : 'text-muted-foreground')}>{tradeoff.impact === 'POSITIVE' ? '+' : tradeoff.impact === 'NEGATIVE' ? '−' : '·'} {tradeoff.description}</span>)}</div></button>)}</div>}
      <DialogFooter><Button variant="outline" onClick={() => { setReplan(null); setRecommendation(null); }}>Back to findings</Button><Button disabled={!selectedOption} onClick={() => setConfirmApply(true)}><Check className="size-3.5" />Review confirmation</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={confirmApply} onOpenChange={setConfirmApply}><DialogContent><DialogHeader><DialogTitle>Confirm selected changes</DialogTitle><DialogDescription>{selectedOption?.label}: {selectedOption?.description} Review the changes before executing this re-plan.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmApply(false)}>Keep reviewing</Button><Button disabled={applying} onClick={() => void applyReplan()}>{applying ? 'Applying…' : 'Confirm re-plan'}</Button></DialogFooter></DialogContent></Dialog>
  </WorkFrame>;
}

const MEMORY_TYPES: MemoryType[] = ['EXPLICIT_PREFERENCE', 'EXPLICIT_FACT', 'USER_RULE', 'LEARNED_PATTERN', 'TEMPORARY_CONTEXT'];
const MEMORY_SCOPES: MemoryScope[] = ['GLOBAL', 'SCHEDULING', 'TASKS', 'MEETINGS', 'FOCUS_TIME', 'BREAKS', 'TRAVEL', 'WORK_HOURS', 'PERSONAL'];
function displayEnum(value: string) { return value.toLowerCase().replace(/_/g, ' '); }

export function MemoryPage() {
  const [memories, setMemories] = useState<MemoryEntryDTO[]>([]);
  const [conflicts, setConflicts] = useState<MemoryConflictDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<MemoryEntryDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() { setLoading(true); setError(null); try { const [items, detected] = await Promise.all([knowledgeService.listMemories(), knowledgeService.listMemoryConflicts()]); setMemories(items); setConflicts(detected); } catch (cause) { setError(errorText(cause)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  const visible = memories.filter((item) => (typeFilter === 'ALL' || item.type === typeFilter) && `${item.content} ${item.description ?? ''} ${item.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); const form = new FormData(event.currentTarget);
    const data = { content: String(form.get('content') ?? '').trim(), description: String(form.get('description') ?? '').trim() || undefined, confidence: Number(form.get('confidence') ?? 1), tags: String(form.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean) };
    try {
      if (editing) await knowledgeService.updateMemory(editing.id, { ...data, scope: String(form.get('scope')) as MemoryScope });
      else await knowledgeService.createMemory({ ...data, type: String(form.get('type')) as MemoryType, source: 'USER_INPUT', scope: String(form.get('scope')) as MemoryScope, isUserEditable: true });
      setFormOpen(false); setEditing(null); await load();
    } catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }

  async function resolve(conflict: MemoryConflictDTO, resolution: NonNullable<MemoryConflictDTO['resolution']>) { await knowledgeService.resolveMemoryConflict(conflict.id, resolution); await load(); }
  async function remove(memory: MemoryEntryDTO) { if (!window.confirm(`Archive “${memory.content}”?`)) return; await knowledgeService.deleteMemory(memory.id); await load(); }

  return <WorkFrame title="Memory Center" icon={<Sparkles />} action={<Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-3.5" />Add memory</Button>}>
    <div className="grid grid-cols-3 border-b border-border pb-4"><div><p className="text-2xs text-muted-foreground">Active</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : memories.filter((item) => item.status === 'ACTIVE').length}</p></div><div><p className="text-2xs text-muted-foreground">Needs confirmation</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : memories.filter((item) => !item.isConfirmed).length}</p></div><div><p className="text-2xs text-muted-foreground">Open conflicts</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : conflicts.length}</p></div></div>
    <div className="flex flex-col gap-2 border-b border-border py-3 sm:flex-row"><Select aria-label="Filter memories by type" className="sm:max-w-56" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">All types</option>{MEMORY_TYPES.map((type) => <option key={type} value={type}>{displayEnum(type)}</option>)}</Select><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memories or tags" aria-label="Search memories" /></div>
    {error && <ErrorLine message={error} retry={() => void load()} />}
    {loading ? <LoadRows /> : visible.length === 0 ? <div className="grid min-h-52 place-items-center text-center"><div><h2 className="text-sm font-medium">No memories match</h2><p className="mt-1 text-xs text-muted-foreground">Change the filter or add a memory.</p><Button size="sm" className="mt-3" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-3.5" />Add memory</Button></div></div> : <ul className="divide-y divide-border">{visible.map((memory) => <li key={memory.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-medium">{memory.content}</h3><StatusBadge tone={memory.isConfirmed ? 'success' : 'ai'}>{memory.isConfirmed ? 'Confirmed' : 'Inferred'}</StatusBadge><StatusBadge>{displayEnum(memory.type)}</StatusBadge></div>{memory.description && <p className="mt-1 text-xs text-muted-foreground">{memory.description}</p>}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground"><span>{displayEnum(memory.scope)}</span><span>{Math.round(memory.confidence * 100)}% confidence</span>{memory.tags.map((tag) => <span key={tag}>#{tag}</span>)}{memory.expiresAt && <span>Expires {shortDate(memory.expiresAt)}</span>}</div></div><div className="flex shrink-0 gap-1">{!memory.isConfirmed && <Button size="sm" variant="outline" onClick={() => void knowledgeService.updateMemory(memory.id, { isConfirmed: true, status: 'ACTIVE' }).then(load)}><Check className="size-3.5" />Confirm</Button>}<Button size="sm" variant="ghost" onClick={() => { setEditing(memory); setFormOpen(true); }}>Edit</Button><Button size="icon-sm" variant="ghost" aria-label="Archive memory" onClick={() => void remove(memory)}><Trash2 className="size-3.5" /></Button></div></li>)}</ul>}
    {conflicts.length > 0 && <section className="mt-6 border-t border-border pt-4"><div className="flex items-center justify-between"><h2 className="text-xs font-semibold">Conflicts to resolve</h2><StatusBadge tone="warning">{conflicts.length}</StatusBadge></div><ul className="mt-2 divide-y divide-border">{conflicts.map((conflict) => <li key={conflict.id} className="py-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-medium">{displayEnum(conflict.type)} · {conflict.severity.toLowerCase()}</p><p className="mt-1 max-w-2xl text-xs text-muted-foreground">{conflict.description}</p></div><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => void resolve(conflict, 'KEEP_FIRST')}>Keep first</Button><Button size="sm" variant="outline" onClick={() => void resolve(conflict, 'KEEP_SECOND')}>Keep second</Button><Button size="sm" variant="ghost" onClick={() => void resolve(conflict, 'MERGE')}>Merge</Button></div></div></li>)}</ul></section>}
    <Dialog open={formOpen} onOpenChange={(open) => { if (!open && !saving) setFormOpen(false); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Edit memory' : 'Add memory'}</DialogTitle><DialogDescription>Inferences remain unconfirmed until you review them.</DialogDescription></DialogHeader><form onSubmit={(event) => void save(event)} className="space-y-4"><Field label="Memory" htmlFor="memory-content"><Textarea id="memory-content" name="content" required maxLength={2000} rows={3} defaultValue={editing?.content ?? ''} autoFocus /></Field><Field label="Description" htmlFor="memory-description"><Input id="memory-description" name="description" maxLength={500} defaultValue={editing?.description ?? ''} /></Field><div className="grid grid-cols-2 gap-3">{!editing && <Field label="Type" htmlFor="memory-type"><Select id="memory-type" name="type" defaultValue="EXPLICIT_PREFERENCE">{MEMORY_TYPES.map((type) => <option key={type} value={type}>{displayEnum(type)}</option>)}</Select></Field>}<Field label="Scope" htmlFor="memory-scope"><Select id="memory-scope" name="scope" defaultValue={editing?.scope ?? 'GLOBAL'}>{MEMORY_SCOPES.map((scope) => <option key={scope} value={scope}>{displayEnum(scope)}</option>)}</Select></Field></div><Field label="Confidence" htmlFor="memory-confidence"><div className="flex items-center gap-3"><input id="memory-confidence" name="confidence" type="range" min="0" max="1" step="0.01" defaultValue={editing?.confidence ?? 1} className="w-full accent-primary" /><span className="w-10 text-right text-2xs tabular-nums">{Math.round((editing?.confidence ?? 1) * 100)}%</span></div></Field><Field label="Tags" htmlFor="memory-tags" hint="Separate tags with commas"><Input id="memory-tags" name="tags" defaultValue={editing?.tags.join(', ') ?? ''} /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save memory'}</Button></DialogFooter></form></DialogContent></Dialog>
  </WorkFrame>;
}

const RULE_RESOLUTIONS: NonNullable<RuleConflictDTO['resolution']>[] = ['DISABLE_FIRST', 'DISABLE_SECOND', 'ADJUST_PRIORITY', 'MERGE', 'MANUAL', 'KEEP_BOTH'];

export function RulesPage() {
  const [rules, setRules] = useState<RuleDTO[]>([]);
  const [conflicts, setConflicts] = useState<RuleConflictDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<RulePreviewDTO | null>(null);

  async function load() { setLoading(true); setError(null); try { const [items, detected] = await Promise.all([knowledgeService.listRules(), knowledgeService.listRuleConflicts()]); setRules(items); setConflicts(detected); } catch (cause) { setError(errorText(cause)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);

  async function previewRule() { setPreviewing(true); setError(null); try { setPreview(await knowledgeService.previewRule(text)); } catch (cause) { setError(errorText(cause)); } finally { setPreviewing(false); } }
  async function saveRule() { if (!preview) return; setSaving(true); setError(null); try { await knowledgeService.savePreviewRule(preview); setText(''); setPreview(null); await load(); } catch (cause) { setError(errorText(cause)); } finally { setSaving(false); } }

  return <WorkFrame title="Rules" icon={<FileClock />}>
    <section className="border-b border-border pb-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Describe a scheduling rule</h2><p className="mt-1 text-xs text-muted-foreground">Review the interpretation before adding it to your rule set.</p></div><StatusBadge tone="ai">Natural language</StatusBadge></div><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start"><Textarea rows={2} maxLength={1000} value={text} onChange={(event) => { setText(event.target.value); setPreview(null); }} placeholder="Never schedule meetings before 10 AM" aria-label="Describe a rule" className="flex-1" /><Button onClick={() => void previewRule()} disabled={previewing || !text.trim()}>{previewing ? 'Interpreting…' : 'Preview'}</Button></div>{error && <ErrorLine message={error} retry={() => void previewRule()} />}
      {preview && <div className="mt-3 border border-ai/30 bg-ai-soft/30 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold">{preview.name}</p><p className="mt-1 text-2xs text-muted-foreground">{displayEnum(preview.type)} · {displayEnum(preview.scope)} · {preview.action}</p></div><StatusBadge tone="ai">{Math.round(preview.confidence * 100)}% confidence</StatusBadge></div><div className="mt-2 flex flex-wrap items-center gap-2 text-2xs"><span className="rounded-sm bg-muted px-2 py-1">{preview.conditions.map((condition) => `${condition.field} ${condition.operator} ${String(condition.value)}`).join(' AND ')}</span><span className="text-muted-foreground">Triggers: {preview.triggers.map(displayEnum).join(', ')}</span></div><div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setPreview(null)}>Revise</Button><Button size="sm" onClick={() => void saveRule()} disabled={saving}>{saving ? 'Saving…' : 'Save rule'}</Button></div></div>}
    </section>
    <section className="border-b border-border py-4"><div className="flex items-center justify-between"><div><h2 className="text-xs font-semibold">Your rules</h2><p className="mt-1 text-2xs text-muted-foreground">Enabled rules apply to their listed scheduling triggers.</p></div><span className="text-2xs text-muted-foreground">{loading ? '—' : rules.length} total</span></div>{loading ? <LoadRows /> : rules.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">No rules yet. Add one above.</p> : <ul className="mt-2 divide-y divide-border">{rules.map((rule) => <li key={rule.id} className="flex flex-wrap items-center gap-3 py-3"><button type="button" role="switch" aria-checked={rule.enabled} aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`} onClick={() => void knowledgeService.toggleRule(rule.id, !rule.enabled).then(load)} className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', rule.enabled ? 'bg-primary' : 'bg-muted')}><span className={cn('absolute top-0.5 size-3 rounded-full bg-background transition-transform', rule.enabled ? 'translate-x-3.5' : 'translate-x-0.5')} /></button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={cn('text-xs font-medium', !rule.enabled && 'text-muted-foreground')}>{rule.name}</h3><StatusBadge>{displayEnum(rule.type)}</StatusBadge></div><p className="mt-1 text-2xs text-muted-foreground">{rule.conditions.map((condition) => `${condition.field} ${condition.operator} ${String(condition.value)}`).join(' · ')} · {rule.action} · priority {rule.priority}</p><p className="mt-1 truncate text-2xs text-subtle-foreground">{rule.naturalLanguageText}</p></div><Button size="sm" variant="ghost" onClick={() => void knowledgeService.deleteRule(rule.id).then(load)} aria-label={`Delete ${rule.name}`}><Trash2 className="size-3.5" /></Button></li>)}</ul>}</section>
    {conflicts.length > 0 && <section className="pt-4"><div className="flex items-center gap-2"><GitBranch className="size-3.5 text-muted-foreground" /><h2 className="text-xs font-semibold">Rule conflicts</h2><StatusBadge tone="warning">{conflicts.length}</StatusBadge></div><ul className="mt-2 divide-y divide-border">{conflicts.map((conflict) => <li key={conflict.id} className="py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium">{conflict.rule1Name} <span className="text-muted-foreground">↔</span> {conflict.rule2Name}</p><p className="mt-1 text-xs text-muted-foreground">{conflict.description}</p><p className="mt-1 text-2xs text-muted-foreground">{displayEnum(conflict.conflictType)} · {conflict.severity.toLowerCase()}</p></div><Select aria-label={`Resolve conflict between ${conflict.rule1Name} and ${conflict.rule2Name}`} className="w-44" defaultValue="" onChange={(event) => { if (event.target.value) void knowledgeService.resolveRuleConflict(conflict.id, event.target.value as NonNullable<RuleConflictDTO['resolution']>).then(load); }}><option value="" disabled>Resolve…</option>{RULE_RESOLUTIONS.map((resolution) => <option key={resolution} value={resolution}>{displayEnum(resolution)}</option>)}</Select></div></li>)}</ul></section>}
  </WorkFrame>;
}

const PRIORITIES: ProactivePreferencesDTO['minPriority'][] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
function interventionTone(priority: InterventionDTO['priority']): 'neutral' | 'warning' | 'danger' { return priority === 'URGENT' ? 'danger' : priority === 'HIGH' ? 'warning' : 'neutral'; }

export function ProactivePage() {
  const [items, setItems] = useState<InterventionDTO[]>([]);
  const [preferences, setPreferences] = useState<ProactivePreferencesDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [snoozeMinutes, setSnoozeMinutes] = useState(30);

  async function load() { setLoading(true); setError(null); try { const [rows, prefs] = await Promise.all([knowledgeService.listInterventions(), knowledgeService.proactivePreferences()]); setItems(rows); setPreferences(prefs); if (prefs) setSnoozeMinutes(prefs.snoozeDurationMinutes); else setError('Proactive preferences could not be loaded; those controls are unavailable until the next refresh.'); } catch (cause) { setError(errorText(cause)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  const visible = items.filter((item) => priorityFilter === 'ALL' || item.priority === priorityFilter);
  async function runCheck() { setChecking(true); setError(null); try { setItems(await knowledgeService.runProactiveCheck()); } catch (cause) { setError(errorText(cause)); } finally { setChecking(false); } }
  async function savePreferences(patch: Partial<ProactivePreferencesDTO>) { try { setPreferences(await knowledgeService.updateProactivePreferences(patch)); } catch (cause) { setError(errorText(cause)); } }
  async function refresh() { setItems(await knowledgeService.listInterventions()); }

  return <WorkFrame title="Proactive" icon={<Sparkles />} action={<Button size="sm" onClick={() => void runCheck()} disabled={checking}><RefreshCw className={cn('size-3.5', checking && 'animate-spin')} />{checking ? 'Checking…' : 'Run check'}</Button>}>
    <div className="grid grid-cols-3 border-b border-border pb-4"><div><p className="text-2xs text-muted-foreground">Active</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : items.filter((item) => item.status === 'ACTIVE').length}</p></div><div><p className="text-2xs text-muted-foreground">Urgent / high</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : items.filter((item) => ['URGENT', 'HIGH'].includes(item.priority) && item.status === 'ACTIVE').length}</p></div><div><p className="text-2xs text-muted-foreground">Acknowledged</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : items.filter((item) => item.status === 'ACKNOWLEDGED').length}</p></div></div>
    {error && <ErrorLine message={error} retry={() => void load()} />}
    <section className="flex flex-col gap-3 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Interventions</h2><p className="mt-1 text-2xs text-muted-foreground">Ranked by priority and confidence.</p></div><Select aria-label="Filter by intervention priority" className="sm:max-w-44" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="ALL">All priorities</option>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</Select></section>
    {loading ? <LoadRows /> : visible.length === 0 ? <div className="grid min-h-52 place-items-center text-center"><div><CheckCircle2 className="mx-auto size-5 text-status-success" /><h3 className="mt-2 text-sm font-medium">No interventions in this view</h3><p className="mt-1 text-xs text-muted-foreground">Run a check to review the latest schedule signals.</p><Button size="sm" className="mt-3" onClick={() => void runCheck()}>Run proactive check</Button></div></div> : <ul className="divide-y divide-border">{visible.map((item) => <li key={item.id} className="py-4"><div className="flex flex-wrap items-start gap-3"><div className={cn('mt-1 size-2 shrink-0 rounded-full', item.priority === 'URGENT' ? 'bg-status-critical' : item.priority === 'HIGH' ? 'bg-status-warning' : 'bg-primary')} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-semibold">{item.title}</h3><StatusBadge tone={interventionTone(item.priority)}>{item.priority}</StatusBadge>{item.status === 'ACKNOWLEDGED' && <StatusBadge tone="success">Seen</StatusBadge>}</div><p className="mt-1 text-xs text-muted-foreground">{item.description}</p><p className="mt-1 text-2xs text-subtle-foreground">Why: {item.reason}</p><div className="mt-2 flex flex-wrap gap-2">{item.affectedEntities.map((entity) => <span key={`${entity.type}-${entity.id}`} className="rounded-sm border border-border px-2 py-1 text-2xs text-muted-foreground">{entity.type.toLowerCase()} · {entity.title}</span>)}</div>{!USE_MOCK && <p className="mt-2 text-2xs text-muted-foreground">Acknowledge, snooze, and dismissal persist to intervention state and survive reloads.</p>}<div className="mt-3 flex flex-wrap items-center gap-2">{item.status === 'ACTIVE' && <Button size="sm" variant="outline" onClick={() => void knowledgeService.acknowledgeIntervention(item.id).then(refresh)}><Check className="size-3.5" />Acknowledge</Button>}<Select aria-label={`Snooze ${item.title}`} className="w-32" value={String(snoozeMinutes)} onChange={(event) => setSnoozeMinutes(Number(event.target.value))}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="240">4 hours</option></Select><Button size="sm" variant="ghost" onClick={() => void knowledgeService.snoozeIntervention(item.id, snoozeMinutes).then(refresh)}><Clock3 className="size-3.5" />Snooze</Button><Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void knowledgeService.dismissIntervention(item.id).then(refresh)}>Dismiss</Button></div></div></div></li>)}</ul>}
    <section className="mt-6 border-t border-border pt-4"><h2 className="text-xs font-semibold">Delivery & quiet hours</h2>{preferences && <div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="flex items-center justify-between gap-3 text-xs"><span><span className="block font-medium">Proactive checks</span><span className="text-2xs text-muted-foreground">Master setting for generated interventions.</span></span><input type="checkbox" checked={preferences.enabled} onChange={(event) => void savePreferences({ enabled: event.target.checked })} className="size-4 accent-primary" /></label><Field label="Check interval" htmlFor="check-interval"><Select id="check-interval" value={String(preferences.checkIntervalMinutes)} onChange={(event) => void savePreferences({ checkIntervalMinutes: Number(event.target.value) })}><option value="30">Every 30 minutes</option><option value="60">Every hour</option><option value="180">Every 3 hours</option><option value="720">Twice a day</option></Select></Field><Field label="Minimum priority" htmlFor="minimum-priority"><Select id="minimum-priority" value={preferences.minPriority} onChange={(event) => void savePreferences({ minPriority: event.target.value as ProactivePreferencesDTO['minPriority'] })}>{PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field><Field label="Snooze default" htmlFor="snooze-default"><Select id="snooze-default" value={String(preferences.snoozeDurationMinutes)} onChange={(event) => void savePreferences({ snoozeDurationMinutes: Number(event.target.value) })}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="240">4 hours</option></Select></Field><label className="flex items-center justify-between gap-3 text-xs"><span><span className="block font-medium">Group similar</span><span className="text-2xs text-muted-foreground">Combine repeated interventions in one check.</span></span><input type="checkbox" checked={preferences.groupSimilar} onChange={(event) => void savePreferences({ groupSimilar: event.target.checked })} className="size-4 accent-primary" /></label></div>}</section>
  </WorkFrame>;
}

const AUTONOMY_DESCRIPTIONS: Record<PermissionPolicyDTO['autonomyLevel'], string> = { OBSERVE: 'Read-only. The assistant observes and reports.', SUGGEST: 'Actions are suggested and require your confirmation.', ASK_BEFORE_ACTION: 'Low-risk actions may run; medium and high risk require review.', AUTO_EXECUTE_LOW_RISK: 'Routine low-risk actions may run within policy boundaries.', DELEGATED_AUTHORITY: 'Broad autonomy within the scopes and limits configured here.' };

export function PermissionsPage() {
  const [templates, setTemplates] = useState<PermissionTemplateDTO[]>([]);
  const [policies, setPolicies] = useState<PermissionPolicyDTO[]>([]);
  const [permissions, setPermissions] = useState<UserPermissionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateToApply, setTemplateToApply] = useState<PermissionTemplateDTO | null>(null);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const active = policies.find((policy) => policy.isActive) ?? policies[0];

  async function load() { setLoading(true); setError(null); try { const [available, current, explicit] = await Promise.all([knowledgeService.templates(), knowledgeService.policies(), knowledgeService.permissions()]); setTemplates(available); setPolicies(current); setPermissions(explicit); } catch (cause) { setError(errorText(cause)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  async function applyTemplate(template: PermissionTemplateDTO) { setApplying(true); setError(null); try { await knowledgeService.applyTemplate(template.id); setTemplateToApply(null); await load(); } catch (cause) { setError(errorText(cause)); } finally { setApplying(false); } }
  async function updatePolicy(patch: Partial<Omit<PermissionPolicyDTO, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) { if (!active) return; setSaving(true); try { const updated = await knowledgeService.updatePolicy(active.id, patch); setPolicies((items) => items.map((item) => item.id === updated.id ? updated : item)); } catch (cause) { setError(errorText(cause)); } finally { setSaving(false); } }

  return <WorkFrame title="Permissions & Autonomy" icon={<CheckCircle2 />}>
    {error && <ErrorLine message={error} retry={() => void load()} />}
    <section className="border-b border-border pb-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Autonomy profile</h2><p className="mt-1 text-xs text-muted-foreground">Choose how much the assistant may do without asking.</p></div>{active && <StatusBadge tone={active.isActive ? 'success' : 'neutral'}>{active.isActive ? 'Active' : 'Inactive'}</StatusBadge>}</div>
      {loading ? <LoadRows /> : <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{templates.map((template) => <button type="button" key={template.id} onClick={() => template.autonomyLevel === 'DELEGATED_AUTHORITY' ? setTemplateToApply(template) : void applyTemplate(template)} disabled={applying} className={cn('rounded-md border p-3 text-left transition-colors hover:border-border-strong hover:bg-accent/40', active?.autonomyLevel === template.autonomyLevel && 'border-primary bg-primary/5')}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{template.name}</span>{active?.autonomyLevel === template.autonomyLevel && <Check className="size-3.5 text-primary" />}</div><p className="mt-1 text-2xs text-muted-foreground">{template.description}</p><p className="mt-2 text-2xs font-medium text-subtle-foreground">{displayEnum(template.autonomyLevel)}</p></button>)}</div>}
    </section>
    {active && <section className="grid gap-5 border-b border-border py-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div><div className="flex items-center justify-between gap-3"><div><h2 className="text-xs font-semibold">Active policy boundaries</h2><p className="mt-1 text-2xs text-muted-foreground">{AUTONOMY_DESCRIPTIONS[active.autonomyLevel]}</p></div><label className="flex items-center gap-2 text-2xs"><span>Enabled</span><input type="checkbox" checked={active.isActive} onChange={(event) => void updatePolicy({ isActive: event.target.checked })} className="size-4 accent-primary" /></label></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Risk threshold" htmlFor="risk-threshold"><Select id="risk-threshold" value={active.riskThreshold} onChange={(event) => void updatePolicy({ riskThreshold: event.target.value as PermissionPolicyDTO['riskThreshold'] })}>{(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field><div className="text-xs"><p className="font-medium">Enabled scopes</p><p className="mt-1 text-2xs text-muted-foreground">{active.enabledScopes.map(displayEnum).join(' · ') || 'No scopes enabled'}</p></div></div>
        <div className="mt-4 border-t border-border pt-3"><p className="text-xs font-medium">Ask before these actions</p><div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">{active.allowedActions.map((action) => <label key={action} className="flex items-center gap-2 text-2xs"><input type="checkbox" checked={active.requireConfirmationFor.includes(action)} onChange={(event) => { const next = event.target.checked ? [...active.requireConfirmationFor, action] : active.requireConfirmationFor.filter((value) => value !== action); void updatePolicy({ requireConfirmationFor: next }); }} className="size-3.5 accent-primary" />{displayEnum(action)}</label>)}</div></div>
      </div>
      <aside className="border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"><h3 className="text-xs font-semibold">Protected entities</h3>{active.protectedEntities.length ? <ul className="mt-2 space-y-2">{active.protectedEntities.map((item) => <li key={item.id} className="text-2xs"><span className="font-medium">{item.type.toLowerCase()}</span><span className="text-muted-foreground"> · {item.reason}</span></li>)}</ul> : <p className="mt-2 text-2xs text-muted-foreground">No entities are protected by this policy.</p>}<div className="mt-4 border-t border-border pt-3"><p className="text-2xs font-medium">Quiet restriction</p><p className="mt-1 text-2xs text-muted-foreground">{active.timeRestrictions.map((item) => `${item.startTime}–${item.endTime}`).join(', ') || 'No restricted hours'}</p>{active.maxActionsPerPeriod && <p className="mt-2 text-2xs text-muted-foreground">Limit: {active.maxActionsPerPeriod.count} actions per {active.maxActionsPerPeriod.periodMinutes} minutes</p>}</div></aside>
    </section>}
    <section className="pt-4"><div className="flex items-center justify-between"><div><h2 className="text-xs font-semibold">Explicit permissions</h2><p className="mt-1 text-2xs text-muted-foreground">Template grants and denials currently active.</p></div><span className="text-2xs text-muted-foreground">{permissions.length} active</span></div>{loading ? <LoadRows /> : permissions.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">No explicit permissions have been granted.</p> : <ul className="mt-2 divide-y divide-border">{permissions.map((permission) => <li key={permission.id} className="flex items-center gap-2 py-2.5 text-2xs"><span className="min-w-0 flex-1 truncate font-medium">{displayEnum(permission.action)}</span><span className="text-muted-foreground">{displayEnum(permission.scope)}</span><StatusBadge tone={permission.decision === 'ALLOW' ? 'success' : 'danger'}>{permission.decision}</StatusBadge><span className="text-subtle-foreground">{permission.grantedBy}</span></li>)}</ul>}</section>
    <Dialog open={Boolean(templateToApply)} onOpenChange={(open) => { if (!open) setTemplateToApply(null); }}><DialogContent><DialogHeader><DialogTitle>Enable full delegation?</DialogTitle><DialogDescription>{templateToApply?.description} This grants broad autonomy across calendar, task, notification, and integration actions. You can change the policy afterward.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setTemplateToApply(null)}>Cancel</Button><Button variant="destructive" disabled={applying} onClick={() => templateToApply && void applyTemplate(templateToApply)}>{applying ? 'Applying…' : 'Enable Delegate'}</Button></DialogFooter></DialogContent></Dialog>
    {saving && <p className="sr-only" role="status">Saving policy</p>}
  </WorkFrame>;
}

const PROVIDERS: Array<{ provider: CalendarProvider; name: string; description: string }> = [
  { provider: 'GOOGLE', name: 'Google Calendar', description: 'Google account calendars and events.' },
  { provider: 'OUTLOOK', name: 'Outlook Calendar', description: 'Microsoft calendar and event sync.' },
  { provider: 'LOCAL', name: 'Local calendar', description: 'Private calendar stored in this workspace.' },
];

export function IntegrationsPage() {
  const [connections, setConnections] = useState<Awaited<ReturnType<typeof integrationsService.connections>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<CalendarProvider | null>(null);
  const [syncing, setSyncing] = useState<CalendarProvider | null>(null);
  const [activeTab, setActiveTab] = useState<'accounts' | 'travel'>('accounts');
  const [notice, setNotice] = useState<string | null>(null);
  const [travelBusy, setTravelBusy] = useState(false);
  const [travelError, setTravelError] = useState<string | null>(null);
  const [travelResult, setTravelResult] = useState<Awaited<ReturnType<typeof integrationsService.estimateTravel>> | null>(null);

  async function load() { setLoading(true); setError(null); try { setConnections(await integrationsService.connections()); } catch (cause) { setError(errorText(cause)); } finally { setLoading(false); } }
  // The OAuth callback redirects back here with ?connected=<provider> or
  // ?error=<reason>, so surface that outcome and strip it from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedProvider = params.get('connected');
    const callbackError = params.get('error');
    if (connectedProvider || callbackError) {
      if (connectedProvider) {
        setNotice(`${connectedProvider.toUpperCase()} calendar connected.`);
      }
      if (callbackError) {
        setError(callbackError);
      }
      window.history.replaceState({}, '', '/integrations');
    }
    void load();
  }, []);
  async function connect(provider: CalendarProvider) {
    if (provider === 'LOCAL' || provider === 'APPLE') return;
    setConnecting(provider);
    setError(null);
    try {
      // Live mode returns null because the browser is handed to the provider.
      const result = await integrationsService.connect(provider);
      if (result) setNotice(`${provider === 'GOOGLE' ? 'Google' : 'Outlook'} connected in this mock workspace.`);
      else setNotice(`Redirecting to ${provider === 'GOOGLE' ? 'Google' : 'Outlook'} to finish connecting...`);
      await load();
    } catch (cause) { setError(errorText(cause)); } finally { setConnecting(null); }
  }
  async function disconnect(provider: CalendarProvider) { if (provider === 'LOCAL') return; try { await integrationsService.disconnect(provider); await load(); setNotice(`${provider} disconnected.`); } catch (cause) { setError(errorText(cause)); } }
  async function sync(provider: CalendarProvider) { setSyncing(provider); setError(null); try { const result = await integrationsService.sync(provider); await load(); setNotice(`${result.calendarsSynced} calendars checked · ${result.eventsSynced} events synced.`); } catch (cause) { setError(errorText(cause)); } finally { setSyncing(null); } }

  async function estimate(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setTravelBusy(true); setTravelError(null); const form = new FormData(event.currentTarget); try { setTravelResult(await integrationsService.estimateTravel({ origin: { address: String(form.get('origin') ?? '') }, destination: { address: String(form.get('destination') ?? '') }, mode: String(form.get('mode')) as 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT' | 'FLIGHT', departureTime: String(form.get('departure') ?? '') ? isoDate(String(form.get('departure'))) : undefined, avoidTolls: form.get('tolls') === 'on', avoidHighways: form.get('highways') === 'on', avoidFerries: form.get('ferries') === 'on' })); } catch (cause) { setTravelError(errorText(cause)); } finally { setTravelBusy(false); } }

  return <WorkFrame title="Integrations" icon={<GitBranch />}>
    <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Integration settings">{([{ id: 'accounts', label: 'Calendar accounts' }, { id: 'travel', label: 'Travel time' }] as const).map((tab) => <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={cn('h-9 border-b-2 px-3 text-xs font-medium', activeTab === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground')}>{tab.label}</button>)}</div>
    {error && <ErrorLine message={error} retry={() => void load()} />}
    {notice && <div role="status" className="flex items-center justify-between border-b border-border py-2 text-xs text-muted-foreground">{notice}<button type="button" className="text-foreground" onClick={() => setNotice(null)}>Dismiss</button></div>}
    {activeTab === 'accounts' ? <section aria-label="Calendar connections">
      <div className="flex items-center justify-between border-b border-border py-3"><div><h2 className="text-sm font-semibold">Connected calendars</h2><p className="mt-1 text-2xs text-muted-foreground">Connection and sync status for each provider.</p></div><StatusBadge tone={USE_MOCK ? 'ai' : 'success'}>{USE_MOCK ? 'Mock workspace' : 'Live OAuth'}</StatusBadge></div>
      {loading ? <LoadRows /> : <ul className="divide-y divide-border">{PROVIDERS.map((provider) => { const connection = connections.find((item) => item.provider === provider.provider); const connected = Boolean(connection?.isActive); return <li key={provider.provider} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card text-xs font-semibold">{provider.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-semibold">{provider.name}</h3><StatusBadge tone={connected ? 'success' : 'neutral'}>{connected ? 'Connected' : 'Not connected'}</StatusBadge>{connection?.syncError && <StatusBadge tone="danger">Sync issue</StatusBadge>}</div><p className="mt-1 text-2xs text-muted-foreground">{connected ? connection?.externalUserId : provider.description}</p>{connected && <p className="mt-1 text-2xs text-subtle-foreground">{connection?.calendars.length ?? 0} calendars · last sync {connection?.lastSync ? shortDate(connection.lastSync) : 'never'}</p>}{connection?.syncError && <p className="mt-1 text-2xs text-destructive">{connection.syncError}</p>}</div><div className="flex gap-2">{connected && <Button size="sm" variant="outline" onClick={() => void sync(provider.provider)} disabled={syncing === provider.provider}><RefreshCw className={cn('size-3.5', syncing === provider.provider && 'animate-spin')} />{syncing === provider.provider ? 'Syncing…' : 'Sync now'}</Button>}{provider.provider === 'LOCAL' ? <Button size="sm" variant="ghost" disabled>Always on</Button> : connected ? <Button size="sm" variant="ghost" onClick={() => void disconnect(provider.provider)}>Disconnect</Button> : <Button size="sm" onClick={() => void connect(provider.provider)} disabled={connecting === provider.provider || !integrationsService.canConnectCalendar} title={!integrationsService.canConnectCalendar ? 'The OAuth provider callback is incompatible with the current API route.' : undefined}>{connecting === provider.provider ? 'Connecting…' : integrationsService.canConnectCalendar ? 'Connect' : 'Unavailable'}</Button>}</div></li>; })}</ul>}
      <div className="border-t border-border py-3"><h3 className="text-xs font-semibold">Calendars in this workspace</h3>{connections.filter((item) => item.isActive).flatMap((item) => item.calendars).length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No calendars are available.</p> : <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{connections.filter((item) => item.isActive).flatMap((item) => item.calendars).map((calendar) => <li key={calendar.id} className="flex items-center gap-2 text-2xs"><span className="size-2 rounded-full border border-foreground/10" style={{ backgroundColor: calendar.color ?? '#888' }} />{calendar.name}<span className="text-muted-foreground">{calendar.provider}</span></li>)}</ul>}</div>
    </section> : <section className="grid gap-6 py-4 lg:grid-cols-[minmax(0,1fr)_300px]"><div><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Travel time estimate</h2><StatusBadge tone="ai">Preview</StatusBadge></div><p className="mt-1 text-xs text-muted-foreground">{integrationsService.canEstimateTravel ? 'Compare locations and account for travel between events.' : 'No travel-time HTTP controller is available; live estimates are disabled.'}</p><form className="mt-4 space-y-3" onSubmit={(event) => void estimate(event)}><fieldset disabled={!integrationsService.canEstimateTravel} className="space-y-3 disabled:opacity-50"><Field label="Origin" htmlFor="travel-origin"><Input id="travel-origin" name="origin" required placeholder="Office or address" /></Field><Field label="Destination" htmlFor="travel-destination"><Input id="travel-destination" name="destination" required placeholder="Meeting location" /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Travel mode" htmlFor="travel-mode"><Select id="travel-mode" name="mode" defaultValue="DRIVING">{(['DRIVING', 'WALKING', 'BICYCLING', 'TRANSIT', 'FLIGHT'] as const).map((mode) => <option value={mode} key={mode}>{displayEnum(mode)}</option>)}</Select></Field><Field label="Departure" htmlFor="travel-departure"><Input id="travel-departure" name="departure" type="datetime-local" /></Field></div><div className="flex flex-wrap gap-x-5 gap-y-2 text-2xs"><label className="flex items-center gap-2"><input type="checkbox" name="tolls" className="size-3.5 accent-primary" />Avoid tolls</label><label className="flex items-center gap-2"><input type="checkbox" name="highways" className="size-3.5 accent-primary" />Avoid highways</label><label className="flex items-center gap-2"><input type="checkbox" name="ferries" className="size-3.5 accent-primary" />Avoid ferries</label></div><Button type="submit" disabled={travelBusy || !integrationsService.canEstimateTravel}>{travelBusy ? 'Estimating…' : 'Estimate travel'}</Button></fieldset></form>{travelError && <ErrorLine message={travelError} retry={() => setTravelError(null)} />}</div><aside className="border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><h3 className="text-xs font-semibold">Estimate</h3>{travelResult ? <><p className="mt-4 text-3xl font-semibold tabular-nums">{travelResult.durationInTrafficMinutes ?? travelResult.durationMinutes}<span className="ml-1 text-sm font-normal text-muted-foreground">min</span></p><p className="mt-1 text-xs text-muted-foreground">{travelResult.distanceKilometers} km · {travelResult.provider}</p><div className="my-4 h-px bg-border" /><p className="text-xs">{travelResult.startAddress}</p><ArrowDown className="my-2 size-3.5 text-muted-foreground" /><p className="text-xs">{travelResult.endAddress}</p>{travelResult.warnings?.map((warning) => <p key={warning} className="mt-3 text-2xs text-status-warning">{warning}</p>)}</> : <p className="mt-3 text-xs text-muted-foreground">{integrationsService.canEstimateTravel ? 'Enter two locations for a preview estimate.' : 'Estimates require a route provider endpoint that is not currently exposed.'}</p>}</aside></section>}
  </WorkFrame>;
}

const NOTIFICATION_CHANNELS: Array<'app' | 'email' | 'sms' | 'push'> = ['app', 'email', 'sms', 'push'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<NotificationPreferencesDTO | null>(null);
  const [draft, setDraft] = useState<NotificationPreferencesDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // C4: delete-account flow state. Confirmation requires typing own email.
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  // C6: AI processing consent state.
  const [consent, setConsent] = useState<AiConsentStatus | null>(null);
  async function load() { setLoading(true); setError(null); try { const value = await integrationsService.notificationPreferences(); setPreferences(value); setDraft(value); if (!value) setError('The backend does not return saved notification preferences; editing is unavailable.'); } catch (cause) { setError(errorText(cause)); } finally { setLoading(false); } aiConsentService.status().then(setConsent).catch(() => setConsent(null)); }
  async function toggleConsent() { try { setConsent(consent?.granted ? await aiConsentService.revoke() : await aiConsentService.grant()); } catch (cause) { setError(errorText(cause)); } }
  useEffect(() => { void load(); }, []);
  function updateDraft(patch: Partial<NotificationPreferencesDTO>) { setDraft((value) => value ? { ...value, ...patch } : value); setSaved(false); }
  async function save() { if (!draft) return; setSaving(true); setError(null); try { const value = await integrationsService.updateNotificationPreferences(draft); setPreferences(value); setDraft(value); setSaved(true); } catch (cause) { setError(errorText(cause)); } finally { setSaving(false); } }
  async function deleteAccount() { if (!user?.email) return; setDeleting(true); setError(null); try { await authService.deleteAccount(deleteConfirm); await logout(); navigate('/login'); } catch (cause) { setError(errorText(cause)); setDeleting(false); } }
  return <WorkFrame title="Notification Preferences" icon={<CheckCircle2 />}>
    <div className="flex items-start justify-between gap-3 border-b border-border pb-4"><div><h2 className="text-sm font-semibold">Where and when to notify</h2><p className="mt-1 text-xs text-muted-foreground">Configure delivery channels and your working-hours window.</p></div>{saved && <StatusBadge tone="success">Saved</StatusBadge>}</div>
    {error && <ErrorLine message={error} retry={() => void load()} />}
    {consent && <section className="mt-4 rounded-md border border-border p-4">
      <h3 className="text-xs font-semibold">AI processing consent</h3>
      <p className="mt-1 text-xs text-muted-foreground">Calendar content is sent to our AI provider for assistant features only after you allow it here. Data is not sold, not used for advertising, and not used to train generalized AI models.</p>
      <div className="mt-3 flex items-center gap-3">
        <Button variant={consent.granted ? 'outline' : 'default'} onClick={() => void toggleConsent()}>{consent.granted ? 'Withdraw consent' : 'Allow AI processing'}</Button>
        {consent.granted ? <StatusBadge tone="success">Granted {consent.grantedAt ? new Date(consent.grantedAt).toLocaleDateString() : ''} · v{consent.policyVersion}</StatusBadge> : <StatusBadge tone="warning">Not granted — AI features are blocked</StatusBadge>}
      </div>
    </section>}
    <section className="mt-4 rounded-md border border-destructive/40 p-4">
      <h3 className="text-xs font-semibold text-destructive">Delete account</h3>
      <p className="mt-1 text-xs text-muted-foreground">Permanently deletes your account, connected calendars, events, tasks, memories, and AI data. Provider access is revoked. This cannot be undone.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input aria-label="Type your email address to confirm deletion" type="email" placeholder={user?.email ?? 'your email'} value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} className="max-w-64" />
        <Button variant="destructive" disabled={!user?.email || deleteConfirm.trim().toLowerCase() !== (user?.email ?? '').toLowerCase() || deleting} onClick={() => void deleteAccount()}>{deleting ? 'Deleting…' : 'Delete my account'}</Button>
      </div>
      <p className="mt-2 text-2xs text-muted-foreground">See our <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link> and <Link to="/terms" className="underline hover:text-foreground">Terms of Service</Link> for what deletion means.</p>
    </section>
    {loading ? <LoadRows /> : draft && <div className="grid gap-6 py-4 lg:grid-cols-[minmax(0,1fr)_300px]"><section><h3 className="text-xs font-semibold">Channels</h3><div className="mt-2 divide-y divide-border">{NOTIFICATION_CHANNELS.map((channel) => { const settings = draft[channel]; return <div key={channel} className="flex items-center gap-3 py-3"><label className="flex min-w-0 flex-1 items-center gap-3 text-xs capitalize"><input type="checkbox" checked={settings?.enabled ?? false} onChange={(event) => updateDraft({ [channel]: { ...settings, enabled: event.target.checked } })} className="size-4 accent-primary" /><span className="font-medium">{channel === 'app' ? 'In app' : channel}</span></label>{channel === 'email' && <Input aria-label="Notification email address" type="email" placeholder="name@example.com" value={draft.email?.address ?? ''} onChange={(event) => updateDraft({ email: { enabled: draft.email?.enabled ?? false, address: event.target.value } })} className="max-w-64" />}{channel === 'sms' && <Input aria-label="Notification phone number" type="tel" placeholder="Phone number" value={draft.sms?.phoneNumber ?? ''} onChange={(event) => updateDraft({ sms: { enabled: draft.sms?.enabled ?? false, phoneNumber: event.target.value } })} className="max-w-64" />}</div>; })}</div><Button className="mt-4" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}</Button></section><aside className="border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><h3 className="text-xs font-semibold">Working hours</h3><label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.workingHours?.enabled ?? false} onChange={(event) => updateDraft({ workingHours: { enabled: event.target.checked, start: draft.workingHours?.start ?? '09:00', end: draft.workingHours?.end ?? '17:00', days: draft.workingHours?.days ?? [] } })} className="size-4 accent-primary" />Use quiet hours outside work</label><div className="mt-3 grid grid-cols-2 gap-2"><Field label="Start" htmlFor="quiet-start"><Input id="quiet-start" type="time" value={draft.workingHours?.start ?? '09:00'} onChange={(event) => updateDraft({ workingHours: { enabled: draft.workingHours?.enabled ?? true, start: event.target.value, end: draft.workingHours?.end ?? '17:00', days: draft.workingHours?.days ?? [] } })} /></Field><Field label="End" htmlFor="quiet-end"><Input id="quiet-end" type="time" value={draft.workingHours?.end ?? '17:00'} onChange={(event) => updateDraft({ workingHours: { enabled: draft.workingHours?.enabled ?? true, start: draft.workingHours?.start ?? '09:00', end: event.target.value, days: draft.workingHours?.days ?? [] } })} /></Field></div><p className="mt-3 text-2xs font-medium">Days</p><div className="mt-2 flex flex-wrap gap-2">{WEEKDAYS.map((day, index) => <label key={day} className="flex items-center gap-1.5 text-2xs"><input type="checkbox" checked={draft.workingHours?.days.includes(index) ?? false} onChange={(event) => { const current = draft.workingHours?.days ?? []; updateDraft({ workingHours: { enabled: draft.workingHours?.enabled ?? true, start: draft.workingHours?.start ?? '09:00', end: draft.workingHours?.end ?? '17:00', days: event.target.checked ? [...current, index] : current.filter((value) => value !== index) } }); }} className="size-3.5 accent-primary" />{day}</label>)}</div><Field className="mt-4" label="Timezone" htmlFor="notification-timezone"><Input id="notification-timezone" value={draft.timezone ?? ''} onChange={(event) => updateDraft({ timezone: event.target.value })} /></Field></aside></div>}
  </WorkFrame>;
}

const MEETING_TYPES: MeetingType[] = ['STANDARD', 'ONE_ON_ONE', 'TEAM_SYNC', 'CLIENT_MEETING', 'BOARD', 'INTERVIEW', 'RETROSPECTIVE', 'PLANNING', 'OTHER'];

export function MeetingsPage() {
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [commitments, setCommitments] = useState<CommitmentDTO[]>([]);
  const [meetingId, setMeetingId] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingType>('TEAM_SYNC');
  const [mode, setMode] = useState<'prepare' | 'review'>('prepare');
  const [preparation, setPreparation] = useState<MeetingPreparationDTO | null>(null);
  const [extraction, setExtraction] = useState<MeetingExtractionDTO | null>(null);
  const [notes, setNotes] = useState('Action: Finish API error states before the customer review.\nCommitment: I will send the launch proposal tomorrow.\nDeadline: Final checklist due Friday.\nDecision: Keep the launch checklist focused on customer blockers.\nFollow-up: Check back with the research team.');
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [confirmedSuggestions, setConfirmedSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const start = dayjs().subtract(1, 'day'); const end = dayjs().add(30, 'day');
      const [calendarEvents, taskRows, commitmentRows] = await Promise.all([calendarService.listEvents(start, end), workService.listTasks(), operationsService.listCommitments()]);
      const meetingRows = calendarEvents.filter((event) => event.category === 'MEETING' || event.participants.length > 0).sort((a, b) => a.start.localeCompare(b.start));
      setEvents(meetingRows); setTasks(taskRows); setCommitments(commitmentRows);
      const initial = meetingRows[0]?.id ?? ''; setMeetingId((current) => current || initial);
    } catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!meetingId) { setPreparation(null); setExtraction(null); return; }
    void Promise.all([integrationsService.preparation(meetingId), integrationsService.extraction(meetingId)]).then(([prep, post]) => { setPreparation(prep); setExtraction(post); setSelectedSuggestions([]); setConfirmedSuggestions([]); }).catch((cause) => setError(errorText(cause)));
  }, [meetingId]);
  const event = events.find((item) => item.id === meetingId);

  async function generatePreparation() { if (!event) return; setGenerating(true); setError(null); try { setPreparation(await integrationsService.prepareMeeting(event, meetingType, tasks, commitments)); if (!USE_MOCK) setNotice('Preparation was generated but the backend does not save it for later retrieval.'); } catch (cause) { setError(errorText(cause)); } finally { setGenerating(false); } }
  async function toggleChecklist(itemId: string, completed: boolean) { if (!meetingId) return; try { const value = await integrationsService.completeChecklist(meetingId, itemId, completed); if (!value) setError('Checklist changes are not persisted by the current API.'); else setPreparation(value); } catch (cause) { setError(errorText(cause)); } }
  async function processNotes() { if (!event) return; setGenerating(true); setError(null); try { setExtraction(await integrationsService.processMeeting(event.id, event.title, notes, event.start, event.end)); setSelectedSuggestions([]); setConfirmedSuggestions([]); if (!USE_MOCK) setNotice('Extraction results are only available for this view; the backend does not save them.'); } catch (cause) { setError(errorText(cause)); } finally { setGenerating(false); } }
  function selectSuggestion(id: string, selected: boolean) { setSelectedSuggestions((items) => selected ? [...new Set([...items, id])] : items.filter((item) => item !== id)); }
  async function confirmSuggestions() {
    if (!extraction) return; setGenerating(true); setError(null); let count = 0;
    try {
      for (const item of extraction.actionItems) if (selectedSuggestions.includes(item.id)) { await workService.createTask({ title: item.description, description: item.context, priority: item.priority === 'HIGH' ? 8 : item.priority === 'LOW' ? 3 : 5, dueDate: item.dueDate }); count++; }
      for (const item of extraction.followUps) if (selectedSuggestions.includes(item.id)) { await workService.createTask({ title: item.description, description: item.context, priority: 5, dueDate: item.dueDate }); count++; }
      for (const item of extraction.commitments) if (selectedSuggestions.includes(item.id)) { if (!item.deadline) continue; await operationsService.createCommitment({ object: item.description, description: item.context, deadline: item.deadline, source: 'AI_INFERRED' }); count++; }
      for (const item of extraction.deadlines) if (selectedSuggestions.includes(item.id)) { await integrationsService.createDeadline({ title: item.description, dueDate: item.date, priority: 5, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }); count++; }
      setConfirmedSuggestions((ids) => [...new Set([...ids, ...selectedSuggestions])]); setSelectedSuggestions([]); setNotice(`${count} selected item${count === 1 ? '' : 's'} ${USE_MOCK ? 'added to the mock workspace.' : 'created.'}`);
    } catch (cause) { setError(errorText(cause)); }
    finally { setGenerating(false); }
  }

  function suggestionRow(id: string, title: string, detail: string, confidence?: number, disabled = false) {
    const confirmed = confirmedSuggestions.includes(id);
    return <label key={id} className={cn('flex gap-2 border-b border-border py-2.5 text-xs', disabled && 'opacity-50')}><input type="checkbox" checked={selectedSuggestions.includes(id) || confirmed} disabled={disabled || confirmed} onChange={(event) => selectSuggestion(id, event.target.checked)} className="mt-0.5 size-3.5 shrink-0 accent-primary" /><span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="mt-0.5 block text-2xs text-muted-foreground">{detail}</span></span>{confidence !== undefined && <span className="shrink-0 text-2xs text-muted-foreground">{Math.round(confidence * 100)}%</span>}{confirmed && <StatusBadge tone="success">Added</StatusBadge>}</label>;
  }

  return <WorkFrame title="Meeting Intelligence" icon={<CalendarClock />}>
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="min-w-0 lg:border-r lg:border-border lg:pr-4"><h2 className="text-xs font-semibold">Upcoming meetings</h2><p className="mt-1 text-2xs text-muted-foreground">Select a calendar meeting to prepare or review.</p>{loading ? <LoadRows /> : events.length === 0 ? <p className="py-6 text-xs text-muted-foreground">No upcoming meetings were found in the calendar.</p> : <ul className="mt-2 divide-y divide-border">{events.map((item) => <li key={item.id}><button type="button" onClick={() => setMeetingId(item.id)} aria-pressed={meetingId === item.id} className={cn('w-full py-2.5 text-left', meetingId === item.id && 'text-primary')}><span className="block truncate text-xs font-medium">{item.title}</span><span className="mt-1 block text-2xs text-muted-foreground">{shortDate(item.start)} · {clock(item.start)} · {item.participants.length} guests</span></button></li>)}</ul>}</aside>
      <section className="min-w-0">{error && <ErrorLine message={error} retry={() => void load()} />}{notice && <div role="status" className="mb-3 flex items-center justify-between border-l-2 border-status-success bg-muted/40 px-3 py-2 text-xs">{notice}<button onClick={() => setNotice(null)} className="text-muted-foreground">Dismiss</button></div>}
        {event ? <><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3"><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{event.title}</h2><p className="mt-1 text-2xs text-muted-foreground">{shortDate(event.start)} · {clock(event.start)}–{clock(event.end)} · {event.location || 'Location not set'}</p></div><div className="flex gap-1" role="tablist" aria-label="Meeting view">{([{ id: 'prepare', label: 'Prepare' }, { id: 'review', label: 'Post-meeting review' }] as const).map((tab) => <button type="button" role="tab" aria-selected={mode === tab.id} key={tab.id} onClick={() => setMode(tab.id)} className={cn('rounded-sm px-2 py-1 text-2xs', mode === tab.id ? 'bg-accent text-foreground' : 'text-muted-foreground')}>{tab.label}</button>)}</div></div>
        {mode === 'prepare' ? (
          <MeetingPreparationPanel
            preparation={preparation}
            meetingType={meetingType}
            onMeetingTypeChange={setMeetingType}
            generating={generating}
            onGenerate={() => void generatePreparation()}
            onToggleChecklist={(itemId, completed) => void toggleChecklist(itemId, completed)}
            canEditChecklist={USE_MOCK}
          />
        ) : (
          <MeetingReviewPanel
            notes={notes}
            onNotesChange={setNotes}
            extraction={extraction}
            generating={generating}
            onProcess={() => void processNotes()}
            selectedSuggestions={selectedSuggestions}
            confirmedSuggestions={confirmedSuggestions}
            onToggleSuggestion={selectSuggestion}
            onConfirm={() => void confirmSuggestions()}
            renderSuggestion={suggestionRow}
          />
        )}
        </> : <div className="grid min-h-48 place-items-center text-center"><div><CalendarClock className="mx-auto size-5 text-muted-foreground" /><h3 className="mt-2 text-sm font-medium">Select a meeting</h3><p className="mt-1 text-xs text-muted-foreground">Choose one from the calendar list to begin.</p></div></div>}
      </section>
    </div>
  </WorkFrame>;
}

function MeetingPreparationPanel({
  preparation,
  meetingType,
  onMeetingTypeChange,
  generating,
  onGenerate,
  onToggleChecklist,
  canEditChecklist,
}: {
  preparation: MeetingPreparationDTO | null;
  meetingType: MeetingType;
  onMeetingTypeChange: (type: MeetingType) => void;
  generating: boolean;
  onGenerate: () => void;
  onToggleChecklist: (itemId: string, completed: boolean) => void;
  canEditChecklist: boolean;
}) {
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Meeting type" htmlFor="meeting-type" className="w-48">
          <Select id="meeting-type" value={meetingType} onChange={(event) => onMeetingTypeChange(event.target.value as MeetingType)}>
            {MEETING_TYPES.map((type) => <option key={type} value={type}>{displayEnum(type)}</option>)}
          </Select>
        </Field>
        <Button onClick={onGenerate} disabled={generating}>{generating ? 'Preparing…' : preparation ? 'Refresh preparation' : 'Generate preparation'}</Button>
      </div>
      {!preparation ? (
        <div className="grid min-h-40 place-items-center py-8 text-center">
          <div><CalendarClock className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Generate a preparation package for this meeting.</p></div>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="border-l-2 border-primary/50 bg-muted/40 px-3 py-2">
            <p className="text-xs">{preparation.summary}</p>
            <p className="mt-1 text-2xs text-muted-foreground">Generated {shortDate(preparation.generatedAt)} · {Math.round(preparation.confidence * 100)}% confidence</p>
          </div>
          <section>
            <h3 className="text-xs font-semibold">Preparation checklist</h3>
            {!canEditChecklist && <p className="mt-1 text-2xs text-muted-foreground">Checklist changes cannot be saved by the current API.</p>}
            <ul className="mt-1 divide-y divide-border">{preparation.checklist.map((item) => <li key={item.id} className="flex items-start gap-2 py-2"><input type="checkbox" checked={item.completed} disabled={!canEditChecklist} onChange={(event) => onToggleChecklist(item.id, event.target.checked)} aria-label={`Complete ${item.title}`} className="mt-0.5 size-3.5 accent-primary" /><span className={cn('min-w-0 flex-1 text-xs', item.completed && 'text-muted-foreground line-through')}>{item.title}<span className="mt-0.5 block text-2xs text-muted-foreground">{item.description} · {item.estimatedMinutes ?? 0} min</span></span><StatusBadge tone={item.priority === 'HIGH' ? 'warning' : 'neutral'}>{item.priority}</StatusBadge></li>)}</ul>
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <section><h3 className="text-xs font-semibold">Suggested agenda</h3><ul className="mt-2 space-y-2">{preparation.suggestedAgenda.map((item) => <li key={item.id} className="border-l border-border pl-2"><p className="text-xs font-medium">{item.title}<span className="ml-2 text-2xs text-muted-foreground">{item.estimatedMinutes}m</span></p><p className="mt-1 text-2xs text-muted-foreground">{item.description}</p></li>)}</ul></section>
            <section><h3 className="text-xs font-semibold">Relevant work</h3><ul className="mt-2 space-y-2">{preparation.relevantTasks.slice(0, 4).map((item) => <li key={item.taskId} className="flex items-start justify-between gap-2 text-xs"><span>{item.title}<span className="block text-2xs text-muted-foreground">{item.projectName ?? item.status.replace('_', ' ')} · priority {item.priority}</span></span>{item.dueDate && <span className="shrink-0 text-2xs text-muted-foreground">{shortDate(item.dueDate)}</span>}</li>)}</ul></section>
          </div>
          <section className="border-t border-border pt-3"><h3 className="text-xs font-semibold">Outstanding commitments</h3>{preparation.outstandingCommitments.length ? <ul className="mt-2 divide-y divide-border">{preparation.outstandingCommitments.map((item) => <li key={item.commitmentId} className="flex items-center justify-between gap-2 py-2 text-xs"><span>{item.object}<span className="ml-2 text-2xs text-muted-foreground">{item.status.replace('_', ' ')}</span></span><StatusBadge tone={item.riskLevel === 'HIGH' || item.riskLevel === 'CRITICAL' ? 'danger' : 'warning'}>{item.riskLevel}</StatusBadge></li>)}</ul> : <p className="mt-1 text-xs text-muted-foreground">No open commitments in this preview.</p>}</section>
        </div>
      )}
    </div>
  );
}

function MeetingReviewPanel({
  notes,
  onNotesChange,
  extraction,
  generating,
  onProcess,
  selectedSuggestions,
  confirmedSuggestions,
  onToggleSuggestion,
  onConfirm,
  renderSuggestion,
}: {
  notes: string;
  onNotesChange: (value: string) => void;
  extraction: MeetingExtractionDTO | null;
  generating: boolean;
  onProcess: () => void;
  selectedSuggestions: string[];
  confirmedSuggestions: string[];
  onToggleSuggestion: (id: string, selected: boolean) => void;
  onConfirm: () => void;
  renderSuggestion: (id: string, title: string, detail: string, confidence?: number, disabled?: boolean) => React.ReactNode;
}) {
  const section = (title: string, items: Array<{ id: string; description: string; confidence: number; dueDate?: string; deadline?: string; date?: string; assignee?: string; person?: string }>, category: 'action' | 'commitment' | 'deadline' | 'followup') => (
    <section className="mt-4" key={category}>
      <h3 className="text-xs font-semibold">{title}</h3>
      {items.length ? items.map((item) => {
        const date = item.deadline ?? item.dueDate ?? item.date;
        const person = item.person ?? item.assignee;
        const personUnavailable = category === 'commitment' && Boolean(person) && !USE_MOCK;
        const detail = `${person ? `${person} · ` : ''}${date ? `due ${shortDate(date)}` : category === 'commitment' ? 'deadline needed' : 'No due date'}${personUnavailable ? ' · person field not supported by API' : ''}`;
        return renderSuggestion(item.id, item.description, detail, item.confidence, category === 'commitment' && (!item.deadline || personUnavailable));
      }) : <p className="mt-2 text-xs text-muted-foreground">No {title.toLowerCase()} extracted.</p>}
    </section>
  );

  return (
    <div className="py-3">
      <div>
        <h3 className="text-xs font-semibold">Notes or transcript</h3>
        <p className="mt-1 text-2xs text-muted-foreground">Extracted changes stay proposals until you select and confirm them.</p>
        <Textarea className="mt-2" rows={6} value={notes} onChange={(event) => onNotesChange(event.target.value)} aria-label="Meeting notes or transcript" />
        <Button className="mt-2" onClick={onProcess} disabled={generating || !notes.trim()}>{generating ? 'Reviewing…' : 'Process notes'}</Button>
      </div>
      {extraction && <div className="mt-5">
        <div className="border-l-2 border-ai/60 bg-ai-soft/30 px-3 py-2"><p className="text-xs">{extraction.summary}</p><p className="mt-1 text-2xs text-muted-foreground">{Math.round(extraction.confidence * 100)}% overall confidence · explicit confirmation required before creation</p></div>
        {section('Action items', extraction.actionItems, 'action')}
        {section('Commitments', extraction.commitments, 'commitment')}
        {section('Deadlines', extraction.deadlines, 'deadline')}
        {section('Follow-ups', extraction.followUps, 'followup')}
        {(extraction.keyDecisions.length + extraction.blockers.length + extraction.risks.length) > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-3">{[['Decisions', extraction.keyDecisions], ['Blockers', extraction.blockers], ['Risks', extraction.risks]].map(([label, values]) => <div key={String(label)}><h4 className="text-2xs font-semibold">{label}</h4>{(values as string[]).length ? (values as string[]).map((value) => <p key={value} className="mt-1 text-2xs text-muted-foreground">{value}</p>) : <p className="mt-1 text-2xs text-muted-foreground">None identified</p>}</div>)}</div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><p className="text-2xs text-muted-foreground">{selectedSuggestions.length} suggestions selected · {confirmedSuggestions.length} added</p><Button onClick={onConfirm} disabled={generating || selectedSuggestions.length === 0}>{generating ? 'Adding…' : 'Confirm selected items'}</Button></div>
      </div>}
    </div>
  );
}

export function InsightsPage() {
  const [items, setItems] = useState<InterventionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function load() { setLoading(true); setError(null); try { setItems(await knowledgeService.listInterventions()); } catch (cause) { setError(errorText(cause)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  const active = items.filter((item) => item.status === 'ACTIVE');
  return <WorkFrame title="Insights" icon={<Sparkles />}>
    <div className="grid grid-cols-3 border-b border-border pb-4"><div><p className="text-2xs text-muted-foreground">Active signals</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : active.length}</p></div><div><p className="text-2xs text-muted-foreground">Urgent</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : active.filter((item) => item.priority === 'URGENT').length}</p></div><div><p className="text-2xs text-muted-foreground">Needs review</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : active.filter((item) => item.priority === 'HIGH' || item.priority === 'URGENT').length}</p></div></div>
    {error && <ErrorLine message={error} retry={() => void load()} />}
    <div className="flex items-center justify-between border-b border-border py-3"><div><h2 className="text-sm font-semibold">Latest signals</h2><p className="mt-1 text-2xs text-muted-foreground">High-value changes surfaced from the current mock schedule.</p></div><Link to="/proactive" className="text-xs font-medium text-primary hover:underline">Open feed</Link></div>
    {loading ? <LoadRows /> : active.length ? <ul className="divide-y divide-border">{active.slice(0, 4).map((item) => <li key={item.id} className="flex items-start gap-3 py-3"><span className={cn('mt-1.5 size-2 rounded-full', item.priority === 'URGENT' ? 'bg-status-critical' : item.priority === 'HIGH' ? 'bg-status-warning' : 'bg-primary')} /><div className="min-w-0 flex-1"><p className="text-xs font-medium">{item.title}</p><p className="mt-1 text-2xs text-muted-foreground">{item.description}</p></div><StatusBadge tone={interventionTone(item.priority)}>{item.priority}</StatusBadge></li>)}</ul> : <div className="py-10 text-center text-xs text-muted-foreground">No active signals.</div>}
    <div className="mt-6 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">{[['Reality check', '/reality', 'Inspect schedule deviations'], ['Commitments', '/commitments', 'Review deadline risk'], ['Permissions', '/permissions', 'Adjust action boundaries']].map(([title, to, description]) => <Link key={to} to={to} className="group flex items-start justify-between border-b border-border py-2 text-xs"><span><span className="block font-medium">{title}</span><span className="mt-1 block text-2xs text-muted-foreground">{description}</span></span><ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>)}</div>
  </WorkFrame>;
}

export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const destinations = COMMANDS.filter((command) => command.action === 'navigate');
  const filtered = destinations.filter((command) => `${command.label} ${command.description} ${command.keywords.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <WorkFrame title="Command Center" icon={<SearchIcon />}>
    <div className="border-b border-border pb-4"><h2 className="text-sm font-semibold">Go to a workspace</h2><p className="mt-1 text-xs text-muted-foreground">Search product surfaces or open the global palette with Ctrl/⌘K.</p><label className="relative mt-3 block max-w-xl"><SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search goals, meetings, preferences…" aria-label="Search command center" className="pl-8" /></label></div>
    {filtered.length ? <ul className="divide-y divide-border">{filtered.map((command) => <li key={command.id}><button type="button" onClick={() => command.to && navigate(command.to)} className="group flex w-full items-center gap-3 py-3 text-left"><span className="grid size-7 place-items-center rounded-md border border-border bg-card"><ArrowRight className="size-3.5 text-muted-foreground" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{command.label}</span><span className="mt-0.5 block text-2xs text-muted-foreground">{command.description}</span></span><span className="text-2xs text-subtle-foreground">Open</span></button></li>)}</ul> : <div className="py-12 text-center"><p className="text-sm font-medium">No matching destinations</p><p className="mt-1 text-xs text-muted-foreground">Try another search.</p></div>}
  </WorkFrame>;
}
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Check, Circle, Clock3, FolderKanban, ListTodo, Plus, Search, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { workService } from '@/services/work';
import type { CreateGoalInput, CreateProjectInput, CreateTaskInput, GoalDTO, GoalStatus, GoalUpdateStatus, ProjectDTO, ProjectStatus, TaskDTO, TaskStatus, UpdateGoalInput, UpdateProjectInput, UpdateTaskInput } from '@/services/types';

type WorkKind = 'goals' | 'projects' | 'tasks';
type WorkItem = GoalDTO | ProjectDTO | TaskDTO;
type WorkData = { goals: GoalDTO[]; projects: ProjectDTO[]; tasks: TaskDTO[] };
type WorkStatus = GoalStatus | ProjectStatus | TaskStatus;

const TITLES: Record<WorkKind, string> = { goals: 'Goals', projects: 'Projects', tasks: 'Tasks' };
const ICONS = { goals: Sparkles, projects: FolderKanban, tasks: ListTodo };
const STATUS_LABELS: Record<WorkStatus, string> = {
  PENDING: 'Not started', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
  ON_HOLD: 'On hold', BLOCKED: 'Blocked',
};
const GOAL_STATUSES: GoalStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD'];
const PROJECT_STATUSES: ProjectStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD', 'CANCELLED'];
const TASK_STATUSES: TaskStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD', 'CANCELLED'];

function dateLabel(date: string | null | undefined): string {
  if (!date) return 'No date';
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return 'No date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value);
}

function dateInput(date: string | null | undefined): string {
  return date ? new Date(date).toISOString().slice(0, 10) : '';
}

function dateValue(date: string): string | undefined {
  return date ? new Date(`${date}T12:00:00.000Z`).toISOString() : undefined;
}

function itemDate(kind: WorkKind, item: WorkItem): string | null {
  return kind === 'goals' ? (item as GoalDTO).targetDate : (item as ProjectDTO | TaskDTO).dueDate;
}

function isOverdue(item: WorkItem, kind: WorkKind): boolean {
  const date = itemDate(kind, item);
  const status = item.status;
  return Boolean(date && new Date(date).getTime() < Date.now() && status !== 'COMPLETED' && status !== 'CANCELLED');
}

function priorityLabel(priority: number): string {
  return priority >= 8 ? 'High' : priority >= 5 ? 'Medium' : 'Low';
}

function relationshipLabel(kind: WorkKind, item: WorkItem, data: WorkData): string | null {
  if (kind === 'projects') {
    const goal = data.goals.find((row) => row.id === (item as ProjectDTO).goalId);
    return goal ? `Goal · ${goal.title}` : null;
  }
  if (kind === 'tasks') {
    const task = item as TaskDTO;
    const project = data.projects.find((row) => row.id === task.projectId);
    const goal = data.goals.find((row) => row.id === task.goalId);
    return project?.title ?? goal?.title ?? null;
  }
  return null;
}

function taskProgress(kind: WorkKind, item: WorkItem, data: WorkData): { done: number; total: number } | null {
  const tasks = kind === 'goals'
    ? data.tasks.filter((task) => task.goalId === item.id || data.projects.some((project) => project.id === task.projectId && project.goalId === item.id))
    : kind === 'projects'
      ? data.tasks.filter((task) => task.projectId === item.id)
      : [];
  if (kind === 'tasks') return null;
  return { done: tasks.filter((task) => task.status === 'COMPLETED').length, total: tasks.length };
}

function defaultData(): WorkData {
  return { goals: [], projects: [], tasks: [] };
}

function loadPageData(kind: WorkKind): Promise<WorkData> {
  if (kind === 'goals') return Promise.all([workService.listGoals(), workService.listProjects(), workService.listTasks()]).then(([goals, projects, tasks]) => ({ goals, projects, tasks }));
  if (kind === 'projects') return Promise.all([workService.listProjects(), workService.listGoals(), workService.listTasks()]).then(([projects, goals, tasks]) => ({ goals, projects, tasks }));
  return Promise.all([workService.listTasks(), workService.listProjects(), workService.listGoals()]).then(([tasks, projects, goals]) => ({ goals, projects, tasks }));
}

function getStatusOptions(kind: WorkKind): WorkStatus[] {
  return kind === 'goals' ? GOAL_STATUSES : kind === 'projects' ? PROJECT_STATUSES : TASK_STATUSES;
}

function WorkForm({
  kind, item, data, saving, onCancel, onSave,
}: {
  kind: WorkKind; item: WorkItem | null; data: WorkData; saving: boolean;
  onCancel: () => void; onSave: (payload: CreateGoalInput | UpdateGoalInput | CreateProjectInput | UpdateProjectInput | CreateTaskInput | UpdateTaskInput) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [priority, setPriority] = useState(String(item?.priority ?? 5));
  const [status, setStatus] = useState<WorkStatus>(item?.status ?? 'PENDING');
  const [dueDate, setDueDate] = useState(dateInput(item ? itemDate(kind, item) : null));
  const [goalId, setGoalId] = useState(kind === 'projects' ? (item as ProjectDTO | null)?.goalId ?? '' : (item as TaskDTO | null)?.goalId ?? '');
  const [projectId, setProjectId] = useState((item as TaskDTO | null)?.projectId ?? '');
  const [duration, setDuration] = useState(String((item as TaskDTO | null)?.estimatedDurationMin ?? ''));
  const statusOptions = getStatusOptions(kind).filter((value) => kind !== 'goals' || value !== 'ON_HOLD');

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const common = { title: title.trim(), description: description.trim() || undefined, priority: Number(priority) };
    if (kind === 'goals') {
      onSave({ ...common, ...(item ? { status: status as GoalUpdateStatus } : {}), targetDate: dateValue(dueDate) });
      return;
    }
    if (kind === 'projects') {
      onSave({ ...common, goalId: goalId || null, dueDate: dateValue(dueDate), ...(item ? { status: status as ProjectStatus } : {}) });
      return;
    }
    onSave({ ...common, goalId: goalId || null, projectId: projectId || null, dueDate: dateValue(dueDate),
      estimatedDurationMinutes: duration ? Number(duration) : undefined, ...(item ? { status: status as TaskStatus } : {}) });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Field label="Title" htmlFor="work-title"><Input id="work-title" autoFocus required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Description" htmlFor="work-description"><Textarea id="work-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" htmlFor="work-priority" hint="0 to 10">
          <Input id="work-priority" type="number" min={0} max={10} value={priority} onChange={(event) => setPriority(event.target.value)} />
        </Field>
        <Field label={kind === 'goals' ? 'Target date' : 'Due date'} htmlFor="work-date">
          <Input id="work-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
      </div>
      {item && <Field label="Status" htmlFor="work-status"><Select id="work-status" value={status} onChange={(event) => setStatus(event.target.value as WorkStatus)}>{statusOptions.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</Select></Field>}
      {kind !== 'goals' && <Field label={kind === 'projects' ? 'Parent goal' : 'Goal'} htmlFor="work-goal">
        <Select id="work-goal" value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">No goal</option>{data.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</Select>
      </Field>}
      {kind === 'tasks' && <>
        <Field label="Project" htmlFor="work-project"><Select id="work-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</Select></Field>
        <Field label="Estimated minutes" htmlFor="work-duration"><Input id="work-duration" type="number" min={1} value={duration} onChange={(event) => setDuration(event.target.value)} /></Field>
      </>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Saving…' : item ? 'Save changes' : `Create ${kind === 'goals' ? 'goal' : kind === 'projects' ? 'project' : 'task'}`}</Button>
      </DialogFooter>
    </form>
  );
}

export function WorkPage({ kind }: { kind: WorkKind }) {
  const [data, setData] = useState<WorkData>(defaultData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | WorkStatus>('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [editing, setEditing] = useState<WorkItem | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try { setData(await loadPageData(kind)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this workspace.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void reload(); }, [kind]);

  const rows = kind === 'goals' ? data.goals : kind === 'projects' ? data.projects : data.tasks;
  const filtered = useMemo(() => rows.filter((item) => {
    const matchesStatus = filter === 'ALL' || item.status === filter;
    const needle = search.trim().toLowerCase();
    return matchesStatus && (!needle || `${item.title} ${item.description ?? ''}`.toLowerCase().includes(needle));
  }), [rows, filter, search]);
  const Icon = ICONS[kind];
  const activeCount = rows.filter((item) => item.status === 'IN_PROGRESS').length;
  const overdueCount = rows.filter((item) => isOverdue(item, kind)).length;
  const completedCount = rows.filter((item) => item.status === 'COMPLETED').length;

  async function save(payload: CreateGoalInput | UpdateGoalInput | CreateProjectInput | UpdateProjectInput | CreateTaskInput | UpdateTaskInput) {
    setSaving(true);
    try {
      if (kind === 'goals') {
        if (editing) await workService.updateGoal(editing.id, payload as UpdateGoalInput);
        else await workService.createGoal(payload as CreateGoalInput);
      } else if (kind === 'projects') {
        if (editing) await workService.updateProject(editing.id, payload as UpdateProjectInput);
        else await workService.createProject(payload as CreateProjectInput);
      } else {
        if (editing) await workService.updateTask(editing.id, payload as UpdateTaskInput);
        else await workService.createTask(payload as CreateTaskInput);
      }
      setEditing(undefined);
      setSelected(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save changes.');
    } finally { setSaving(false); }
  }

  async function changeTaskStatus(task: TaskDTO) {
    const status: TaskStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try { await workService.updateTask(task.id, { status }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update task.'); }
  }

  async function remove(item: WorkItem) {
    if (!window.confirm(`Delete “${item.title}”?`)) return;
    try {
      if (kind === 'goals') await workService.deleteGoal(item.id);
      else if (kind === 'projects') await workService.deleteProject(item.id);
      else await workService.deleteTask(item.id);
      setSelected(null);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete this item.'); }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={TITLES[kind]} icon={<Icon />}>
        <Button size="sm" onClick={() => setEditing(null)}><Plus className="size-3.5" /> New</Button>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-4 md:px-6">
          <nav className="flex gap-1 border-b border-border" aria-label="Goals, projects, and tasks">
            {(['goals', 'projects', 'tasks'] as const).map((tab) => {
              const TabIcon = ICONS[tab];
              return <Link key={tab} to={`/${tab}`} aria-current={tab === kind ? 'page' : undefined} className={cn('flex h-9 items-center gap-2 border-b-2 px-3 text-xs font-medium capitalize transition-colors', tab === kind ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}><TabIcon className="size-3.5" />{tab}</Link>;
            })}
          </nav>

          <div className="grid grid-cols-3 border-b border-border py-4">
            <div><p className="text-2xs text-muted-foreground">In progress</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : activeCount}</p></div>
            <div><p className="text-2xs text-muted-foreground">Past due</p><p className={cn('mt-1 text-lg font-semibold tabular-nums', overdueCount > 0 && 'text-destructive')}>{loading ? '—' : overdueCount}</p></div>
            <div><p className="text-2xs text-muted-foreground">Completed</p><p className="mt-1 text-lg font-semibold tabular-nums">{loading ? '—' : completedCount}</p></div>
          </div>

          <div className="flex flex-col gap-3 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Filter by status">
              {(['ALL', ...getStatusOptions(kind)] as const).map((status) => <button key={status} type="button" onClick={() => setFilter(status)} aria-pressed={filter === status} className={cn('shrink-0 rounded-md px-2 py-1 text-2xs transition-colors', filter === status ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')}>{status === 'ALL' ? 'All' : STATUS_LABELS[status]}</button>)}
            </div>
            <label className="relative block w-full sm:max-w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${kind}`} className="pl-8" aria-label={`Search ${kind}`} />
            </label>
          </div>

          {error && <div role="alert" className="mt-4 flex items-center justify-between gap-3 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void reload()}>Retry</Button></div>}

          {loading ? <div className="divide-y divide-border" aria-label={`Loading ${kind}`}>
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center gap-3 py-4"><Skeleton className="size-4 rounded-full" /><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3 w-48 max-w-full" /><Skeleton className="h-2.5 w-72 max-w-full" /></div><Skeleton className="h-4 w-16" /></div>)}
          </div> : filtered.length === 0 ? <div className="grid min-h-64 place-items-center py-12 text-center">
            <div className="max-w-sm">
              <div className="mx-auto mb-3 grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground"><Icon className="size-4" /></div>
              <h2 className="text-sm font-medium">{rows.length === 0 ? `Nothing in ${kind} yet` : 'No matches'}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{rows.length === 0 ? `Add a ${kind.slice(0, -1)} to make progress visible here.` : 'Try another status or search term.'}</p>
              {rows.length === 0 && <Button size="sm" className="mt-4" onClick={() => setEditing(null)}><Plus className="size-3.5" /> Create {kind.slice(0, -1)}</Button>}
            </div>
          </div> : <ul className="divide-y divide-border" aria-label={TITLES[kind]}>
            {filtered.map((item) => {
              const progress = taskProgress(kind, item, data);
              const relation = relationshipLabel(kind, item, data);
              const overdue = isOverdue(item, kind);
              return <li key={item.id}>
                <div className="group flex min-h-16 items-center gap-3 py-3">
                  {kind === 'tasks' ? <button type="button" onClick={() => void changeTaskStatus(item as TaskDTO)} aria-label={`${item.status === 'COMPLETED' ? 'Reopen' : 'Complete'} ${item.title}`} className={cn('grid size-5 shrink-0 place-items-center rounded-full border transition-colors', item.status === 'COMPLETED' ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-transparent hover:border-primary hover:text-primary')}><Check className="size-3" /></button> : <span className={cn('size-2 shrink-0 rounded-full', item.status === 'COMPLETED' ? 'bg-status-success' : item.status === 'BLOCKED' ? 'bg-status-critical' : item.status === 'IN_PROGRESS' ? 'bg-primary' : 'bg-muted-foreground/40')} />}
                  <button type="button" onClick={() => setSelected(item)} className="min-w-0 flex-1 text-left">
                    <span className="flex min-w-0 items-center gap-2"><span className={cn('truncate text-sm font-medium', item.status === 'COMPLETED' && 'text-muted-foreground line-through')}>{item.title}</span><Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{STATUS_LABELS[item.status]}</Badge></span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                      {item.description && <span className="max-w-lg truncate">{item.description}</span>}
                      {relation && <span className="inline-flex items-center gap-1"><ArrowUpRight className="size-3" />{relation}</span>}
                      {progress && <span>{progress.done}/{progress.total} tasks</span>}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2 text-2xs text-muted-foreground">
                    <span className="hidden sm:inline">{priorityLabel(item.priority)}</span>
                    {kind === 'tasks' && (item as TaskDTO).estimatedDurationMin && <span className="hidden items-center gap-1 md:inline-flex"><Clock3 className="size-3" />{(item as TaskDTO).estimatedDurationMin}m</span>}
                    <span className={cn('inline-flex items-center gap-1 tabular-nums', overdue && 'font-medium text-destructive')}><CalendarDays className="size-3" />{dateLabel(itemDate(kind, item))}</span>
                    <button type="button" onClick={() => setSelected(item)} aria-label={`Open ${item.title}`} className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-70 hover:bg-accent hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"><ArrowUpRight className="size-3.5" /></button>
                  </div>
                </div>
              </li>;
            })}
          </ul>}
        </div>
      </div>

      <Dialog open={editing !== undefined} onOpenChange={(open) => { if (!open && !saving) setEditing(undefined); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? `Edit ${kind.slice(0, -1)}` : `New ${kind.slice(0, -1)}`}</DialogTitle><DialogDescription>Changes are saved to this workspace.</DialogDescription></DialogHeader>
          <WorkForm key={`${kind}-${editing?.id ?? 'new'}`} kind={kind} item={editing ?? null} data={data} saving={saving} onCancel={() => setEditing(undefined)} onSave={(payload) => void save(payload)} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {selected && <>
            <DialogHeader><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{STATUS_LABELS[selected.status]}</Badge><Badge variant={selected.priority >= 8 ? 'warning' : 'neutral'}>{priorityLabel(selected.priority)} priority</Badge></div><DialogTitle className="pt-1">{selected.title}</DialogTitle><DialogDescription>{selected.description || 'No description has been added.'}</DialogDescription></DialogHeader>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-4 text-xs">
              <div><dt className="text-muted-foreground">{kind === 'goals' ? 'Target date' : 'Due date'}</dt><dd className={cn('mt-1 font-medium', isOverdue(selected, kind) && 'text-destructive')}>{dateLabel(itemDate(kind, selected))}{isOverdue(selected, kind) && ' · Past due'}</dd></div>
              <div><dt className="text-muted-foreground">Related to</dt><dd className="mt-1 font-medium">{relationshipLabel(kind, selected, data) ?? 'No parent'}</dd></div>
              {kind === 'tasks' && <div><dt className="text-muted-foreground">Estimated effort</dt><dd className="mt-1 font-medium">{(selected as TaskDTO).estimatedDurationMin ? `${(selected as TaskDTO).estimatedDurationMin} minutes` : 'Not estimated'}</dd></div>}
              {taskProgress(kind, selected, data) && <div><dt className="text-muted-foreground">Tasks complete</dt><dd className="mt-1 font-medium">{taskProgress(kind, selected, data)?.done} of {taskProgress(kind, selected, data)?.total}</dd></div>}
            </dl>
            {kind === 'tasks' && <div className="flex items-center gap-2 text-2xs text-muted-foreground"><Circle className="size-3" />Task details reflect the scheduling fields currently supported by the API.</div>}
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove(selected)}>Delete</Button>
              <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => { setEditing(selected); setSelected(null); }}>Edit</Button><Button type="button" onClick={() => setSelected(null)}>Done</Button></div>
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function GoalsPage() { return <WorkPage kind="goals" />; }
export function ProjectsPage() { return <WorkPage kind="projects" />; }
export function TasksPage() { return <WorkPage kind="tasks" />; }
import { useState } from 'react';
import { Plus, Check, MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import { tasksAPI } from '@/services';
import dayjs from 'dayjs';

interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  startDate?: string;
  priority: number;
  status: string;
  estimatedDurationMin?: number;
  goalId?: string;
  projectId?: string;
}

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const res = await tasksAPI.getAll({ status: filter === 'all' ? undefined : filter });
      setTasks(res.data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-6xl space-y-4 p-5 md:p-8"><div className="h-8 max-w-xs animate-pulse rounded-lg bg-muted" /><div className="h-24 animate-pulse rounded-2xl bg-muted" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-eyebrow mb-2">Small steps, meaningful progress</p>
          <h1 className="page-title">Tasks</h1>
          <p className="mt-2 text-sm text-muted-foreground">Keep your next actions clear and manageable.</p>
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/15 transition hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Task
        </button>
      </header>

      <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {['all', 'PENDING', 'IN_PROGRESS', 'COMPLETED'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="surface-card px-5 py-14 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
              <Check className="h-5 w-5" />
            </div>
            <h2 className="font-semibold tracking-tight">A little breathing room</h2>
            <p className="mt-1 text-sm text-muted-foreground">No tasks found. Create one to get started.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="surface-card flex items-center p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <input type="checkbox" aria-label={`Mark ${task.title} complete`} className="mr-4 h-4 w-4 rounded border-input accent-primary" />
              <div className="flex-1">
                <h3 className="font-medium tracking-tight">{task.title}</h3>
                {task.description && (
                  <p className="text-sm text-muted-foreground">{task.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {task.dueDate && `Due ${dayjs(task.dueDate).format('MMM D')}`}
                  {task.estimatedDurationMin && `${task.estimatedDurationMin}m`}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium
                    ${task.priority >= 7 ? 'bg-red-100 text-red-800' :
                      task.priority >= 4 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'}`}>
                    {task.priority >= 7 ? 'High' : task.priority >= 4 ? 'Medium' : 'Low'}
                  </span>
                </div>
              </div>
              <button aria-label={`More options for ${task.title}`} className="ml-2 rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { workService } from '@/services/work';
import { timeBlockService, type TimeBlockDTO } from '@/services/time-blocks';
import { assistantService } from '@/services/assistant';
import { useAuth } from '@/contexts/AuthContext';
import type { GoalDTO, ProjectDTO, TaskDTO } from '@/services/types';

type TodayGoal = GoalDTO & { progress: number };

export function TodayPage() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeBlocks, setTimeBlocks] = useState<TimeBlockDTO[]>([]);
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [goals, setGoals] = useState<TodayGoal[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [currentDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const today = dayjs(currentDate);
      const startOfDay = today.startOf('day').toDate();
      const endOfDay = today.endOf('day').toDate();

      const results = await Promise.allSettled([
        timeBlockService.listRange(startOfDay.toISOString(), endOfDay.toISOString()),
        workService.listTasks(),
        workService.listGoals(),
        workService.listProjects(),
      ]);

      const [timeBlocksResult, tasksResult, goalsResult, projectsResult] = results;
      const failures: string[] = [];

      if (timeBlocksResult.status === 'fulfilled') {
        setTimeBlocks(timeBlocksResult.value);
      } else {
        setTimeBlocks([]);
        failures.push('time blocks');
      }

      const allTasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
      if (tasksResult.status !== 'fulfilled') failures.push('tasks');
      setTasks(allTasks.filter((task) => task.status === 'PENDING' || task.status === 'IN_PROGRESS').sort((a, b) => b.priority - a.priority).slice(0, 5));

      const projects: ProjectDTO[] = projectsResult.status === 'fulfilled' ? projectsResult.value : [];
      if (projectsResult.status !== 'fulfilled') failures.push('projects');
      if (goalsResult.status === 'fulfilled') {
        const activeGoals = goalsResult.value.filter((goal) => goal.status === 'PENDING' || goal.status === 'IN_PROGRESS');
        setGoals(activeGoals.map((goal) => {
          const projectIds = projects.filter((project) => project.goalId === goal.id).map((project) => project.id);
          const related = allTasks.filter((task) => task.goalId === goal.id || (task.projectId && projectIds.includes(task.projectId)));
          const completed = related.filter((task) => task.status === 'COMPLETED').length;
          return { ...goal, progress: related.length ? Math.round(completed / related.length * 100) : 0 };
        }));
      } else {
        setGoals([]);
        failures.push('goals');
      }

      setDataError(failures.length ? `Could not load ${failures.join(', ')}. The rest of your dashboard is still available.` : null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not load the dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const now = dayjs();
  const today = dayjs(currentDate);
  const isToday = today.isSame(dayjs(), 'day');

  if (loading) {
    return <div className="p-6 space-y-4">
      <div className="h-8 bg-muted rounded animate-pulse" />
      <div className="space-y-3">
        {[1,2,3].map(i => (
          <div key={i} className="h-24 bg-muted rounded animate-pulse" />
        ))}
      </div>
    </div>;
  }

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-6 md:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-eyebrow mb-2">{today.format('dddd, MMMM D')}</p>
          <h1 className="page-title">
            {isToday ? 'Today' : today.format('MMMM D, YYYY')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {now.format('h:mm A')} <span className="px-1">·</span> {user?.name || 'Welcome'}
          </p>
        </div>

        {dataError && (
          <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {dataError}
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <Link to="/tasks" aria-label="Add task" title="Add task" className="rounded-xl border bg-card p-2.5 shadow-sm transition hover:bg-muted">
            <Calendar className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1">
            <button 
              aria-label="Previous day"
              className="rounded-xl border bg-card p-2.5 shadow-sm transition hover:bg-muted"
              onClick={() => setCurrentDate(dayjs(currentDate).subtract(1, 'day').toDate())}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm px-2">{today.format('ddd MMM D')}</span>
            <button 
              aria-label="Next day"
              className="rounded-xl border bg-card p-2.5 shadow-sm transition hover:bg-muted"
              onClick={() => setCurrentDate(dayjs(currentDate).add(1, 'day').toDate())}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Current Activity */}
      <div className="surface-card p-5 md:p-6">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
          <span className="page-eyebrow">Happening now</span>
        </div>
        
        {timeBlocks.length > 0 ? (
          <div className="space-y-2">
            {timeBlocks
              .filter(tb => new Date(tb.endDate).getTime() > Date.now() - 60000)
              .slice(0, 1)
              .map((block) => (
                <div key={block.id}>
                  <h3 className="text-xl font-semibold tracking-tight">{block.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {dayjs(block.startDate).format('h:mm A')} - {dayjs(block.endDate).format('h:mm A')}
                  </p>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No scheduled activities right now. Take a moment or plan your next focus block.</p>
        )}
      </div>

      {/* Next Up */}
      <div className="surface-card p-5 md:p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">Up next</h2>
          <span className="text-xs font-medium text-muted-foreground">Your priorities</span>
        </div>
        {tasks.slice(0, 2).map((task) => (
          <div key={task.id} className="border-b border-border/70 py-4 last:border-0 last:pb-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium tracking-tight">{task.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {task.dueDate && `Due ${dayjs(task.dueDate).format('MMM D, h:mm A')}`}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                task.priority >= 7 ? 'bg-red-100 text-red-800' :
                task.priority >= 4 ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-800'
              }`}>
                {task.priority >= 7 ? 'High' : task.priority >= 4 ? 'Med' : 'Low'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* AI Recommendations */}
      <div className="surface-card border-primary/15 bg-gradient-to-br from-white to-secondary/70 p-5 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <p className="page-eyebrow">Personalized guidance</p>
            <h2 className="font-semibold tracking-tight">AI Assistant</h2>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground">
          {assistantService.apiAvailable
            ? 'Ask the assistant to review your day or help prioritize open work.'
            : 'Assistant conversations are unavailable because the backend has no assistant controller yet.'}
        </p>
        <Link to="/assistant" className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline">
          Open Assistant
        </Link>
      </div>

      {/* Goals Progress */}
      <div className="surface-card p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">Goals in progress</h2>
          <Target className="h-4 w-4 text-primary" />
        </div>
        <div className="space-y-4">
          {goals.slice(0, 3).map((goal) => (
            <div key={goal.id}>
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{goal.title}</h3>
                <span className="text-xs font-medium text-muted-foreground">
                  {goal.progress}%
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div 
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${goal.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

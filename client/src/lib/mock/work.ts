import type { GoalDTO, ProjectDTO, TaskDTO } from '@/services/types';
import { mockId } from '@/lib/mock/calendar';

const GOALS_KEY = 'calassist-mock-goals';
const PROJECTS_KEY = 'calassist-mock-projects';
const TASKS_KEY = 'calassist-mock-tasks';
const VERSION = 1;

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function timestamp(): string {
  return new Date().toISOString();
}

function seedGoals(): GoalDTO[] {
  const now = timestamp();
  return [
    { id: 'goal_launch', userId: 'usr_demo', title: 'Ship the client launch', description: 'Bring the first customer-ready release across the line.', status: 'IN_PROGRESS', priority: 9, startDate: dateOffset(-18), targetDate: dateOffset(24), completedAt: null, createdAt: now, updatedAt: now },
    { id: 'goal_health', userId: 'usr_demo', title: 'Build a steadier week', description: 'Protect focus time and make room for recovery.', status: 'IN_PROGRESS', priority: 7, startDate: dateOffset(-8), targetDate: dateOffset(38), completedAt: null, createdAt: now, updatedAt: now },
    { id: 'goal_learning', userId: 'usr_demo', title: 'Get comfortable with Spanish', description: 'A small daily habit, with a conversational milestone.', status: 'PENDING', priority: 4, startDate: null, targetDate: dateOffset(70), completedAt: null, createdAt: now, updatedAt: now },
  ];
}

function seedProjects(): ProjectDTO[] {
  const now = timestamp();
  return [
    { id: 'project_release', userId: 'usr_demo', goalId: 'goal_launch', title: 'Release 1.0', description: 'Close the remaining product and launch work.', status: 'IN_PROGRESS', priority: 9, startDate: dateOffset(-12), dueDate: dateOffset(18), completedAt: null, createdAt: now, updatedAt: now },
    { id: 'project_research', userId: 'usr_demo', goalId: 'goal_launch', title: 'Customer discovery', description: 'Turn early interviews into a clear product brief.', status: 'PENDING', priority: 6, startDate: dateOffset(-4), dueDate: dateOffset(12), completedAt: null, createdAt: now, updatedAt: now },
    { id: 'project_routine', userId: 'usr_demo', goalId: 'goal_health', title: 'Morning reset', description: null, status: 'IN_PROGRESS', priority: 5, startDate: dateOffset(-7), dueDate: dateOffset(28), completedAt: null, createdAt: now, updatedAt: now },
  ];
}

function seedTasks(): TaskDTO[] {
  const now = timestamp();
  const task = (id: string, title: string, projectId: string | null, goalId: string | null, status: TaskDTO['status'], priority: number, dueIn: number, duration: number, description: string | null = null): TaskDTO => ({
    id, userId: 'usr_demo', projectId, goalId, milestoneId: null, title, description, status, priority,
    estimatedDurationMin: duration, actualDurationMin: status === 'COMPLETED' ? duration : null,
    dueDate: dateOffset(dueIn), startDate: null, completedAt: status === 'COMPLETED' ? dateOffset(-1) : null,
    source: 'USER', flexibility: 'MEDIUM', energyRequirement: 'MEDIUM', context: null,
    preferredTime: null, location: null, createdAt: now, updatedAt: now,
  });
  return [
    task('task_api', 'Finish API error states', 'project_release', 'goal_launch', 'IN_PROGRESS', 9, 1, 90, 'Cover empty, conflict, and retry paths.'),
    task('task_review', 'Review onboarding copy', 'project_release', 'goal_launch', 'PENDING', 7, 3, 45),
    task('task_demo', 'Prepare launch walkthrough', 'project_release', 'goal_launch', 'PENDING', 8, 7, 75),
    task('task_interviews', 'Summarize interview notes', 'project_research', 'goal_launch', 'COMPLETED', 6, -2, 60),
    task('task_walk', 'Take a lunchtime walk', 'project_routine', 'goal_health', 'PENDING', 5, 0, 30),
    task('task_vocab', 'Practice ten new words', null, 'goal_learning', 'PENDING', 4, 2, 15),
    task('task_inbox', 'Clear launch feedback inbox', null, 'goal_launch', 'BLOCKED', 6, 4, 30, 'Waiting on the latest customer notes.'),
  ];
}

function readRows<T>(key: string, seed: () => T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as { version: number; data: T[] };
    return parsed.version === VERSION && Array.isArray(parsed.data) ? parsed.data : seed();
  } catch {
    return seed();
  }
}

function writeRows<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify({ version: VERSION, data }));
  } catch {
    // The in-memory mock remains usable when browser storage is unavailable.
  }
}

export const mockWork = {
  goals: () => readRows(GOALS_KEY, seedGoals),
  projects: () => readRows(PROJECTS_KEY, seedProjects),
  tasks: () => readRows(TASKS_KEY, seedTasks),
  saveGoals: (rows: GoalDTO[]) => writeRows(GOALS_KEY, rows),
  saveProjects: (rows: ProjectDTO[]) => writeRows(PROJECTS_KEY, rows),
  saveTasks: (rows: TaskDTO[]) => writeRows(TASKS_KEY, rows),
  id: (prefix: string) => mockId(`${prefix}_`),
  now: timestamp,
};
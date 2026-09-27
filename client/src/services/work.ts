import api from './api';
import { USE_MOCK } from './auth';
import { latency } from '@/lib/mock/db';
import { mockWork } from '@/lib/mock/work';
import type {
  CreateGoalInput,
  CreateProjectInput,
  CreateTaskInput,
  GoalDTO,
  GoalStatus,
  ProjectDTO,
  ProjectStatus,
  TaskDTO,
  TaskStatus,
  UpdateGoalInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from './types';

export const workService = {
  async listGoals(status?: GoalStatus): Promise<GoalDTO[]> {
    if (USE_MOCK) {
      await latency();
      return mockWork.goals().filter((goal) => !status || goal.status === status);
    }
    const { data } = await api.get<GoalDTO[]>('/api/goals', { params: { status } });
    return data;
  },

  async createGoal(input: CreateGoalInput): Promise<GoalDTO> {
    if (!USE_MOCK) return (await api.post<GoalDTO>('/api/goals', input)).data;
    await latency();
    const now = mockWork.now();
    const goal: GoalDTO = {
      id: mockWork.id('goal'), userId: 'usr_demo', title: input.title,
      description: input.description ?? null, status: 'PENDING', priority: input.priority ?? 5,
      startDate: input.startDate ?? null, targetDate: input.targetDate ?? null,
      completedAt: null, createdAt: now, updatedAt: now,
    };
    mockWork.saveGoals([goal, ...mockWork.goals()]);
    return goal;
  },

  async updateGoal(id: string, input: UpdateGoalInput): Promise<GoalDTO> {
    if (!USE_MOCK) return (await api.patch<GoalDTO>(`/api/goals/${id}`, input)).data;
    await latency();
    const rows = mockWork.goals();
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new Error('Goal not found');
    rows[index] = { ...rows[index], ...input, description: input.description ?? rows[index].description,
      completedAt: input.status === 'COMPLETED' ? mockWork.now() : input.status ? null : rows[index].completedAt,
      updatedAt: mockWork.now() };
    mockWork.saveGoals(rows);
    return rows[index];
  },

  async deleteGoal(id: string): Promise<void> {
    if (!USE_MOCK) { await api.delete(`/api/goals/${id}`); return; }
    await latency();
    mockWork.saveGoals(mockWork.goals().filter((row) => row.id !== id));
  },

  async listProjects(filters: { status?: ProjectStatus; goalId?: string } = {}): Promise<ProjectDTO[]> {
    if (USE_MOCK) {
      await latency();
      return mockWork.projects().filter((row) => (!filters.status || row.status === filters.status) && (!filters.goalId || row.goalId === filters.goalId));
    }
    const { data } = await api.get<ProjectDTO[]>('/api/projects', { params: filters });
    return data;
  },

  async createProject(input: CreateProjectInput): Promise<ProjectDTO> {
    if (!USE_MOCK) return (await api.post<ProjectDTO>('/api/projects', input)).data;
    await latency();
    const now = mockWork.now();
    const project: ProjectDTO = {
      id: mockWork.id('project'), userId: 'usr_demo', goalId: input.goalId ?? null,
      title: input.title, description: input.description ?? null, status: 'PENDING',
      priority: input.priority ?? 5, startDate: input.startDate ?? null, dueDate: input.dueDate ?? null,
      completedAt: null, createdAt: now, updatedAt: now,
    };
    mockWork.saveProjects([project, ...mockWork.projects()]);
    return project;
  },

  async updateProject(id: string, input: UpdateProjectInput): Promise<ProjectDTO> {
    if (!USE_MOCK) return (await api.patch<ProjectDTO>(`/api/projects/${id}`, input)).data;
    await latency();
    const rows = mockWork.projects();
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new Error('Project not found');
    rows[index] = { ...rows[index], ...input, description: input.description ?? rows[index].description,
      completedAt: input.status === 'COMPLETED' ? mockWork.now() : input.status ? null : rows[index].completedAt,
      updatedAt: mockWork.now() };
    mockWork.saveProjects(rows);
    return rows[index];
  },

  async deleteProject(id: string): Promise<void> {
    if (!USE_MOCK) { await api.delete(`/api/projects/${id}`); return; }
    await latency();
    mockWork.saveProjects(mockWork.projects().filter((row) => row.id !== id));
  },

  async listTasks(filters: { status?: TaskStatus; goalId?: string; projectId?: string } = {}): Promise<TaskDTO[]> {
    if (USE_MOCK) {
      await latency();
      return mockWork.tasks().filter((row) => (!filters.status || row.status === filters.status) && (!filters.goalId || row.goalId === filters.goalId) && (!filters.projectId || row.projectId === filters.projectId));
    }
    const { data } = await api.get<TaskDTO[]>('/api/tasks', { params: filters });
    return data;
  },

  async createTask(input: CreateTaskInput): Promise<TaskDTO> {
    if (!USE_MOCK) return (await api.post<TaskDTO>('/api/tasks', input)).data;
    await latency();
    const now = mockWork.now();
    const task: TaskDTO = {
      id: mockWork.id('task'), userId: 'usr_demo', title: input.title,
      description: input.description ?? null, projectId: input.projectId ?? null, goalId: input.goalId ?? null,
      milestoneId: input.milestoneId ?? null, status: 'PENDING', priority: input.priority ?? 5,
      estimatedDurationMin: input.estimatedDurationMinutes ?? null, actualDurationMin: null,
      startDate: input.startDate ?? null, dueDate: input.dueDate ?? null, completedAt: null,
      source: 'USER', flexibility: input.flexibility ?? 'MEDIUM', energyRequirement: input.energyRequirement ?? 'MEDIUM',
      context: input.context ?? null, preferredTime: input.preferredTime ?? null, location: input.location ?? null,
      createdAt: now, updatedAt: now,
    };
    mockWork.saveTasks([task, ...mockWork.tasks()]);
    return task;
  },

  async updateTask(id: string, input: UpdateTaskInput): Promise<TaskDTO> {
    if (!USE_MOCK) return (await api.patch<TaskDTO>(`/api/tasks/${id}`, input)).data;
    await latency();
    const rows = mockWork.tasks();
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new Error('Task not found');
    const { estimatedDurationMinutes, actualDurationMinutes, ...rest } = input;
    rows[index] = { ...rows[index], ...rest,
      estimatedDurationMin: estimatedDurationMinutes ?? rows[index].estimatedDurationMin,
      actualDurationMin: actualDurationMinutes ?? rows[index].actualDurationMin,
      description: input.description ?? rows[index].description,
      completedAt: input.status === 'COMPLETED' ? input.completedAt ?? mockWork.now() : input.status ? null : rows[index].completedAt,
      updatedAt: mockWork.now() };
    mockWork.saveTasks(rows);
    return rows[index];
  },

  async deleteTask(id: string): Promise<void> {
    if (!USE_MOCK) { await api.delete(`/api/tasks/${id}`); return; }
    await latency();
    mockWork.saveTasks(mockWork.tasks().filter((row) => row.id !== id));
  },
};
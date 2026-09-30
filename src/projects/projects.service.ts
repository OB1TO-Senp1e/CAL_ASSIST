import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { CreateProjectRequest, UpdateProjectRequest } from './interfaces/project.interface';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, request: CreateProjectRequest) {
    return this.prisma.project.create({
      data: {
        userId,
        title: request.title,
        description: request.description,
        goalId: request.goalId,
        priority: request.priority,
        startDate: request.startDate ? new Date(request.startDate) : undefined,
        dueDate: request.dueDate ? new Date(request.dueDate) : undefined,
      },
    });
  }

  async findAll(
    userId: string,
    options?: {
      status?: string;
      goalId?: string;
      limit?: number;
    }
  ) {
    const where: any = { userId };
    if (options?.status) where.status = options.status;
    if (options?.goalId) where.goalId = options.goalId;

    return this.prisma.project.findMany({
      where,
      orderBy: { priority: 'desc' },
      take: options?.limit,
      include: {
        milestones: {
          include: {
            tasks: true,
          },
        },
        tasks: true,
      },
    });
  }

  async findOne(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
      include: {
        milestones: {
          include: {
            tasks: {
              include: {
                timeBlocks: true,
              },
            },
          },
        },
        tasks: {
          include: {
            timeBlocks: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(userId: string, id: string, request: UpdateProjectRequest) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        title: request.title,
        description: request.description,
        goalId: request.goalId,
        status: request.status,
        priority: request.priority,
        startDate: request.startDate ? new Date(request.startDate) : undefined,
        dueDate: request.dueDate ? new Date(request.dueDate) : undefined,
        // Match the goal/task rule: completing stamps completedAt, reopening clears it.
        completedAt:
          request.status === 'COMPLETED'
            ? new Date()
            : request.status && project.completedAt
              ? null
              : undefined,
      },
    });
  }

  async delete(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.project.delete({
      where: { id },
    });
  }

  async getProgress(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
      include: {
        milestones: {
          include: {
            tasks: {
              select: {
                id: true,
                status: true,
                estimatedDurationMin: true,
                actualDurationMin: true,
                dueDate: true,
              },
            },
          },
        },
        tasks: {
          select: {
            id: true,
            status: true,
            estimatedDurationMin: true,
            actualDurationMin: true,
            dueDate: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const allTasks = [...project.tasks, ...project.milestones.flatMap((m) => m.tasks)];

    const uniqueTasks = Array.from(new Map(allTasks.map((t) => [t.id, t])).values());

    const totalTasks = uniqueTasks.length;
    const completedTasks = uniqueTasks.filter((task) => task.status === 'COMPLETED').length;
    const estimatedMinutes = uniqueTasks.reduce((sum, t) => sum + (t.estimatedDurationMin || 0), 0);
    const actualMinutes = uniqueTasks.reduce((sum, t) => sum + (t.actualDurationMin || 0), 0);

    const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

    return {
      projectId: project.id,
      title: project.title,
      status: project.status,
      dueDate: project.dueDate,
      progress: {
        totalTasks,
        completedTasks,
        completionRate: Math.round(completionRate * 100),
        estimatedHours: Math.round((estimatedMinutes / 60) * 10) / 10,
        actualHours: Math.round((actualMinutes / 60) * 10) / 10,
      },
      milestones: project.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        dueDate: m.dueDate,
        taskCount: m.tasks.length,
      })),
    };
  }

  async getHierarchy(userId: string, id: string) {
    const project = await this.findOne(userId, id);

    return {
      project: {
        id: project.id,
        title: project.title,
        description: project.description,
        status: project.status,
        priority: project.priority,
        startDate: project.startDate,
        dueDate: project.dueDate,
        milestones: project.milestones.map((milestone) => ({
          id: milestone.id,
          title: milestone.title,
          description: milestone.description,
          status: milestone.status,
          dueDate: milestone.dueDate,
          tasks: milestone.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            estimatedDurationMin: task.estimatedDurationMin,
            dueDate: task.dueDate,
          })),
        })),
        tasks: project.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          estimatedDurationMin: task.estimatedDurationMin,
          dueDate: task.dueDate,
        })),
      },
    };
  }
}

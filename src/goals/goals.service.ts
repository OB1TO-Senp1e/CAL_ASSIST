import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { CreateGoalRequest, UpdateGoalRequest } from './interfaces/goal.interface';
import { GoalEngine } from './domain/goal-engine';

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalEngine: GoalEngine
  ) {}

  async create(userId: string, request: CreateGoalRequest) {
    return this.prisma.goal.create({
      data: {
        userId,
        title: request.title,
        description: request.description,
        priority: request.priority,
        startDate: request.startDate ? new Date(request.startDate) : undefined,
        targetDate: request.targetDate ? new Date(request.targetDate) : undefined,
      },
    });
  }

  async findAll(userId: string, options?: { status?: string; limit?: number }) {
    const where: any = { userId };
    if (options?.status) {
      where.status = options.status;
    }

    return this.prisma.goal.findMany({
      where,
      orderBy: { priority: 'desc' },
      take: options?.limit,
    });
  }

  async findOne(userId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
      include: {
        projects: {
          include: {
            milestones: {
              include: {
                tasks: true,
              },
            },
            tasks: true,
          },
        },
        milestones: {
          include: {
            tasks: true,
          },
        },
        tasks: {
          include: {
            timeBlocks: true,
          },
        },
      },
    });

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    return goal;
  }

  async update(userId: string, id: string, request: UpdateGoalRequest) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
    });

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    return this.prisma.goal.update({
      where: { id },
      data: {
        title: request.title,
        description: request.description,
        status: request.status,
        priority: request.priority,
        startDate: request.startDate ? new Date(request.startDate) : undefined,
        targetDate: request.targetDate ? new Date(request.targetDate) : undefined,
        // Completing stamps the time; moving back out of COMPLETED clears it.
        completedAt:
          request.status === 'COMPLETED'
            ? new Date()
            : request.status && goal.completedAt
              ? null
              : undefined,
      },
    });
  }

  async delete(userId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
    });

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    return this.prisma.goal.delete({
      where: { id },
    });
  }

  async getProgress(userId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
      include: {
        projects: {
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
        },
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

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    // Aggregate all tasks from goal, projects, and milestones
    const allTasks = [
      ...goal.tasks,
      ...goal.projects.flatMap((p) => p.tasks),
      ...goal.projects.flatMap((p) => p.milestones.flatMap((m) => m.tasks)),
      ...goal.milestones.flatMap((m) => m.tasks),
    ];

    // Deduplicate tasks by ID
    const uniqueTasks = Array.from(new Map(allTasks.map((t) => [t.id, t])).values());

    const totalTasks = uniqueTasks.length;
    const completedTasks = uniqueTasks.filter((task) => task.status === 'COMPLETED').length;
    const estimatedMinutes = uniqueTasks.reduce((sum, t) => sum + (t.estimatedDurationMin || 0), 0);
    const actualMinutes = uniqueTasks.reduce((sum, t) => sum + (t.actualDurationMin || 0), 0);

    const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

    const metrics = {
      totalTasks,
      completedTasks,
      overdueTasks: uniqueTasks.filter(
        (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED'
      ).length,
      estimatedTotalHours: Math.round((estimatedMinutes / 60) * 10) / 10,
      actualTotalHours: Math.round((actualMinutes / 60) * 10) / 10,
    };

    const progress = this.goalEngine.calculateProgress(metrics);
    const risk = this.goalEngine.calculateRisk(metrics, goal.targetDate || undefined);

    return {
      goalId: goal.id,
      title: goal.title,
      status: goal.status,
      targetDate: goal.targetDate,
      progress,
      risk,
      metrics,
      hierarchy: {
        projects: goal.projects.length,
        milestones:
          goal.milestones.length + goal.projects.reduce((sum, p) => sum + p.milestones.length, 0),
        totalTasks,
      },
    };
  }

  async getHierarchy(userId: string, id: string) {
    const goal = await this.findOne(userId, id);

    // Build full hierarchy tree
    return {
      goal: {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        status: goal.status,
        priority: goal.priority,
        targetDate: goal.targetDate,
        projects: goal.projects.map((project) => ({
          id: project.id,
          title: project.title,
          description: project.description,
          status: project.status,
          priority: project.priority,
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
        })),
        milestones: goal.milestones.map((milestone) => ({
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
        tasks: goal.tasks.map((task) => ({
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

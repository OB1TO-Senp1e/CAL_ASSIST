import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { CreateMilestoneRequest, UpdateMilestoneRequest } from './interfaces/milestone.interface';

@Injectable()
export class MilestonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, request: CreateMilestoneRequest) {
    // Validate that either projectId or goalId is provided
    if (!request.projectId && !request.goalId) {
      throw new BadRequestException('Milestone must be associated with either a project or a goal');
    }

    return this.prisma.milestone.create({
      data: {
        userId,
        title: request.title,
        description: request.description,
        projectId: request.projectId,
        goalId: request.goalId,
        dueDate: new Date(request.dueDate),
        priority: request.priority,
      },
    });
  }

  async findAll(
    userId: string,
    options?: {
      status?: string;
      goalId?: string;
      projectId?: string;
      limit?: number;
    }
  ) {
    const where: any = { userId };
    if (options?.status) where.status = options.status;
    if (options?.goalId) where.goalId = options.goalId;
    if (options?.projectId) where.projectId = options.projectId;

    return this.prisma.milestone.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      take: options?.limit,
      include: {
        tasks: true,
      },
    });
  }

  async findOne(userId: string, id: string) {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id, userId },
      include: {
        tasks: {
          include: {
            timeBlocks: true,
          },
        },
      },
    });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    return milestone;
  }

  async update(userId: string, id: string, request: UpdateMilestoneRequest) {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id, userId },
    });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    return this.prisma.milestone.update({
      where: { id },
      data: {
        title: request.title,
        description: request.description,
        projectId: request.projectId,
        goalId: request.goalId,
        status: request.status,
        priority: request.priority,
        dueDate: request.dueDate ? new Date(request.dueDate) : undefined,
        completedAt: request.completedAt ? new Date(request.completedAt) : undefined,
      },
    });
  }

  async delete(userId: string, id: string) {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id, userId },
    });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    return this.prisma.milestone.delete({
      where: { id },
    });
  }

  async getProgress(userId: string, id: string) {
    const milestone = await this.prisma.milestone.findFirst({
      where: { id, userId },
      include: {
        tasks: {
          select: {
            status: true,
            estimatedDurationMin: true,
            actualDurationMin: true,
          },
        },
      },
    });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    const totalTasks = milestone.tasks.length;
    const completedTasks = milestone.tasks.filter((task) => task.status === 'COMPLETED').length;
    const estimatedMinutes = milestone.tasks.reduce(
      (sum, t) => sum + (t.estimatedDurationMin || 0),
      0
    );
    const actualMinutes = milestone.tasks.reduce((sum, t) => sum + (t.actualDurationMin || 0), 0);

    const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

    return {
      milestoneId: milestone.id,
      title: milestone.title,
      status: milestone.status,
      dueDate: milestone.dueDate,
      progress: {
        totalTasks,
        completedTasks,
        completionRate: Math.round(completionRate * 100),
        estimatedHours: Math.round((estimatedMinutes / 60) * 10) / 10,
        actualHours: Math.round((actualMinutes / 60) * 10) / 10,
      },
    };
  }
}

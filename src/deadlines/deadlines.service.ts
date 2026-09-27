import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { CreateDeadlineRequest, UpdateDeadlineRequest } from './interfaces/deadline.interface';

@Injectable()
export class DeadlinesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, request: CreateDeadlineRequest) {
    return this.prisma.deadline.create({
      data: {
        userId,
        title: request.title,
        description: request.description,
        dueDate: new Date(request.dueDate),
        goalId: request.goalId,
        projectId: request.projectId,
        priority: request.priority,
        timezone: request.timezone || 'UTC',
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
      upcoming?: boolean;
    }
  ) {
    const where: any = { userId };
    if (options?.status) where.status = options.status;
    if (options?.goalId) where.goalId = options.goalId;
    if (options?.projectId) where.projectId = options.projectId;

    if (options?.upcoming) {
      where.dueDate = { gte: new Date() };
    }

    return this.prisma.deadline.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      take: options?.limit,
    });
  }

  async findOne(userId: string, id: string) {
    const deadline = await this.prisma.deadline.findFirst({
      where: { id, userId },
    });

    if (!deadline) {
      throw new NotFoundException('Deadline not found');
    }

    return deadline;
  }

  async update(userId: string, id: string, request: UpdateDeadlineRequest) {
    const deadline = await this.prisma.deadline.findFirst({
      where: { id, userId },
    });

    if (!deadline) {
      throw new NotFoundException('Deadline not found');
    }

    return this.prisma.deadline.update({
      where: { id },
      data: {
        title: request.title,
        description: request.description,
        dueDate: request.dueDate ? new Date(request.dueDate) : undefined,
        goalId: request.goalId,
        projectId: request.projectId,
        status: request.status,
        priority: request.priority,
        timezone: request.timezone,
      },
    });
  }

  async delete(userId: string, id: string) {
    const deadline = await this.prisma.deadline.findFirst({
      where: { id, userId },
    });

    if (!deadline) {
      throw new NotFoundException('Deadline not found');
    }

    return this.prisma.deadline.delete({
      where: { id },
    });
  }

  async getUpcoming(userId: string, days: number = 7) {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return this.prisma.deadline.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: {
          gte: now,
          lte: future,
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getOverdue(userId: string) {
    const now = new Date();

    const overdue = await this.prisma.deadline.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { lt: now },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Update status to OVERDUE
    for (const deadline of overdue) {
      await this.prisma.deadline.update({
        where: { id: deadline.id },
        data: { status: 'OVERDUE' },
      });
    }

    return overdue;
  }
}

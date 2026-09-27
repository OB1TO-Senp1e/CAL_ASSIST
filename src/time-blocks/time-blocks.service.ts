import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { CreateTimeBlockRequest, UpdateTimeBlockRequest } from './interfaces/time-block.interface';

@Injectable()
export class TimeBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, request: CreateTimeBlockRequest) {
    return this.prisma.timeBlock.create({
      data: {
        userId,
        title: request.title,
        description: request.description,
        eventId: request.eventId,
        taskId: request.taskId,
        startDate: new Date(request.startDate),
        endDate: new Date(request.endDate),
        blockType: request.blockType,
        status: request.status || 'SCHEDULED',
        focusLevel: request.focusLevel || 1,
      },
    });
  }

  async findAll(
    userId: string,
    options?: {
      startDate?: string;
      endDate?: string;
      blockType?: string;
      limit?: number;
    }
  ) {
    const where: any = { userId };

    if (options?.startDate && options?.endDate) {
      where.startDate = {
        gte: new Date(options.startDate),
        lte: new Date(options.endDate),
      };
    }

    if (options?.blockType) {
      where.blockType = options.blockType;
    }

    return this.prisma.timeBlock.findMany({
      where,
      orderBy: [{ startDate: 'asc' }],
      take: options?.limit,
      include: {
        event: true,
        task: true,
      },
    });
  }

  async findOne(userId: string, id: string) {
    const timeBlock = await this.prisma.timeBlock.findFirst({
      where: { id, userId },
      include: {
        event: true,
        task: true,
      },
    });

    if (!timeBlock) {
      throw new NotFoundException('TimeBlock not found');
    }

    return timeBlock;
  }

  async update(userId: string, id: string, request: UpdateTimeBlockRequest) {
    const timeBlock = await this.prisma.timeBlock.findFirst({
      where: { id, userId },
    });

    if (!timeBlock) {
      throw new NotFoundException('TimeBlock not found');
    }

    return this.prisma.timeBlock.update({
      where: { id },
      data: {
        title: request.title,
        description: request.description,
        eventId: request.eventId,
        taskId: request.taskId,
        startDate: request.startDate,
        endDate: request.endDate,
        blockType: request.blockType,
        status: request.status,
        focusLevel: request.focusLevel,
      },
    });
  }

  async delete(userId: string, id: string) {
    const timeBlock = await this.prisma.timeBlock.findFirst({
      where: { id, userId },
    });

    if (!timeBlock) {
      throw new NotFoundException('TimeBlock not found');
    }

    return this.prisma.timeBlock.delete({
      where: { id },
    });
  }
}

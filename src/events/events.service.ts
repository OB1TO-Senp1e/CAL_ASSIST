import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { CreateEventRequest, UpdateEventRequest } from './interfaces/event.interface';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, request: CreateEventRequest) {
    return this.prisma.event.create({
      data: {
        userId,
        title: request.title,
        description: request.description,
        location: request.location,
        startDate: new Date(request.startDate),
        endDate: new Date(request.endDate),
        allDay: request.allDay,
        timezone: request.timezone,
        recurrenceRule: request.recurrence,
        status: request.status,
      },
    });
  }

  async findAll(
    userId: string,
    options?: {
      status?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    }
  ) {
    const where: any = { userId };
    if (options?.status) where.status = options.status;
    if (options?.startDate && options?.endDate) {
      where.AND = [
        { startDate: { gte: new Date(options.startDate) } },
        { startDate: { lte: new Date(options.endDate) } },
      ];
    }

    return this.prisma.event.findMany({
      where,
      orderBy: { startDate: 'asc' },
      take: options?.limit,
    });
  }

  async findOne(userId: string, id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, userId },
      include: {
        timeBlocks: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async update(userId: string, id: string, request: UpdateEventRequest) {
    const event = await this.prisma.event.findFirst({
      where: { id, userId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        title: request.title,
        description: request.description,
        location: request.location,
        startDate: request.startDate ? new Date(request.startDate) : undefined,
        endDate: request.endDate ? new Date(request.endDate) : undefined,
        allDay: request.allDay,
        timezone: request.timezone,
        recurrenceRule: request.recurrence,
        status: request.status,
      },
    });
  }

  async delete(userId: string, id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, userId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.prisma.event.delete({
      where: { id },
    });
  }
}

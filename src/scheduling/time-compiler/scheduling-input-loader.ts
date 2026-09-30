import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import {
  SchedulingInput,
  SchedulingTask,
  CalendarEvent,
  AvailabilityRule,
  SchedulingConstraint,
  TaskFlexibility,
  EnergyLevel,
} from './domain/time-compiler.types';
import { CompileScheduleRequest } from './interfaces/time-compiler.interface';
import {
  DEFAULT_TASK_DURATION_MIN,
  SchedulingPreferencesResolver,
} from './scheduling-preferences.resolver';

const SCHEDULABLE_TASK_STATUSES = ['PENDING', 'IN_PROGRESS'];

@Injectable()
export class SchedulingInputLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: SchedulingPreferencesResolver
  ) {}

  /**
   * Assembles a real SchedulingInput from the user's data. Replaces the previous
   * inline mock that hard-coded `tasks: []`, which made every compile throw
   * "No tasks to schedule" no matter what the user actually owned.
   */
  async load(userId: string, request: CompileScheduleRequest): Promise<SchedulingInput> {
    const start = new Date(request.timeRange.start);
    const end = new Date(request.timeRange.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('timeRange.start and timeRange.end must be valid ISO dates');
    }
    if (start >= end) {
      throw new BadRequestException('Invalid time range: start must be before end');
    }

    const taskWhere: any = {
      userId,
      deletedAt: null,
      status: { in: SCHEDULABLE_TASK_STATUSES },
    };

    // The client sends taskIds; goalId/projectId scope the request to one
    // objective. Honour all three so "compile my week" works end to end.
    if (request.taskIds?.length) {
      taskWhere.id = { in: request.taskIds };
    } else if (request.projectId) {
      taskWhere.projectId = request.projectId;
    } else if (request.goalId) {
      taskWhere.goalId = request.goalId;
    }

    const [tasks, events, availabilityRules, constraints, preferenceRows, user] = await Promise.all(
      [
        this.prisma.task.findMany({
          where: taskWhere,
          include: { dependencies: { select: { dependsOnId: true } } },
          orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
          take: 100,
        }),
        this.prisma.event.findMany({
          where: {
            userId,
            deletedAt: null,
            status: { not: 'CANCELLED' },
            startDate: { lt: end },
            endDate: { gt: start },
          },
          orderBy: { startDate: 'asc' },
          take: 200,
        }),
        this.prisma.availabilityRule.findMany({
          where: { userId, deletedAt: null },
          orderBy: { priority: 'desc' },
        }),
        this.prisma.constraint.findMany({
          where: { userId, deletedAt: null, isActive: true },
        }),
        this.prisma.preference.findMany({
          where: { userId, deletedAt: null },
          select: { key: true, valueJson: true },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { timezone: true },
        }),
      ]
    );

    return {
      userId,
      timeRange: { start, end },
      timezone: request.timezone || user?.timezone || 'UTC',
      tasks: this.mapTasks(tasks),
      fixedEvents: this.mapEvents(events),
      availability: this.mapAvailability(availabilityRules),
      constraints: this.mapConstraints(constraints),
      preferences: this.preferences.resolve(request, preferenceRows),
      existingBlocks: [],
    };
  }

  private mapTasks(rows: any[]): SchedulingTask[] {
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? undefined,
      estimatedDurationMinutes:
        t.estimatedDurationMin && t.estimatedDurationMin > 0
          ? t.estimatedDurationMin
          : DEFAULT_TASK_DURATION_MIN,
      actualDurationMinutes: t.actualDurationMin ?? undefined,
      priority: t.priority ?? 0,
      deadline: t.dueDate ?? undefined,
      startDate: t.startDate ?? undefined,
      status: t.status,
      dependencies: (t.dependencies ?? []).map((d: any) => d.dependsOnId),
      flexibility: (t.flexibility ?? 'MEDIUM') as TaskFlexibility,
      energyRequirement: (t.energyRequirement ?? 'MEDIUM') as EnergyLevel,
      context: t.context ?? undefined,
      preferredTime: t.preferredTime ?? undefined,
      location: t.location ?? undefined,
      goalId: t.goalId ?? undefined,
      projectId: t.projectId ?? undefined,
      milestoneId: t.milestoneId ?? undefined,
    }));
  }

  private mapEvents(rows: any[]): CalendarEvent[] {
    return rows.map((e) => ({
      id: e.id,
      title: e.title,
      startTime: e.startDate,
      endTime: e.endDate,
      timezone: e.timezone ?? 'UTC',
      isAllDay: e.allDay,
      status: e.status,
      location: e.location ?? undefined,
      // Real calendar events are treated as immovable.
      isFixed: true,
    }));
  }

  private mapAvailability(rows: any[]): AvailabilityRule[] {
    return rows.map((r) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek ?? undefined,
      startDate: r.startDate ?? undefined,
      endDate: r.endDate ?? undefined,
      startTime: r.startTime,
      endTime: r.endTime,
      timezone: r.timezone ?? 'UTC',
      isAvailable: r.isAvailable,
      priority: r.priority ?? 0,
      recurrence: (r.recurrence ?? 'WEEKLY') as AvailabilityRule['recurrence'],
    }));
  }

  private mapConstraints(rows: any[]): SchedulingConstraint[] {
    return rows.map((c) => ({
      id: c.id,
      type: this.mapConstraintType(c.type),
      severity: this.mapConstraintSeverity(c.severity),
      description: c.description ?? c.title,
      parameters: {
        title: c.title,
        startDate: c.startDate?.toISOString(),
        endDate: c.endDate?.toISOString(),
        timeWindowStart: c.timeWindowStart,
        timeWindowEnd: c.timeWindowEnd,
        daysOfWeek: c.daysOfWeek,
      },
    }));
  }

  /** Prisma `ConstraintType` and the compiler's vocabulary do not line up 1:1. */
  private mapConstraintType(type: string): SchedulingConstraint['type'] {
    switch (type) {
      case 'FOCUS_REQUIRED':
        return 'FOCUS_REQUIRED';
      case 'PREFERRED_TIME':
        return 'PREFERRED_TIME';
      case 'MAX_MEETING_HOURS':
        return 'MAX_HOURS_PER_DAY';
      case 'MIN_BREAK_TIME':
        return 'MIN_BREAK_BETWEEN';
      case 'ENERGY_CONSERVATION':
        return 'ENERGY_MATCH';
      case 'NO_MEETINGS':
      case 'AVOID_TIME':
      default:
        return 'AVAILABILITY_WINDOW';
    }
  }

  /** Prisma uses LOW..HARD_STOP; the compiler uses HARD/SOFT/PREFERENCE. */
  private mapConstraintSeverity(severity: string): SchedulingConstraint['severity'] {
    switch (severity) {
      case 'HARD_STOP':
      case 'HIGH':
        return 'HARD';
      case 'MEDIUM':
        return 'SOFT';
      case 'LOW':
      default:
        return 'PREFERENCE';
    }
  }
}

/** Compiler block type -> Prisma `TimeBlockType`. */
export function toPrismaBlockType(
  type: string
): 'FOCUS' | 'MEETING' | 'TRAVEL' | 'BREAK' | 'BUFFER' | 'ROUTINE' {
  switch (type) {
    case 'MEETING':
      return 'MEETING';
    case 'BREAK':
      return 'BREAK';
    case 'BUFFER':
      return 'BUFFER';
    case 'TRAVEL':
      return 'TRAVEL';
    case 'ROUTINE':
      return 'ROUTINE';
    case 'TASK':
    case 'FOCUS':
    default:
      return 'FOCUS';
  }
}

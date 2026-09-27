import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import {
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
  ToolCategory,
  ToolConfirmationLevel,
} from '../interfaces/assistant-tools.interface';
import {
  CreateScheduleProposalInputSchema,
  CreateScheduleProposalOutputSchema,
  CreateScheduleProposalInput,
  CreateScheduleProposalOutput,
} from '../interfaces/tool-schemas';
import { TimeCompilerService } from '../../../scheduling/time-compiler/time-compiler.service';
import {
  SchedulingInput,
  SchedulingTask,
  CalendarEvent,
  AvailabilityRule,
  SchedulingPreferences,
} from '../../../scheduling/time-compiler/domain/time-compiler.types';

@Injectable()
export class CreateScheduleProposalTool implements ToolDefinition<
  CreateScheduleProposalInput,
  CreateScheduleProposalOutput
> {
  name = 'create_schedule_proposal';
  description = 'Generate a schedule proposal from tasks, goals, or projects';
  category: ToolCategory = 'SCHEDULING';
  confirmationLevel: ToolConfirmationLevel = 'MEDIUM';
  inputSchema = CreateScheduleProposalInputSchema;
  outputSchema = CreateScheduleProposalOutputSchema;
  requiresAuth = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeCompiler: TimeCompilerService
  ) {}

  async execute(
    input: CreateScheduleProposalInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<CreateScheduleProposalOutput>> {
    try {
      const tasks = await this.getTasksForProposal(input, context.userId);
      const fixedEvents = await this.getFixedEvents(input.timeRange, context.userId);
      const availability = await this.getAvailabilityRules(context.userId);
      const preferences = await this.getSchedulingPreferences(context.userId, input.preferences);

      const schedulingInput: SchedulingInput = {
        userId: context.userId,
        timeRange: {
          start: new Date(input.timeRange.start),
          end: new Date(input.timeRange.end),
        },
        timezone: input.timezone || 'UTC',
        tasks: this.mapToSchedulingTasks(tasks),
        fixedEvents: this.mapToCalendarEvents(fixedEvents),
        availability: this.mapToAvailabilityRules(availability),
        constraints: [],
        preferences,
        existingBlocks: [],
      };

      const proposal = await this.timeCompiler.compileSchedule(schedulingInput);

      return {
        status: 'SUCCESS',
        data: {
          proposalId: proposal.id,
          status: proposal.status,
          confidence: proposal.confidence,
          proposedBlocks: proposal.proposedBlocks.map((b) => ({
            id: b.id,
            title: b.title,
            startTime: b.startTime.toISOString(),
            endTime: b.endTime.toISOString(),
            durationMinutes: b.durationMinutes,
            type: b.type,
            confidence: b.confidence,
            reason: b.reason,
          })),
          fixedBlocks: proposal.fixedBlocks.map((b) => ({
            id: b.id,
            title: b.title,
            startTime: b.startTime.toISOString(),
            endTime: b.endTime.toISOString(),
          })),
          conflicts: proposal.conflicts.map((c) => ({
            type: c.type,
            severity: c.severity,
            description: c.description,
          })),
          unsatisfiedConstraints: proposal.unsatisfiedConstraints.map((c) => ({
            type: c.type,
            severity: c.severity,
            description: c.description,
          })),
          alternatives: proposal.alternatives.map((a) => ({
            name: a.name,
            description: a.description,
            confidence: a.confidence,
          })),
          metrics: {
            totalScheduledMinutes: proposal.metrics.totalScheduledMinutes,
            utilizationRate: proposal.metrics.utilizationRate,
            deadlineComplianceRate: proposal.metrics.deadlineComplianceRate,
            dependencyComplianceRate: proposal.metrics.dependencyComplianceRate,
          },
          reasoning: proposal.reasoning,
        },
      };
    } catch (error: any) {
      return { status: 'ERROR', error: `Failed to create schedule proposal: ${error.message}` };
    }
  }

  private async getTasksForProposal(input: CreateScheduleProposalInput, userId: string) {
    const where: any = { userId, status: { in: ['PENDING', 'IN_PROGRESS'] } };
    if (input.taskIds && input.taskIds.length > 0) {
      where.id = { in: input.taskIds };
    } else if (input.goalId) {
      where.goalId = input.goalId;
    } else if (input.projectId) {
      where.projectId = input.projectId;
    }
    return this.prisma.task.findMany({ where });
  }

  private async getFixedEvents(timeRange: { start: string; end: string }, userId: string) {
    return this.prisma.event.findMany({
      where: {
        userId,
        startDate: { gte: new Date(timeRange.start), lte: new Date(timeRange.end) },
        status: { in: ['CONFIRMED', 'TENTATIVE'] },
      },
    });
  }

  private async getAvailabilityRules(userId: string) {
    return this.prisma.availabilityRule.findMany({ where: { userId, isAvailable: true } });
  }

  private async getSchedulingPreferences(
    userId: string,
    overrides?: Partial<SchedulingPreferences>
  ): Promise<SchedulingPreferences> {
    const defaultPrefs: SchedulingPreferences = {
      workingHoursStart: '09:00',
      workingHoursEnd: '17:00',
      preferredFocusBlockDuration: 90,
      maxFocusBlockDuration: 180,
      minBreakDuration: 15,
      maxDailyHours: 8,
      preferredBreakInterval: 90,
      energyPeakHours: [
        { start: '09:00', end: '11:00' },
        { start: '14:00', end: '16:00' },
      ],
      bufferBetweenTasks: 10,
      travelBufferDefault: 15,
      protectFocusTime: true,
      allowWeekendScheduling: false,
      taskOrderingStrategy: 'BALANCED',
    };
    return { ...defaultPrefs, ...overrides };
  }

  private mapToSchedulingTasks(tasks: any[]): SchedulingTask[] {
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      estimatedDurationMinutes: t.estimatedDurationMin || 60,
      actualDurationMinutes: t.actualDurationMin || undefined,
      priority: t.priority,
      deadline: t.dueDate ? new Date(t.dueDate) : undefined,
      startDate: t.startDate ? new Date(t.startDate) : undefined,
      status: t.status,
      dependencies: [],
      flexibility: t.flexibility,
      energyRequirement: t.energyRequirement,
      context: t.context,
      preferredTime: t.preferredTime ? new Date(t.preferredTime) : undefined,
      location: t.location,
      goalId: t.goalId,
      projectId: t.projectId,
      milestoneId: t.milestoneId,
    }));
  }

  private mapToCalendarEvents(events: any[]): CalendarEvent[] {
    return events.map((e) => ({
      id: e.id,
      title: e.title,
      startTime: new Date(e.startDate),
      endTime: new Date(e.endDate),
      timezone: e.timezone,
      isAllDay: e.allDay,
      status: e.status,
      location: e.location,
      isFixed: true,
    }));
  }

  private mapToAvailabilityRules(rules: any[]): AvailabilityRule[] {
    return rules.map((r) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek ?? undefined,
      startDate: r.startDate ? new Date(r.startDate) : undefined,
      endDate: r.endDate ? new Date(r.endDate) : undefined,
      startTime: r.startTime,
      endTime: r.endTime,
      timezone: r.timezone,
      isAvailable: r.isAvailable,
      priority: r.priority,
      recurrence: r.recurrence,
    }));
  }
}

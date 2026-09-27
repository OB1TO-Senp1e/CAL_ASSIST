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
  ExplainScheduleInputSchema,
  ExplainScheduleOutputSchema,
  ExplainScheduleInput,
  ExplainScheduleOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class ExplainScheduleTool implements ToolDefinition<
  ExplainScheduleInput,
  ExplainScheduleOutput
> {
  name = 'explain_schedule';
  description = 'Explain the reasoning behind a schedule or daily plan';
  category: ToolCategory = 'INSIGHTS';
  confirmationLevel: ToolConfirmationLevel = 'NONE';
  inputSchema = ExplainScheduleInputSchema;
  outputSchema = ExplainScheduleOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: ExplainScheduleInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<ExplainScheduleOutput>> {
    try {
      let events: any[] = [];
      let tasks: any[] = [];

      if (input.date) {
        const date = new Date(input.date);
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        events = await this.prisma.event.findMany({
          where: {
            userId: context.userId,
            startDate: { gte: dayStart, lte: dayEnd },
            status: { in: ['CONFIRMED', 'TENTATIVE'] },
          },
          orderBy: { startDate: 'asc' },
        });

        tasks = await this.prisma.task.findMany({
          where: {
            userId: context.userId,
            dueDate: { gte: dayStart, lte: dayEnd },
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
          orderBy: { priority: 'desc' },
        });
      }

      const schedule = events.map((e) => ({
        time: `${e.startDate.toISOString().substr(11, 5)} - ${e.endDate.toISOString().substr(11, 5)}`,
        title: e.title,
        type: 'event',
        reason: `Calendar event`,
        confidence: 1.0,
      }));

      const taskSchedule = tasks.map((t) => ({
        time: t.dueDate ? `${t.dueDate.toISOString().substr(11, 5)}` : 'Anytime',
        title: t.title,
        type: 'task',
        reason: `Priority ${t.priority}, ${t.estimatedDurationMin}min estimated`,
        confidence: 0.8,
      }));

      const allItems = [...schedule, ...taskSchedule].sort((a, b) => a.time.localeCompare(b.time));

      const conflicts = await this.detectConflicts(input.date, context.userId);

      return {
        status: 'SUCCESS',
        data: {
          summary: `Your schedule for ${input.date ? new Date(input.date).toDateString() : 'today'} has ${events.length} events and ${tasks.length} tasks.`,
          schedule: allItems,
          conflicts: conflicts.map((c) => ({
            description: c.description,
            severity: c.severity,
            resolution: c.type === 'OVERLAP' ? 'Reschedule one event' : 'Add buffer time',
          })),
          tradeoffs: [],
          alternatives: [],
          metrics: {
            utilizationRate: events.length > 0 ? 0.7 : 0,
            focusTimeMinutes: tasks.reduce((sum, t) => sum + (t.estimatedDurationMin || 0), 0),
            breakTimeMinutes: 0,
            deadlineCompliance: 1.0,
          },
        },
      };
    } catch (error: any) {
      return { status: 'ERROR', error: `Failed to explain schedule: ${error.message}` };
    }
  }

  private async detectConflicts(date: string | undefined, userId: string) {
    if (!date) return [];
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const events = await this.prisma.event.findMany({
      where: {
        userId,
        startDate: { gte: dayStart, lte: dayEnd },
        status: { in: ['CONFIRMED', 'TENTATIVE'] },
      },
    });

    const conflicts: any[] = [];
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i];
        const b = events[j];
        const aStart = new Date(a.startDate);
        const aEnd = new Date(a.endDate);
        const bStart = new Date(b.startDate);
        const bEnd = new Date(b.endDate);

        if (aStart < bEnd && aEnd > bStart) {
          conflicts.push({
            type: 'OVERLAP',
            severity: 'CRITICAL',
            description: `"${a.title}" overlaps with "${b.title}"`,
          });
        }
      }
    }
    return conflicts;
  }
}

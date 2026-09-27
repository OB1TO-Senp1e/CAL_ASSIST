import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/common/services/prisma.service';
import { AiProviderService } from '@app/integrations/ai-providers/ai-provider.service';
import { ContextEngineService } from '@app/core/context-engine/context-engine.service';

export interface ScheduleRequest {
  tasks: Array<{
    id: string;
    title: string;
    estimatedDurationMinutes: number;
    priority: number;
    deadline?: Date;
    dependencies: string[];
  }>;
  constraints: Array<{
    type: 'hard' | 'soft';
    description: string;
    timeWindow?: { start: Date; end: Date };
  }>;
  workingHours: { start: string; end: string; days: number[] };
  timezone: string;
}

export interface ScheduledTimeBlock {
  taskId: string;
  startTime: Date;
  endTime: Date;
  blockType: 'FOCUS' | 'MEETING' | 'BREAK' | 'BUFFER';
  explanation: string;
}

export interface ScheduleResult {
  planId: string;
  timeBlocks: ScheduledTimeBlock[];
  conflicts: any[];
  confidence: number;
  reasoning: string;
}

@Injectable()
export class SchedulingEngineService {
  private readonly logger = new Logger(SchedulingEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly contextEngine: ContextEngineService
  ) {}

  async generateSchedule(userId: string, request: ScheduleRequest): Promise<ScheduleResult> {
    const userContext = await this.contextEngine.getUserContext(userId);

    const existingEvents = await this.prisma.event.findMany({
      where: {
        userId,
        startDate: {
          gte:
            request.constraints.find((c) => c.timeWindow?.start)?.timeWindow?.start ||
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          lte:
            request.constraints.find((c) => c.timeWindow?.end)?.timeWindow?.end ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const existingTasks = await this.prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });

    const prompt = this.buildSchedulingPrompt(request, existingEvents, existingTasks, userContext);

    const aiResponse = await this.aiProvider.generateStructured(prompt, {
      temperature: 0.4,
      maxTokens: 4000,
    });

    const timeBlocks: ScheduledTimeBlock[] = aiResponse.timeBlocks || [];
    const conflicts = this.detectConflicts(timeBlocks, existingEvents);

    const planId = `plan_${Date.now()}`;

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'SCHEDULE_GENERATED',
        entityType: 'Plan',
        entityId: planId,
        details: `Generated schedule with ${timeBlocks.length} time blocks, ${conflicts.length} conflicts`,
      },
    });

    return {
      planId,
      timeBlocks,
      conflicts,
      confidence: aiResponse.confidence || 0.8,
      reasoning: aiResponse.reasoning || 'Schedule generated with optimal time allocation',
    };
  }

  async findAvailableSlots(
    userId: string,
    durationMinutes: number,
    preferredTimes?: Array<{ start: Date; end: Date }>
  ) {
    const userContext = await this.contextEngine.getUserContext(userId);

    const startWindow = preferredTimes?.[0]?.start || new Date();
    const endWindow =
      preferredTimes?.[0]?.end || new Date(startWindow.getTime() + 7 * 24 * 60 * 60 * 1000);

    const existingEvents = await this.prisma.event.findMany({
      where: {
        userId,
        OR: [
          { startDate: { lte: endWindow, gte: startWindow } },
          { endDate: { gte: startWindow, lte: endWindow } },
        ],
      },
    });

    const workingHours = userContext.workingHours;
    const availableSlots: Array<{ start: Date; end: Date }> = [];

    const current = new Date(startWindow);
    while (current.getTime() < endWindow.getTime()) {
      const dayOfWeek = current.getDay();
      if (workingHours.days.includes(dayOfWeek)) {
        const dayStart = new Date(current);
        dayStart.setHours(parseInt(workingHours.start.split(':')[0]), 0, 0, 0);
        const dayEnd = new Date(current);
        dayEnd.setHours(parseInt(workingHours.end.split(':')[0]), 0, 0, 0);

        const slotStart = new Date(Math.max(current.getTime(), dayStart.getTime()));
        const slotEnd = new Date(Math.min(endWindow.getTime(), dayEnd.getTime()));

        if (slotEnd.getTime() - slotStart.getTime() >= durationMinutes * 60 * 1000) {
          availableSlots.push({ start: slotStart, end: slotEnd });
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return availableSlots.filter((slot) => {
      const slotDuration = (slot.end.getTime() - slot.start.getTime()) / (1000 * 60);
      return slotDuration >= durationMinutes;
    });
  }

  async compileSchedule(userId: string, planId: string, timeBlocks: ScheduledTimeBlock[]) {
    const results: any[] = [];

    for (const block of timeBlocks) {
      const created = await this.prisma.timeBlock.create({
        data: {
          userId,
          title: block.taskId,
          startDate: block.startTime,
          endDate: block.endTime,
          blockType: block.blockType as any,
          status: 'SCHEDULED' as any,
        },
      });
      results.push(created);
    }

    return results;
  }

  private detectConflicts(blocks: ScheduledTimeBlock[], existingEvents: any[]): any[] {
    const conflicts: any[] = [];

    for (const block of blocks) {
      for (const event of existingEvents) {
        const blockStart = new Date(block.startTime);
        const blockEnd = new Date(block.endTime);
        const eventStart = new Date(event.startDate);
        const eventEnd = new Date(event.endDate);

        if (blockStart < eventEnd && blockEnd > eventStart) {
          conflicts.push({
            type: 'TIME_OVERLAP',
            blockId: block.taskId,
            eventId: event.id,
            startTime: blockStart,
            endTime: blockEnd,
          });
        }
      }
    }

    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const b1 = blocks[i];
        const b2 = blocks[j];

        if (b1.startTime < b2.endTime && b1.endTime > b2.startTime) {
          conflicts.push({
            type: 'BLOCK_OVERLAP',
            block1: b1.taskId,
            block2: b2.taskId,
          });
        }
      }
    }

    return conflicts;
  }

  private buildSchedulingPrompt(
    request: ScheduleRequest,
    events: any[],
    tasks: any[],
    context: any
  ): string {
    return `
You are CalAssist's scheduling engine. Your job is to find optimal time slots for tasks.

Tasks to schedule:
${JSON.stringify(request.tasks, null, 2)}

Constraints:
${JSON.stringify(request.constraints, null, 2)}

Existing Events:
${JSON.stringify(
  events.map((e) => ({
    id: e.id,
    title: e.title,
    startDate: e.startDate,
    endDate: e.endDate,
    allDay: e.allDay,
  })),
  null,
  2
)}

User Preferences:
- Working hours: ${JSON.stringify(request.workingHours)}
- Timezone: ${request.timezone}

Please generate an optimized schedule. Respond with valid JSON:
{
  "timeBlocks": [
    {
      "taskId": "<task id>",
      "startTime": "<ISO datetime>",
      "endTime": "<ISO datetime>",
      "blockType": "FOCUS",
      "explanation": "<why this time was chosen>"
    }
  ],
  "confidence": <0.0-1.0>,
  "reasoning": "<explanation of scheduling decisions>"
}
    `;
  }
}

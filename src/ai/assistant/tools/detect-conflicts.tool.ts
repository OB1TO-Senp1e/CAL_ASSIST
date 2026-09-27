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
  DetectConflictsInputSchema,
  DetectConflictsOutputSchema,
  DetectConflictsInput,
  DetectConflictsOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class DetectConflictsTool implements ToolDefinition<
  DetectConflictsInput,
  DetectConflictsOutput
> {
  name = 'detect_conflicts';
  description = 'Detect scheduling conflicts for a time range or specific event';
  category: ToolCategory = 'CONFLICTS';
  confirmationLevel: ToolConfirmationLevel = 'NONE';
  inputSchema = DetectConflictsInputSchema;
  outputSchema = DetectConflictsOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: DetectConflictsInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<DetectConflictsOutput>> {
    try {
      const events = await this.prisma.event.findMany({
        where: {
          userId: context.userId,
          startDate: { gte: new Date(input.startDate) },
          endDate: { lte: new Date(input.endDate) },
          status: { in: ['CONFIRMED', 'TENTATIVE'] },
          ...(input.eventId ? { id: { not: input.eventId } } : {}),
        },
        orderBy: { startDate: 'asc' },
      });

      const conflicts: DetectConflictsOutput['conflicts'] = [];

      if (input.newEvent) {
        const newStart = new Date(input.newEvent.startDate);
        const newEnd = new Date(input.newEvent.endDate);

        for (const event of events) {
          const eventStart = new Date(event.startDate);
          const eventEnd = new Date(event.endDate);

          if (newStart < eventEnd && newEnd > eventStart) {
            let type: DetectConflictsOutput['conflicts'][0]['type'] = 'OVERLAP';
            if (newStart >= eventStart && newEnd <= eventEnd) type = 'CONTAINS';
            else if (newStart <= eventStart && newEnd >= eventEnd) type = 'CONTAINS';
            else if (newEnd === eventStart || newStart === eventEnd) type = 'ADJACENT';

            conflicts.push({
              type,
              severity: type === 'OVERLAP' || type === 'CONTAINS' ? 'CRITICAL' : 'WARNING',
              description: `"${input.newEvent.title}" conflicts with "${event.title}"`,
              conflictingEventId: event.id,
              conflictingEventTitle: event.title,
            });
          }
        }
      } else {
        for (let i = 0; i < events.length; i++) {
          for (let j = i + 1; j < events.length; j++) {
            const a = events[i];
            const b = events[j];
            const aStart = new Date(a.startDate);
            const aEnd = new Date(a.endDate);
            const bStart = new Date(b.startDate);
            const bEnd = new Date(b.endDate);

            if (aStart < bEnd && aEnd > bStart) {
              let type: DetectConflictsOutput['conflicts'][0]['type'] = 'OVERLAP';
              if (aStart >= bStart && aEnd <= bEnd) type = 'CONTAINS';
              else if (bStart >= aStart && bEnd <= aEnd) type = 'CONTAINS';
              else if (aEnd === bStart || aStart === bEnd) type = 'ADJACENT';

              conflicts.push({
                type,
                severity: type === 'OVERLAP' || type === 'CONTAINS' ? 'CRITICAL' : 'WARNING',
                description: `"${a.title}" overlaps with "${b.title}"`,
                conflictingEventId: a.id,
                conflictingEventTitle: b.title,
              });
            }
          }
        }
      }

      const suggestions = conflicts.map((c) => {
        if (c.type === 'OVERLAP')
          return `Consider rescheduling "${c.conflictingEventTitle}" or "${input.newEvent?.title || 'the new event'}"`;
        if (c.type === 'ADJACENT') return 'Events are back-to-back; consider adding a buffer';
        return 'Review event timing';
      });

      return {
        status: 'SUCCESS',
        data: {
          hasConflicts: conflicts.length > 0,
          conflicts,
          suggestions,
        },
      };
    } catch (error: any) {
      return { status: 'ERROR', error: `Failed to detect conflicts: ${error.message}` };
    }
  }
}

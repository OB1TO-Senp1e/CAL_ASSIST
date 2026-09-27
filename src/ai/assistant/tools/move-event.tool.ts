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
  MoveEventInputSchema,
  MoveEventOutputSchema,
  MoveEventInput,
  MoveEventOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class MoveEventTool implements ToolDefinition<MoveEventInput, MoveEventOutput> {
  name = 'move_event';
  description = 'Move an existing calendar event to a new time';
  category: ToolCategory = 'CALENDAR';
  confirmationLevel: ToolConfirmationLevel = 'HIGH';
  inputSchema = MoveEventInputSchema;
  outputSchema = MoveEventOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: MoveEventInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<MoveEventOutput>> {
    try {
      const existing = await this.prisma.event.findFirst({
        where: { id: input.eventId, userId: context.userId },
      });

      if (!existing) {
        return { status: 'ERROR', error: 'Event not found' };
      }

      const duration = existing.endDate.getTime() - existing.startDate.getTime();
      const newStart = new Date(input.newStartDate);
      const newEnd = new Date(input.newEndDate);

      if (newEnd.getTime() - newStart.getTime() !== duration) {
        return {
          status: 'ERROR',
          error: 'Event duration cannot change during move. Use resize for duration changes.',
        };
      }

      // Check for conflicts
      const conflicts = await this.prisma.event.findFirst({
        where: {
          userId: context.userId,
          id: { not: input.eventId },
          status: { in: ['CONFIRMED', 'TENTATIVE'] },
          AND: [{ startDate: { lt: newEnd } }, { endDate: { gt: newStart } }],
        },
      });

      if (conflicts) {
        return {
          status: 'REQUIRES_CONFIRMATION',
          error: 'Moving this event would create a conflict',
          requiresConfirmation: true,
          confirmationPrompt: `Moving "${existing.title}" to ${newStart.toISOString()} - ${newEnd.toISOString()} conflicts with "${conflicts.title}". Continue anyway?`,
          confirmationData: {
            eventId: input.eventId,
            newStart: input.newStartDate,
            newEnd: input.newEndDate,
          },
        };
      }

      const event = await this.prisma.event.update({
        where: { id: input.eventId },
        data: {
          startDate: newStart,
          endDate: newEnd,
          timezone: input.timezone || existing.timezone,
        },
      });

      return {
        status: 'SUCCESS',
        data: {
          id: event.id,
          title: event.title,
          startDate: event.startDate.toISOString(),
          endDate: event.endDate.toISOString(),
          timezone: event.timezone,
        },
      };
    } catch (error: any) {
      return { status: 'ERROR', error: `Failed to move event: ${error.message}` };
    }
  }
}

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
  DeleteEventInputSchema,
  DeleteEventOutputSchema,
  DeleteEventInput,
  DeleteEventOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class DeleteEventTool implements ToolDefinition<DeleteEventInput, DeleteEventOutput> {
  name = 'delete_event';
  description = 'Delete a calendar event';
  category: ToolCategory = 'CALENDAR';
  confirmationLevel: ToolConfirmationLevel = 'HIGH';
  inputSchema = DeleteEventInputSchema;
  outputSchema = DeleteEventOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: DeleteEventInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<DeleteEventOutput>> {
    try {
      const existing = await this.prisma.event.findFirst({
        where: { id: input.eventId, userId: context.userId },
      });

      if (!existing) {
        return {
          status: 'ERROR',
          error: 'Event not found',
        };
      }

      await this.prisma.event.delete({ where: { id: input.eventId } });

      return {
        status: 'SUCCESS',
        data: {
          success: true,
          eventId: input.eventId,
        },
      };
    } catch (error: any) {
      return {
        status: 'ERROR',
        error: `Failed to delete event: ${error.message}`,
      };
    }
  }
}

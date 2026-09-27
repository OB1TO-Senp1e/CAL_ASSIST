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
  UpdateEventInputSchema,
  UpdateEventOutputSchema,
  UpdateEventInput,
  UpdateEventOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class UpdateEventTool implements ToolDefinition<UpdateEventInput, UpdateEventOutput> {
  name = 'update_event';
  description = 'Update an existing calendar event';
  category: ToolCategory = 'CALENDAR';
  confirmationLevel: ToolConfirmationLevel = 'MEDIUM';
  inputSchema = UpdateEventInputSchema;
  outputSchema = UpdateEventOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: UpdateEventInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<UpdateEventOutput>> {
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

      const updateData: any = {};
      if (input.title) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.location !== undefined) updateData.location = input.location;
      if (input.startDate) updateData.startDate = new Date(input.startDate);
      if (input.endDate) updateData.endDate = new Date(input.endDate);
      if (input.allDay !== undefined) updateData.allDay = input.allDay;
      if (input.timezone) updateData.timezone = input.timezone;
      if (input.recurrence !== undefined) updateData.recurrenceRule = input.recurrence;
      if (input.status) updateData.status = input.status;

      const event = await this.prisma.event.update({
        where: { id: input.eventId },
        data: updateData,
      });

      if (input.participants) {
        await this.prisma.eventParticipant.deleteMany({ where: { eventId: input.eventId } });
        if (input.participants.length > 0) {
          await this.prisma.eventParticipant.createMany({
            data: input.participants.map((p) => ({
              eventId: event.id,
              email: p.email,
              displayName: p.displayName,
              status: p.status,
              isOrganizer: false,
            })),
            skipDuplicates: true,
          });
        }
      }

      return {
        status: 'SUCCESS',
        data: {
          id: event.id,
          title: event.title,
          startDate: event.startDate.toISOString(),
          endDate: event.endDate.toISOString(),
          status: event.status,
        },
      };
    } catch (error: any) {
      return {
        status: 'ERROR',
        error: `Failed to update event: ${error.message}`,
      };
    }
  }
}

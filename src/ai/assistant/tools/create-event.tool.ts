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
  CreateEventInputSchema,
  CreateEventOutputSchema,
  CreateEventInput,
  CreateEventOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class CreateEventTool implements ToolDefinition<CreateEventInput, CreateEventOutput> {
  name = 'create_event';
  description = 'Create a new calendar event';
  category: ToolCategory = 'CALENDAR';
  confirmationLevel: ToolConfirmationLevel = 'MEDIUM';
  inputSchema = CreateEventInputSchema;
  outputSchema = CreateEventOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: CreateEventInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<CreateEventOutput>> {
    try {
      const event = await this.prisma.event.create({
        data: {
          userId: context.userId,
          title: input.title,
          description: input.description,
          location: input.location,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          allDay: input.allDay ?? false,
          timezone: input.timezone ?? 'UTC',
          recurrenceRule: input.recurrence,
          status: input.status ?? 'CONFIRMED',
          calendarId: input.calendarId,
        },
      });

      if (input.participants && input.participants.length > 0) {
        await this.prisma.eventParticipant.createMany({
          data: input.participants.map((p) => ({
            eventId: event.id,
            email: p.email,
            displayName: p.displayName,
            status: p.status ?? 'NEEDS_ACTION',
            isOrganizer: false,
          })),
          skipDuplicates: true,
        });
      }

      if (input.reminders && input.reminders.length > 0) {
        await this.prisma.reminder.createMany({
          data: input.reminders.map((r) => ({
            userId: context.userId,
            eventId: event.id,
            timeType: 'MINUTES_BEFORE',
            timeValue: r.minutesBefore,
            method: r.method,
            isActive: true,
          })),
          skipDuplicates: true,
        });
      }

      return {
        status: 'SUCCESS',
        data: {
          id: event.id,
          title: event.title,
          startDate: event.startDate.toISOString(),
          endDate: event.endDate.toISOString(),
          timezone: event.timezone,
          status: event.status,
        },
      };
    } catch (error: any) {
      return {
        status: 'ERROR',
        error: `Failed to create event: ${error.message}`,
      };
    }
  }
}

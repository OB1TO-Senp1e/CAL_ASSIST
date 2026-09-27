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
  FindAvailabilityInputSchema,
  FindAvailabilityOutputSchema,
  FindAvailabilityInput,
  FindAvailabilityOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class FindAvailabilityTool implements ToolDefinition<
  FindAvailabilityInput,
  FindAvailabilityOutput
> {
  name = 'find_availability';
  description = 'Find available time slots for scheduling';
  category: ToolCategory = 'AVAILABILITY';
  confirmationLevel: ToolConfirmationLevel = 'NONE';
  inputSchema = FindAvailabilityInputSchema;
  outputSchema = FindAvailabilityOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: FindAvailabilityInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<FindAvailabilityOutput>> {
    try {
      const events = await this.prisma.event.findMany({
        where: {
          userId: context.userId,
          startDate: {
            gte: new Date(input.startDate),
            lte: new Date(input.endDate),
          },
          status: { in: ['CONFIRMED', 'TENTATIVE'] },
        },
        orderBy: { startDate: 'asc' },
      });

      const workingHours = input.workingHours || { start: 9, end: 17, days: [1, 2, 3, 4, 5] };
      const bufferMs = (input.bufferMinutes ?? 10) * 60000;

      const slots: { start: Date; end: Date; durationMinutes: number }[] = [];
      const current = new Date(input.startDate);

      while (current < new Date(input.endDate)) {
        const dayOfWeek = current.getDay();
        if (workingHours.days.includes(dayOfWeek)) {
          const dayStart = new Date(current);
          dayStart.setHours(workingHours.start, 0, 0, 0);

          const dayEnd = new Date(current);
          dayEnd.setHours(workingHours.end, 0, 0, 0);

          let slotStart = dayStart;
          for (const event of events) {
            const eventStart = new Date(event.startDate);
            const eventEnd = new Date(event.endDate);

            if (eventEnd <= slotStart) continue;
            if (eventStart >= dayEnd) break;

            if (eventStart > slotStart) {
              const duration = eventStart.getTime() - slotStart.getTime();
              if (duration >= input.durationMinutes * 60000 + bufferMs) {
                slots.push({
                  start: new Date(slotStart),
                  end: new Date(eventStart.getTime() - bufferMs),
                  durationMinutes: Math.floor(
                    (eventStart.getTime() - slotStart.getTime() - bufferMs) / 60000
                  ),
                });
              }
            }
            slotStart = new Date(Math.max(slotStart.getTime(), eventEnd.getTime() + bufferMs));
          }

          if (slotStart < dayEnd) {
            const duration = dayEnd.getTime() - slotStart.getTime();
            if (duration >= input.durationMinutes * 60000) {
              slots.push({
                start: new Date(slotStart),
                end: dayEnd,
                durationMinutes: Math.floor(duration / 60000),
              });
            }
          }
        }
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
      }

      const totalAvailableMinutes = slots.reduce((sum, s) => sum + s.durationMinutes, 0);

      return {
        status: 'SUCCESS',
        data: {
          slots: slots.map((s) => ({
            start: s.start.toISOString(),
            end: s.end.toISOString(),
            durationMinutes: s.durationMinutes,
          })),
          totalAvailableMinutes,
        },
      };
    } catch (error: any) {
      return {
        status: 'ERROR',
        error: `Failed to find availability: ${error.message}`,
      };
    }
  }
}

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
  CreateGoalInputSchema,
  CreateGoalOutputSchema,
  CreateGoalInput,
  CreateGoalOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class CreateGoalTool implements ToolDefinition<CreateGoalInput, CreateGoalOutput> {
  name = 'create_goal';
  description = 'Create a new goal';
  category: ToolCategory = 'GOALS';
  confirmationLevel: ToolConfirmationLevel = 'MEDIUM';
  inputSchema = CreateGoalInputSchema;
  outputSchema = CreateGoalOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: CreateGoalInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<CreateGoalOutput>> {
    try {
      const goal = await this.prisma.goal.create({
        data: {
          userId: context.userId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
        },
      });

      return {
        status: 'SUCCESS',
        data: {
          id: goal.id,
          title: goal.title,
          priority: goal.priority,
          status: goal.status,
        },
      };
    } catch (error: any) {
      return { status: 'ERROR', error: `Failed to create goal: ${error.message}` };
    }
  }
}

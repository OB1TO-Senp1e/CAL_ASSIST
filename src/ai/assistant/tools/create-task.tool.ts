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
  CreateTaskInputSchema,
  CreateTaskOutputSchema,
  CreateTaskInput,
  CreateTaskOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class CreateTaskTool implements ToolDefinition<CreateTaskInput, CreateTaskOutput> {
  name = 'create_task';
  description = 'Create a new task';
  category: ToolCategory = 'TASKS';
  confirmationLevel: ToolConfirmationLevel = 'LOW';
  inputSchema = CreateTaskInputSchema;
  outputSchema = CreateTaskOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: CreateTaskInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<CreateTaskOutput>> {
    try {
      const task = await this.prisma.task.create({
        data: {
          userId: context.userId,
          title: input.title,
          description: input.description,
          projectId: input.projectId,
          goalId: input.goalId,
          milestoneId: input.milestoneId,
          priority: input.priority,
          estimatedDurationMin: input.estimatedDurationMinutes,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          flexibility: input.flexibility,
          energyRequirement: input.energyRequirement,
          context: input.context,
          preferredTime: input.preferredTime ? new Date(input.preferredTime) : undefined,
          location: input.location,
        },
      });

      if (input.dependencies && input.dependencies.length > 0) {
        await this.prisma.taskDependency.createMany({
          data: input.dependencies.map((depId) => ({
            taskId: task.id,
            dependsOnId: depId,
            type: 'FINISH_TO_START',
          })),
          skipDuplicates: true,
        });
      }

      return {
        status: 'SUCCESS',
        data: {
          id: task.id,
          title: task.title,
          estimatedDurationMinutes: task.estimatedDurationMin || 0,
          priority: task.priority,
          status: task.status,
        },
      };
    } catch (error: any) {
      return {
        status: 'ERROR',
        error: `Failed to create task: ${error.message}`,
      };
    }
  }
}

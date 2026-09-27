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
  UpdateTaskInputSchema,
  UpdateTaskOutputSchema,
  UpdateTaskInput,
  UpdateTaskOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class UpdateTaskTool implements ToolDefinition<UpdateTaskInput, UpdateTaskOutput> {
  name = 'update_task';
  description = 'Update an existing task';
  category: ToolCategory = 'TASKS';
  confirmationLevel: ToolConfirmationLevel = 'LOW';
  inputSchema = UpdateTaskInputSchema;
  outputSchema = UpdateTaskOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: UpdateTaskInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<UpdateTaskOutput>> {
    try {
      const existing = await this.prisma.task.findFirst({
        where: { id: input.taskId, userId: context.userId },
      });

      if (!existing) {
        return { status: 'ERROR', error: 'Task not found' };
      }

      const updateData: any = {};
      if (input.title) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.projectId) updateData.projectId = input.projectId;
      if (input.goalId) updateData.goalId = input.goalId;
      if (input.milestoneId) updateData.milestoneId = input.milestoneId;
      if (input.status) updateData.status = input.status;
      if (input.priority) updateData.priority = input.priority;
      if (input.estimatedDurationMinutes)
        updateData.estimatedDurationMin = input.estimatedDurationMinutes;
      if (input.actualDurationMinutes !== undefined)
        updateData.actualDurationMin = input.actualDurationMinutes;
      if (input.dueDate) updateData.dueDate = new Date(input.dueDate);
      if (input.startDate) updateData.startDate = new Date(input.startDate);
      if (input.completedAt) updateData.completedAt = new Date(input.completedAt);
      if (input.flexibility) updateData.flexibility = input.flexibility;
      if (input.energyRequirement) updateData.energyRequirement = input.energyRequirement;
      if (input.context !== undefined) updateData.context = input.context;
      if (input.preferredTime) updateData.preferredTime = new Date(input.preferredTime);
      if (input.location !== undefined) updateData.location = input.location;

      const task = await this.prisma.task.update({
        where: { id: input.taskId },
        data: updateData,
      });

      if (input.dependencies !== undefined) {
        await this.prisma.taskDependency.deleteMany({ where: { taskId: input.taskId } });
        if (input.dependencies.length > 0) {
          await this.prisma.taskDependency.createMany({
            data: input.dependencies.map((depId) => ({
              taskId: task.id,
              dependsOnId: depId,
              type: 'FINISH_TO_START',
            })),
            skipDuplicates: true,
          });
        }
      }

      return {
        status: 'SUCCESS',
        data: {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
        },
      };
    } catch (error: any) {
      return { status: 'ERROR', error: `Failed to update task: ${error.message}` };
    }
  }
}

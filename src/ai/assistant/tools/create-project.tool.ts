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
  CreateProjectInputSchema,
  CreateProjectOutputSchema,
  CreateProjectInput,
  CreateProjectOutput,
} from '../interfaces/tool-schemas';

@Injectable()
export class CreateProjectTool implements ToolDefinition<CreateProjectInput, CreateProjectOutput> {
  name = 'create_project';
  description = 'Create a new project';
  category: ToolCategory = 'PROJECTS';
  confirmationLevel: ToolConfirmationLevel = 'MEDIUM';
  inputSchema = CreateProjectInputSchema;
  outputSchema = CreateProjectOutputSchema;
  requiresAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: CreateProjectInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<CreateProjectOutput>> {
    try {
      const project = await this.prisma.project.create({
        data: {
          userId: context.userId,
          title: input.title,
          description: input.description,
          goalId: input.goalId,
          priority: input.priority,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
        },
      });

      return {
        status: 'SUCCESS',
        data: {
          id: project.id,
          title: project.title,
          goalId: project.goalId || undefined,
          status: project.status,
        },
      };
    } catch (error: any) {
      return { status: 'ERROR', error: `Failed to create project: ${error.message}` };
    }
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ToolDefinition,
  ToolCategory,
  ToolExecutionContext,
  ToolResult,
} from './interfaces/assistant-tools.interface';
import { CreateEventTool } from './tools/create-event.tool';
import { UpdateEventTool } from './tools/update-event.tool';
import { DeleteEventTool } from './tools/delete-event.tool';
import { MoveEventTool } from './tools/move-event.tool';
import { FindAvailabilityTool } from './tools/find-availability.tool';
import { CreateTaskTool } from './tools/create-task.tool';
import { UpdateTaskTool } from './tools/update-task.tool';
import { CreateGoalTool } from './tools/create-goal.tool';
import { CreateProjectTool } from './tools/create-project.tool';
import { CreateScheduleProposalTool } from './tools/create-schedule-proposal.tool';
import { DetectConflictsTool } from './tools/detect-conflicts.tool';
import { ExplainScheduleTool } from './tools/explain-schedule.tool';
import { PlanDayTool } from './tools/plan-day.tool';

@Injectable()
export class ToolRegistry implements OnModuleInit {
  private tools = new Map<string, ToolDefinition>();
  private toolsByCategory = new Map<ToolCategory, ToolDefinition[]>();

  constructor(
    private readonly createEventTool: CreateEventTool,
    private readonly updateEventTool: UpdateEventTool,
    private readonly deleteEventTool: DeleteEventTool,
    private readonly moveEventTool: MoveEventTool,
    private readonly findAvailabilityTool: FindAvailabilityTool,
    private readonly createTaskTool: CreateTaskTool,
    private readonly updateTaskTool: UpdateTaskTool,
    private readonly createGoalTool: CreateGoalTool,
    private readonly createProjectTool: CreateProjectTool,
    private readonly createScheduleProposalTool: CreateScheduleProposalTool,
    private readonly detectConflictsTool: DetectConflictsTool,
    private readonly explainScheduleTool: ExplainScheduleTool,
    private readonly planDayTool: PlanDayTool
  ) {}

  onModuleInit() {
    this.register(this.createEventTool);
    this.register(this.updateEventTool);
    this.register(this.deleteEventTool);
    this.register(this.moveEventTool);
    this.register(this.findAvailabilityTool);
    this.register(this.createTaskTool);
    this.register(this.updateTaskTool);
    this.register(this.createGoalTool);
    this.register(this.createProjectTool);
    this.register(this.createScheduleProposalTool);
    this.register(this.detectConflictsTool);
    this.register(this.explainScheduleTool);
    this.register(this.planDayTool);
  }

  private register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);

    const categoryTools = this.toolsByCategory.get(tool.category) || [];
    categoryTools.push(tool);
    this.toolsByCategory.set(tool.category, categoryTools);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return this.toolsByCategory.get(category) || [];
  }

  async executeTool<TInput, TOutput>(
    name: string,
    input: TInput,
    context: ToolExecutionContext
  ): Promise<ToolResult<TOutput>> {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        status: 'ERROR',
        error: `Tool not found: ${name}`,
      };
    }

    const parseResult = tool.inputSchema.safeParse(input);
    if (!parseResult.success) {
      return {
        status: 'ERROR',
        error: `Invalid input for ${name}: ${parseResult.error.message}`,
      };
    }

    return tool.execute(parseResult.data, context) as Promise<ToolResult<TOutput>>;
  }

  getToolDefinitionsForLLM(): Array<{
    name: string;
    description: string;
    category: ToolCategory;
    confirmationLevel: string;
    inputSchema: any;
    outputSchema: any;
  }> {
    return this.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      confirmationLevel: tool.confirmationLevel,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    }));
  }
}

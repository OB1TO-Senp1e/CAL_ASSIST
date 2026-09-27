import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import { IntentParserService } from '../../ai/intent/intent-parser.service';
import { ToolRegistry } from './tool-registry.service';
import {
  ToolExecutionContext,
  ToolResult,
  AssistantMessage,
  AssistantResponse,
  ProposedAction,
  IntentAction,
  Context,
  ToolConfirmationLevel,
} from './interfaces/assistant-tools.interface';
import { ParsedIntent } from '../../ai/intent/interfaces/intent.interface';

@Injectable()
export class AssistantOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly intentParser: IntentParserService,
    private readonly toolRegistry: ToolRegistry
  ) {}

  async processMessage(
    userId: string,
    message: string,
    conversationId?: string
  ): Promise<AssistantResponse> {
    const context = await this.buildContext(userId);

    const intent = await this.intentParser.parseIntent(userId, message);

    const intentActions = await this.extractIntentActions(intent, context);

    const proposedActions = await this.validateAndPrepareActions(intentActions, context);

    const requiresConfirmation = proposedActions.some((a) => a.confirmationLevel !== 'NONE');

    if (requiresConfirmation) {
      return {
        message: this.formatProposedActions(proposedActions),
        proposedActions,
        requiresConfirmation: true,
        confidence: this.calculateOverallConfidence(proposedActions),
      };
    }

    const results = await this.executeActions(proposedActions, context);

    return this.formatExecutionResults(results, proposedActions);
  }

  async confirmAction(
    userId: string,
    actionId: string,
    confirmed: boolean,
    modifiedInput?: Record<string, any>
  ): Promise<AssistantResponse> {
    const context = await this.buildContext(userId);

    if (!confirmed) {
      return {
        message: 'Action cancelled.',
        confidence: 1.0,
      };
    }

    const proposedAction = await this.getPendingAction(userId, actionId);
    if (!proposedAction) {
      return {
        message: 'Action not found or expired.',
        confidence: 0,
      };
    }

    const input = modifiedInput || proposedAction.input;
    const result = await this.toolRegistry.executeTool(proposedAction.toolName, input, context);

    return this.formatSingleResult(proposedAction, result);
  }

  private async buildContext(userId: string): Promise<ToolExecutionContext & { context: Context }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });

    const timezone = user?.timezone || 'UTC';
    const now = new Date();

    const workingHoursPref = user?.preferences.find((p) => p.key === 'working_hours');
    const workingHours = workingHoursPref
      ? JSON.parse(workingHoursPref.valueJson)
      : { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };

    const activeGoals = await this.prisma.goal.findMany({
      where: { userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      select: { id: true, title: true },
      take: 5,
    });

    const activeProjects = await this.prisma.project.findMany({
      where: { userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      select: { id: true, title: true },
      take: 5,
    });

    const upcomingEvents = await this.prisma.event.findMany({
      where: {
        userId,
        startDate: { gte: now },
        status: { in: ['CONFIRMED', 'TENTATIVE'] },
      },
      orderBy: { startDate: 'asc' },
      take: 10,
    });

    const pendingTasks = await this.prisma.task.findMany({
      where: { userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      orderBy: { priority: 'desc' },
      take: 10,
    });

    const context: Context = {
      userId,
      timezone,
      currentDate: now.toISOString(),
      workingHours,
      activeGoals: activeGoals.map((g) => g.id),
      activeProjects: activeProjects.map((p) => p.id),
      upcomingEvents,
      pendingTasks,
    };

    return {
      userId,
      timezone,
      currentTime: now,
      permissions: ['read', 'write'],
      metadata: { context },
      context,
    };
  }

  private async extractIntentActions(
    intent: ParsedIntent,
    context: ToolExecutionContext & { context: Context }
  ): Promise<IntentAction[]> {
    const toolDefinitions = this.toolRegistry.getToolDefinitionsForLLM();

    const prompt = `
You are CalAssist's assistant orchestrator. Based on the user's intent and available tools, determine which tools to call.

User Intent: ${JSON.stringify(intent)}
Available Tools: ${JSON.stringify(toolDefinitions.map((t) => ({ name: t.name, description: t.description, category: t.category, confirmationLevel: t.confirmationLevel })))}

Context:
- Timezone: ${context.timezone}
- Current time: ${context.currentTime.toISOString()}
- Working hours: ${JSON.stringify(context.context.workingHours)}
- Active goals: ${context.context.activeGoals?.length || 0}
- Upcoming events: ${context.context.upcomingEvents?.length || 0}
- Pending tasks: ${context.context.pendingTasks?.length || 0}

Respond with valid JSON array of actions:
[
  {
    "toolName": "tool_name",
    "input": { ... },
    "reasoning": "why this tool",
    "confidence": 0.9,
    "requiresConfirmation": true/false,
    "confirmationLevel": "NONE|LOW|MEDIUM|HIGH|CRITICAL"
  }
]
`;

    const aiResponse = await this.aiProvider.generateStructured(prompt, {
      temperature: 0.3,
      maxTokens: 3000,
    });

    return aiResponse.actions || [];
  }

  private async validateAndPrepareActions(
    intentActions: IntentAction[],
    context: ToolExecutionContext & { context: Context }
  ): Promise<ProposedAction[]> {
    const proposedActions: ProposedAction[] = [];

    for (const action of intentActions) {
      const tool = this.toolRegistry.getTool(action.toolName);
      if (!tool) continue;

      const parseResult = tool.inputSchema.safeParse(action.input);
      if (!parseResult.success) continue;

      proposedActions.push({
        id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        toolName: action.toolName,
        description: action.reasoning,
        input: action.input,
        confirmationLevel: action.confirmationLevel || tool.confirmationLevel,
        estimatedImpact: this.estimateImpact(action.toolName, action.input),
        reversible: this.isReversible(action.toolName),
      });
    }

    return proposedActions;
  }

  private async executeActions(
    proposedActions: ProposedAction[],
    context: ToolExecutionContext & { context: Context }
  ): Promise<Array<{ action: ProposedAction; result: ToolResult<any> }>> {
    const results: Array<{ action: ProposedAction; result: ToolResult<any> }> = [];

    for (const action of proposedActions) {
      const result = await this.toolRegistry.executeTool(action.toolName, action.input, context);
      results.push({ action, result });
    }

    return results;
  }

  private formatProposedActions(actions: ProposedAction[]): string {
    return actions
      .map(
        (a) => `🔹 ${a.description} (${a.toolName}) - ${a.confirmationLevel} confirmation required`
      )
      .join('\n');
  }

  private formatExecutionResults(
    results: Array<{ action: ProposedAction; result: ToolResult<any> }>,
    actions: ProposedAction[]
  ): AssistantResponse {
    const successful = results.filter((r) => r.result.status === 'SUCCESS').length;
    const failed = results.filter((r) => r.result.status === 'ERROR').length;

    let message = `Executed ${actions.length} action(s): ${successful} succeeded`;
    if (failed > 0) message += `, ${failed} failed`;

    return {
      message,
      toolCalls: results.map((r) => ({
        id: r.action.id,
        name: r.action.toolName,
        arguments: r.action.input,
      })),
      confidence: successful / actions.length,
    };
  }

  private formatSingleResult(action: ProposedAction, result: ToolResult<any>): AssistantResponse {
    if (result.status === 'SUCCESS') {
      return {
        message: `✅ ${action.description} completed successfully.`,
        confidence: 1.0,
      };
    }
    return {
      message: `❌ ${action.description} failed: ${result.error}`,
      confidence: 0,
    };
  }

  private calculateOverallConfidence(actions: ProposedAction[]): number {
    return (
      actions.reduce((sum, a) => sum + (a.estimatedImpact === 'CRITICAL' ? 0.7 : 0.9), 0) /
      actions.length
    );
  }

  private estimateImpact(toolName: string, input: any): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const criticalTools = ['delete_event', 'create_schedule_proposal'];
    const highTools = [
      'create_event',
      'update_event',
      'move_event',
      'create_task',
      'create_goal',
      'create_project',
    ];
    const mediumTools = ['update_task'];

    if (criticalTools.includes(toolName)) return 'CRITICAL';
    if (highTools.includes(toolName)) return 'HIGH';
    if (mediumTools.includes(toolName)) return 'MEDIUM';
    return 'LOW';
  }

  private isReversible(toolName: string): boolean {
    const irreversible = ['delete_event'];
    return !irreversible.includes(toolName);
  }

  private async getPendingAction(userId: string, actionId: string): Promise<ProposedAction | null> {
    return null;
  }
}

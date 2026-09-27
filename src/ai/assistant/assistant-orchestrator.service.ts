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

    // Persist the user turn so `GET /assistant/conversations/:id/messages`
    // returns a complete thread (the composer also writes optimistically on
    // the client; storing here makes the write idempotent).
    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const existing = await this.prisma.conversation.findFirst({
        where: { userId, isActive: true },
        orderBy: { lastMessageAt: 'desc' },
        select: { id: true },
      });
      activeConversationId = existing?.id;
    }
    if (!activeConversationId) {
      const created = await this.prisma.conversation.create({
        data: { userId },
      });
      activeConversationId = created.id;
    }

    await this.prisma.conversationMessage.create({
      data: {
        conversationId: activeConversationId,
        userId,
        role: 'USER',
        content: message,
      },
    });

    const intent = await this.intentParser.parseIntent(userId, message);

    const intentActions = await this.extractIntentActions(intent, context);

    const proposedActions = await this.validateAndPrepareActions(intentActions, context);

    const requiresConfirmation = proposedActions.some((a) => a.confirmationLevel !== 'NONE');

    const response = requiresConfirmation
      ? {
          message: this.formatProposedActions(proposedActions),
          proposedActions,
          requiresConfirmation: true,
          confidence: this.calculateOverallConfidence(proposedActions),
        }
      : this.formatExecutionResults(
          await this.executeActions(proposedActions, context),
          proposedActions
        );

    // Persist the assistant turn; proposedActions travel in modelOutput so the
    // thread can resurrect proposal cards after a reload.
    await this.prisma.conversationMessage.create({
      data: {
        conversationId: activeConversationId,
        userId,
        role: 'ASSISTANT',
        content: response.message,
        modelOutput: response.proposedActions
          ? JSON.stringify({
              proposedActions: response.proposedActions,
              requiresConfirmation: response.requiresConfirmation ?? false,
              confidence: response.confidence ?? null,
            })
          : undefined,
      },
    });

    // Record pending claims so confirmAction can find them later.
    if (response.proposedActions) {
      await this.prisma.assistantAction.createMany({
        data: response.proposedActions.map((action) => ({
          userId,
          conversationId: activeConversationId,
          actionType: action.toolName,
          entityType: action.toolName,
          parameters: action.input as any,
          confidence: action.confirmationLevel === 'CRITICAL' ? 0.7 : 0.9,
          reasoning: action.description,
          wasApplied: false,
        })),
      });
    }

    // Keep the conversation list sorted by activity.
    await this.prisma.conversation.update({
      where: { id: activeConversationId },
      data: { lastMessageAt: new Date() },
    });

    return response;
  }

  async confirmAction(
    userId: string,
    actionId: string,
    confirmed: boolean,
    modifiedInput?: Record<string, any>
  ): Promise<AssistantResponse> {
    const context = await this.buildContext(userId);

    if (!confirmed) {
      // Record the rejection so the action can never be applied later.
      await this.prisma.assistantAction.updateMany({
        where: { userId, id: actionId, wasApplied: false },
        data: {
          wasApplied: true,
          outcome: { status: 'REJECTED', message: 'Action cancelled by user.' },
          appliedAt: new Date(),
        },
      });
      return {
        message: 'Action cancelled.',
        confidence: 1.0,
      };
    }

    const record = await this.prisma.assistantAction.findFirst({
      where: { id: actionId, userId, wasApplied: false },
    });
    if (!record) {
      return {
        message: 'Action not found or expired.',
        confidence: 0,
      };
    }

    const proposedAction: ProposedAction = {
      id: record.id,
      toolName: record.actionType,
      description: record.reasoning ?? record.actionType,
      input: (record.parameters as Record<string, any>) ?? {},
      confirmationLevel: 'NONE',
      estimatedImpact: this.estimateImpact(record.actionType, record.parameters),
      reversible: this.isReversible(record.actionType),
    };

    const input = modifiedInput || proposedAction.input;
    const result = await this.toolRegistry.executeTool(proposedAction.toolName, input, context);

    await this.prisma.assistantAction.updateMany({
      where: { userId, id: actionId, wasApplied: false },
      data: {
        wasApplied: true,
        outcome: {
          status: result.status,
          message: result.error ?? result.data ?? undefined,
        },
        appliedAt: new Date(),
      },
    });

    // Persist the SYSTEM receipt so a live thread shows what was applied.
    const formatted = this.formatSingleResult(proposedAction, result);
    if (record.conversationId) {
      await this.prisma.conversationMessage.create({
        data: {
          conversationId: record.conversationId,
          userId,
          role: 'SYSTEM',
          content: formatted.message,
          modelOutput: JSON.stringify({ confidence: formatted.confidence ?? null }),
        },
      });
      await this.prisma.conversation.update({
        where: { id: record.conversationId },
        data: { lastMessageAt: new Date() },
      });
    }

    return formatted;
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
    try {
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

      if (Array.isArray(aiResponse.actions) && aiResponse.actions.length > 0) {
        return aiResponse.actions;
      }
    } catch (error: any) {
      // No LLM reachable; fall through to the deterministic mapper below.
    }

    return this.mapIntentToActionsLocally(intent);
  }

  /**
   * Deterministic intent→action mapper used when no LLM provider is reachable.
   * Maps the nine ParsedIntent members onto the registered tool input schemas
   * so proposals still reach the confirm step in a live-but-LLM-less backend.
   */
  private mapIntentToActionsLocally(intent: ParsedIntent): IntentAction[] {
    const title = String(intent.entities?.title ?? intent.originalText ?? 'Untitled');
    const startDate = intent.entities?.startDate as string | undefined;
    const endDate = intent.entities?.endDate as string | undefined;
    const priority = intent.entities?.priority;
    const description = intent.entities?.description as string | undefined;

    const withReasoning = (
      toolName: string,
      input: Record<string, any>,
      reasoning: string
    ): IntentAction => {
      // Use each tool's registered default confirmation level instead of
      // hard-coding NONE, so high-risk writes (delete, move, create) still
      // surface as confirmable proposals.
      const tool = this.toolRegistry.getTool(toolName);
      return {
        toolName,
        input,
        reasoning,
        confidence: intent.confidence ?? 0.6,
        requiresConfirmation: (tool?.confirmationLevel ?? 'NONE') !== 'NONE',
        confirmationLevel: tool?.confirmationLevel ?? 'NONE',
      };
    };

    switch (intent.type) {
      case 'CREATE_EVENT': {
        const start = startDate
          ? String(startDate)
          : new Date(Date.now() + 60 * 60000).toISOString();
        const end = endDate
          ? String(endDate)
          : new Date(Date.parse(start) + 60 * 60000).toISOString();
        return [
          withReasoning(
            'create_event',
            { title, description, startDate: start, endDate: end },
            `Create "${title}"`
          ),
        ];
      }
      case 'CREATE_TASK':
        return [
          withReasoning(
            'create_task',
            {
              title,
              description,
              priority: typeof priority === 'number' ? priority : 3,
              estimatedDurationMinutes: intent.entities?.durationMinutes ?? 60,
              ...(startDate ? { startDate: String(startDate) } : {}),
              ...(intent.entities?.dueDate ? { dueDate: String(intent.entities.dueDate) } : {}),
            },
            `Create task "${title}"`
          ),
        ];
      case 'CREATE_GOAL':
        return [
          withReasoning(
            'create_goal',
            {
              title,
              description,
              ...(startDate ? { startDate: String(startDate) } : {}),
              ...(intent.entities?.targetDate ? { targetDate: String(intent.entities.targetDate) } : {}),
            },
            `Create goal "${title}"`
          ),
        ];
      case 'SCHEDULE_TASK':
        return [
          withReasoning(
            'create_schedule_proposal',
            {
              timeRange: {
                start: new Date().toISOString(),
                end: new Date(Date.now() + 7 * 86400000).toISOString(),
              },
              timezone: 'UTC',
            },
            `Build a schedule for "${title}"`
          ),
        ];
      case 'QUERY_AVAILABILITY': {
        const start = startDate ? String(startDate) : new Date().toISOString();
        return [
          withReasoning(
            'find_availability',
            {
              startDate: start,
              endDate: endDate
                ? String(endDate)
                : new Date(Date.parse(start) + 86400000).toISOString(),
              durationMinutes: intent.entities?.durationMinutes ?? 60,
            },
            `Find availability for "${title}"`
          ),
        ];
      }
      case 'CHECK_CONFLICTS':
        return [
          withReasoning(
            'detect_conflicts',
            {
              startDate: String(startDate ?? new Date().toISOString()),
              endDate: String(
                endDate ??
                  new Date(
                    Date.parse(String(startDate ?? new Date().toISOString())) + 86400000
                  ).toISOString()
              ),
            },
            `Check conflicts for "${title}"`
          ),
        ];
      case 'RESCHEDULE_EVENT':
      case 'CANCEL_EVENT': {
        const toolName = intent.type === 'RESCHEDULE_EVENT' ? 'move_event' : 'delete_event';
        const input: Record<string, any> = { eventId: intent.entities?.eventId ?? '' };
        if (intent.type === 'RESCHEDULE_EVENT') {
          const start = startDate ? String(startDate) : new Date().toISOString();
          input.newStartDate = start;
          input.newEndDate = endDate ?? new Date(Date.parse(start) + 60000).toISOString();
        }
        return [
          withReasoning(
            toolName,
            input,
            intent.type === 'RESCHEDULE_EVENT' ? `Move "${title}"` : `Delete "${title}"`
          ),
        ];
      }
      case 'GET_RECOMMENDATIONS':
      default:
        return [
          withReasoning(
            'explain_schedule',
            { date: startDate ?? new Date().toISOString(), includeMetrics: true },
            `Explain today's schedule`
          ),
        ];
    }
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
}

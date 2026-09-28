import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import { MetricsService } from '../../metrics/metrics.service';
import { IntentParserService } from '../../ai/intent/intent-parser.service';
import { ToolRegistry } from './tool-registry.service';
import {
  applyRequiredDurationDefault,
  describeToolInputSchema,
  normalizeToolInput,
} from './interfaces/normalize-tool-input';
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
import { extractSequencedTaskTitles } from '../../ai/intent/local-intent.classifier';

@Injectable()
export class AssistantOrchestratorService {
  private readonly logger = new Logger(AssistantOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly intentParser: IntentParserService,
    private readonly toolRegistry: ToolRegistry,
    // Optional and last so existing construction (including specs) is unaffected.
    @Optional() private readonly metrics?: MetricsService
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
    const assistantMessage = await this.prisma.conversationMessage.create({
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
          // Reuse the proposal id the client received so `confirmAction` can look
          // the row up by that same id. createMany would otherwise assign a cuid
          // the client never sees, and every confirm would miss.
          id: action.id,
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

    return {
      ...response,
      conversationId: activeConversationId,
      messageId: assistantMessage.id,
    };
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
    // `input` may come from a legacy row or a client-side edit, so run it
    // through the same normaliser + required-default pass used when proposing.
    const result = await this.toolRegistry.executeTool(
      proposedAction.toolName,
      applyRequiredDurationDefault(
        proposedAction.toolName,
        normalizeToolInput(proposedAction.toolName, input)
      ),
      context
    );

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
    // Read-only questions must never become writes because the action model
    // over-interpreted the intent.
    if (intent.entities?.isQuery) {
      return this.mapIntentToActionsLocally(intent);
    }

    const sequencedTaskTitles = extractSequencedTaskTitles(intent.originalText);
    if (sequencedTaskTitles.length > 1) {
      return sequencedTaskTitles.map((title) => ({
        toolName: 'create_task',
        input: {
          title,
          priority: typeof intent.entities?.priority === 'number' ? intent.entities.priority : 3,
          estimatedDurationMinutes: intent.entities?.durationMinutes ?? 60,
        },
        reasoning: `Create task "${title}" from the requested sequence`,
        confidence: intent.confidence ?? 0.8,
        requiresConfirmation: true,
        confirmationLevel: 'LOW',
      }));
    }

    try {
      const toolDefinitions = this.toolRegistry.getToolDefinitionsForLLM();

      const prompt = `
You are CalAssist's assistant orchestrator. Based on the user's intent and available tools, determine which tools to call.

User Intent: ${JSON.stringify(intent)}
Available Tools: ${JSON.stringify(
        toolDefinitions.map((t) => ({
          name: t.name,
          description: t.description,
          category: t.category,
          confirmationLevel: t.confirmationLevel,
          // Spell out the schema's own field names so the model cannot invent
          // aliases such as `durationMinutes` for `create_task` (which made
          // every proposal fail zod validation and vanish from the response).
          inputFields: describeToolInputSchema(t.inputSchema),
        }))
      )}

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

Rules for "input":
- Use ONLY the listed inputFields for the chosen tool, and only the fields you actually know.
- Dates must be full ISO-8601 strings in UTC, e.g. "2026-09-28T15:00:00.000Z".
- OMIT any field you do not have a value for. Never send an empty string ("") or null for a date.
- Durations are numbers of minutes, not strings.
`;

      const aiResponse = await this.aiProvider.generateStructured(prompt, {
        temperature: 0.3,
        maxTokens: 3000,
      });

      // The prompt asks the model for a bare JSON array; some models (and the
      // OpenAI wrapper) may return { actions: [...] } instead. Accept both.
      const actions = Array.isArray(aiResponse) ? aiResponse : aiResponse?.actions;
      if (Array.isArray(actions) && actions.length > 0) {
        return this.enrichActionsWithParsedEntities(intent, actions);
      }
      // The provider answered but proposed nothing usable. Counted separately from
      // a transport failure: an outage and a model that keeps ignoring the tool
      // list need different fixes, and one counter would hide both.
      this.metrics?.recordLocalFallback('extract_actions', 'provider_returned_no_actions');
    } catch (error: any) {
      // No LLM reachable; fall through to the deterministic mapper below.
      this.logger.warn(
        `Action extraction via AI provider failed, using local mapper: ${error?.message ?? error}`
      );
      this.metrics?.recordLocalFallback('extract_actions', 'provider_error');
    }

    return this.mapIntentToActionsLocally(intent);
  }

  private enrichActionsWithParsedEntities(
    intent: ParsedIntent,
    actions: IntentAction[]
  ): IntentAction[] {
    const entities = intent.entities ?? {};
    return actions.map((action) => {
      const input = { ...action.input };
      const title = String(entities.title ?? intent.originalText ?? 'Untitled');
      if (intent.type === 'CREATE_EVENT' && action.toolName === 'create_event') {
        input.title = input.title || title;
        if (entities.startDate) input.startDate = String(entities.startDate);
        if (entities.endDate) input.endDate = String(entities.endDate);
      } else if (intent.type === 'CREATE_TASK' && action.toolName === 'create_task') {
        input.title = input.title || title;
        if (typeof entities.priority === 'number') input.priority = entities.priority;
        if (typeof entities.durationMinutes === 'number') {
          input.estimatedDurationMinutes = entities.durationMinutes;
        }
        if (entities.startDate) input.startDate = String(entities.startDate);
        if (entities.dueDate) input.dueDate = String(entities.dueDate);
      } else if (intent.type === 'CREATE_GOAL' && action.toolName === 'create_goal') {
        input.title = input.title || title;
        if (typeof entities.priority === 'number') input.priority = entities.priority;
        if (entities.startDate) input.startDate = String(entities.startDate);
        if (entities.dueDate) input.targetDate = String(entities.dueDate);
      } else if (intent.type === 'CREATE_PROJECT' && action.toolName === 'create_project') {
        input.title = input.title || title;
        if (typeof entities.priority === 'number') input.priority = entities.priority;
        if (entities.startDate) input.startDate = String(entities.startDate);
        if (entities.dueDate) input.dueDate = String(entities.dueDate);
      }
      return { ...action, input };
    });
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
              ...(intent.entities?.dueDate
                ? { targetDate: String(intent.entities.dueDate) }
                : intent.entities?.targetDate
                  ? { targetDate: String(intent.entities.targetDate) }
                  : {}),
              ...(typeof priority === 'number' ? { priority } : {}),
            },
            `Create goal "${title}"`
          ),
        ];
      // Stage 4: `create_project` has been a registered tool since Phase 8, but
      // this mapper had no case for it, so any project intent fell through to
      // `default:` and proposed `explain_schedule` instead of creating anything.
      case 'CREATE_PROJECT':
        return [
          withReasoning(
            'create_project',
            {
              title,
              description,
              priority: typeof priority === 'number' ? priority : 3,
              ...(intent.entities?.goalId ? { goalId: String(intent.entities.goalId) } : {}),
              ...(startDate ? { startDate: String(startDate) } : {}),
              ...(intent.entities?.dueDate ? { dueDate: String(intent.entities.dueDate) } : {}),
            },
            `Create project "${title}"`
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

      // LLM output is untrusted: repair field aliases, blank-string dates and
      // stringified numbers before validating, then restore schema-required
      // defaults. Without this a single `dueDate: ""` (exactly what
      // gpt-oss:20b emits for "no due date") made safeParse fail and the
      // proposal disappeared from the response entirely.
      const normalizedInput = applyRequiredDurationDefault(
        action.toolName,
        normalizeToolInput(action.toolName, action.input)
      );

      const parseResult = tool.inputSchema.safeParse(normalizedInput);
      if (!parseResult.success) {
        // Log instead of silently dropping: a failing proposal used to surface
        // only as "Executed 0 action(s)", which is undebuggable from the client.
        this.logger.warn(
          `Dropped invalid ${action.toolName} proposal: ${parseResult.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ')} | input=${JSON.stringify(normalizedInput)}`
        );
        continue;
      }

      const parsedInput = parseResult.data as Record<string, any>;

      proposedActions.push({
        id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        toolName: action.toolName,
        description: action.reasoning,
        // Persist the validated payload so confirmAction re-executes exactly
        // what was shown to the user rather than the raw LLM guess.
        input: parsedInput,
        confirmationLevel: action.confirmationLevel || tool.confirmationLevel,
        estimatedImpact: this.estimateImpact(action.toolName, parsedInput),
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

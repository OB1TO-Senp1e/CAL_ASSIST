import { z } from 'zod';

export const ToolCategorySchema = z.enum([
  'CALENDAR',
  'TASKS',
  'GOALS',
  'PROJECTS',
  'SCHEDULING',
  'AVAILABILITY',
  'CONFLICTS',
  'INSIGHTS',
]);

export type ToolCategory = z.infer<typeof ToolCategorySchema>;

export const ToolConfirmationLevelSchema = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export type ToolConfirmationLevel = z.infer<typeof ToolConfirmationLevelSchema>;

export const ToolResultStatusSchema = z.enum([
  'SUCCESS',
  'ERROR',
  'REQUIRES_CONFIRMATION',
  'PARTIAL',
]);

export type ToolResultStatus = z.infer<typeof ToolResultStatusSchema>;

export interface ToolResult<T = any> {
  status: ToolResultStatus;
  data?: T;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  confirmationData?: any;
  metadata?: Record<string, any>;
}

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: ToolCategory;
  confirmationLevel: ToolConfirmationLevel;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  requiresAuth: boolean;
  execute: (input: TInput, context: ToolExecutionContext) => Promise<ToolResult<TOutput>>;
}

export interface ToolExecutionContext {
  userId: string;
  timezone: string;
  currentTime: Date;
  permissions: string[];
  metadata?: Record<string, any>;
}

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.any()),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ProposedActionSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  description: z.string(),
  input: z.record(z.any()),
  confirmationLevel: ToolConfirmationLevelSchema,
  estimatedImpact: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  reversible: z.boolean(),
});

export type ProposedAction = z.infer<typeof ProposedActionSchema>;

export const AssistantMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolCallId: z.string().optional(),
  name: z.string().optional(),
});

export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

export const AssistantResponseSchema = z.object({
  message: z.string(),
  toolCalls: z.array(ToolCallSchema).optional(),
  proposedActions: z.array(ProposedActionSchema).optional(),
  requiresConfirmation: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  // Set by the orchestrator when it persists a turn, so the HTTP layer can echo
  // the stored ids instead of guessing which conversation/message they belong to.
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
});

export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;

export const ConfirmationRequestSchema = z.object({
  actionId: z.string(),
  confirmed: z.boolean(),
  modifiedInput: z.record(z.any()).optional(),
});

export type ConfirmationRequest = z.infer<typeof ConfirmationRequestSchema>;

export const ContextSchema = z.object({
  userId: z.string(),
  timezone: z.string(),
  currentDate: z.string().datetime(),
  workingHours: z
    .object({
      start: z.string(),
      end: z.string(),
      days: z.array(z.number()),
    })
    .optional(),
  preferences: z.record(z.any()).optional(),
  activeGoals: z.array(z.string()).optional(),
  activeProjects: z.array(z.string()).optional(),
  upcomingEvents: z.array(z.any()).optional(),
  pendingTasks: z.array(z.any()).optional(),
  recentIntent: z.any().optional(),
});

export type Context = z.infer<typeof ContextSchema>;

export const IntentActionSchema = z.object({
  toolName: z.string(),
  input: z.record(z.any()),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.boolean(),
  confirmationLevel: ToolConfirmationLevelSchema,
});

export type IntentAction = z.infer<typeof IntentActionSchema>;

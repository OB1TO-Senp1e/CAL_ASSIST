import { z } from 'zod';

export const AutonomyLevelSchema = z.enum([
  'OBSERVE',
  'SUGGEST',
  'ASK_BEFORE_ACTION',
  'AUTO_EXECUTE_LOW_RISK',
  'DELEGATED_AUTHORITY',
]);

export type AutonomyLevel = z.infer<typeof AutonomyLevelSchema>;

export const PermissionActionSchema = z.enum([
  'CREATE_EVENT',
  'MOVE_EVENT',
  'CANCEL_EVENT',
  'CONTACT_PEOPLE',
  'NEGOTIATE_MEETING_TIMES',
  'MODIFY_TASKS',
  'REPLAN_SCHEDULES',
  'SEND_NOTIFICATIONS',
  'CREATE_TASK',
  'UPDATE_TASK',
  'DELETE_TASK',
  'CREATE_COMMITMENT',
  'MODIFY_COMMITMENT',
  'EXTRACT_COMMITMENTS',
  'MODIFY_GOALS',
  'MODIFY_PROJECTS',
  'RUN_PROACTIVE_CHECK',
  'DISMISS_INTERVENTION',
  'MODIFY_RULES',
  'MODIFY_AUTONOMY_POLICIES',
  'ACCESS_INTEGRATIONS',
  'SYNC_CALENDAR',
  'MODIFY_PREFERENCES',
]);

export type PermissionAction = z.infer<typeof PermissionActionSchema>;

export const PermissionScopeSchema = z.enum([
  'GLOBAL',
  'CALENDAR',
  'TASKS',
  'COMMITMENTS',
  'GOALS',
  'PROJECTS',
  'SCHEDULING',
  'NOTIFICATIONS',
  'INTEGRATIONS',
  'AI_ASSISTANT',
  'PROACTIVE',
  'RULES',
]);

export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

export const PermissionDecisionSchema = z.enum(['ALLOW', 'DENY', 'ASK', 'CONDITIONAL']);

export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const UserPermissionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  action: PermissionActionSchema,
  scope: PermissionScopeSchema,
  decision: PermissionDecisionSchema,
  conditions: z.record(z.any()).default({}),
  grantedAt: z.string().datetime(),
  grantedBy: z.string().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
});

export type UserPermission = z.infer<typeof UserPermissionSchema>;

export const AutonomyPolicySchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  autonomyLevel: AutonomyLevelSchema,
  enabledScopes: z.array(PermissionScopeSchema).default([]),
  allowedActions: z.array(PermissionActionSchema).default([]),
  riskThreshold: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW'),
  requireConfirmationFor: z.array(PermissionActionSchema).default([]),
  protectedEntities: z
    .array(
      z.object({
        type: z.enum(['EVENT', 'TASK', 'COMMITMENT', 'GOAL', 'PROJECT']),
        id: z.string(),
        reason: z.string(),
      })
    )
    .default([]),
  timeRestrictions: z
    .array(
      z.object({
        startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        days: z.array(z.number().int().min(0).max(6)),
      })
    )
    .default([]),
  maxActionsPerPeriod: z
    .object({
      count: z.number().int().positive(),
      periodMinutes: z.number().int().positive(),
    })
    .optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AutonomyPolicy = z.infer<typeof AutonomyPolicySchema>;

export const AuditActionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  action: PermissionActionSchema,
  scope: PermissionScopeSchema,
  autonomyLevel: AutonomyLevelSchema,
  decision: PermissionDecisionSchema,
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  entityTitle: z.string().optional(),
  previousState: z.record(z.any()).optional(),
  newState: z.record(z.any()).optional(),
  reason: z.string().optional(),
  initiatedBy: z
    .enum([
      'USER',
      'AI_ASSISTANT',
      'PROACTIVE',
      'AUTONOMY_POLICY',
      'RULE_ENGINE',
      'REPLANNING',
      'SCHEDULED_JOB',
    ])
    .default('USER'),
  policyId: z.string().optional(),
  ruleId: z.string().optional(),
  interventionId: z.string().optional(),
  riskLevel: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('NONE'),
  wasUndone: z.boolean().default(false),
  undoneAt: z.string().datetime().optional().nullable(),
  undoneBy: z.string().optional(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.any()).default({}),
});

export type AuditAction = z.infer<typeof AuditActionSchema>;

export const PermissionCheckInputSchema = z.object({
  userId: z.string(),
  action: PermissionActionSchema,
  scope: PermissionScopeSchema,
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  context: z.record(z.any()).default({}),
  initiatedBy: z
    .enum([
      'USER',
      'AI_ASSISTANT',
      'PROACTIVE',
      'AUTONOMY_POLICY',
      'RULE_ENGINE',
      'REPLANNING',
      'SCHEDULED_JOB',
    ])
    .default('AI_ASSISTANT'),
  riskLevel: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW'),
});

export type PermissionCheckInput = z.infer<typeof PermissionCheckInputSchema>;

/**
 * Stage 4k runtime contracts. The `/api/permissions` controller used to take
 * bare `@Body() body: SomeTsType` with no pipe, and because these types are
 * zod-inferred they vanish at compile time — anything reached the database.
 * `userId` is injected from the JWT, never from the body.
 */
export const CheckPermissionInputSchema = PermissionCheckInputSchema.omit({ userId: true });
export type CheckPermissionInput = z.infer<typeof CheckPermissionInputSchema>;

export const GrantPermissionInputSchema = z.object({
  action: PermissionActionSchema,
  scope: PermissionScopeSchema,
  decision: PermissionDecisionSchema,
  conditions: z.record(z.any()).default({}),
  grantedBy: z.string().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type GrantPermissionInput = z.infer<typeof GrantPermissionInputSchema>;

export const CreateAutonomyPolicyInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  autonomyLevel: AutonomyLevelSchema,
  enabledScopes: z.array(PermissionScopeSchema).default([]),
  allowedActions: z.array(PermissionActionSchema).default([]),
  riskThreshold: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW'),
  requireConfirmationFor: z.array(PermissionActionSchema).default([]),
  protectedEntities: z
    .array(
      z.object({
        type: z.enum(['EVENT', 'TASK', 'COMMITMENT', 'GOAL', 'PROJECT']),
        id: z.string(),
        reason: z.string(),
      })
    )
    .default([]),
  timeRestrictions: z
    .array(
      z.object({
        startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        days: z.array(z.number().int().min(0).max(6)),
      })
    )
    .default([]),
  maxActionsPerPeriod: z
    .object({
      count: z.number().int().positive(),
      periodMinutes: z.number().int().positive(),
    })
    .optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().default(0),
});

export type CreateAutonomyPolicyInput = z.infer<typeof CreateAutonomyPolicyInputSchema>;

export const UpdateAutonomyPolicyInputSchema = CreateAutonomyPolicyInputSchema.partial();
export type UpdateAutonomyPolicyInput = z.infer<typeof UpdateAutonomyPolicyInputSchema>;

export const ApplyTemplateInputSchema = z.object({
  templateId: z.string().min(1),
});
export type ApplyTemplateInput = z.infer<typeof ApplyTemplateInputSchema>;

/** Undo takes the audit id from the body; userId comes from the JWT. */
export const UndoActionInputSchema = z.object({
  auditRecordId: z.string().min(1),
  reason: z.string().optional(),
});
export type UndoActionInput = z.infer<typeof UndoActionInputSchema>;

export const PermissionCheckResultSchema = z.object({
  allowed: z.boolean(),
  decision: PermissionDecisionSchema,
  reason: z.string(),
  requiredConfirmation: z.boolean(),
  applicablePolicy: z.string().optional(),
  applicablePermissions: z.array(UserPermissionSchema).optional(),
  auditRecord: z.string().optional(),
});

export type PermissionCheckResult = z.infer<typeof PermissionCheckResultSchema>;

export const UndoRequestSchema = z.object({
  userId: z.string(),
  auditRecordId: z.string(),
  reason: z.string().optional(),
});

export type UndoRequest = z.infer<typeof UndoRequestSchema>;

export const UndoResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  restoredState: z.record(z.any()).optional(),
});

export type UndoResult = z.infer<typeof UndoResultSchema>;

export const PermissionTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  autonomyLevel: AutonomyLevelSchema,
  permissions: z.array(
    z.object({
      action: PermissionActionSchema,
      scope: PermissionScopeSchema,
      decision: PermissionDecisionSchema,
      conditions: z.record(z.any()).optional(),
    })
  ),
  applicability: z
    .array(z.enum(['WORK', 'PERSONAL', 'STUDENT', 'EXECUTIVE', 'FREELANCER']))
    .default(['WORK', 'PERSONAL']),
});

export type PermissionTemplate = z.infer<typeof PermissionTemplateSchema>;

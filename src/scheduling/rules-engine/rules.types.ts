import { z } from 'zod';

export const RuleTypeSchema = z.enum([
  'TIME_RESTRICTION',
  'BUFFER_RULE',
  'CONSECUTIVE_LIMIT',
  'PROTECTION_RULE',
  'PREFERENCE_RULE',
  'ENERGY_RULE',
  'TRAVEL_RULE',
]);

export type RuleType = z.infer<typeof RuleTypeSchema>;

export const RuleTriggerSchema = z.enum([
  'SCHEDULE_EVENT',
  'SCHEDULE_TASK',
  'SCHEDULE_MEETING',
  'CREATE_TIME_BLOCK',
  'MOVE_BLOCK',
  'RESIZE_BLOCK',
  'GENERATE_SCHEDULE',
]);

export type RuleTrigger = z.infer<typeof RuleTriggerSchema>;

export const RuleActionSchema = z.enum([
  'BLOCK',
  'WARN',
  'ADJUST',
  'REQUIRE_CONFIRMATION',
  'SUGGEST_ALTERNATIVE',
  'SPLIT',
  'RESCHEDULE',
]);

export type RuleAction = z.infer<typeof RuleActionSchema>;

export const RuleScopeSchema = z.enum([
  'GLOBAL',
  'MEETINGS',
  'TASKS',
  'FOCUS_TIME',
  'BREAKS',
  'WORK_HOURS',
  'PERSONAL',
  'SPECIFIC_ENTITY',
]);

export type RuleScope = z.infer<typeof RuleScopeSchema>;

export const RuleConditionSchema = z.object({
  field: z.string(),
  operator: z.enum([
    'EQUALS',
    'NOT_EQUALS',
    'CONTAINS',
    'NOT_CONTAINS',
    'STARTS_WITH',
    'ENDS_WITH',
    'GREATER_THAN',
    'LESS_THAN',
    'GREATER_EQUAL',
    'LESS_EQUAL',
    'IN_RANGE',
    'OUT_OF_RANGE',
    'BEFORE_TIME',
    'AFTER_TIME',
    'BETWEEN_TIMES',
    'ON_DAY',
    'NOT_ON_DAY',
    'WITHIN_DAYS',
    'HAS_TAG',
    'NOT_HAS_TAG',
  ]),
  value: z.any(),
  value2: z.any().optional(),
});

export type RuleCondition = z.infer<typeof RuleConditionSchema>;

export const RuleSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: RuleTypeSchema,
  scope: RuleScopeSchema,
  triggers: z
    .array(RuleTriggerSchema)
    .default(['SCHEDULE_EVENT', 'SCHEDULE_TASK', 'GENERATE_SCHEDULE']),
  conditions: z.array(RuleConditionSchema).default([]),
  action: RuleActionSchema,
  actionConfig: z.record(z.any()).default({}),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
  isNaturalLanguage: z.boolean().default(false),
  naturalLanguageText: z.string().optional(),
  source: z.enum(['USER_CREATED', 'AI_INFERRED', 'TEMPLATE', 'IMPORTED']).default('USER_CREATED'),
  confidence: z.number().min(0).max(1).default(1.0),
  conflictsWith: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastTriggeredAt: z.string().datetime().optional().nullable(),
  triggerCount: z.number().int().nonnegative().default(0),
});

export type Rule = z.infer<typeof RuleSchema>;

export const CreateRuleInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  type: RuleTypeSchema,
  scope: RuleScopeSchema.default('GLOBAL'),
  triggers: z
    .array(RuleTriggerSchema)
    .default(['SCHEDULE_EVENT', 'SCHEDULE_TASK', 'GENERATE_SCHEDULE']),
  conditions: z.array(RuleConditionSchema).default([]),
  action: RuleActionSchema,
  actionConfig: z.record(z.any()).default({}),
  priority: z.number().int().default(0),
  naturalLanguageText: z.string().optional(),
});

export type CreateRuleInput = z.infer<typeof CreateRuleInputSchema>;

export const UpdateRuleInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  type: RuleTypeSchema.optional(),
  scope: RuleScopeSchema.optional(),
  triggers: z.array(RuleTriggerSchema).optional(),
  conditions: z.array(RuleConditionSchema).optional(),
  action: RuleActionSchema.optional(),
  actionConfig: z.record(z.any()).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
  naturalLanguageText: z.string().optional(),
});

export type UpdateRuleInput = z.infer<typeof UpdateRuleInputSchema>;

export const RuleConflictSchema = z.object({
  id: z.string(),
  ruleId1: z.string(),
  ruleId2: z.string(),
  rule1Name: z.string(),
  rule2Name: z.string(),
  conflictType: z.enum([
    'DIRECT_CONTRADICTION',
    'OVERLAPPING_CONDITIONS',
    'MUTUALLY_EXCLUSIVE_ACTIONS',
    'PRIORITY_AMBIGUITY',
    'SCOPE_OVERLAP',
  ]),
  description: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  suggestedResolution: z
    .enum(['DISABLE_FIRST', 'DISABLE_SECOND', 'ADJUST_PRIORITY', 'MERGE', 'MANUAL'])
    .optional(),
  detectedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional().nullable(),
  resolution: z
    .enum(['DISABLE_FIRST', 'DISABLE_SECOND', 'ADJUST_PRIORITY', 'MERGE', 'MANUAL', 'KEEP_BOTH'])
    .optional(),
});

export type RuleConflict = z.infer<typeof RuleConflictSchema>;

export const RuleValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
      code: z.string(),
    })
  ),
  warnings: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
    })
  ),
});

export type RuleValidationResult = z.infer<typeof RuleValidationResultSchema>;

export const RuleEnforcementResultSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  triggered: z.boolean(),
  action: RuleActionSchema,
  message: z.string(),
  originalInput: z.record(z.any()),
  adjustedInput: z.record(z.any()).optional(),
  blocked: z.boolean(),
  requiresConfirmation: z.boolean(),
  confirmationPrompt: z.string().optional(),
  alternativeSuggestions: z
    .array(
      z.object({
        description: z.string(),
        adjustedInput: z.record(z.any()),
      })
    )
    .optional(),
});

export type RuleEnforcementResult = z.infer<typeof RuleEnforcementResultSchema>;

export const RulesEnforcementSummarySchema = z.object({
  input: z.record(z.any()),
  results: z.array(RuleEnforcementResultSchema),
  blocked: z.boolean(),
  requiresConfirmation: z.boolean(),
  conflicts: z.array(RuleConflictSchema),
  appliedAdjustments: z.array(
    z.object({
      ruleId: z.string(),
      field: z.string(),
      originalValue: z.any(),
      newValue: z.any(),
    })
  ),
});

export type RulesEnforcementSummary = z.infer<typeof RulesEnforcementSummarySchema>;

export const ParseNaturalLanguageInputSchema = z.object({
  text: z.string().min(1).max(1000),
  context: z.record(z.any()).optional(),
});

export type ParseNaturalLanguageInput = z.infer<typeof ParseNaturalLanguageInputSchema>;

export const ParsedRuleSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: RuleTypeSchema,
  scope: RuleScopeSchema,
  triggers: z.array(RuleTriggerSchema),
  conditions: z.array(RuleConditionSchema),
  action: RuleActionSchema,
  actionConfig: z.record(z.any()),
  priority: z.number().int(),
  confidence: z.number().min(0).max(1),
  originalText: z.string(),
});

export type ParsedRule = z.infer<typeof ParsedRuleSchema>;

export const NaturalLanguageParseResultSchema = z.object({
  rules: z.array(ParsedRuleSchema),
  ambiguous: z.array(
    z.object({
      text: z.string(),
      possibleInterpretations: z.array(z.string()),
    })
  ),
  errors: z.array(z.string()),
});

export type NaturalLanguageParseResult = z.infer<typeof NaturalLanguageParseResultSchema>;

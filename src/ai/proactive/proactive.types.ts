import { z } from 'zod';

export const InterventionTypeSchema = z.enum([
  'DEADLINE_AT_RISK',
  'CALENDAR_OVERLOAD',
  'UNSCHEDULED_PRIORITY',
  'CONFLICT_DETECTED',
  'MISSING_PREPARATION',
  'TRAVEL_CONSTRAINT',
  'UNFINISHED_COMMITMENT',
  'GOAL_OFF_TRACK',
  'REPEATED_POSTPONEMENT',
  'NO_TIME_ALLOCATED',
]);

export type InterventionType = z.infer<typeof InterventionTypeSchema>;

export const InterventionPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export type InterventionPriority = z.infer<typeof InterventionPrioritySchema>;

export const InterventionActionSchema = z.enum([
  'ALLOCATE_TIME',
  'RESCHEDULE',
  'DELEGATE',
  'REDUCE_SCOPE',
  'CANCEL_LOW_PRIORITY',
  'REQUEST_EXTENSION',
  'ADD_BUFFER',
  'PREPARE_MATERIALS',
  'PLAN_TRAVEL',
  'REVIEW_PRIORITIES',
  'BREAK_DOWN_TASK',
  'SET_REMINDER',
  'COMMUNICATE_CHANGE',
  'NO_ACTION',
]);

export type InterventionAction = z.infer<typeof InterventionActionSchema>;

export const InterventionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: InterventionTypeSchema,
  priority: InterventionPrioritySchema,
  title: z.string(),
  description: z.string(),
  reason: z.string(),
  affectedEntities: z.array(
    z.object({
      type: z.enum(['TASK', 'EVENT', 'COMMITMENT', 'GOAL', 'PROJECT', 'TIME_BLOCK']),
      id: z.string(),
      title: z.string(),
    })
  ),
  action: InterventionActionSchema,
  actionDetails: z.record(z.any()).default({}),
  estimatedEffortMinutes: z.number().int().nonnegative().default(0),
  confidence: z.number().min(0).max(1).default(1.0),
  status: z
    .enum(['ACTIVE', 'ACKNOWLEDGED', 'DISMISSED', 'ACTED_UPON', 'EXPIRED'])
    .default('ACTIVE'),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional().nullable(),
  acknowledgedAt: z.string().datetime().optional().nullable(),
  actedUponAt: z.string().datetime().optional().nullable(),
  snoozedUntil: z.string().datetime().optional().nullable(),
  metadata: z.record(z.any()).default({}),
});

export type Intervention = z.infer<typeof InterventionSchema>;

export const ProactiveCheckInputSchema = z.object({
  userId: z.string(),
  timeRange: z
    .object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    })
    .optional(),
  interventionTypes: z.array(InterventionTypeSchema).optional(),
  minPriority: InterventionPrioritySchema.optional(),
  limit: z.number().int().positive().default(10),
});

export type ProactiveCheckInput = z.infer<typeof ProactiveCheckInputSchema>;

export const ProactiveCheckResultSchema = z.object({
  timestamp: z.string().datetime(),
  interventions: z.array(InterventionSchema),
  summary: z.object({
    total: z.number(),
    byPriority: z.record(z.number()),
    byType: z.record(z.number()),
    urgentCount: z.number(),
    highCount: z.number(),
  }),
  nextCheckRecommendedAt: z.string().datetime().optional(),
});

export type ProactiveCheckResult = z.infer<typeof ProactiveCheckResultSchema>;

export const UserProactivePreferencesSchema = z.object({
  userId: z.string(),
  enabled: z.boolean().default(true),
  checkIntervalMinutes: z.number().int().positive().default(60),
  quietHours: z
    .object({
      start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    })
    .optional(),
  enabledTypes: z.array(InterventionTypeSchema).default([]),
  minPriority: InterventionPrioritySchema.default('MEDIUM'),
  maxInterventionsPerCheck: z.number().int().positive().default(5),
  deliveryChannels: z.array(z.enum(['IN_APP', 'EMAIL', 'PUSH', 'SMS'])).default(['IN_APP']),
  groupSimilar: z.boolean().default(true),
  snoozeDurationMinutes: z.number().int().positive().default(30),
});

export type UserProactivePreferences = z.infer<typeof UserProactivePreferencesSchema>;

export const InterventionTemplateSchema = z.object({
  id: z.string(),
  type: InterventionTypeSchema,
  titleTemplate: z.string(),
  descriptionTemplate: z.string(),
  reasonTemplate: z.string(),
  defaultAction: InterventionActionSchema,
  defaultPriority: InterventionPrioritySchema,
  conditions: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum(['GREATER_THAN', 'LESS_THAN', 'EQUALS', 'CONTAINS']),
        value: z.any(),
      })
    )
    .default([]),
});

export type InterventionTemplate = z.infer<typeof InterventionTemplateSchema>;

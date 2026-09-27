import { z } from 'zod';

export const ReplanTriggerSchema = z.enum([
  'TASK_OVERRUN',
  'MEETING_LATE',
  'TASK_POSTPONED',
  'DEADLINE_APPROACHING',
  'DEPENDENCY_INCOMPLETE',
  'SCHEDULE_DRIFT',
  'NEW_TASK',
  'TASK_CANCELLED',
  'MEETING_CANCELLED',
  'MANUAL',
]);

export type ReplanTrigger = z.infer<typeof ReplanTriggerSchema>;

export const ReplanUrgencySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type ReplanUrgency = z.infer<typeof ReplanUrgencySchema>;

export const ScheduleOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  moves: z.array(
    z.object({
      entityType: z.enum(['TASK', 'EVENT', 'COMMITMENT', 'TIME_BLOCK']),
      entityId: z.string(),
      entityTitle: z.string(),
      from: z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      }),
      to: z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      }),
      reason: z.string(),
    })
  ),
  unchanged: z.array(
    z.object({
      entityType: z.enum(['TASK', 'EVENT', 'COMMITMENT', 'TIME_BLOCK']),
      entityId: z.string(),
      entityTitle: z.string(),
      start: z.string().datetime(),
      end: z.string().datetime(),
    })
  ),
  deadlineImpact: z.array(
    z.object({
      entityId: z.string(),
      entityType: z.enum(['TASK', 'COMMITMENT', 'GOAL', 'PROJECT']),
      entityTitle: z.string(),
      originalDeadline: z.string().datetime(),
      newProjectedCompletion: z.string().datetime(),
      impact: z.enum(['NONE', 'MINOR', 'MAJOR', 'MISSED']),
      daysShift: z.number(),
    })
  ),
  constraintViolations: z.array(
    z.object({
      constraintId: z.string(),
      constraintType: z.string(),
      description: z.string(),
      severity: z.enum(['WARNING', 'VIOLATION']),
      affectedEntities: z.array(z.string()),
    })
  ),
  tradeoffs: z.array(
    z.object({
      description: z.string(),
      impact: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']),
      affectedArea: z.enum([
        'DEADLINES',
        'FOCUS_TIME',
        'MEETINGS',
        'BREAKS',
        'WORK_LIFE_BALANCE',
        'PRIORITIES',
      ]),
    })
  ),
  confidence: z.number().min(0).max(1),
  estimatedEffortMinutes: z.number(),
});

export type ScheduleOption = z.infer<typeof ScheduleOptionSchema>;

export const ReplanOptionsSchema = z.object({
  trigger: ReplanTriggerSchema,
  reason: z.string(),
  affectedEntities: z.array(
    z.object({
      type: z.enum(['TASK', 'EVENT', 'COMMITMENT', 'GOAL']),
      id: z.string(),
      title: z.string(),
    })
  ),
  urgency: ReplanUrgencySchema,
  options: z.array(ScheduleOptionSchema).min(1).max(3),
  originalSchedule: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      type: z.enum(['TASK', 'EVENT', 'COMMITMENT', 'TIME_BLOCK']),
      start: z.string().datetime(),
      end: z.string().datetime(),
      status: z.string(),
    })
  ),
  recommendedOptionId: z.string().optional(),
  requiresUserApproval: z.boolean(),
  autonomyPolicyApplied: z.boolean(),
  createdAt: z.string().datetime(),
});

export type ReplanOptions = z.infer<typeof ReplanOptionsSchema>;

export const AutonomyPolicySchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  scope: z.enum(['GLOBAL', 'SCHEDULING', 'TASKS', 'MEETINGS', 'FOCUS_TIME']),
  triggers: z.array(ReplanTriggerSchema),
  allowedActions: z.array(
    z.enum([
      'MOVE_TASK',
      'RESCHEDULE_EVENT',
      'SPLIT_TASK',
      'MERGE_BLOCKS',
      'ADD_BUFFER',
      'REDUCE_SCOPE',
      'REPRIORITIZE',
      'EXTEND_DEADLINE',
      'CANCEL_LOW_PRIORITY',
    ])
  ),
  constraints: z.array(
    z.object({
      type: z.enum([
        'MAX_MOVES_PER_DAY',
        'MAX_TIME_SHIFT_MINUTES',
        'PROTECT_TIME_RANGES',
        'RESPECT_HARD_CONSTRAINTS',
      ]),
      config: z.record(z.any()),
    })
  ),
  maxChangesPerOperation: z.number().int().positive().default(3),
  maxTimeShiftMinutes: z.number().int().nonnegative().default(120),
  protectedTimeRanges: z.array(
    z.object({
      start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      days: z.array(z.number().int().min(0).max(6)),
      reason: z.string(),
    })
  ),
  requireConfirmationFor: z.array(
    z.enum([
      'DEADLINE_CHANGES',
      'MEETING_MOVES',
      'FOCUS_TIME_CHANGES',
      'EXTERNAL_EVENT_CHANGES',
      'HIGH_PRIORITY_CHANGES',
    ])
  ),
  priority: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AutonomyPolicy = z.infer<typeof AutonomyPolicySchema>;

export const CreateAutonomyPolicyInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  scope: z.enum(['GLOBAL', 'SCHEDULING', 'TASKS', 'MEETINGS', 'FOCUS_TIME']).default('GLOBAL'),
  triggers: z.array(ReplanTriggerSchema).default([]),
  allowedActions: z
    .array(
      z.enum([
        'MOVE_TASK',
        'RESCHEDULE_EVENT',
        'SPLIT_TASK',
        'MERGE_BLOCKS',
        'ADD_BUFFER',
        'REDUCE_SCOPE',
        'REPRIORITIZE',
        'EXTEND_DEADLINE',
        'CANCEL_LOW_PRIORITY',
      ])
    )
    .default([]),
  constraints: z
    .array(
      z.object({
        type: z.enum([
          'MAX_MOVES_PER_DAY',
          'MAX_TIME_SHIFT_MINUTES',
          'PROTECT_TIME_RANGES',
          'RESPECT_HARD_CONSTRAINTS',
        ]),
        config: z.record(z.any()),
      })
    )
    .default([]),
  maxChangesPerOperation: z.number().int().positive().default(3),
  maxTimeShiftMinutes: z.number().int().nonnegative().default(120),
  protectedTimeRanges: z
    .array(
      z.object({
        start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        days: z.array(z.number().int().min(0).max(6)),
        reason: z.string(),
      })
    )
    .default([]),
  requireConfirmationFor: z
    .array(
      z.enum([
        'DEADLINE_CHANGES',
        'MEETING_MOVES',
        'FOCUS_TIME_CHANGES',
        'EXTERNAL_EVENT_CHANGES',
        'HIGH_PRIORITY_CHANGES',
      ])
    )
    .default([]),
});

export type CreateAutonomyPolicyInput = z.infer<typeof CreateAutonomyPolicyInputSchema>;

export const ReplanExecutionResultSchema = z.object({
  replanId: z.string(),
  selectedOptionId: z.string(),
  appliedChanges: z.array(
    z.object({
      entityType: z.string(),
      entityId: z.string(),
      action: z.string(),
      from: z.record(z.any()),
      to: z.record(z.any()),
    })
  ),
  skippedChanges: z.array(
    z.object({
      entityType: z.string(),
      entityId: z.string(),
      reason: z.string(),
    })
  ),
  autonomyPolicyUsed: z.string().optional(),
  executedAt: z.string().datetime(),
  success: z.boolean(),
  warnings: z.array(z.string()),
});

export type ReplanExecutionResult = z.infer<typeof ReplanExecutionResultSchema>;

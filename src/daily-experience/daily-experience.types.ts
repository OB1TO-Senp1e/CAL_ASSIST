import { z } from 'zod';

export const DailyPhaseSchema = z.enum(['MORNING', 'DURING_DAY', 'EVENING']);
export type DailyPhase = z.infer<typeof DailyPhaseSchema>;

export const PrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type Priority = z.infer<typeof PrioritySchema>;

export const TimeBlockTypeSchema = z.enum([
  'FOCUS',
  'MEETING',
  'BREAK',
  'BUFFER',
  'TRAVEL',
  'ADMIN',
  'PERSONAL',
  'DEEP_WORK',
  'SHALLOW_WORK',
]);
export type TimeBlockType = z.infer<typeof TimeBlockTypeSchema>;

export const RiskLevelSchema = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const BriefingItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: PrioritySchema,
  category: z.enum([
    'PRIORITY_TASK',
    'MEETING_PREP',
    'COMMITMENT',
    'RISK',
    'SCHEDULE_CONFLICT',
    'FOCUS_BLOCK',
    'REMINDER',
    'HABIT',
    'HEALTH',
    'OTHER',
  ]),
  timeEstimateMinutes: z.number().int().positive().optional(),
  dueBy: z.string().datetime().optional(),
  relatedEntity: z
    .object({
      type: z.enum(['TASK', 'EVENT', 'COMMITMENT', 'GOAL', 'PROJECT', 'MEETING']),
      id: z.string(),
      title: z.string(),
    })
    .optional(),
  actionable: z.boolean().default(true),
  estimatedImpact: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

export type BriefingItem = z.infer<typeof BriefingItemSchema>;

export const MorningBriefingSchema = z.object({
  date: z.string().datetime(),
  generatedAt: z.string().datetime(),
  timezone: z.string(),
  summary: z.string(),
  items: z.array(BriefingItemSchema),
  schedule: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      type: TimeBlockTypeSchema,
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      location: z.string().optional(),
      confidence: z.number().min(0).max(1),
      isFixed: z.boolean().default(false),
    })
  ),
  risks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      level: RiskLevelSchema,
      affectedEntities: z.array(
        z.object({
          type: z.enum(['TASK', 'EVENT', 'COMMITMENT', 'GOAL']),
          id: z.string(),
          title: z.string(),
        })
      ),
      mitigation: z.string().optional(),
    })
  ),
  preparationRequirements: z.array(
    z.object({
      entityType: z.enum(['EVENT', 'MEETING', 'TASK']),
      entityId: z.string(),
      title: z.string(),
      requirement: z.string(),
      timeEstimateMinutes: z.number().int().positive().optional(),
      dueBy: z.string().datetime().optional(),
    })
  ),
  recommendedFocusBlocks: z.array(
    z.object({
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      durationMinutes: z.number().int().positive(),
      suggestedType: z.enum(['DEEP_WORK', 'SHALLOW_WORK', 'CREATIVE', 'ADMIN', 'LEARNING']),
      reason: z.string(),
      energyLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    })
  ),
  metrics: z.object({
    totalScheduledHours: z.number(),
    focusHours: z.number(),
    meetingHours: z.number(),
    breakHours: z.number(),
    utilizationRate: z.number(),
  }),
});

export type MorningBriefing = z.infer<typeof MorningBriefingSchema>;

export const CurrentActivitySchema = z.object({
  current: z
    .object({
      id: z.string(),
      title: z.string(),
      type: TimeBlockTypeSchema,
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      progressPercent: z.number().min(0).max(100),
      timeRemainingMinutes: z.number().int().positive(),
    })
    .optional(),
  next: z
    .object({
      id: z.string(),
      title: z.string(),
      type: TimeBlockTypeSchema,
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      location: z.string().optional(),
      prepTimeMinutes: z.number().int().nonnegative().default(0),
    })
    .optional(),
  upcomingToday: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      type: TimeBlockTypeSchema,
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
    })
  ),
  contextualReminders: z.array(
    z.object({
      id: z.string(),
      message: z.string(),
      trigger: z.enum(['TIME_BASED', 'LOCATION_BASED', 'ACTIVITY_BASED', 'MANUAL']),
      priority: PrioritySchema,
      dismissible: z.boolean().default(true),
      relatedEntity: z
        .object({
          type: z.enum(['TASK', 'EVENT', 'COMMITMENT', 'GOAL']),
          id: z.string(),
          title: z.string(),
        })
        .optional(),
    })
  ),
  scheduleChanges: z.array(
    z.object({
      id: z.string(),
      changeType: z.enum(['MOVED', 'RESCHEDULED', 'CANCELLED', 'ADDED', 'EXTENDED', 'SHORTENED']),
      entityType: z.enum(['EVENT', 'TASK', 'TIME_BLOCK']),
      entityId: z.string(),
      title: z.string(),
      oldTime: z
        .object({
          start: z.string().datetime(),
          end: z.string().datetime(),
        })
        .optional(),
      newTime: z
        .object({
          start: z.string().datetime(),
          end: z.string().datetime(),
        })
        .optional(),
      reason: z.string().optional(),
      requiresAction: z.boolean().default(false),
    })
  ),
  replanningSuggestions: z.array(
    z.object({
      id: z.string(),
      trigger: z.string(),
      description: z.string(),
      recommendedAction: z.string(),
      impact: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      confidence: z.number().min(0).max(1),
    })
  ),
  focusMode: z
    .object({
      active: z.boolean(),
      type: z.enum(['DEEP_WORK', 'SHALLOW_WORK', 'CREATIVE', 'ADMIN', 'MEETINGS']).optional(),
      endsAt: z.string().datetime().optional(),
      blockedNotifications: z.boolean().default(true),
    })
    .optional(),
});

export type CurrentActivity = z.infer<typeof CurrentActivitySchema>;

export const EveningWrapupSchema = z.object({
  date: z.string().datetime(),
  generatedAt: z.string().datetime(),
  timezone: z.string(),
  summary: z.string(),
  completion: z.object({
    totalScheduledMinutes: z.number(),
    completedMinutes: z.number(),
    completionRate: z.number(),
    focusMinutesCompleted: z.number(),
    meetingMinutesCompleted: z.number(),
    tasksCompleted: z.number(),
    tasksTotal: z.number(),
  }),
  unfinishedWork: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      type: z.enum(['TASK', 'EVENT', 'COMMITMENT', 'GOAL']),
      originalPlan: z.string(),
      actualProgress: z.string(),
      remainingMinutes: z.number().int().positive().optional(),
      recommendedAction: z.enum([
        'RESCHEDULE_TOMORROW',
        'DELEGATE',
        'REDUCE_SCOPE',
        'CANCEL',
        'EXTEND_DEADLINE',
      ]),
      reason: z.string(),
    })
  ),
  commitments: z.array(
    z.object({
      id: z.string(),
      object: z.string(),
      person: z.string().optional(),
      deadline: z.string().datetime(),
      status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE']),
      riskLevel: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      actionTakenToday: z.string().optional(),
    })
  ),
  tomorrowPreview: z.object({
    date: z.string().datetime(),
    totalScheduledHours: z.number(),
    focusHours: z.number(),
    meetingHours: z.number(),
    keyMeetings: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        startTime: z.string().datetime(),
        endTime: z.string().datetime(),
        prepRequired: z.boolean(),
      })
    ),
    topPriorities: z.array(
      z.object({
        title: z.string(),
        type: z.enum(['TASK', 'MEETING_PREP', 'COMMITMENT', 'FOCUS_BLOCK']),
        estimatedMinutes: z.number().int().positive(),
        reason: z.string(),
      })
    ),
    recommendedFirstBlock: z
      .object({
        startTime: z.string().datetime(),
        endTime: z.string().datetime(),
        type: z.enum(['DEEP_WORK', 'SHALLOW_WORK', 'CREATIVE', 'ADMIN']),
        reason: z.string(),
      })
      .optional(),
    risks: z.array(
      z.object({
        title: z.string(),
        level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
        mitigation: z.string(),
      })
    ),
  }),
  scheduleAdjustments: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      reason: z.string(),
      impact: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      requiresConfirmation: z.boolean().default(false),
    })
  ),
  reflection: z
    .object({
      wins: z.array(z.string()).optional(),
      challenges: z.array(z.string()).optional(),
      learnings: z.array(z.string()).optional(),
      mood: z.enum(['EXCELLENT', 'GOOD', 'NEUTRAL', 'CHALLENGING', 'DIFFICULT']).optional(),
    })
    .optional(),
});

export type EveningWrapup = z.infer<typeof EveningWrapupSchema>;

export const DailyExperienceConfigSchema = z.object({
  userId: z.string(),
  morningBriefingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .default('07:00'),
  eveningWrapupTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .default('18:00'),
  enableMorningBriefing: z.boolean().default(true),
  enableDuringDaySupport: z.boolean().default(true),
  enableEveningWrapup: z.boolean().default(true),
  briefingLength: z.enum(['CONCISE', 'STANDARD', 'DETAILED']).default('STANDARD'),
  includeMetrics: z.boolean().default(true),
  includeRisks: z.boolean().default(true),
  includePreparation: z.boolean().default(true),
  includeFocusBlocks: z.boolean().default(true),
  duringDayReminders: z.boolean().default(true),
  focusModeNotifications: z.boolean().default(true),
  scheduleChangeAlerts: z.boolean().default(true),
  replanningAlerts: z.boolean().default(true),
  eveningReflection: z.boolean().default(false),
  adjustmentSuggestions: z.boolean().default(true),
  conciseMode: z.boolean().default(false),
});

export type DailyExperienceConfig = z.infer<typeof DailyExperienceConfigSchema>;

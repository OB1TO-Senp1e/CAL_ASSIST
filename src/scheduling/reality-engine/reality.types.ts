import { z } from 'zod';

export const DeviationTypeSchema = z.enum([
  'TASK_OVERRUN',
  'TASK_UNDERRUN',
  'MEETING_LATE',
  'MEETING_EARLY',
  'TASK_POSTPONED',
  'TASK_CANCELLED',
  'DEADLINE_APPROACHING',
  'DEPENDENCY_INCOMPLETE',
  'UNALLOCATED_WORK',
  'SCHEDULE_DRIFT',
  'FOCUS_TIME_INTERRUPTED',
  'BREAK_SKIPPED',
  'TRAVEL_DELAY',
]);

export type DeviationType = z.infer<typeof DeviationTypeSchema>;

export const DeviationSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export type DeviationSeverity = z.infer<typeof DeviationSeveritySchema>;

export const ImpactLevelSchema = z.enum(['NEGLIGIBLE', 'MINOR', 'MODERATE', 'MAJOR', 'SEVERE']);

export type ImpactLevel = z.infer<typeof ImpactLevelSchema>;

export const RecommendationTypeSchema = z.enum([
  'RESCHEDULE_TASK',
  'ALLOCATE_TIME',
  'ADJUST_DEADLINE',
  'REASSIGN_RESOURCES',
  'SPLIT_TASK',
  'CANCEL_LOW_PRIORITY',
  'REQUEST_EXTENSION',
  'ADD_BUFFER',
  'RESOLVE_CONFLICT',
  'NO_ACTION_NEEDED',
]);

export type RecommendationType = z.infer<typeof RecommendationTypeSchema>;

export const DeviationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: DeviationTypeSchema,
  severity: DeviationSeveritySchema,
  title: z.string(),
  description: z.string(),
  entityType: z.enum(['TASK', 'EVENT', 'GOAL', 'PROJECT', 'COMMITMENT', 'TIME_BLOCK']),
  entityId: z.string(),
  plannedValue: z.number(),
  actualValue: z.number(),
  unit: z.enum(['MINUTES', 'HOURS', 'DAYS', 'COUNT', 'PERCENTAGE']),
  detectedAt: z.string().datetime(),
  acknowledgedAt: z.string().datetime().optional().nullable(),
  resolvedAt: z.string().datetime().optional().nullable(),
  metadata: z.record(z.any()).default({}),
});

export type Deviation = z.infer<typeof DeviationSchema>;

export const ImpactAnalysisSchema = z.object({
  deviationId: z.string(),
  directImpact: z.object({
    affectedEntities: z.array(
      z.object({
        type: z.enum(['TASK', 'EVENT', 'GOAL', 'PROJECT', 'COMMITMENT', 'TIME_BLOCK']),
        id: z.string(),
        title: z.string(),
        impactLevel: ImpactLevelSchema,
        description: z.string(),
      })
    ),
    scheduleConsequences: z.array(
      z.object({
        description: z.string(),
        affectedDate: z.string().datetime(),
        timeShift: z.number(),
        unit: z.enum(['MINUTES', 'HOURS', 'DAYS']),
      })
    ),
    deadlineRisk: z.object({
      hasRisk: z.boolean(),
      affectedDeadlines: z.array(
        z.object({
          entityId: z.string(),
          entityType: z.string(),
          originalDeadline: z.string().datetime(),
          newProjectedCompletion: z.string().datetime().optional(),
          riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
        })
      ),
      summary: z.string(),
    }),
    resourceImpact: z.object({
      overallocatedResources: z.array(z.string()),
      underutilizedResources: z.array(z.string()),
    }),
    cascadingEffects: z.array(
      z.object({
        description: z.string(),
        probability: z.number().min(0).max(1),
        estimatedDelay: z.number(),
        unit: z.enum(['MINUTES', 'HOURS', 'DAYS']),
      })
    ),
  }),
  overallImpactLevel: ImpactLevelSchema,
  confidence: z.number().min(0).max(1),
});

export type ImpactAnalysis = z.infer<typeof ImpactAnalysisSchema>;

export const RecommendationSchema = z.object({
  id: z.string(),
  deviationId: z.string(),
  type: RecommendationTypeSchema,
  title: z.string(),
  description: z.string(),
  whatChanged: z.string(),
  whyItMatters: z.string(),
  options: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string(),
      estimatedEffort: z.number(),
      unit: z.enum(['MINUTES', 'HOURS', 'DAYS']),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
      feasibility: z.number().min(0).max(1),
    })
  ),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  estimatedResolutionTime: z.number(),
  unit: z.enum(['MINUTES', 'HOURS', 'DAYS']),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED']),
  createdAt: z.string().datetime(),
  acceptedAt: z.string().datetime().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

export const RealityCheckResultSchema = z.object({
  timestamp: z.string().datetime(),
  deviations: z.array(DeviationSchema),
  impactAnalyses: z.array(ImpactAnalysisSchema),
  recommendations: z.array(RecommendationSchema),
  summary: z.object({
    totalDeviations: z.number(),
    bySeverity: z.record(z.number()),
    byType: z.record(z.number()),
    criticalCount: z.number(),
    highCount: z.number(),
    actionableRecommendations: z.number(),
  }),
});

export type RealityCheckResult = z.infer<typeof RealityCheckResultSchema>;

export const TaskExecutionAnalysisSchema = z.object({
  taskId: z.string(),
  plannedDuration: z.number(),
  actualDuration: z.number(),
  variance: z.number(),
  variancePercent: z.number(),
  status: z.enum(['ON_TRACK', 'AT_RISK', 'BEHIND', 'CRITICAL']),
  milestones: z.array(
    z.object({
      name: z.string(),
      plannedDate: z.string().datetime(),
      actualDate: z.string().datetime().optional(),
      status: z.enum(['PENDING', 'COMPLETED', 'DELAYED']),
    })
  ),
  dependencies: z.array(
    z.object({
      taskId: z.string(),
      title: z.string(),
      status: z.string(),
      blocksCompletion: z.boolean(),
    })
  ),
  recommendations: z.array(RecommendationSchema),
});

export type TaskExecutionAnalysis = z.infer<typeof TaskExecutionAnalysisSchema>;

export const ProjectHealthSchema = z.object({
  projectId: z.string(),
  overallHealth: z.enum(['HEALTHY', 'AT_RISK', 'CRITICAL', 'OFF_TRACK']),
  scheduleVariance: z.number(),
  budgetVariance: z.number().optional(),
  completionRate: z.number(),
  milestonesOnTrack: z.number(),
  milestonesAtRisk: z.number(),
  upcomingDeadlines: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      deadline: z.string().datetime(),
      daysRemaining: z.number(),
      riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    })
  ),
  deviations: z.array(DeviationSchema),
  recommendations: z.array(RecommendationSchema),
});

export type ProjectHealth = z.infer<typeof ProjectHealthSchema>;

export const ScheduleDriftSchema = z.object({
  date: z.string().datetime(),
  plannedHours: z.number(),
  actualHours: z.number(),
  variance: z.number(),
  variancePercent: z.number(),
  categories: z.record(z.number()),
  topDeviations: z.array(DeviationSchema),
});

export type ScheduleDrift = z.infer<typeof ScheduleDriftSchema>;

export const RealityEngineConfigSchema = z.object({
  taskOverrunThreshold: z.number().default(1.25),
  taskUnderrunThreshold: z.number().default(0.75),
  meetingLateThreshold: z.number().default(5),
  deadlineWarningDays: z.number().default(3),
  maxConsecutivePostpones: z.number().default(3),
  scheduleDriftThreshold: z.number().default(0.15),
  enableAiAnalysis: z.boolean().default(true),
});

export type RealityEngineConfig = z.infer<typeof RealityEngineConfigSchema>;

export const RealityCheckInputSchema = z.object({
  userId: z.string(),
  timeRange: z
    .object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    })
    .optional(),
  entityTypes: z
    .array(z.enum(['TASK', 'EVENT', 'GOAL', 'PROJECT', 'COMMITMENT', 'TIME_BLOCK']))
    .optional(),
  includeResolved: z.boolean().default(false),
  minSeverity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

export type RealityCheckInput = z.infer<typeof RealityCheckInputSchema>;

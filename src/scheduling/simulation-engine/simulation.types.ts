import { z } from 'zod';

// Local type definitions matching time-compiler types exactly
export type TimeBlockType =
  'TASK' | 'FOCUS' | 'MEETING' | 'BREAK' | 'BUFFER' | 'TRAVEL' | 'ROUTINE';

export type ScheduleProposalStatus = 'DRAFT' | 'READY' | 'APPLIED' | 'REJECTED';

export type ConstraintType =
  | 'HARD_DEADLINE'
  | 'FIXED_EVENT'
  | 'AVAILABILITY_WINDOW'
  | 'FOCUS_REQUIRED'
  | 'MAX_HOURS_PER_DAY'
  | 'MIN_BREAK_BETWEEN'
  | 'PREFERRED_TIME'
  | 'ENERGY_MATCH'
  | 'LOCATION_BASED'
  | 'DEPENDENCY'
  | 'TRAVEL_BUFFER';

export type ConstraintSeverity = 'HARD' | 'SOFT' | 'PREFERENCE';

export type TaskFlexibility = 'LOW' | 'MEDIUM' | 'HIGH';
export type EnergyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface AppliedConstraint {
  type: ConstraintType;
  severity: ConstraintSeverity;
  description: string;
  satisfied: boolean;
  impact?: string;
}

export interface ScheduledBlock {
  id: string;
  type: TimeBlockType;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  timezone: string;

  // Source references
  taskId?: string;
  eventId?: string;
  goalId?: string;
  projectId?: string;
  milestoneId?: string;

  // Task properties
  priority?: number;
  flexibility?: TaskFlexibility;
  energyRequirement?: EnergyLevel;
  context?: string;
  location?: string;

  // Metadata
  confidence: number;
  reason: string;
  constraints: AppliedConstraint[];
  isFixed: boolean;
  isProposed: boolean;
}

export interface SchedulingInput {
  userId: string;
  timeRange: TimeRange;
  timezone: string;

  // Tasks to schedule
  tasks: any[];

  // Existing calendar events (fixed)
  fixedEvents: any[];

  // Availability rules
  availability: any[];

  // Constraints
  constraints: any[];

  // Preferences
  preferences: any;

  // Existing time blocks (already scheduled)
  existingBlocks: ScheduledBlock[];
}

// Zod schemas for API validation
export const TimeBlockTypeSchema = z.enum([
  'TASK', 'FOCUS', 'MEETING', 'BREAK', 'BUFFER', 'TRAVEL', 'ROUTINE'
]);

export const TimeRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const AppliedConstraintSchema = z.object({
  type: z.enum([
    'HARD_DEADLINE', 'FIXED_EVENT', 'AVAILABILITY_WINDOW', 'FOCUS_REQUIRED',
    'MAX_HOURS_PER_DAY', 'MIN_BREAK_BETWEEN', 'PREFERRED_TIME', 'ENERGY_MATCH',
    'LOCATION_BASED', 'DEPENDENCY', 'TRAVEL_BUFFER'
  ]),
  severity: z.enum(['HARD', 'SOFT', 'PREFERENCE']),
  description: z.string(),
  satisfied: z.boolean(),
  impact: z.string().optional(),
});

export const ScheduledBlockSchema = z.object({
  id: z.string(),
  type: TimeBlockTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  timezone: z.string(),
  taskId: z.string().optional(),
  eventId: z.string().optional(),
  goalId: z.string().optional(),
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  priority: z.number().optional(),
  flexibility: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  energyRequirement: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  context: z.string().optional(),
  location: z.string().optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  constraints: z.array(AppliedConstraintSchema),
  isFixed: z.boolean(),
  isProposed: z.boolean(),
});

export const SimulationTypeSchema = z.enum([
  'MOVE_EVENT', 'MOVE_TASK', 'ADD_TIME_BLOCK', 'REMOVE_TIME_BLOCK',
  'CHANGE_AVAILABILITY', 'ADD_TASK', 'REMOVE_TASK', 'CHANGE_DEADLINE',
  'ADD_WORK_HOURS', 'REMOVE_WORK_HOURS', 'TAKE_TIME_OFF', 'SHIFT_SCHEDULE',
  'LAUNCH_EARLIER', 'LAUNCH_LATER', 'CUSTOM',
]);

export type SimulationType = z.infer<typeof SimulationTypeSchema>;

export const SimulationChangeSchema = z.object({
  id: z.string(),
  type: SimulationTypeSchema,
  description: z.string(),
  targetEntityType: z.enum(['TASK', 'EVENT', 'TIME_BLOCK', 'AVAILABILITY', 'PREFERENCE']),
  targetEntityId: z.string().optional(),
  parameters: z.record(z.any()),
});

export type SimulationChange = z.infer<typeof SimulationChangeSchema>;

export const SimulationInputSchema = z.object({
  userId: z.string(),
  baseSchedule: z.array(ScheduledBlockSchema),
  timeRange: TimeRangeSchema,
  timezone: z.string(),
  changes: z.array(SimulationChangeSchema),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      estimatedDurationMinutes: z.number().int().positive(),
      priority: z.number().int().min(1).max(10),
      deadline: z.string().datetime().optional(),
      startDate: z.string().datetime().optional(),
      status: z.string(),
      dependencies: z.array(z.string()),
      flexibility: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      energyRequirement: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      context: z.string().optional(),
      preferredTime: z.string().datetime().optional(),
      location: z.string().optional(),
      goalId: z.string().optional(),
      projectId: z.string().optional(),
      milestoneId: z.string().optional(),
    })
  ),
  fixedEvents: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      timezone: z.string(),
      isAllDay: z.boolean(),
      status: z.string(),
      location: z.string().optional(),
      isFixed: z.boolean(),
    })
  ),
  availability: z.array(
    z.object({
      id: z.string(),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      startTime: z.string(),
      endTime: z.string(),
      timezone: z.string(),
      isAvailable: z.boolean(),
      priority: z.number().int().default(0),
      recurrence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM']),
    })
  ),
  constraints: z.array(
    z.object({
      id: z.string(),
      type: z.enum([
        'HARD_DEADLINE', 'FIXED_EVENT', 'AVAILABILITY_WINDOW', 'FOCUS_REQUIRED',
        'MAX_HOURS_PER_DAY', 'MIN_BREAK_BETWEEN', 'PREFERRED_TIME', 'ENERGY_MATCH',
        'LOCATION_BASED', 'DEPENDENCY', 'TRAVEL_BUFFER'
      ]),
      severity: z.enum(['HARD', 'SOFT', 'PREFERENCE']),
      description: z.string(),
      parameters: z.record(z.any()),
      appliesTo: z.array(z.string()).optional(),
    })
  ),
  preferences: z.object({
    workingHoursStart: z.string(),
    workingHoursEnd: z.string(),
    preferredFocusBlockDuration: z.number().int().positive(),
    maxFocusBlockDuration: z.number().int().positive(),
    minBreakDuration: z.number().int().positive(),
    maxDailyHours: z.number().int().positive(),
    preferredBreakInterval: z.number().int().positive(),
    energyPeakHours: z.array(
      z.object({
        start: z.string(),
        end: z.string(),
      })
    ),
    bufferBetweenTasks: z.number().int().nonnegative(),
    travelBufferDefault: z.number().int().nonnegative(),
    protectFocusTime: z.boolean(),
    allowWeekendScheduling: z.boolean(),
    taskOrderingStrategy: z.enum(['PRIORITY', 'DEADLINE', 'DEPENDENCY', 'ENERGY', 'BALANCED']),
  }),
});

export type SimulationInput = z.infer<typeof SimulationInputSchema>;

export const ScheduleDiffSchema = z.object({
  moved: z.array(
    z.object({
      blockId: z.string(),
      title: z.string(),
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
  added: z.array(
    z.object({
      blockId: z.string(),
      title: z.string(),
      type: TimeBlockTypeSchema,
      start: z.string().datetime(),
      end: z.string().datetime(),
      reason: z.string(),
    })
  ),
  removed: z.array(
    z.object({
      blockId: z.string(),
      title: z.string(),
      type: TimeBlockTypeSchema,
      reason: z.string(),
    })
  ),
  rescheduled: z.array(
    z.object({
      blockId: z.string(),
      title: z.string(),
      originalStart: z.string().datetime(),
      originalEnd: z.string().datetime(),
      newStart: z.string().datetime(),
      newEnd: z.string().datetime(),
      reason: z.string(),
    })
  ),
});

export type ScheduleDiff = z.infer<typeof ScheduleDiffSchema>;

export const DeadlineEffectSchema = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  originalDeadline: z.string().datetime(),
  originalProjectedCompletion: z.string().datetime().optional(),
  newProjectedCompletion: z.string().datetime().optional(),
  impact: z.enum(['NONE', 'MINOR', 'MAJOR', 'MISSED']),
  daysShift: z.number(),
  riskLevel: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});

export type DeadlineEffect = z.infer<typeof DeadlineEffectSchema>;

export const ConstraintViolationSchema = z.object({
  constraintId: z.string(),
  constraintType: z.string(),
  description: z.string(),
  severity: z.enum(['WARNING', 'VIOLATION']),
  affectedEntities: z.array(z.string()),
  wasSatisfiedBefore: z.boolean(),
});

export type ConstraintViolation = z.infer<typeof ConstraintViolationSchema>;

export const WorkloadChangesSchema = z.object({
  totalScheduledMinutes: z.number(),
  baseTotalMinutes: z.number(),
  changeMinutes: z.number(),
  focusMinutesChange: z.number(),
  meetingMinutesChange: z.number(),
  breakMinutesChange: z.number(),
  utilizationRateChange: z.number(),
  dailyBreakdown: z.array(
    z.object({
      date: z.string().datetime(),
      baseMinutes: z.number(),
      simulatedMinutes: z.number(),
      changeMinutes: z.number(),
    })
  ),
});

export type WorkloadChanges = z.infer<typeof WorkloadChangesSchema>;

export const DependencyEffectSchema = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  dependencyId: z.string(),
  dependencyTitle: z.string(),
  wasSatisfied: z.boolean(),
  isSatisfied: z.boolean(),
  violationDescription: z.string().optional(),
});

export type DependencyEffect = z.infer<typeof DependencyEffectSchema>;

export const TradeoffSchema = z.object({
  id: z.string(),
  description: z.string(),
  impact: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  affectedArea: z.enum([
    'DEADLINES', 'FOCUS_TIME', 'MEETINGS', 'BREAKS',
    'WORK_LIFE_BALANCE', 'PRIORITIES'
  ]),
  affectedBlocks: z.array(z.string()),
});

export type Tradeoff = z.infer<typeof TradeoffSchema>;

export const ConflictSchema = z.object({
  id: z.string(),
  type: z.enum([
    'OVERLAP', 'DEADLINE_MISS', 'DEPENDENCY_VIOLATION',
    'AVAILABILITY_VIOLATION', 'ENERGY_MISMATCH'
  ]),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO']),
  description: z.string(),
  involvedBlocks: z.array(z.string()),
  suggestedResolution: z.string().optional(),
});

export type Conflict = z.infer<typeof ConflictSchema>;

export const MetricsSchema = z.object({
  confidence: z.number().min(0).max(1),
  feasibilityScore: z.number().min(0).max(1),
  deadlineComplianceRate: z.number().min(0).max(1),
  dependencyComplianceRate: z.number().min(0).max(1),
  utilizationRate: z.number().min(0).max(1),
  scheduleStabilityScore: z.number().min(0).max(1),
});

export type Metrics = z.infer<typeof MetricsSchema>;

export const SimulationResultSchema = z.object({
  simulationId: z.string(),
  userId: z.string(),
  type: z.enum(['SINGLE', 'COMPARISON']),
  baseSchedule: z.array(ScheduledBlockSchema),
  simulatedSchedule: z.array(ScheduledBlockSchema),
  changes: z.array(SimulationChangeSchema),
  scheduleDiff: ScheduleDiffSchema,
  deadlineEffects: z.array(DeadlineEffectSchema),
  constraintViolations: z.array(ConstraintViolationSchema),
  workloadChanges: WorkloadChangesSchema,
  dependencyEffects: z.array(DependencyEffectSchema),
  tradeoffs: z.array(TradeoffSchema),
  conflicts: z.array(ConflictSchema),
  metrics: MetricsSchema,
  summary: z.string(),
  createdAt: z.string().datetime(),
});

export type SimulationResult = z.infer<typeof SimulationResultSchema>;

export const ScenarioSchema = z.object({
  scenarioId: z.string(),
  name: z.string(),
  description: z.string(),
  changes: z.array(SimulationChangeSchema),
  simulatedSchedule: z.array(ScheduledBlockSchema),
  metrics: MetricsSchema,
  deadlineEffects: z.array(DeadlineEffectSchema),
  constraintViolations: z.array(ConstraintViolationSchema),
  tradeoffs: z.array(TradeoffSchema),
  summary: z.string(),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

export const ComparisonResultSchema = z.object({
  comparisonId: z.string(),
  userId: z.string(),
  baseSchedule: z.array(ScheduledBlockSchema),
  scenarios: z.array(ScenarioSchema),
  recommendedScenarioId: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;

export const ApplySimulationInputSchema = z.object({
  simulationId: z.string(),
  userId: z.string(),
  confirm: z.boolean(),
});

export type ApplySimulationInput = z.infer<typeof ApplySimulationInputSchema>;

export const QuickSimulationInputSchema = z.object({
  userId: z.string(),
  question: z.string(),
  context: z.object({
    timeRange: z.object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    }),
    timezone: z.string(),
  }).optional(),
});

export type QuickSimulationInput = z.infer<typeof QuickSimulationInputSchema>;
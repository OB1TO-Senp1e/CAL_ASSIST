import { z } from 'zod';

export const CreateEventInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  allDay: z.boolean().optional(),
  timezone: z.string().optional(),
  recurrence: z.string().optional(),
  status: z.enum(['CONFIRMED', 'TENTATIVE', 'CANCELLED', 'NEEDS_ACTION']).optional(),
  calendarId: z.string().optional(),
  participants: z
    .array(
      z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
        status: z.enum(['NEEDS_ACTION', 'ACCEPTED', 'DECLINED', 'TENTATIVE']).optional(),
        role: z.enum(['REQ_PARTICIPANT', 'OPT_PARTICIPANT', 'CHAIR', 'NON_PARTICIPANT']).optional(),
      })
    )
    .optional(),
  reminders: z
    .array(
      z.object({
        minutesBefore: z.number().int().positive(),
        method: z.enum(['APP', 'EMAIL', 'SMS', 'PUSH']),
      })
    )
    .optional(),
});

export type CreateEventInput = z.infer<typeof CreateEventInputSchema>;

export const CreateEventOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  timezone: z.string(),
  status: z.string(),
});

export type CreateEventOutput = z.infer<typeof CreateEventOutputSchema>;

export const UpdateEventInputSchema = z.object({
  eventId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  timezone: z.string().optional(),
  recurrence: z.string().nullable().optional(),
  status: z.enum(['CONFIRMED', 'TENTATIVE', 'CANCELLED', 'NEEDS_ACTION']).optional(),
  participants: z
    .array(
      z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
        status: z.enum(['NEEDS_ACTION', 'ACCEPTED', 'DECLINED', 'TENTATIVE']),
        role: z.enum(['REQ_PARTICIPANT', 'OPT_PARTICIPANT', 'CHAIR', 'NON_PARTICIPANT']),
      })
    )
    .optional(),
});

export type UpdateEventInput = z.infer<typeof UpdateEventInputSchema>;

export const UpdateEventOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  status: z.string(),
});

export type UpdateEventOutput = z.infer<typeof UpdateEventOutputSchema>;

export const DeleteEventInputSchema = z.object({
  eventId: z.string(),
});

export type DeleteEventInput = z.infer<typeof DeleteEventInputSchema>;

export const DeleteEventOutputSchema = z.object({
  success: z.boolean(),
  eventId: z.string(),
});

export type DeleteEventOutput = z.infer<typeof DeleteEventOutputSchema>;

export const MoveEventInputSchema = z.object({
  eventId: z.string(),
  newStartDate: z.string().datetime(),
  newEndDate: z.string().datetime(),
  timezone: z.string().optional(),
});

export type MoveEventInput = z.infer<typeof MoveEventInputSchema>;

export const MoveEventOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  timezone: z.string(),
});

export type MoveEventOutput = z.infer<typeof MoveEventOutputSchema>;

export const FindAvailabilityInputSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  workingHours: z
    .object({
      start: z.number().int().min(0).max(23),
      end: z.number().int().min(0).max(23),
      days: z.array(z.number().int().min(0).max(6)),
    })
    .optional(),
  bufferMinutes: z.number().int().nonnegative().optional(),
  timezone: z.string().optional(),
});

export type FindAvailabilityInput = z.infer<typeof FindAvailabilityInputSchema>;

export const FindAvailabilityOutputSchema = z.object({
  slots: z.array(
    z.object({
      start: z.string().datetime(),
      end: z.string().datetime(),
      durationMinutes: z.number(),
    })
  ),
  totalAvailableMinutes: z.number(),
});

export type FindAvailabilityOutput = z.infer<typeof FindAvailabilityOutputSchema>;

export const CreateTaskInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  projectId: z.string().optional(),
  goalId: z.string().optional(),
  milestoneId: z.string().optional(),
  priority: z.number().int().min(0).max(10).optional(),
  estimatedDurationMinutes: z.number().int().positive(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  flexibility: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  energyRequirement: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  context: z.string().optional(),
  preferredTime: z.string().datetime().optional(),
  location: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

export const CreateTaskOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  estimatedDurationMinutes: z.number(),
  priority: z.number(),
  status: z.string(),
});

export type CreateTaskOutput = z.infer<typeof CreateTaskOutputSchema>;

export const UpdateTaskInputSchema = z.object({
  taskId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  goalId: z.string().optional(),
  milestoneId: z.string().optional(),
  status: z
    .enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'BLOCKED', 'ON_HOLD'])
    .optional(),
  priority: z.number().int().min(0).max(10).optional(),
  estimatedDurationMinutes: z.number().int().positive().optional(),
  actualDurationMinutes: z.number().int().nonnegative().optional(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  flexibility: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  energyRequirement: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  context: z.string().optional(),
  preferredTime: z.string().datetime().optional(),
  location: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const UpdateTaskOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.number(),
});

export type UpdateTaskOutput = z.infer<typeof UpdateTaskOutputSchema>;

export const CreateGoalInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(10).optional(),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
});

export type CreateGoalInput = z.infer<typeof CreateGoalInputSchema>;

export const CreateGoalOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  priority: z.number(),
  status: z.string(),
});

export type CreateGoalOutput = z.infer<typeof CreateGoalOutputSchema>;

export const CreateProjectInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  goalId: z.string().optional(),
  priority: z.number().int().min(0).max(10).optional(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const CreateProjectOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  goalId: z.string().optional(),
  status: z.string(),
});

export type CreateProjectOutput = z.infer<typeof CreateProjectOutputSchema>;

export const CreateScheduleProposalInputSchema = z.object({
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  timezone: z.string().optional(),
  taskIds: z.array(z.string()).optional(),
  goalId: z.string().optional(),
  projectId: z.string().optional(),
  preferences: z
    .object({
      workingHoursStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      workingHoursEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      preferredFocusBlockDuration: z.number().int().positive(),
      maxFocusBlockDuration: z.number().int().positive(),
      minBreakDuration: z.number().int().positive(),
      maxDailyHours: z.number().int().positive(),
      preferredBreakInterval: z.number().int().positive(),
      energyPeakHours: z.array(
        z.object({
          start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
          end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        })
      ),
      bufferBetweenTasks: z.number().int().nonnegative(),
      travelBufferDefault: z.number().int().nonnegative(),
      protectFocusTime: z.boolean(),
      allowWeekendScheduling: z.boolean(),
      taskOrderingStrategy: z.enum(['PRIORITY', 'DEADLINE', 'DEPENDENCY', 'ENERGY', 'BALANCED']),
    })
    .partial()
    .optional(),
});

export type CreateScheduleProposalInput = z.infer<typeof CreateScheduleProposalInputSchema>;

export const CreateScheduleProposalOutputSchema = z.object({
  proposalId: z.string(),
  status: z.enum(['DRAFT', 'READY', 'APPLIED', 'REJECTED']),
  confidence: z.number().min(0).max(1),
  proposedBlocks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      durationMinutes: z.number(),
      type: z.string(),
      confidence: z.number(),
      reason: z.string(),
    })
  ),
  fixedBlocks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
    })
  ),
  conflicts: z.array(
    z.object({
      type: z.string(),
      severity: z.string(),
      description: z.string(),
    })
  ),
  unsatisfiedConstraints: z.array(
    z.object({
      type: z.string(),
      severity: z.string(),
      description: z.string(),
    })
  ),
  alternatives: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      confidence: z.number(),
    })
  ),
  metrics: z.object({
    totalScheduledMinutes: z.number(),
    utilizationRate: z.number(),
    deadlineComplianceRate: z.number(),
    dependencyComplianceRate: z.number(),
  }),
  reasoning: z.array(z.string()),
});

export type CreateScheduleProposalOutput = z.infer<typeof CreateScheduleProposalOutputSchema>;

export const DetectConflictsInputSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  eventId: z.string().optional(),
  newEvent: z
    .object({
      title: z.string(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
      timezone: z.string(),
      allDay: z.boolean().optional(),
    })
    .optional(),
});

export type DetectConflictsInput = z.infer<typeof DetectConflictsInputSchema>;

export const DetectConflictsOutputSchema = z.object({
  hasConflicts: z.boolean(),
  conflicts: z.array(
    z.object({
      type: z.enum(['OVERLAP', 'CONTAINS', 'ADJACENT', 'RECURRENCE_OVERLAP']),
      severity: z.enum(['CRITICAL', 'WARNING', 'INFO']),
      description: z.string(),
      conflictingEventId: z.string().optional(),
      conflictingEventTitle: z.string().optional(),
    })
  ),
  suggestions: z.array(z.string()),
});

export type DetectConflictsOutput = z.infer<typeof DetectConflictsOutputSchema>;

export const ExplainScheduleInputSchema = z.object({
  proposalId: z.string().optional(),
  date: z.string().datetime().optional(),
  includeAlternatives: z.boolean().optional(),
  includeMetrics: z.boolean().optional(),
});

export type ExplainScheduleInput = z.infer<typeof ExplainScheduleInputSchema>;

export const ExplainScheduleOutputSchema = z.object({
  summary: z.string(),
  schedule: z.array(
    z.object({
      time: z.string(),
      title: z.string(),
      type: z.string(),
      reason: z.string(),
      confidence: z.number(),
    })
  ),
  conflicts: z.array(
    z.object({
      description: z.string(),
      severity: z.string(),
      resolution: z.string(),
    })
  ),
  tradeoffs: z.array(
    z.object({
      description: z.string(),
      impact: z.string(),
      alternative: z.string(),
    })
  ),
  alternatives: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
        confidence: z.number(),
      })
    )
    .optional(),
  metrics: z
    .object({
      utilizationRate: z.number(),
      focusTimeMinutes: z.number(),
      breakTimeMinutes: z.number(),
      deadlineCompliance: z.number(),
    })
    .optional(),
});

export type ExplainScheduleOutput = z.infer<typeof ExplainScheduleOutputSchema>;

export const PlanDayInputSchema = z.object({
  date: z.string().datetime(),
  timezone: z.string().optional(),
  taskIds: z.array(z.string()).optional(),
  goalId: z.string().optional(),
  preferences: z
    .object({
      workingHoursStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      workingHoursEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      preferredFocusBlockDuration: z.number().int().positive(),
      maxFocusBlockDuration: z.number().int().positive(),
      minBreakDuration: z.number().int().positive(),
      maxDailyHours: z.number().int().positive(),
      preferredBreakInterval: z.number().int().positive(),
      energyPeakHours: z.array(
        z.object({
          start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
          end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        })
      ),
      bufferBetweenTasks: z.number().int().nonnegative(),
      travelBufferDefault: z.number().int().nonnegative(),
      protectFocusTime: z.boolean(),
      allowWeekendScheduling: z.boolean(),
      taskOrderingStrategy: z.enum(['PRIORITY', 'DEADLINE', 'DEPENDENCY', 'ENERGY', 'BALANCED']),
    })
    .partial()
    .optional(),
});

export type PlanDayInput = z.infer<typeof PlanDayInputSchema>;

export const PlanDayOutputSchema = z.object({
  date: z.string().datetime(),
  proposalId: z.string(),
  blocks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      durationMinutes: z.number(),
      type: z.string(),
      taskId: z.string().optional(),
      confidence: z.number(),
      reason: z.string(),
    })
  ),
  fixedEvents: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
    })
  ),
  metrics: z.object({
    totalWorkMinutes: z.number(),
    focusMinutes: z.number(),
    breakMinutes: z.number(),
    utilizationRate: z.number(),
  }),
  confidence: z.number(),
  reasoning: z.array(z.string()),
  conflicts: z.array(
    z.object({
      type: z.string(),
      severity: z.string(),
      description: z.string(),
    })
  ),
});

export type PlanDayOutput = z.infer<typeof PlanDayOutputSchema>;

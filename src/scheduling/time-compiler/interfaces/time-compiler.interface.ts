import { z } from 'zod';
import {
  SchedulingInput,
  ScheduleProposal,
  ScheduledBlock,
  SchedulingTask,
  CalendarEvent,
  AvailabilityRule,
  SchedulingConstraint,
  SchedulingPreferences,
  TimeRange,
  TaskFlexibility,
  EnergyLevel,
  TimeBlockType,
  ConstraintType,
  ConstraintSeverity,
  Conflict,
  Tradeoff,
  Alternative,
  UnsatisfiedConstraint,
  AppliedConstraint,
} from '../domain/time-compiler.types';

export const TimeRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const SchedulingTaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  estimatedDurationMinutes: z.number().int().positive(),
  actualDurationMinutes: z.number().int().positive().optional(),
  priority: z.number().int().min(0).max(10),
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
});

export const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  timezone: z.string(),
  isAllDay: z.boolean(),
  status: z.string(),
  location: z.string().optional(),
  isFixed: z.boolean(),
});

export const AvailabilityRuleSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  timezone: z.string(),
  isAvailable: z.boolean(),
  priority: z.number().int(),
  recurrence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM']),
});

export const SchedulingConstraintSchema = z.object({
  id: z.string(),
  type: z.enum([
    'HARD_DEADLINE',
    'FIXED_EVENT',
    'AVAILABILITY_WINDOW',
    'FOCUS_REQUIRED',
    'MAX_HOURS_PER_DAY',
    'MIN_BREAK_BETWEEN',
    'PREFERRED_TIME',
    'ENERGY_MATCH',
    'LOCATION_BASED',
    'DEPENDENCY',
    'TRAVEL_BUFFER',
  ]),
  severity: z.enum(['HARD', 'SOFT', 'PREFERENCE']),
  description: z.string(),
  parameters: z.record(z.any()),
  appliesTo: z.array(z.string()).optional(),
});

export const SchedulingPreferencesSchema = z.object({
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
});

export const SchedulingInputSchema = z.object({
  userId: z.string(),
  timeRange: TimeRangeSchema,
  timezone: z.string(),
  tasks: z.array(SchedulingTaskSchema),
  fixedEvents: z.array(CalendarEventSchema),
  availability: z.array(AvailabilityRuleSchema),
  constraints: z.array(SchedulingConstraintSchema),
  preferences: SchedulingPreferencesSchema,
  existingBlocks: z.array(z.any()), // ScheduledBlock - complex, using any for now
});

export type TimeRangeRequest = z.infer<typeof TimeRangeSchema>;
export type SchedulingTaskRequest = z.infer<typeof SchedulingTaskSchema>;
export type CalendarEventRequest = z.infer<typeof CalendarEventSchema>;
export type AvailabilityRuleRequest = z.infer<typeof AvailabilityRuleSchema>;
export type SchedulingConstraintRequest = z.infer<typeof SchedulingConstraintSchema>;
export type SchedulingPreferencesRequest = z.infer<typeof SchedulingPreferencesSchema>;
export type SchedulingInputRequest = z.infer<typeof SchedulingInputSchema>;

export const CompileScheduleSchema = z.object({
  timeRange: TimeRangeSchema,
  timezone: z.string().default('UTC'),
  taskIds: z.array(z.string()).optional(),
  goalId: z.string().optional(),
  projectId: z.string().optional(),
  preferences: SchedulingPreferencesSchema.partial().optional(),
});

export type CompileScheduleRequest = z.infer<typeof CompileScheduleSchema>;

export interface CompileScheduleResponse {
  proposal: ScheduleProposal;
  applied: boolean;
}

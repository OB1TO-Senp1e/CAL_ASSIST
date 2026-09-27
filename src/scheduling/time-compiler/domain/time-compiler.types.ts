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

export interface AppliedConstraint {
  type: ConstraintType;
  severity: ConstraintSeverity;
  description: string;
  satisfied: boolean;
  impact?: string;
}

export interface UnsatisfiedConstraint {
  type: ConstraintType;
  severity: ConstraintSeverity;
  description: string;
  affectedBlocks: string[];
  suggestedResolution?: string;
}

export interface Conflict {
  id: string;
  type:
    | 'OVERLAP'
    | 'DEADLINE_MISS'
    | 'DEPENDENCY_VIOLATION'
    | 'AVAILABILITY_VIOLATION'
    | 'ENERGY_MISMATCH';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  description: string;
  involvedBlocks: string[];
  suggestedResolution?: string;
}

export interface Tradeoff {
  id: string;
  description: string;
  impact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  affectedBlocks: string[];
  alternative?: string;
}

export interface Alternative {
  id: string;
  name: string;
  description: string;
  blocks: ScheduledBlock[];
  confidence: number;
  pros: string[];
  cons: string[];
  estimatedCompletionRate: number;
}

export interface ScheduleProposal {
  id: string;
  userId: string;
  status: ScheduleProposalStatus;
  timeRange: TimeRange;
  createdAt: Date;
  updatedAt: Date;

  proposedBlocks: ScheduledBlock[];
  fixedBlocks: ScheduledBlock[]; // Existing calendar events that can't be moved

  confidence: number; // 0-1 overall confidence

  constraints: AppliedConstraint[];
  unsatisfiedConstraints: UnsatisfiedConstraint[];
  conflicts: Conflict[];
  tradeoffs: Tradeoff[];
  alternatives: Alternative[];

  metrics: {
    totalScheduledMinutes: number;
    totalTaskMinutes: number;
    focusMinutes: number;
    breakMinutes: number;
    bufferMinutes: number;
    travelMinutes: number;
    utilizationRate: number; // scheduled / available
    deadlineComplianceRate: number; // tasks meeting deadlines / total tasks with deadlines
    dependencyComplianceRate: number;
  };

  reasoning: string[];
}

export interface SchedulingInput {
  userId: string;
  timeRange: TimeRange;
  timezone: string;

  // Tasks to schedule
  tasks: SchedulingTask[];

  // Existing calendar events (fixed)
  fixedEvents: CalendarEvent[];

  // Availability rules
  availability: AvailabilityRule[];

  // Constraints
  constraints: SchedulingConstraint[];

  // Preferences
  preferences: SchedulingPreferences;

  // Existing time blocks (already scheduled)
  existingBlocks: ScheduledBlock[];
}

export interface SchedulingTask {
  id: string;
  title: string;
  description?: string;
  estimatedDurationMinutes: number;
  actualDurationMinutes?: number;
  priority: number;
  deadline?: Date;
  startDate?: Date; // earliest start
  status: string;
  dependencies: string[]; // task IDs that must complete first

  flexibility: TaskFlexibility;
  energyRequirement: EnergyLevel;
  context?: string;
  preferredTime?: Date;
  location?: string;

  goalId?: string;
  projectId?: string;
  milestoneId?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  isAllDay: boolean;
  status: string;
  location?: string;
  isFixed: boolean; // cannot be moved
}

export interface AvailabilityRule {
  id: string;
  dayOfWeek?: number; // 0-6, null = all days
  startDate?: Date;
  endDate?: Date;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  timezone: string;
  isAvailable: boolean;
  priority: number;
  recurrence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
}

export interface SchedulingConstraint {
  id: string;
  type: ConstraintType;
  severity: ConstraintSeverity;
  description: string;
  parameters: Record<string, any>;
  appliesTo?: string[]; // task IDs, empty = all
}

export interface SchedulingPreferences {
  workingHoursStart: string; // HH:mm
  workingHoursEnd: string; // HH:mm
  preferredFocusBlockDuration: number; // minutes
  maxFocusBlockDuration: number;
  minBreakDuration: number;
  maxDailyHours: number;
  preferredBreakInterval: number; // minutes of work before break
  energyPeakHours: { start: string; end: string }[];
  bufferBetweenTasks: number; // minutes
  travelBufferDefault: number; // minutes
  protectFocusTime: boolean;
  allowWeekendScheduling: boolean;
  taskOrderingStrategy: 'PRIORITY' | 'DEADLINE' | 'DEPENDENCY' | 'ENERGY' | 'BALANCED';
}

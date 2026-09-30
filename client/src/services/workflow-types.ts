import type { CalendarDTO, CalendarProvider, CalendarEventDTO } from './types';

export type CommitmentStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
export type CommitmentSource = 'USER_INPUT' | 'AI_INFERRED' | 'EMAIL_EXTRACTED';
export type CommitmentRelatedEntityType = 'TASK' | 'PROJECT' | 'MEETING' | 'GOAL' | 'EVENT';
export type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** The serialized shape returned by CommitmentEngineService.mapToCommitment. */
export interface CommitmentDTO {
  id: string;
  userId: string;
  object: string;
  description?: string;
  deadline: string;
  status: CommitmentStatus;
  source: CommitmentSource;
  /** Who the promise was made to, when it came out of a meeting or email. */
  person?: string;
  personEmail?: string;
  /** Extraction confidence, 0..1; absent for hand-entered commitments. */
  confidence?: number;
  /** Verbatim snippet the commitment was extracted from. */
  context?: string;
  relatedEntityType?: CommitmentRelatedEntityType;
  relatedEntityId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommitmentRiskDTO {
  commitmentId: string;
  riskLevel: RiskLevel;
  riskFactors: Array<'NO_TIME_ALLOCATED' | 'DEADLINE_APPROACHING' | 'OVERDUE' | 'CONFLICTING_COMMITMENT' | 'DEPENDENCY_BLOCKING' | 'LOW_CONFIDENCE' | 'REPEATEDLY_POSTPONED' | 'MISSING_PREPARATION'>;
  details: string;
  recommendation: string;
  suggestedActions: Array<{ type: 'ALLOCATE_TIME' | 'RESCHEDULE' | 'DELEGATE' | 'CANCEL' | 'ESCALATE'; description: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' }>;
  assessedAt: string;
}

export type ScheduleBlockType = 'TASK' | 'FOCUS' | 'MEETING' | 'BREAK' | 'BUFFER' | 'TRAVEL' | 'ROUTINE';
export type ScheduleProposalStatus = 'DRAFT' | 'READY' | 'APPLIED' | 'REJECTED';
export type ConstraintType = 'HARD_DEADLINE' | 'FIXED_EVENT' | 'AVAILABILITY_WINDOW' | 'FOCUS_REQUIRED' | 'MAX_HOURS_PER_DAY' | 'MIN_BREAK_BETWEEN' | 'PREFERRED_TIME' | 'ENERGY_MATCH' | 'LOCATION_BASED' | 'DEPENDENCY' | 'TRAVEL_BUFFER';
export type ConstraintSeverity = 'HARD' | 'SOFT' | 'PREFERENCE';

export interface AppliedConstraintDTO {
  type: ConstraintType;
  severity: ConstraintSeverity;
  description: string;
  satisfied: boolean;
  impact?: string;
}

export interface ScheduledBlockDTO {
  id: string;
  type: ScheduleBlockType;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  timezone: string;
  taskId?: string;
  goalId?: string;
  projectId?: string;
  priority?: number;
  flexibility?: 'LOW' | 'MEDIUM' | 'HIGH';
  energyRequirement?: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  reason: string;
  constraints: AppliedConstraintDTO[];
  isFixed: boolean;
  isProposed: boolean;
}

export interface ScheduleAlternativeDTO {
  id: string;
  name: string;
  description: string;
  blocks: ScheduledBlockDTO[];
  confidence: number;
  pros: string[];
  cons: string[];
  estimatedCompletionRate: number;
}

export interface ScheduleProposalDTO {
  id: string;
  userId: string;
  status: ScheduleProposalStatus;
  timeRange: { start: string; end: string };
  createdAt: string;
  updatedAt: string;
  proposedBlocks: ScheduledBlockDTO[];
  fixedBlocks: ScheduledBlockDTO[];
  confidence: number;
  constraints: AppliedConstraintDTO[];
  unsatisfiedConstraints: Array<{ type: ConstraintType; severity: ConstraintSeverity; description: string; affectedBlocks: string[]; suggestedResolution?: string }>;
  conflicts: Array<{ id: string; type: 'OVERLAP' | 'DEADLINE_MISS' | 'DEPENDENCY_VIOLATION' | 'AVAILABILITY_VIOLATION' | 'ENERGY_MISMATCH'; severity: 'CRITICAL' | 'WARNING' | 'INFO'; description: string; involvedBlocks: string[]; suggestedResolution?: string }>;
  tradeoffs: Array<{ id: string; description: string; impact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; affectedBlocks: string[]; alternative?: string }>;
  alternatives: ScheduleAlternativeDTO[];
  metrics: { totalScheduledMinutes: number; totalTaskMinutes: number; focusMinutes: number; breakMinutes: number; bufferMinutes: number; travelMinutes: number; utilizationRate: number; deadlineComplianceRate: number; dependencyComplianceRate: number };
  reasoning: string[];
}

export interface CompilePreferencesDTO {
  workingHoursStart: string;
  workingHoursEnd: string;
  preferredFocusBlockDuration: number;
  maxFocusBlockDuration: number;
  minBreakDuration: number;
  maxDailyHours: number;
  preferredBreakInterval: number;
  energyPeakHours: Array<{ start: string; end: string }>;
  bufferBetweenTasks: number;
  travelBufferDefault: number;
  protectFocusTime: boolean;
  allowWeekendScheduling: boolean;
  taskOrderingStrategy: 'PRIORITY' | 'DEADLINE' | 'DEPENDENCY' | 'ENERGY' | 'BALANCED';
}

export type DeviationType = 'TASK_OVERRUN' | 'TASK_UNDERRUN' | 'MEETING_LATE' | 'MEETING_EARLY' | 'TASK_POSTPONED' | 'TASK_CANCELLED' | 'DEADLINE_APPROACHING' | 'DEPENDENCY_INCOMPLETE' | 'UNALLOCATED_WORK' | 'SCHEDULE_DRIFT' | 'FOCUS_TIME_INTERRUPTED' | 'BREAK_SKIPPED' | 'TRAVEL_DELAY';
export type DeviationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface DeviationDTO {
  id: string; userId: string; type: DeviationType; severity: DeviationSeverity; title: string; description: string;
  entityType: 'TASK' | 'EVENT' | 'GOAL' | 'PROJECT' | 'COMMITMENT' | 'TIME_BLOCK'; entityId: string;
  plannedValue: number; actualValue: number; unit: 'MINUTES' | 'HOURS' | 'DAYS' | 'COUNT' | 'PERCENTAGE';
  detectedAt: string; acknowledgedAt: string | null; resolvedAt: string | null; metadata: Record<string, unknown>;
}

export interface RealityRecommendationDTO {
  id: string; deviationId: string;
  type: 'RESCHEDULE_TASK' | 'ALLOCATE_TIME' | 'ADJUST_DEADLINE' | 'REASSIGN_RESOURCES' | 'SPLIT_TASK' | 'CANCEL_LOW_PRIORITY' | 'REQUEST_EXTENSION' | 'ADD_BUFFER' | 'RESOLVE_CONFLICT' | 'NO_ACTION_NEEDED';
  title: string; description: string; whatChanged: string; whyItMatters: string;
  options: Array<{ id: string; label: string; description: string; estimatedEffort: number; unit: 'MINUTES' | 'HOURS' | 'DAYS'; pros: string[]; cons: string[]; feasibility: number }>;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; estimatedResolutionTime: number; unit: 'MINUTES' | 'HOURS' | 'DAYS';
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED'; createdAt: string; acceptedAt: string | null; completedAt: string | null;
}

export interface RealityCheckDTO {
  timestamp: string;
  deviations: DeviationDTO[];
  impactAnalyses: Array<{
    deviationId: string;
    directImpact: {
      affectedEntities: Array<{ type: DeviationDTO['entityType']; id: string; title: string; impactLevel: 'NEGLIGIBLE' | 'MINOR' | 'MODERATE' | 'MAJOR' | 'SEVERE'; description: string }>;
      scheduleConsequences: Array<{ description: string; affectedDate: string; timeShift: number; unit: 'MINUTES' | 'HOURS' | 'DAYS' }>;
      deadlineRisk: { hasRisk: boolean; affectedDeadlines: Array<{ entityId: string; entityType: string; originalDeadline: string; newProjectedCompletion?: string; riskLevel: RiskLevel }>; summary: string };
      resourceImpact: { overallocatedResources: string[]; underutilizedResources: string[] };
      cascadingEffects: Array<{ description: string; probability: number; estimatedDelay: number; unit: 'MINUTES' | 'HOURS' | 'DAYS' }>;
    };
    overallImpactLevel: 'NEGLIGIBLE' | 'MINOR' | 'MODERATE' | 'MAJOR' | 'SEVERE'; confidence: number;
  }>;
  recommendations: RealityRecommendationDTO[];
  summary: { totalDeviations: number; bySeverity: Record<string, number>; byType: Record<string, number>; criticalCount: number; highCount: number; actionableRecommendations: number };
}

export type ReplanTrigger = 'TASK_OVERRUN' | 'MEETING_LATE' | 'TASK_POSTPONED' | 'DEADLINE_APPROACHING' | 'DEPENDENCY_INCOMPLETE' | 'SCHEDULE_DRIFT' | 'NEW_TASK' | 'TASK_CANCELLED' | 'MEETING_CANCELLED' | 'MANUAL';
export interface ReplanOptionDTO {
  id: string; label: string; description: string;
  moves: Array<{ entityType: 'TASK' | 'EVENT' | 'COMMITMENT' | 'TIME_BLOCK'; entityId: string; entityTitle: string; from: { start: string; end: string }; to: { start: string; end: string }; reason: string }>;
  unchanged: Array<{ entityType: 'TASK' | 'EVENT' | 'COMMITMENT' | 'TIME_BLOCK'; entityId: string; entityTitle: string; start: string; end: string }>;
  deadlineImpact: Array<{ entityId: string; entityType: 'TASK' | 'COMMITMENT' | 'GOAL' | 'PROJECT'; entityTitle: string; originalDeadline: string; newProjectedCompletion: string; impact: 'NONE' | 'MINOR' | 'MAJOR' | 'MISSED'; daysShift: number }>;
  constraintViolations: Array<{ constraintId: string; constraintType: string; description: string; severity: 'WARNING' | 'VIOLATION'; affectedEntities: string[] }>;
  tradeoffs: Array<{ description: string; impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; affectedArea: 'DEADLINES' | 'FOCUS_TIME' | 'MEETINGS' | 'BREAKS' | 'WORK_LIFE_BALANCE' | 'PRIORITIES' }>;
  confidence: number; estimatedEffortMinutes: number;
}
export interface ReplanOptionsDTO {
  trigger: ReplanTrigger; reason: string; affectedEntities: Array<{ type: 'TASK' | 'EVENT' | 'COMMITMENT' | 'GOAL'; id: string; title: string }>;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH'; options: ReplanOptionDTO[];
  originalSchedule: Array<{ id: string; title: string; type: 'TASK' | 'EVENT' | 'COMMITMENT' | 'TIME_BLOCK'; start: string; end: string; status: string }>;
  recommendedOptionId?: string; requiresUserApproval: boolean; autonomyPolicyApplied: boolean; createdAt: string;
}
export interface ReplanSuggestionDTO {
  type: 'RESCHEDULE_MISSED' | 'RESOLVE_CONFLICTS' | 'REPRIORITIZE_COMMITMENTS';
  title: string;
  description: string;
  action: 'reschedule' | 'resolve_conflicts' | 'reprioritize';
  priority: 'HIGH' | 'MEDIUM';
}

export type MemoryType = 'EXPLICIT_PREFERENCE' | 'EXPLICIT_FACT' | 'USER_RULE' | 'LEARNED_PATTERN' | 'TEMPORARY_CONTEXT';
export type MemorySource = 'USER_INPUT' | 'AI_INFERENCE' | 'SYSTEM_OBSERVATION' | 'EXTERNAL_SYNC' | 'IMPORTED';
export type MemoryStatus = 'ACTIVE' | 'DEPRECATED' | 'CONFLICTING' | 'ARCHIVED' | 'DELETED';
export type MemoryScope = 'GLOBAL' | 'SCHEDULING' | 'TASKS' | 'MEETINGS' | 'FOCUS_TIME' | 'BREAKS' | 'TRAVEL' | 'WORK_HOURS' | 'PERSONAL';

export interface MemoryEntryDTO {
  id: string; userId: string; type: MemoryType; source: MemorySource; scope: MemoryScope; content: string;
  description?: string; confidence: number; status: MemoryStatus; isUserEditable: boolean; isConfirmed: boolean;
  confirmedAt?: string | null; confirmedBy?: string | null; tags: string[]; metadata: Record<string, unknown>;
  createdAt: string; updatedAt: string; expiresAt?: string | null; lastAccessedAt?: string | null; accessCount: number;
}
export interface MemoryConflictDTO {
  id: string; memoryId1: string; memoryId2: string; type: 'CONTRADICTION' | 'DUPLICATE' | 'OUTDATED' | 'SCOPE_OVERLAP';
  description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; detectedAt: string; resolvedAt?: string | null;
  resolution?: 'KEEP_FIRST' | 'KEEP_SECOND' | 'MERGE' | 'DELETE_BOTH' | 'MANUAL';
}

export type RuleType = 'TIME_RESTRICTION' | 'BUFFER_RULE' | 'CONSECUTIVE_LIMIT' | 'PROTECTION_RULE' | 'PREFERENCE_RULE' | 'ENERGY_RULE' | 'TRAVEL_RULE';
export type RuleScope = 'GLOBAL' | 'MEETINGS' | 'TASKS' | 'FOCUS_TIME' | 'BREAKS' | 'WORK_HOURS' | 'PERSONAL' | 'SPECIFIC_ENTITY';
export type RuleTrigger = 'SCHEDULE_EVENT' | 'SCHEDULE_TASK' | 'SCHEDULE_MEETING' | 'CREATE_TIME_BLOCK' | 'MOVE_BLOCK' | 'RESIZE_BLOCK' | 'GENERATE_SCHEDULE';
export type RuleAction = 'BLOCK' | 'WARN' | 'ADJUST' | 'REQUIRE_CONFIRMATION' | 'SUGGEST_ALTERNATIVE' | 'SPLIT' | 'RESCHEDULE';
export interface RuleConditionDTO { field: string; operator: string; value: unknown; value2?: unknown; }
export interface RuleDTO {
  id: string; userId: string; name: string; description?: string; type: RuleType; scope: RuleScope; triggers: RuleTrigger[];
  conditions: RuleConditionDTO[]; action: RuleAction; actionConfig: Record<string, unknown>; priority: number; enabled: boolean;
  isNaturalLanguage: boolean; naturalLanguageText?: string; source: 'USER_CREATED' | 'AI_INFERRED' | 'TEMPLATE' | 'IMPORTED';
  confidence: number; conflictsWith: string[]; createdAt: string; updatedAt: string; lastTriggeredAt?: string | null; triggerCount: number;
}
export interface RuleConflictDTO {
  id: string; ruleId1: string; ruleId2: string; rule1Name: string; rule2Name: string;
  conflictType: 'DIRECT_CONTRADICTION' | 'OVERLAPPING_CONDITIONS' | 'MUTUALLY_EXCLUSIVE_ACTIONS' | 'PRIORITY_AMBIGUITY' | 'SCOPE_OVERLAP';
  description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  suggestedResolution?: 'DISABLE_FIRST' | 'DISABLE_SECOND' | 'ADJUST_PRIORITY' | 'MERGE' | 'MANUAL';
  detectedAt: string; resolvedAt?: string | null; resolution?: 'DISABLE_FIRST' | 'DISABLE_SECOND' | 'ADJUST_PRIORITY' | 'MERGE' | 'MANUAL' | 'KEEP_BOTH';
}
export interface RulePreviewDTO {
  name: string; description: string; type: RuleType; scope: RuleScope; triggers: RuleTrigger[];
  conditions: RuleConditionDTO[]; action: RuleAction; actionConfig: Record<string, unknown>; priority: number;
  confidence: number; originalText: string;
}
export interface RuleParseResultDTO {
  rules: RulePreviewDTO[];
  ambiguous: Array<{ text: string; possibleInterpretations: string[] }>;
  errors: string[];
}

export type InterventionType = 'DEADLINE_AT_RISK' | 'CALENDAR_OVERLOAD' | 'UNSCHEDULED_PRIORITY' | 'CONFLICT_DETECTED' | 'MISSING_PREPARATION' | 'TRAVEL_CONSTRAINT' | 'UNFINISHED_COMMITMENT' | 'GOAL_OFF_TRACK' | 'REPEATED_POSTPONEMENT' | 'NO_TIME_ALLOCATED';
export type InterventionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type InterventionAction = 'ALLOCATE_TIME' | 'RESCHEDULE' | 'DELEGATE' | 'REDUCE_SCOPE' | 'CANCEL_LOW_PRIORITY' | 'REQUEST_EXTENSION' | 'ADD_BUFFER' | 'PREPARE_MATERIALS' | 'PLAN_TRAVEL' | 'REVIEW_PRIORITIES' | 'BREAK_DOWN_TASK' | 'SET_REMINDER' | 'COMMUNICATE_CHANGE' | 'NO_ACTION';
export interface InterventionDTO {
  id: string; userId: string; type: InterventionType; priority: InterventionPriority; title: string; description: string; reason: string;
  affectedEntities: Array<{ type: 'TASK' | 'EVENT' | 'COMMITMENT' | 'GOAL' | 'PROJECT' | 'TIME_BLOCK'; id: string; title: string }>;
  action: InterventionAction; actionDetails: Record<string, unknown>; estimatedEffortMinutes: number; confidence: number;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'DISMISSED' | 'ACTED_UPON' | 'EXPIRED'; createdAt: string; expiresAt?: string | null;
  acknowledgedAt?: string | null; actedUponAt?: string | null; metadata: Record<string, unknown>;
}
export interface ProactivePreferencesDTO {
  userId: string; enabled: boolean; checkIntervalMinutes: number; quietHours?: { start: string; end: string };
  enabledTypes: InterventionType[]; minPriority: InterventionPriority; maxInterventionsPerCheck: number;
  deliveryChannels: Array<'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS'>; groupSimilar: boolean; snoozeDurationMinutes: number;
}

export type AutonomyLevel = 'OBSERVE' | 'SUGGEST' | 'ASK_BEFORE_ACTION' | 'AUTO_EXECUTE_LOW_RISK' | 'DELEGATED_AUTHORITY';
export type PermissionDecision = 'ALLOW' | 'DENY' | 'ASK' | 'CONDITIONAL';
export interface PermissionTemplateDTO { id: string; name: string; description: string; autonomyLevel: AutonomyLevel; }
export interface PermissionPolicyDTO {
  id: string; userId: string; name: string; description?: string; autonomyLevel: AutonomyLevel; enabledScopes: string[];
  allowedActions: string[]; riskThreshold: RiskLevel; requireConfirmationFor: string[];
  protectedEntities: Array<{ type: 'EVENT' | 'TASK' | 'COMMITMENT' | 'GOAL' | 'PROJECT'; id: string; reason: string }>;
  timeRestrictions: Array<{ startTime: string; endTime: string; days: number[] }>;
  maxActionsPerPeriod?: { count: number; periodMinutes: number }; isActive: boolean; priority: number; createdAt: string; updatedAt: string;
}
export interface UserPermissionDTO {
  id: string; userId: string; action: string; scope: string; decision: PermissionDecision; conditions: Record<string, unknown>;
  grantedAt: string; grantedBy?: string; expiresAt?: string | null; isActive: boolean;
}

export interface CalendarConnectionDTO {
  id: string; userId: string; provider: CalendarProvider; externalUserId?: string | null; scopes: string[]; isActive: boolean;
  lastSync?: string | null; syncError?: string | null; tokenExpiresAt?: string | null; createdAt: string; updatedAt: string; calendars: CalendarDTO[];
}
export interface NotificationPreferencesDTO {
  email?: { enabled: boolean; address?: string }; sms?: { enabled: boolean; phoneNumber?: string };
  push?: { enabled: boolean; deviceTokens?: string[] }; app?: { enabled: boolean };
  workingHours?: { enabled: boolean; start: string; end: string; days: number[] }; timezone?: string; muteUntil?: string | null;
}
export interface TravelRequestDTO {
  origin: { latitude?: number; longitude?: number; address?: string; placeId?: string; name?: string };
  destination: { latitude?: number; longitude?: number; address?: string; placeId?: string; name?: string };
  mode: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT' | 'FLIGHT'; departureTime?: string;
  avoidTolls: boolean; avoidHighways: boolean; avoidFerries: boolean;
}
export interface TravelResultDTO {
  durationMinutes: number; durationInTrafficMinutes?: number; distanceMeters?: number; distanceKilometers?: number;
  startAddress?: string; endAddress?: string; provider: string; trafficModel?: 'BEST_GUESS' | 'PESSIMISTIC' | 'OPTIMISTIC'; warnings?: string[];
}
export interface DeadlineDTO {
  id: string; userId: string; title: string; description?: string | null; dueDate: string; goalId?: string | null;
  projectId?: string | null; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'MISSED'; priority: number;
  timezone: string; createdAt: string; updatedAt: string;
}

export type MeetingType = 'STANDARD' | 'ONE_ON_ONE' | 'TEAM_SYNC' | 'CLIENT_MEETING' | 'BOARD' | 'INTERVIEW' | 'RETROSPECTIVE' | 'PLANNING' | 'OTHER';
export interface MeetingChecklistItemDTO { id: string; title: string; description?: string; category: 'MATERIALS' | 'RESEARCH' | 'DECISIONS' | 'UPDATES' | 'FOLLOW_UPS' | 'LOGISTICS' | 'TECHNICAL' | 'OTHER'; priority: 'HIGH' | 'MEDIUM' | 'LOW'; estimatedMinutes?: number; completed: boolean; relatedEntityType?: 'TASK' | 'COMMITMENT' | 'DOCUMENT' | 'CONTACT' | 'NONE'; relatedEntityId?: string; }
export interface MeetingPreparationDTO {
  meetingId: string; checklist: MeetingChecklistItemDTO[];
  previousContext: Array<{ meetingId: string; meetingTitle: string; date: string; summary: string; actionItems?: Array<{ title: string; assignee?: string; status?: string; dueDate?: string }>; decisions?: string[]; keyDiscussions?: string[]; attendees?: string[] }>;
  outstandingCommitments: Array<{ commitmentId: string; object: string; person?: string; deadline: string; status: 'PENDING' | 'IN_PROGRESS' | 'OVERDUE'; riskLevel: RiskLevel; relatedToMeeting: boolean }>;
  relevantTasks: Array<{ taskId: string; title: string; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED'; priority: number; dueDate?: string; estimatedMinutes?: number; projectId?: string; projectName?: string; relatedToMeeting: boolean }>;
  suggestedAgenda: Array<{ id: string; title: string; description?: string; estimatedMinutes: number; type: 'UPDATE' | 'DISCUSSION' | 'DECISION' | 'REVIEW' | 'PLANNING' | 'BRAINSTORM' | 'RETROSPECTIVE' | 'OTHER'; priority: 'HIGH' | 'MEDIUM' | 'LOW'; suggestedOwner?: string; dependsOn?: string[]; relatedEntities?: Array<{ type: 'TASK' | 'COMMITMENT' | 'GOAL' | 'PROJECT' | 'PREVIOUS_MEETING'; id: string; title: string }> }>;
  generatedAt: string; confidence: number; summary: string;
}
export interface MeetingExtractionDTO {
  meetingId: string;
  actionItems: Array<{ id: string; description: string; assignee?: string; assigneeEmail?: string; dueDate?: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; source: 'TRANSCRIPT' | 'NOTES' | 'MANUAL'; confidence: number; context?: string }>;
  commitments: Array<{ id: string; description: string; person?: string; personEmail?: string; deadline?: string; confidence: number; source: 'TRANSCRIPT' | 'NOTES' | 'MANUAL'; context?: string }>;
  deadlines: Array<{ id: string; description: string; date: string; assignee?: string; assigneeEmail?: string; confidence: number; source: 'TRANSCRIPT' | 'NOTES' | 'MANUAL'; context?: string }>;
  followUps: Array<{ id: string; description: string; assignee?: string; assigneeEmail?: string; dueDate?: string; confidence: number; source: 'TRANSCRIPT' | 'NOTES' | 'MANUAL'; context?: string }>;
  summary: string; keyDecisions: string[]; blockers: string[]; risks: string[]; generatedAt: string; confidence: number; requiresConfirmation: string[];
}
export type CalendarEventForMeeting = CalendarEventDTO;
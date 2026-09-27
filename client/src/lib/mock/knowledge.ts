import { mockId } from '@/lib/mock/calendar';
import type { MemoryConflictDTO, MemoryEntryDTO, PermissionPolicyDTO, PermissionTemplateDTO, ProactivePreferencesDTO, InterventionDTO, RuleConflictDTO, RuleDTO, UserPermissionDTO } from '@/services/workflow-types';

const VERSION = 1;
const KEYS = {
  memories: 'calassist-mock-memories', memoryConflicts: 'calassist-mock-memory-conflicts',
  rules: 'calassist-mock-rules', ruleConflicts: 'calassist-mock-rule-conflicts',
  interventions: 'calassist-mock-interventions', preferences: 'calassist-mock-proactive-preferences',
  policies: 'calassist-mock-permission-policies', permissions: 'calassist-mock-permissions',
} as const;

function isoOffset(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString(); }
function read<T>(key: string, seed: () => T): T { try { const raw = localStorage.getItem(key); if (!raw) return seed(); const stored = JSON.parse(raw) as { version: number; data: T }; return stored.version === VERSION ? stored.data : seed(); } catch { return seed(); } }
function write<T>(key: string, data: T) { try { localStorage.setItem(key, JSON.stringify({ version: VERSION, data })); } catch { /* Keep this mock usable without storage. */ } }
const now = new Date().toISOString();

function seedMemories(): MemoryEntryDTO[] {
  return [
    { id: 'memory_focus', userId: 'usr_demo', type: 'EXPLICIT_PREFERENCE', source: 'USER_INPUT', scope: 'FOCUS_TIME', content: 'Keep mornings available for focused work.', description: 'A stated scheduling preference.', confidence: 1, status: 'ACTIVE', isUserEditable: true, isConfirmed: true, confirmedAt: now, confirmedBy: 'usr_demo', tags: ['focus', 'mornings'], metadata: {}, createdAt: isoOffset(-20), updatedAt: now, lastAccessedAt: now, accessCount: 4 },
    { id: 'memory_tz', userId: 'usr_demo', type: 'EXPLICIT_FACT', source: 'USER_INPUT', scope: 'GLOBAL', content: 'My working timezone is America/Los_Angeles.', confidence: 1, status: 'ACTIVE', isUserEditable: true, isConfirmed: true, confirmedAt: isoOffset(-18), confirmedBy: 'usr_demo', tags: ['timezone'], metadata: {}, createdAt: isoOffset(-18), updatedAt: isoOffset(-18), accessCount: 2 },
    { id: 'memory_pattern', userId: 'usr_demo', type: 'LEARNED_PATTERN', source: 'AI_INFERENCE', scope: 'TASKS', content: 'Writing tasks often take longer than their initial estimate.', confidence: 0.72, status: 'ACTIVE', isUserEditable: true, isConfirmed: false, tags: ['estimation'], metadata: {}, createdAt: isoOffset(-5), updatedAt: isoOffset(-5), accessCount: 1 },
    { id: 'memory_friday', userId: 'usr_demo', type: 'USER_RULE', source: 'USER_INPUT', scope: 'WORK_HOURS', content: 'Keep Friday afternoons free of meetings.', confidence: 1, status: 'ACTIVE', isUserEditable: true, isConfirmed: true, confirmedAt: isoOffset(-9), confirmedBy: 'usr_demo', tags: ['meetings', 'friday'], metadata: {}, createdAt: isoOffset(-9), updatedAt: isoOffset(-9), accessCount: 3 },
    { id: 'memory_board', userId: 'usr_demo', type: 'TEMPORARY_CONTEXT', source: 'SYSTEM_OBSERVATION', scope: 'MEETINGS', content: 'Preparing for the quarterly customer review.', confidence: 0.8, status: 'ACTIVE', isUserEditable: false, isConfirmed: false, tags: ['review'], metadata: {}, createdAt: isoOffset(-1), updatedAt: isoOffset(-1), expiresAt: isoOffset(5), accessCount: 0 },
  ];
}
function seedMemoryConflicts(): MemoryConflictDTO[] {
  return [{ id: 'memory_conflict_1', memoryId1: 'memory_focus', memoryId2: 'memory_pattern', type: 'SCOPE_OVERLAP', description: 'A learned pattern may be interpreted as stronger than your stated focus preference.', severity: 'MEDIUM', detectedAt: isoOffset(-1), resolvedAt: null }];
}

function seedRules(): RuleDTO[] {
  return [
    { id: 'rule_morning', userId: 'usr_demo', name: 'Protect morning focus', description: 'Avoid placing meetings in the morning focus window.', type: 'TIME_RESTRICTION', scope: 'MEETINGS', triggers: ['SCHEDULE_MEETING', 'GENERATE_SCHEDULE'], conditions: [{ field: 'startTime', operator: 'BEFORE_TIME', value: '10:00' }], action: 'BLOCK', actionConfig: {}, priority: 90, enabled: true, isNaturalLanguage: true, naturalLanguageText: 'Never schedule meetings before 10 AM.', source: 'USER_CREATED', confidence: 0.96, conflictsWith: [], createdAt: isoOffset(-14), updatedAt: isoOffset(-14), lastTriggeredAt: isoOffset(-1), triggerCount: 8 },
    { id: 'rule_buffer', userId: 'usr_demo', name: 'Leave room between meetings', description: 'Keep a short transition between meetings.', type: 'BUFFER_RULE', scope: 'MEETINGS', triggers: ['SCHEDULE_MEETING'], conditions: [{ field: 'eventType', operator: 'EQUALS', value: 'MEETING' }], action: 'ADJUST', actionConfig: { bufferMinutes: 15 }, priority: 55, enabled: true, isNaturalLanguage: true, naturalLanguageText: 'Leave 15 minutes between meetings.', source: 'USER_CREATED', confidence: 0.9, conflictsWith: ['rule_friday'], createdAt: isoOffset(-10), updatedAt: isoOffset(-4), triggerCount: 5 },
    { id: 'rule_friday', userId: 'usr_demo', name: 'Keep Friday afternoon open', description: 'Protect personal time at the end of the week.', type: 'PROTECTION_RULE', scope: 'GLOBAL', triggers: ['GENERATE_SCHEDULE', 'SCHEDULE_MEETING'], conditions: [{ field: 'dayOfWeek', operator: 'ON_DAY', value: 5 }, { field: 'startTime', operator: 'AFTER_TIME', value: '13:00' }], action: 'BLOCK', actionConfig: {}, priority: 70, enabled: true, isNaturalLanguage: true, naturalLanguageText: 'Keep Friday afternoons free.', source: 'USER_CREATED', confidence: 0.94, conflictsWith: ['rule_buffer'], createdAt: isoOffset(-8), updatedAt: isoOffset(-8), triggerCount: 2 },
  ];
}
function seedRuleConflicts(): RuleConflictDTO[] {
  return [{ id: 'rule_conflict_1', ruleId1: 'rule_buffer', ruleId2: 'rule_friday', rule1Name: 'Leave room between meetings', rule2Name: 'Keep Friday afternoon open', conflictType: 'SCOPE_OVERLAP', description: 'A Friday afternoon meeting could trigger a transition buffer while the day is protected.', severity: 'MEDIUM', suggestedResolution: 'MANUAL', detectedAt: isoOffset(-4), resolvedAt: null }];
}

function seedInterventions(): InterventionDTO[] {
  return [
    { id: 'intervention_deadline', userId: 'usr_demo', type: 'DEADLINE_AT_RISK', priority: 'URGENT', title: 'Launch proposal due tomorrow', description: 'Only 30 of the estimated 90 minutes are allocated.', reason: 'The deadline is within 72 hours and the task has remaining work.', affectedEntities: [{ type: 'TASK', id: 'task_demo', title: 'Prepare launch walkthrough' }], action: 'ALLOCATE_TIME', actionDetails: { minutes: 60 }, estimatedEffortMinutes: 60, confidence: 0.91, status: 'ACTIVE', createdAt: isoOffset(0), expiresAt: isoOffset(2), metadata: {} },
    { id: 'intervention_calendar', userId: 'usr_demo', type: 'CALENDAR_OVERLOAD', priority: 'HIGH', title: 'Tomorrow is meeting-heavy', description: 'Six meetings leave less than two hours for focus work.', reason: 'The schedule exceeds the daily meeting threshold.', affectedEntities: [{ type: 'EVENT', id: 'evt_seed_3', title: 'Roadmap workshop' }], action: 'RESCHEDULE', actionDetails: {}, estimatedEffortMinutes: 15, confidence: 0.83, status: 'ACTIVE', createdAt: isoOffset(0), metadata: {} },
    { id: 'intervention_goal', userId: 'usr_demo', type: 'GOAL_OFF_TRACK', priority: 'MEDIUM', title: 'Release goal needs attention', description: 'Progress is behind the target date.', reason: 'The target date is approaching with work remaining.', affectedEntities: [{ type: 'GOAL', id: 'goal_launch', title: 'Ship the client launch' }], action: 'REVIEW_PRIORITIES', actionDetails: {}, estimatedEffortMinutes: 10, confidence: 0.77, status: 'ACKNOWLEDGED', createdAt: isoOffset(-1), acknowledgedAt: isoOffset(0), metadata: {} },
    { id: 'intervention_travel', userId: 'usr_demo', type: 'TRAVEL_CONSTRAINT', priority: 'LOW', title: 'Allow travel between locations', description: 'Two events have a short gap and different locations.', reason: 'Travel time may exceed the available transition.', affectedEntities: [{ type: 'EVENT', id: 'evt_seed_4', title: 'Client call' }], action: 'PLAN_TRAVEL', actionDetails: {}, estimatedEffortMinutes: 5, confidence: 0.68, status: 'ACTIVE', createdAt: isoOffset(-2), metadata: {} },
  ];
}

const DEFAULT_PROACTIVE_PREFERENCES: ProactivePreferencesDTO = {
  userId: 'usr_demo', enabled: true, checkIntervalMinutes: 60, enabledTypes: [], minPriority: 'MEDIUM',
  maxInterventionsPerCheck: 5, deliveryChannels: ['IN_APP'], groupSimilar: true, snoozeDurationMinutes: 30,
};

const DEFAULT_PERMISSION_POLICY: PermissionPolicyDTO = {
  id: 'policy_advisor', userId: 'usr_demo', name: 'Advisor', description: 'AI suggests actions but requires confirmation for all changes.',
  autonomyLevel: 'SUGGEST', enabledScopes: ['CALENDAR', 'TASKS', 'SCHEDULING'],
  allowedActions: ['CREATE_EVENT', 'MOVE_EVENT', 'CANCEL_EVENT', 'MODIFY_TASKS', 'REPLAN_SCHEDULES'],
  riskThreshold: 'LOW', requireConfirmationFor: ['CREATE_EVENT', 'MOVE_EVENT', 'CANCEL_EVENT', 'MODIFY_TASKS', 'REPLAN_SCHEDULES'],
  protectedEntities: [{ type: 'EVENT', id: 'evt_seed_0', reason: 'Customer review is fixed.' }],
  timeRestrictions: [{ startTime: '22:00', endTime: '07:00', days: [0, 1, 2, 3, 4, 5, 6] }],
  maxActionsPerPeriod: { count: 5, periodMinutes: 60 }, isActive: true, priority: 0, createdAt: isoOffset(-30), updatedAt: now,
};

const TEMPLATES: PermissionTemplateDTO[] = [
  { id: 'template_observe', name: 'Observer', description: 'Read-only access, AI can only observe and report.', autonomyLevel: 'OBSERVE' },
  { id: 'template_suggest', name: 'Advisor', description: 'AI suggests actions but requires confirmation for all changes.', autonomyLevel: 'SUGGEST' },
  { id: 'template_ask', name: 'Collaborator', description: 'AI executes low-risk actions automatically, asks for medium/high risk.', autonomyLevel: 'ASK_BEFORE_ACTION' },
  { id: 'template_auto_low', name: 'Assistant', description: 'AI handles routine scheduling automatically, asks for significant changes.', autonomyLevel: 'AUTO_EXECUTE_LOW_RISK' },
  { id: 'template_delegated', name: 'Delegate', description: 'Full autonomy within defined boundaries.', autonomyLevel: 'DELEGATED_AUTHORITY' },
];

const SEED_PERMISSIONS: UserPermissionDTO[] = [
  { id: 'permission_create_event', userId: 'usr_demo', action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'ASK', conditions: {}, grantedAt: isoOffset(-30), grantedBy: 'TEMPLATE', isActive: true },
  { id: 'permission_update_task', userId: 'usr_demo', action: 'UPDATE_TASK', scope: 'TASKS', decision: 'ASK', conditions: {}, grantedAt: isoOffset(-30), grantedBy: 'TEMPLATE', isActive: true },
  { id: 'permission_send_notice', userId: 'usr_demo', action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'ASK', conditions: {}, grantedAt: isoOffset(-30), grantedBy: 'TEMPLATE', isActive: true },
];

export const knowledgeMock = {
  id: (prefix: string) => mockId(`${prefix}_`), now: () => new Date().toISOString(),
  memories: () => read(KEYS.memories, seedMemories), saveMemories: (value: MemoryEntryDTO[]) => write(KEYS.memories, value),
  memoryConflicts: () => read(KEYS.memoryConflicts, seedMemoryConflicts), saveMemoryConflicts: (value: MemoryConflictDTO[]) => write(KEYS.memoryConflicts, value),
  rules: () => read(KEYS.rules, seedRules), saveRules: (value: RuleDTO[]) => write(KEYS.rules, value),
  ruleConflicts: () => read(KEYS.ruleConflicts, seedRuleConflicts), saveRuleConflicts: (value: RuleConflictDTO[]) => write(KEYS.ruleConflicts, value),
  interventions: () => read(KEYS.interventions, seedInterventions), saveInterventions: (value: InterventionDTO[]) => write(KEYS.interventions, value),
  preferences: () => read(KEYS.preferences, () => DEFAULT_PROACTIVE_PREFERENCES), savePreferences: (value: ProactivePreferencesDTO) => write(KEYS.preferences, value),
  policies: () => read<PermissionPolicyDTO[]>(KEYS.policies, () => [DEFAULT_PERMISSION_POLICY]), savePolicies: (value: PermissionPolicyDTO[]) => write(KEYS.policies, value),
  permissions: () => read(KEYS.permissions, () => SEED_PERMISSIONS), savePermissions: (value: UserPermissionDTO[]) => write(KEYS.permissions, value),
  templates: () => TEMPLATES,
};
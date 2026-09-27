import { latency } from '@/lib/mock/db';
import { knowledgeMock } from '@/lib/mock/knowledge';
import api from './api';
import { USE_MOCK } from './auth';
import type { AutonomyLevel, InterventionDTO, InterventionPriority, MemoryConflictDTO, MemoryEntryDTO, MemoryScope, MemoryStatus, PermissionPolicyDTO, PermissionTemplateDTO, ProactivePreferencesDTO, RuleAction, RuleConflictDTO, RuleDTO, RuleParseResultDTO, RulePreviewDTO, RuleScope, RuleType, UserPermissionDTO } from './workflow-types';

type TemplatePermission = { action: string; scope: string; decision: 'ALLOW' | 'DENY' | 'ASK'; conditions?: Record<string, unknown> };
const TEMPLATE_PERMISSIONS: Record<string, TemplatePermission[]> = {
  template_observe: [
    { action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'DENY' }, { action: 'MOVE_EVENT', scope: 'CALENDAR', decision: 'DENY' },
    { action: 'CANCEL_EVENT', scope: 'CALENDAR', decision: 'DENY' }, { action: 'MODIFY_TASKS', scope: 'TASKS', decision: 'DENY' },
    { action: 'REPLAN_SCHEDULES', scope: 'SCHEDULING', decision: 'DENY' }, { action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'DENY' },
  ],
  template_suggest: [
    { action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'ASK' }, { action: 'MOVE_EVENT', scope: 'CALENDAR', decision: 'ASK' },
    { action: 'CANCEL_EVENT', scope: 'CALENDAR', decision: 'ASK' }, { action: 'MODIFY_TASKS', scope: 'TASKS', decision: 'ASK' },
    { action: 'REPLAN_SCHEDULES', scope: 'SCHEDULING', decision: 'ASK' }, { action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'ASK' },
  ],
  template_ask: [
    { action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'ASK' }, { action: 'MOVE_EVENT', scope: 'CALENDAR', decision: 'ASK' },
    { action: 'CANCEL_EVENT', scope: 'CALENDAR', decision: 'ASK' }, { action: 'MODIFY_TASKS', scope: 'TASKS', decision: 'ALLOW' },
    { action: 'REPLAN_SCHEDULES', scope: 'SCHEDULING', decision: 'ASK' }, { action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'ALLOW' },
  ],
  template_auto_low: [
    { action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'ALLOW', conditions: { maxDurationMinutes: 60 } },
    { action: 'MOVE_EVENT', scope: 'CALENDAR', decision: 'ALLOW', conditions: { maxShiftMinutes: 30 } },
    { action: 'CANCEL_EVENT', scope: 'CALENDAR', decision: 'ASK' }, { action: 'MODIFY_TASKS', scope: 'TASKS', decision: 'ALLOW' },
    { action: 'REPLAN_SCHEDULES', scope: 'SCHEDULING', decision: 'ASK' }, { action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'ALLOW' },
    { action: 'CONTACT_PEOPLE', scope: 'INTEGRATIONS', decision: 'ASK' }, { action: 'NEGOTIATE_MEETING_TIMES', scope: 'CALENDAR', decision: 'ASK' },
  ],
  template_delegated: [
    { action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'ALLOW' }, { action: 'MOVE_EVENT', scope: 'CALENDAR', decision: 'ALLOW' },
    { action: 'CANCEL_EVENT', scope: 'CALENDAR', decision: 'ALLOW' }, { action: 'MODIFY_TASKS', scope: 'TASKS', decision: 'ALLOW' },
    { action: 'REPLAN_SCHEDULES', scope: 'SCHEDULING', decision: 'ALLOW' }, { action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'ALLOW' },
    { action: 'CONTACT_PEOPLE', scope: 'INTEGRATIONS', decision: 'ALLOW' }, { action: 'NEGOTIATE_MEETING_TIMES', scope: 'CALENDAR', decision: 'ALLOW' },
    { action: 'MODIFY_COMMITMENT', scope: 'COMMITMENTS', decision: 'ALLOW' }, { action: 'MODIFY_AUTONOMY_POLICIES', scope: 'RULES', decision: 'ASK' },
  ],
};

function inferRule(text: string): Pick<RuleDTO, 'name' | 'description' | 'type' | 'scope' | 'triggers' | 'conditions' | 'action' | 'actionConfig' | 'priority'> {
  const normalized = text.trim();
  const time = normalized.match(/\b(?:before|after)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  const minute = time?.[2] ?? '00';
  let hour = time ? Number(time[1]) : 0;
  if (time?.[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (time?.[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;
  const operator = normalized.toLowerCase().includes('after') ? 'AFTER_TIME' : 'BEFORE_TIME';
  const type: RuleType = /travel|commute/i.test(normalized) ? 'TRAVEL_RULE' : /buffer|between/i.test(normalized) ? 'BUFFER_RULE' : /friday|keep .* free|protect/i.test(normalized) ? 'PROTECTION_RULE' : time ? 'TIME_RESTRICTION' : 'PREFERENCE_RULE';
  const scope: RuleScope = /meeting/i.test(normalized) ? 'MEETINGS' : /task/i.test(normalized) ? 'TASKS' : 'GLOBAL';
  const action: RuleAction = /never|don't|do not|keep .* free|avoid/i.test(normalized) ? 'BLOCK' : 'WARN';
  const condition = time ? [{ field: 'startTime', operator, value: `${String(hour).padStart(2, '0')}:${minute}` }] : [{ field: 'title', operator: 'CONTAINS', value: normalized }];
  const buffer = normalized.match(/(\d+)\s*(?:min|minute)/i);
  return {
    name: normalized.length > 80 ? `${normalized.slice(0, 77)}…` : normalized,
    description: `Interpreted from: “${normalized}”`, type, scope,
    triggers: ['SCHEDULE_EVENT', 'SCHEDULE_TASK', 'GENERATE_SCHEDULE'], conditions: condition,
    action, actionConfig: type === 'BUFFER_RULE' ? { bufferMinutes: Number(buffer?.[1] ?? 15) } : {}, priority: 50,
  };
}

export const knowledgeService = {
  async listMemories(): Promise<MemoryEntryDTO[]> {
    if (!USE_MOCK) return (await api.get<{ memories: MemoryEntryDTO[] }>('/api/memory/search')).data.memories;
    await latency(); return knowledgeMock.memories().filter((row) => row.status !== 'DELETED').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async listMemoryConflicts(): Promise<MemoryConflictDTO[]> {
    if (!USE_MOCK) return (await api.get<MemoryConflictDTO[]>('/api/memory/conflicts')).data;
    await latency(80, 180); return knowledgeMock.memoryConflicts().filter((row) => !row.resolvedAt);
  },
  async createMemory(input: { type: MemoryEntryDTO['type']; source: MemoryEntryDTO['source']; scope: MemoryScope; content: string; description?: string; confidence: number; isUserEditable: boolean; tags: string[] }): Promise<MemoryEntryDTO> {
    if (!USE_MOCK) return (await api.post<{ success: boolean; memory: MemoryEntryDTO }>('/api/memory', { ...input, metadata: {} })).data.memory;
    await latency(); const time = knowledgeMock.now();
    const row: MemoryEntryDTO = { id: knowledgeMock.id('memory'), userId: 'usr_demo', ...input, status: 'ACTIVE', isConfirmed: input.source === 'USER_INPUT', confirmedAt: input.source === 'USER_INPUT' ? time : null, confirmedBy: input.source === 'USER_INPUT' ? 'usr_demo' : null, metadata: {}, createdAt: time, updatedAt: time, accessCount: 0 };
    knowledgeMock.saveMemories([row, ...knowledgeMock.memories()]); return row;
  },
  async updateMemory(id: string, patch: Partial<Pick<MemoryEntryDTO, 'content' | 'description' | 'confidence' | 'scope' | 'status' | 'isConfirmed' | 'tags'>>): Promise<void> {
    if (!USE_MOCK) { await api.put(`/api/memory/${id}`, patch); return; }
    await latency(); const rows = knowledgeMock.memories(); const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new Error('Memory not found');
    rows[index] = { ...rows[index], ...patch, confirmedAt: patch.isConfirmed ? knowledgeMock.now() : rows[index].confirmedAt, updatedAt: knowledgeMock.now() };
    knowledgeMock.saveMemories(rows);
  },
  async deleteMemory(id: string): Promise<void> {
    if (!USE_MOCK) { await api.delete(`/api/memory/${id}`); return; }
    await latency(); knowledgeMock.saveMemories(knowledgeMock.memories().map((row) => row.id === id ? { ...row, status: 'DELETED', updatedAt: knowledgeMock.now() } : row));
  },
  async resolveMemoryConflict(id: string, resolution: NonNullable<MemoryConflictDTO['resolution']>): Promise<void> {
    if (!USE_MOCK) { await api.put(`/api/memory/conflicts/${id}/resolve`, { resolution }); return; }
    const conflicts = knowledgeMock.memoryConflicts(); knowledgeMock.saveMemoryConflicts(conflicts.map((row) => row.id === id ? { ...row, resolution, resolvedAt: knowledgeMock.now() } : row));
    if (resolution === 'KEEP_FIRST' || resolution === 'KEEP_SECOND') {
      const memories = knowledgeMock.memories(); const losingId = conflicts.find((row) => row.id === id)?.[resolution === 'KEEP_FIRST' ? 'memoryId2' : 'memoryId1'];
      knowledgeMock.saveMemories(memories.map((row) => row.id === losingId ? { ...row, status: 'DEPRECATED', updatedAt: knowledgeMock.now() } : row));
    }
  },
  async listRules(): Promise<RuleDTO[]> {
    if (!USE_MOCK) return (await api.get<RuleDTO[]>('/api/rules')).data;
    await latency(); return knowledgeMock.rules().sort((a, b) => b.priority - a.priority);
  },
  async listRuleConflicts(): Promise<RuleConflictDTO[]> {
    if (!USE_MOCK) return (await api.get<RuleConflictDTO[]>('/api/rules/conflicts')).data;
    await latency(80, 180); return knowledgeMock.ruleConflicts().filter((row) => !row.resolvedAt);
  },
  async createRuleFromNaturalLanguage(text: string): Promise<RuleDTO> {
    if (!USE_MOCK) return (await api.post<RuleDTO>('/api/rules/from-natural-language', { text })).data;
    await latency(320, 520); if (!text.trim()) throw new Error('Enter a scheduling rule first.');
    const time = knowledgeMock.now(); const inferred = inferRule(text);
    const row: RuleDTO = { id: knowledgeMock.id('rule'), userId: 'usr_demo', ...inferred, enabled: true, isNaturalLanguage: true, naturalLanguageText: text, source: 'USER_CREATED', confidence: /\b(?:before|after|friday|buffer)\b/i.test(text) ? 0.88 : 0.62, conflictsWith: [], createdAt: time, updatedAt: time, lastTriggeredAt: null, triggerCount: 0 };
    knowledgeMock.saveRules([row, ...knowledgeMock.rules()]); return row;
  },
  async previewRule(text: string): Promise<RulePreviewDTO> {
    if (!USE_MOCK) {
      const { data } = await api.post<RuleParseResultDTO>('/api/rules/parse', { text });
      if (!data.rules.length) throw new Error(data.errors[0] ?? data.ambiguous[0]?.possibleInterpretations.join(' / ') ?? 'The rule could not be interpreted.');
      return data.rules[0];
    }
    await latency(240, 420); if (!text.trim()) throw new Error('Enter a scheduling rule first.');
    const time = knowledgeMock.now(); const inferred = inferRule(text);
    return { ...inferred, description: inferred.description ?? '', confidence: /\b(?:before|after|friday|buffer)\b/i.test(text) ? 0.88 : 0.62, originalText: text };
  },
  async savePreviewRule(preview: RulePreviewDTO): Promise<RuleDTO> {
    if (!USE_MOCK) return (await api.post<RuleDTO>('/api/rules/from-natural-language', { text: preview.originalText })).data;
    await latency(120, 220); const time = knowledgeMock.now();
    const row: RuleDTO = { id: knowledgeMock.id('rule'), userId: 'usr_demo', ...preview, enabled: true, isNaturalLanguage: true, naturalLanguageText: preview.originalText, source: 'USER_CREATED', conflictsWith: [], createdAt: time, updatedAt: time, lastTriggeredAt: null, triggerCount: 0 };
    knowledgeMock.saveRules([row, ...knowledgeMock.rules()]); return row;
  },
  async toggleRule(id: string, enabled: boolean): Promise<void> {
    if (!USE_MOCK) { await api.put(`/api/rules/${id}`, { enabled }); return; }
    knowledgeMock.saveRules(knowledgeMock.rules().map((row) => row.id === id ? { ...row, enabled, updatedAt: knowledgeMock.now() } : row));
  },
  async deleteRule(id: string): Promise<void> {
    if (!USE_MOCK) { await api.delete(`/api/rules/${id}`); return; }
    await latency(); knowledgeMock.saveRules(knowledgeMock.rules().filter((row) => row.id !== id));
  },
  async resolveRuleConflict(id: string, resolution: NonNullable<RuleConflictDTO['resolution']>): Promise<void> {
    if (!USE_MOCK) { await api.put(`/api/rules/conflicts/${id}/resolve`, { resolution }); return; }
    const conflicts = knowledgeMock.ruleConflicts(); knowledgeMock.saveRuleConflicts(conflicts.map((row) => row.id === id ? { ...row, resolution, resolvedAt: knowledgeMock.now() } : row));
    if (resolution === 'DISABLE_FIRST' || resolution === 'DISABLE_SECOND') {
      const conflict = conflicts.find((row) => row.id === id); const disabledId = resolution === 'DISABLE_FIRST' ? conflict?.ruleId1 : conflict?.ruleId2;
      knowledgeMock.saveRules(knowledgeMock.rules().map((row) => row.id === disabledId ? { ...row, enabled: false, updatedAt: knowledgeMock.now() } : row));
    }
  },
  async listInterventions(): Promise<InterventionDTO[]> {
    if (!USE_MOCK) return (await api.get<InterventionDTO[]>('/api/proactive/interventions')).data;
    await latency(); return knowledgeMock.interventions().filter((row) => row.status === 'ACTIVE' || row.status === 'ACKNOWLEDGED');
  },
  async runProactiveCheck(): Promise<InterventionDTO[]> {
    if (!USE_MOCK) return (await api.get<{ interventions: InterventionDTO[] }>('/api/proactive/check')).data.interventions;
    await latency(300, 520); return knowledgeMock.interventions().filter((row) => row.status === 'ACTIVE' || row.status === 'ACKNOWLEDGED');
  },
  async updateProactivePreferences(patch: Partial<ProactivePreferencesDTO>): Promise<ProactivePreferencesDTO> {
    if (!USE_MOCK) throw new Error('Proactive preferences are not exposed by the current API.');
    const next = { ...knowledgeMock.preferences(), ...patch }; knowledgeMock.savePreferences(next); return next;
  },
  async proactivePreferences(): Promise<ProactivePreferencesDTO | null> {
    if (!USE_MOCK) return null;
    await latency(80, 180); return knowledgeMock.preferences();
  },
  async acknowledgeIntervention(id: string): Promise<void> {
    if (!USE_MOCK) throw new Error('Proactive acknowledgement is not implemented by the current API (501).');
    knowledgeMock.saveInterventions(knowledgeMock.interventions().map((row) => row.id === id ? { ...row, status: 'ACKNOWLEDGED', acknowledgedAt: knowledgeMock.now() } : row));
  },
  async dismissIntervention(id: string): Promise<void> {
    if (!USE_MOCK) throw new Error('Proactive dismissal is not implemented by the current API (501).');
    knowledgeMock.saveInterventions(knowledgeMock.interventions().map((row) => row.id === id ? { ...row, status: 'DISMISSED' } : row));
  },
  async snoozeIntervention(id: string, minutes: number): Promise<void> {
    if (!USE_MOCK) throw new Error('Proactive snooze is not implemented by the current API (501).');
    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    knowledgeMock.saveInterventions(knowledgeMock.interventions().map((row) => row.id === id ? { ...row, status: 'ACTIVE', expiresAt: until, metadata: { ...row.metadata, snoozedUntil: until } } : row));
  },
  async templates(): Promise<PermissionTemplateDTO[]> {
    if (!USE_MOCK) return (await api.get<PermissionTemplateDTO[]>('/api/permissions/templates')).data;
    await latency(80, 160); return knowledgeMock.templates();
  },
  async permissions(): Promise<UserPermissionDTO[]> {
    if (!USE_MOCK) return (await api.get<UserPermissionDTO[]>('/api/permissions/permissions')).data;
    await latency(100, 220); return knowledgeMock.permissions().filter((row) => row.isActive);
  },
  async policies(): Promise<PermissionPolicyDTO[]> {
    if (!USE_MOCK) return (await api.get<PermissionPolicyDTO[]>('/api/permissions/autonomy-policies')).data;
    await latency(100, 220); return knowledgeMock.policies();
  },
  async updatePolicy(id: string, patch: Partial<Omit<PermissionPolicyDTO, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<PermissionPolicyDTO> {
    if (!USE_MOCK) return (await api.put<PermissionPolicyDTO>(`/api/permissions/autonomy-policies/${id}`, patch)).data;
    const policies = knowledgeMock.policies(); const index = policies.findIndex((row) => row.id === id);
    if (index < 0) throw new Error('Autonomy policy not found');
    policies[index] = { ...policies[index], ...patch, updatedAt: knowledgeMock.now() };
    knowledgeMock.savePolicies(policies); return policies[index];
  },
  async applyTemplate(templateId: string): Promise<void> {
    if (!USE_MOCK) { await api.post('/api/permissions/apply-template', { templateId }); return; }
    await latency(260, 420);
    const template = knowledgeMock.templates().find((item) => item.id === templateId); if (!template) throw new Error('Permission template not found');
    const actions = TEMPLATE_PERMISSIONS[templateId] ?? [];
    const riskThreshold: PermissionPolicyDTO['riskThreshold'] = template.autonomyLevel === 'OBSERVE' ? 'NONE' : template.autonomyLevel === 'DELEGATED_AUTHORITY' ? 'MEDIUM' : 'LOW';
    const time = knowledgeMock.now();
    const policy: PermissionPolicyDTO = {
      id: knowledgeMock.id('policy'), userId: 'usr_demo', name: template.name, description: template.description,
      autonomyLevel: template.autonomyLevel as AutonomyLevel,
      enabledScopes: [...new Set(actions.map((item) => item.scope))], allowedActions: actions.map((item) => item.action), riskThreshold,
      requireConfirmationFor: actions.filter((item) => item.decision === 'ASK').map((item) => item.action), protectedEntities: [], timeRestrictions: [],
      isActive: true, priority: 0, createdAt: time, updatedAt: time,
    };
    const policies = knowledgeMock.policies().map((item) => ({ ...item, isActive: false }));
    knowledgeMock.savePolicies([policy, ...policies]);
    const explicit: UserPermissionDTO[] = actions.filter((item) => item.decision !== 'ASK').map((item) => ({ id: knowledgeMock.id('permission'), userId: 'usr_demo', action: item.action, scope: item.scope, decision: item.decision, conditions: item.conditions ?? {}, grantedAt: time, grantedBy: 'TEMPLATE', isActive: true }));
    knowledgeMock.savePermissions([...knowledgeMock.permissions().map((item) => ({ ...item, isActive: false })), ...explicit]);
    return;
  },
  priorityLabel: (priority: InterventionPriority) => priority[0] + priority.slice(1).toLowerCase(),
};
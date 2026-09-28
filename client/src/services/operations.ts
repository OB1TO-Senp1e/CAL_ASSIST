import { latency } from '@/lib/mock/db';
import { operationsMock } from '@/lib/mock/operations';
import api from './api';
import { USE_MOCK } from './auth';
import type { TaskDTO } from './types';
import type { CommitmentDTO, CommitmentRelatedEntityType, CommitmentRiskDTO, CommitmentSource, CommitmentStatus, CompilePreferencesDTO, RealityCheckDTO, ReplanOptionsDTO, ReplanSuggestionDTO, ScheduleBlockType, ScheduleProposalDTO, ScheduledBlockDTO } from './workflow-types';

function assess(commitment: CommitmentDTO): CommitmentRiskDTO {
  const hours = (new Date(commitment.deadline).getTime() - Date.now()) / 3_600_000;
  const riskFactors: CommitmentRiskDTO['riskFactors'] = [];
  let riskLevel: CommitmentRiskDTO['riskLevel'] = 'NONE';
  if (commitment.status !== 'COMPLETED' && commitment.status !== 'CANCELLED') {
    if (hours < 0) { riskFactors.push('OVERDUE'); riskLevel = 'CRITICAL'; }
    else if (hours <= 24) { riskFactors.push('DEADLINE_APPROACHING'); riskLevel = 'HIGH'; }
    else if (hours <= 72) { riskFactors.push('DEADLINE_APPROACHING'); riskLevel = 'MEDIUM'; }
  }
  // The backend flags this from the stored extraction `confidence`; the mock
  // has no extractor, so it falls back to the old source heuristic.
  const lowConfidence =
    commitment.confidence !== undefined
      ? commitment.confidence < 0.5
      : commitment.source === 'AI_INFERRED' && commitment.status === 'PENDING';
  if (lowConfidence) {
    riskFactors.push('LOW_CONFIDENCE');
    if (riskLevel === 'NONE') riskLevel = 'LOW';
  }
  return {
    commitmentId: commitment.id, riskLevel, riskFactors,
    details: riskFactors.length ? riskFactors.map((factor) => factor.replace(/_/g, ' ').toLowerCase()).join(' · ') : 'No current deadline risk.',
    recommendation: riskLevel === 'CRITICAL' ? 'Review the overdue commitment and choose a next step.' : riskLevel === 'HIGH' || riskLevel === 'MEDIUM' ? 'Protect time before the deadline.' : 'No action needed right now.',
    suggestedActions: riskLevel === 'NONE' ? [] : [{ type: riskLevel === 'CRITICAL' ? 'ESCALATE' : 'ALLOCATE_TIME', description: 'Reserve time to complete this commitment.', priority: riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 'HIGH' : 'MEDIUM' }],
    assessedAt: operationsMock.now(),
  };
}

function formatClock(date: Date): string { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }

export const operationsService = {
  async listCommitments(): Promise<CommitmentDTO[]> {
    if (!USE_MOCK) {
      const { data } = await api.get<CommitmentDTO[]>('/api/commitments');
      return data.sort((a, b) => a.deadline.localeCompare(b.deadline));
    }
    await latency(); return operationsMock.commitments().sort((a, b) => a.deadline.localeCompare(b.deadline));
  },
  async commitmentRisks(): Promise<CommitmentRiskDTO[]> {
    if (!USE_MOCK) return (await api.get<CommitmentRiskDTO[]>('/api/commitments/risks')).data;
    await latency(100, 240); return operationsMock.commitments().map(assess);
  },
  async createCommitment(input: { object: string; description?: string; deadline: string; source: CommitmentSource; person?: string; personEmail?: string; confidence?: number; context?: string; relatedEntityType?: CommitmentRelatedEntityType; relatedEntityId?: string }): Promise<CommitmentDTO> {
    if (!USE_MOCK) return (await api.post<CommitmentDTO>('/api/commitments', input)).data;
    await latency();
    const now = operationsMock.now();
    const row: CommitmentDTO = { id: operationsMock.id('commitment'), userId: 'usr_demo', ...input, status: 'PENDING', createdAt: now, updatedAt: now };
    operationsMock.saveCommitments([row, ...operationsMock.commitments()]);
    return row;
  },
  async updateCommitment(id: string, input: { object?: string; description?: string; deadline?: string; status?: CommitmentStatus; person?: string }): Promise<CommitmentDTO> {
    if (!USE_MOCK) return (await api.put<CommitmentDTO>(`/api/commitments/${id}`, input)).data;
    await latency();
    const rows = operationsMock.commitments(); const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new Error('Commitment not found');
    rows[index] = { ...rows[index], ...input, updatedAt: operationsMock.now() };
    operationsMock.saveCommitments(rows); return rows[index];
  },
  async deleteCommitment(id: string): Promise<void> {
    if (!USE_MOCK) { await api.delete(`/api/commitments/${id}`); return; }
    await latency(); operationsMock.saveCommitments(operationsMock.commitments().filter((row) => row.id !== id));
  },
  async listProposals(): Promise<ScheduleProposalDTO[]> {
    if (!USE_MOCK) return (await api.get<ScheduleProposalDTO[]>('/api/time-compiler/proposals')).data;
    await latency(120, 260); return operationsMock.proposals();
  },
  async compile(tasks: TaskDTO[], options: { start: string; end: string; timezone: string; preferences: CompilePreferencesDTO }): Promise<ScheduleProposalDTO> {
    if (!USE_MOCK) {
      const start = new Date(`${options.start}T${options.preferences.workingHoursStart}:00`).toISOString();
      const end = new Date(`${options.end}T${options.preferences.workingHoursEnd}:00`).toISOString();
      const { data } = await api.post<{ proposal: ScheduleProposalDTO; applied: boolean }>('/api/time-compiler/compile', {
        timeRange: { start, end }, timezone: options.timezone, taskIds: tasks.map((task) => task.id), preferences: options.preferences,
      });
      return data.proposal;
    }
    await latency(360, 620);
    const start = new Date(`${options.start}T${options.preferences.workingHoursStart}:00`);
    const end = new Date(`${options.end}T${options.preferences.workingHoursEnd}:00`);
    const ordered = [...tasks].sort((a, b) => options.preferences.taskOrderingStrategy === 'DEADLINE'
      ? (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') : b.priority - a.priority);
    let cursor = new Date(start);
    const blocks: ScheduledBlockDTO[] = [];
    for (const task of ordered) {
      if (cursor >= end) break;
      const duration = task.estimatedDurationMin ?? options.preferences.preferredFocusBlockDuration;
      if (blocks.length && blocks.reduce((sum, block) => sum + block.durationMinutes, 0) % options.preferences.preferredBreakInterval === 0) {
        cursor = new Date(cursor.getTime() + options.preferences.minBreakDuration * 60_000);
      }
      const blockEnd = new Date(Math.min(cursor.getTime() + duration * 60_000, end.getTime()));
      const scheduledDuration = Math.max(0, Math.round((blockEnd.getTime() - cursor.getTime()) / 60_000));
      if (!scheduledDuration) break;
      const blockType: ScheduleBlockType = 'TASK';
      blocks.push({ id: operationsMock.id('block'), type: blockType, title: task.title, description: task.description ?? undefined,
        startTime: cursor.toISOString(), endTime: blockEnd.toISOString(), durationMinutes: scheduledDuration, timezone: options.timezone,
        taskId: task.id, goalId: task.goalId ?? undefined, projectId: task.projectId ?? undefined, priority: task.priority,
        flexibility: task.flexibility, energyRequirement: task.energyRequirement, confidence: 0.86,
        reason: `Priority ${task.priority}/10 · ${task.estimatedDurationMin ?? duration} minute estimate`, constraints: [], isFixed: false, isProposed: true });
      cursor = new Date(blockEnd.getTime() + options.preferences.bufferBetweenTasks * 60_000);
    }
    const scheduled = blocks.reduce((sum, block) => sum + block.durationMinutes, 0);
    const now = operationsMock.now();
    const makeAlternative = (id: string, name: string, altBlocks: ScheduledBlockDTO[], pros: string[], cons: string[]) => ({ id, name, description: name === 'Deadline first' ? 'Put the closest due work first.' : 'Protect longer focus blocks and reduce context switches.', blocks: altBlocks, confidence: 0.78, pros, cons, estimatedCompletionRate: tasks.length ? Math.round(altBlocks.length / tasks.length * 100) : 0 });
    const proposal: ScheduleProposalDTO = {
      id: operationsMock.id('proposal'), userId: 'usr_demo', status: 'READY', timeRange: { start: start.toISOString(), end: end.toISOString() }, createdAt: now, updatedAt: now,
      proposedBlocks: blocks, fixedBlocks: [], confidence: 0.86, constraints: [], unsatisfiedConstraints: blocks.length < tasks.length ? [{ type: 'AVAILABILITY_WINDOW', severity: 'SOFT', description: 'Some selected tasks do not fit in the chosen working window.', affectedBlocks: tasks.slice(blocks.length).map((task) => task.id), suggestedResolution: 'Extend the time range or select fewer tasks.' }] : [], conflicts: [], tradeoffs: [],
      alternatives: [makeAlternative('alt_deadline', 'Deadline first', [...blocks].reverse(), ['Closest deadlines get first attention.'], ['Higher-priority work may start later.']), makeAlternative('alt_focus', 'Focus blocks', blocks.filter((block) => block.durationMinutes >= 60), ['Fewer context switches.'], ['Some shorter tasks may be left unscheduled.'])],
      metrics: { totalScheduledMinutes: scheduled, totalTaskMinutes: scheduled, focusMinutes: scheduled, breakMinutes: 0, bufferMinutes: Math.max(0, blocks.length - 1) * options.preferences.bufferBetweenTasks, travelMinutes: 0, utilizationRate: Math.min(1, scheduled / Math.max(1, (end.getTime() - start.getTime()) / 60_000)), deadlineComplianceRate: 1, dependencyComplianceRate: 1 },
      reasoning: ['Tasks were ordered using the selected strategy.', 'Blocks respect the working-hours window and configured buffer.'],
    };
    operationsMock.saveProposals([proposal, ...operationsMock.proposals()]);
    return proposal;
  },
  async setProposalStatus(id: string, status: 'APPLIED' | 'REJECTED'): Promise<void> {
    if (!USE_MOCK) { await api.patch(`/api/time-compiler/proposals/${encodeURIComponent(id)}/status`, { status }); return; }
    const proposals = operationsMock.proposals();
    operationsMock.saveProposals(proposals.map((proposal) => proposal.id === id ? { ...proposal, status, updatedAt: operationsMock.now() } : proposal));
  },
  /** PATCH /api/time-compiler/proposals/:id/apply — really writes TimeBlocks. */
  async applyProposal(id: string): Promise<ScheduleProposalDTO> {
    if (!USE_MOCK) return (await api.patch<ScheduleProposalDTO>(`/api/time-compiler/proposals/${encodeURIComponent(id)}/apply`)).data;
    const proposals = operationsMock.proposals();
    const applied = proposals.map((proposal) => proposal.id === id ? { ...proposal, status: 'APPLIED' as const, updatedAt: operationsMock.now() } : proposal);
    operationsMock.saveProposals(applied);
    return applied.find((proposal) => proposal.id === id)!;
  },
  async realityCheck(): Promise<RealityCheckDTO> {
    if (!USE_MOCK) return (await api.get<RealityCheckDTO>('/api/reality/check')).data;
    await latency(260, 440); const result = operationsMock.reality(); result.timestamp = operationsMock.now(); operationsMock.saveReality(result); return result;
  },
  async updateDeviation(id: string, action: 'acknowledge' | 'resolve'): Promise<void> {
    if (!USE_MOCK) {
      await api.post(`/api/reality/deviations/${encodeURIComponent(id)}/${action}`, action === 'resolve' ? { resolution: 'Resolved from the assistant panel' } : {});
      return;
    }
    const result = operationsMock.reality();
    result.deviations = result.deviations.map((deviation) => deviation.id === id ? { ...deviation, acknowledgedAt: operationsMock.now(), resolvedAt: action === 'resolve' ? operationsMock.now() : deviation.resolvedAt } : deviation);
    operationsMock.saveReality(result);
  },
  async updateRecommendation(id: string, status: 'ACCEPTED' | 'REJECTED'): Promise<void> {
    if (!USE_MOCK) { await api.post(`/api/reality/recommendations/${encodeURIComponent(id)}/status`, { status }); return; }
    const result = operationsMock.reality();
    result.recommendations = result.recommendations.map((recommendation) => recommendation.id === id ? { ...recommendation, status, acceptedAt: status === 'ACCEPTED' ? operationsMock.now() : null } : recommendation);
    operationsMock.saveReality(result);
  },
  async generateReplan(reason: string, entity: { id: string; title: string; type: 'TASK' | 'EVENT' | 'COMMITMENT' | 'GOAL' }, trigger: ReplanOptionsDTO['trigger'] = 'MANUAL'): Promise<ReplanOptionsDTO> {
    if (!USE_MOCK) {
      const { data } = await api.post<ReplanOptionsDTO>('/api/replanning/options', { trigger, reason, affectedEntities: [entity], urgency: 'MEDIUM' });
      return data;
    }
    await latency(350, 600);
    const now = new Date(); const later = new Date(now.getTime() + 60 * 60_000); const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
    const item = { entityType: entity.type === 'GOAL' ? 'TASK' as const : entity.type, entityId: entity.id, entityTitle: entity.title };
    const scheduleOption = (id: string, label: string, shiftMinutes: number, confidence: number): ReplanOptionsDTO['options'][number] => ({
      id, label, description: shiftMinutes === 0 ? 'Keep the current structure and add a focused block.' : `Shift flexible work by ${shiftMinutes} minutes.`,
      moves: [{ ...item, from: { start: now.toISOString(), end: later.toISOString() }, to: { start: new Date(now.getTime() + shiftMinutes * 60_000).toISOString(), end: new Date(later.getTime() + shiftMinutes * 60_000).toISOString() }, reason }],
      unchanged: [], deadlineImpact: [], constraintViolations: [],
      tradeoffs: [{ description: 'Protects the highest-priority work.', impact: 'POSITIVE', affectedArea: 'PRIORITIES' }, { description: shiftMinutes ? 'Later work shifts slightly.' : 'Less room remains for flexible work.', impact: 'NEGATIVE', affectedArea: 'WORK_LIFE_BALANCE' }],
      confidence, estimatedEffortMinutes: Math.abs(shiftMinutes) + 15,
    });
    const result: ReplanOptionsDTO = {
      trigger, reason, affectedEntities: [entity], urgency: 'MEDIUM',
      options: [scheduleOption('option_a', 'Protect the deadline', 0, 0.91), scheduleOption('option_b', 'Cascade flexible work', 45, 0.78), scheduleOption('option_c', 'Reduce scope', 0, 0.69)],
      originalSchedule: [{ id: entity.id, title: entity.title, type: 'TASK', start: now.toISOString(), end: later.toISOString(), status: 'IN_PROGRESS' }],
      recommendedOptionId: 'option_a', requiresUserApproval: true, autonomyPolicyApplied: false, createdAt: operationsMock.now(),
    };
    operationsMock.saveReplans([result, ...operationsMock.replans()]);
    return result;
  },
  async replanOptions(): Promise<ReplanSuggestionDTO[]> {
    if (!USE_MOCK) return (await api.get<ReplanSuggestionDTO[]>('/api/replanning/suggestions', { params: { reason: 'General review' } })).data;
    await latency(100, 220);
    return operationsMock.replans().map((item) => ({
      type: 'RESOLVE_CONFLICTS',
      title: `Review ${item.reason}`,
      description: item.reason,
      action: 'resolve_conflicts',
      priority: item.urgency === 'HIGH' ? 'HIGH' : 'MEDIUM',
    }));
  },
  async executeReplan(options: ReplanOptionsDTO, selectedOptionId: string): Promise<void> {
    if (!USE_MOCK) {
      const { data } = await api.post<{ success: boolean; warnings: string[] }>('/api/replanning/execute', { replanOptions: options, selectedOptionId });
      if (!data.success) throw new Error(data.warnings.join(' ') || 'The re-plan could not be applied.');
      return;
    }
    await latency(260, 420);
  },
  clock: (value: string) => formatClock(new Date(value)),
};
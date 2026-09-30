import { mockId } from '@/lib/mock/calendar';
import type { CommitmentDTO, CommitmentRiskDTO, RealityCheckDTO, ReplanOptionsDTO, ScheduleProposalDTO } from '@/services/workflow-types';

const VERSION = 1;
const COMMITMENTS_KEY = 'calassist-mock-commitments';
const PROPOSALS_KEY = 'calassist-mock-proposals';
const REALITY_KEY = 'calassist-mock-reality';
const REPLANS_KEY = 'calassist-mock-replans';

function isoOffset(days: number, hour = 17): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function read<T>(key: string, seed: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return seed();
    const stored = JSON.parse(raw) as { version: number; data: T };
    return stored.version === VERSION ? stored.data : seed();
  } catch { return seed(); }
}

function write<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify({ version: VERSION, data })); } catch { /* mock remains in memory for this operation */ }
}

const createdAt = new Date().toISOString();

function seedCommitments(): CommitmentDTO[] {
  return [
    { id: 'commitment_proposal', userId: 'usr_demo', object: 'Send the launch proposal', description: 'Share the final proposal with the customer team.', deadline: isoOffset(1), status: 'IN_PROGRESS', source: 'USER_INPUT', createdAt, updatedAt: createdAt },
    { id: 'commitment_review', userId: 'usr_demo', object: 'Review the contract draft', description: 'Return comments before the weekly review.', deadline: isoOffset(3), status: 'PENDING', source: 'EMAIL_EXTRACTED', createdAt, updatedAt: createdAt },
    { id: 'commitment_notes', userId: 'usr_demo', object: 'Share interview notes', description: 'Send the summary to the research group.', deadline: isoOffset(-1), status: 'OVERDUE', source: 'AI_INFERRED', createdAt, updatedAt: createdAt },
    { id: 'commitment_done', userId: 'usr_demo', object: 'Confirm the demo agenda', deadline: isoOffset(-2), status: 'COMPLETED', source: 'USER_INPUT', createdAt, updatedAt: createdAt },
  ];
}

function seedReality(): RealityCheckDTO {
  const now = new Date().toISOString();
  const deviations: RealityCheckDTO['deviations'] = [
    { id: 'dev_overrun', userId: 'usr_demo', type: 'TASK_OVERRUN', severity: 'HIGH', title: 'API error states ran long', description: 'The task used 110 minutes against a 60 minute estimate.', entityType: 'TASK', entityId: 'task_api', plannedValue: 60, actualValue: 110, unit: 'MINUTES', detectedAt: now, acknowledgedAt: null, resolvedAt: null, metadata: {} },
    { id: 'dev_deadline', userId: 'usr_demo', type: 'DEADLINE_APPROACHING', severity: 'MEDIUM', title: 'Launch proposal deadline is close', description: 'A high-priority task is due tomorrow and has no scheduled block.', entityType: 'TASK', entityId: 'task_demo', plannedValue: 3, actualValue: 1, unit: 'DAYS', detectedAt: now, acknowledgedAt: null, resolvedAt: null, metadata: {} },
    { id: 'dev_drift', userId: 'usr_demo', type: 'SCHEDULE_DRIFT', severity: 'LOW', title: 'Two focus blocks were missed', description: 'The planned focus time was interrupted twice this week.', entityType: 'TIME_BLOCK', entityId: 'block_focus', plannedValue: 5, actualValue: 3, unit: 'COUNT', detectedAt: now, acknowledgedAt: null, resolvedAt: null, metadata: {} },
  ];
  const recommendations: RealityCheckDTO['recommendations'] = [
    { id: 'rec_api', deviationId: 'dev_overrun', type: 'RESCHEDULE_TASK', title: 'Protect another block for API work', description: 'Move the lower-priority inbox task and finish the remaining validation.', whatChanged: 'API work took 50 minutes longer than expected.', whyItMatters: 'The launch review depends on these error states being complete.', options: [
      { id: 'rec_api_tomorrow', label: 'Schedule tomorrow morning', description: 'Reserve one 60-minute focus block.', estimatedEffort: 60, unit: 'MINUTES', pros: ['Protects the launch review'], cons: ['Moves other flexible work'], feasibility: 0.9 },
      { id: 'rec_api_split', label: 'Split into two blocks', description: 'Finish validation in two shorter sessions.', estimatedEffort: 30, unit: 'MINUTES', pros: ['Smaller focus blocks'], cons: ['More context switching'], feasibility: 0.74 },
    ], priority: 'HIGH', estimatedResolutionTime: 60, unit: 'MINUTES', status: 'PENDING', createdAt: now, acceptedAt: null, completedAt: null },
    { id: 'rec_deadline', deviationId: 'dev_deadline', type: 'ALLOCATE_TIME', title: 'Allocate time to the launch walkthrough', description: 'Make room for the walkthrough before its due date.', whatChanged: 'The walkthrough has no scheduled time.', whyItMatters: 'Without a focus block, the customer review may slip.', options: [{ id: 'rec_demo_focus', label: 'Reserve a focus block', description: 'Use the next open 75-minute block.', estimatedEffort: 75, unit: 'MINUTES', pros: ['Keeps the due date'], cons: ['Uses focus capacity'], feasibility: 0.82 }], priority: 'MEDIUM', estimatedResolutionTime: 75, unit: 'MINUTES', status: 'PENDING', createdAt: now, acceptedAt: null, completedAt: null },
  ];
  return {
    timestamp: now, deviations, impactAnalyses: deviations.map((deviation) => ({
      deviationId: deviation.id,
      directImpact: {
        affectedEntities: [{ type: deviation.entityType, id: deviation.entityId, title: deviation.title, impactLevel: deviation.severity === 'HIGH' ? 'MAJOR' : 'MODERATE', description: deviation.description }],
        scheduleConsequences: [{ description: 'A flexible focus block may need to move.', affectedDate: isoOffset(1, 9), timeShift: 60, unit: 'MINUTES' }],
        deadlineRisk: { hasRisk: deviation.type === 'DEADLINE_APPROACHING', affectedDeadlines: [], summary: deviation.type === 'DEADLINE_APPROACHING' ? 'One task deadline needs attention.' : 'No deadline shift is currently projected.' },
        resourceImpact: { overallocatedResources: [], underutilizedResources: [] },
        cascadingEffects: [{ description: 'Downstream review may move if no time is allocated.', probability: 0.42, estimatedDelay: 1, unit: 'DAYS' }],
      }, overallImpactLevel: deviation.severity === 'HIGH' ? 'MAJOR' : 'MINOR', confidence: 0.87,
    })),
    recommendations,
    summary: { totalDeviations: deviations.length, bySeverity: { HIGH: 1, MEDIUM: 1, LOW: 1 }, byType: { TASK_OVERRUN: 1, DEADLINE_APPROACHING: 1, SCHEDULE_DRIFT: 1 }, criticalCount: 0, highCount: 1, actionableRecommendations: recommendations.length },
  };
}

export const operationsMock = {
  id: (prefix: string) => mockId(`${prefix}_`),
  now: () => new Date().toISOString(),
  commitments: () => read(COMMITMENTS_KEY, seedCommitments),
  saveCommitments: (rows: CommitmentDTO[]) => write(COMMITMENTS_KEY, rows),
  proposals: () => read<ScheduleProposalDTO[]>(PROPOSALS_KEY, () => []),
  saveProposals: (rows: ScheduleProposalDTO[]) => write(PROPOSALS_KEY, rows),
  reality: () => read(REALITY_KEY, seedReality),
  saveReality: (value: RealityCheckDTO) => write(REALITY_KEY, value),
  replans: () => read<ReplanOptionsDTO[]>(REPLANS_KEY, () => []),
  saveReplans: (rows: ReplanOptionsDTO[]) => write(REPLANS_KEY, rows),
};
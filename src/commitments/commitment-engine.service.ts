import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  NotImplementedException,
} from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { AiProviderService } from '../integrations/ai-providers/ai-provider.service';
import { RealityEngineService } from '../scheduling/reality-engine/reality-engine.service';
import { SchedulingEngineService } from '../scheduling/scheduling-engine/scheduling-engine.service';
import {
  Commitment,
  CommitmentSource,
  CommitmentStatus,
  CreateCommitmentInput,
  UpdateCommitmentInput,
  CommitmentRisk,
  SearchCommitmentsInput,
  CommitmentStats,
  ExtractCommitmentsInput,
  ExtractResult,
  ExtractedCommitment,
} from './commitment.types';

@Injectable()
export class CommitmentEngineService {
  private readonly logger = new Logger(CommitmentEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly realityEngine: RealityEngineService,
    private readonly schedulingEngine: SchedulingEngineService,
  ) {}

  async createCommitment(userId: string, input: CreateCommitmentInput): Promise<Commitment> {
    const commitment = await this.prisma.commitment.create({
      data: {
        userId,
        title: input.object,
        description: input.description,
        deadline: new Date(input.deadline),
        status: 'PENDING',
        source: this.toPrismaSource(input.source),
      },
    });

    await this.assessRisk(userId, commitment.id);

    return this.mapToCommitment(commitment);
  }

  async getCommitment(userId: string, commitmentId: string): Promise<Commitment> {
    const commitment = await this.prisma.commitment.findFirst({
      where: { id: commitmentId, userId },
    });

    if (!commitment) {
      throw new NotFoundException(`Commitment ${commitmentId} not found`);
    }

    return this.mapToCommitment(commitment);
  }

  async updateCommitment(userId: string, input: UpdateCommitmentInput): Promise<Commitment> {
    const { id, ...updates } = input;

    const existing = await this.prisma.commitment.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException(`Commitment ${id} not found`);
    }

    const updated = await this.prisma.commitment.update({
      where: { id },
      data: {
        title: updates.object ?? existing.title,
        description: updates.description ?? existing.description,
        deadline: updates.deadline ? new Date(updates.deadline) : existing.deadline,
        status: updates.status ? this.toPrismaStatus(updates.status) : existing.status,
      },
    });

    if (updates.deadline || updates.status) {
      await this.assessRisk(userId, id);
    }

    return this.mapToCommitment(updated);
  }

  async deleteCommitment(userId: string, commitmentId: string): Promise<void> {
    const commitment = await this.prisma.commitment.findFirst({
      where: { id: commitmentId, userId },
    });

    if (!commitment) {
      throw new NotFoundException(`Commitment ${commitmentId} not found`);
    }

    await this.prisma.commitment.delete({ where: { id: commitmentId } });
  }

  async searchCommitments(userId: string, input: SearchCommitmentsInput): Promise<Commitment[]> {
    const where: any = { userId };

    if (input.statuses?.length) where.status = { in: input.statuses.map((s) => this.toPrismaStatus(s)) };
    if (input.sources?.length) where.source = { in: input.sources.map((s) => this.toPrismaSource(s)) };
    if (input.dateFrom || input.dateTo) {
      where.deadline = {};
      if (input.dateFrom) where.deadline.gte = new Date(input.dateFrom);
      if (input.dateTo) where.deadline.lte = new Date(input.dateTo);
    }

    const commitments = await this.prisma.commitment.findMany({
      where,
      orderBy: { deadline: 'asc' },
      skip: input.offset,
      take: input.limit,
    });

    const results = await Promise.all(commitments.map(async (commitment) => ({
      commitment: this.mapToCommitment(commitment),
      risk: input.hasRisk ? await this.assessRisk(userId, commitment.id) : undefined,
    })));
    return results
      .filter(({ risk }) => !input.hasRisk || (risk && risk.riskLevel !== 'NONE'))
      .map(({ commitment }) => commitment);
  }

  async getCommitmentStats(userId: string): Promise<CommitmentStats> {
    const commitments = await this.prisma.commitment.findMany({ where: { userId } });
    const risks = await Promise.all(
      commitments.map((commitment) => this.assessRisk(userId, commitment.id))
    );

    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let totalConfidence = 0;

    for (const c of commitments) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      bySource[c.source] = (bySource[c.source] || 0) + 1;
    }

    const overdue = commitments.filter(c => c.status === 'OVERDUE' || (c.deadline < new Date() && c.status !== 'COMPLETED' && c.status !== 'CANCELLED'));
    const pending = commitments.filter(c => c.status === 'PENDING' || c.status === 'IN_PROGRESS');
    const highRisk = risks.filter((r) => ['HIGH', 'CRITICAL'].includes(r.riskLevel));

    const pendingSorted = [...pending].sort((a, b) => a.deadline.getTime() - b.deadline.getTime());

    return {
      total: commitments.length,
      byStatus,
      bySource,
      overdueCount: overdue.length,
      pendingCount: pending.length,
      highRiskCount: highRisk.length,
      oldestPending: pendingSorted[0]?.deadline.toISOString() || null,
    };
  }

  async getCommitmentRisk(userId: string, commitmentId: string): Promise<CommitmentRisk> {
    return this.assessRisk(userId, commitmentId);
  }

  async assessAllRisks(userId: string): Promise<CommitmentRisk[]> {
    const commitments = await this.prisma.commitment.findMany({
      where: { userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    });

    const risks: CommitmentRisk[] = [];
    for (const c of commitments) {
      const risk = await this.assessRisk(userId, c.id);
      risks.push(risk);
    }

    return risks;
  }

  async extractCommitments(userId: string, input: ExtractCommitmentsInput): Promise<ExtractResult> {
    const prompt = `
Extract commitments from this text:

Text: "${input.text}"

Context: ${JSON.stringify(input.context || {})}
Source: ${input.source}

Identify commitments in the format: "Person will do Object by Deadline" or "I will do Object by Deadline"

Return JSON:
{
  "commitments": [{
    "person": "string or null",
    "object": "string",
    "description": "string or null",
    "deadline": "ISO datetime string",
    "confidence": 0.0-1.0,
    "suggestedTaskId": "string or null",
    "suggestedProjectId": "string or null",
    "metadata": {}
  }],
  "ambiguous": [{"text": "string", "possibleInterpretations": ["string"]}],
  "errors": ["string"]
}

Rules:
- Never invent commitments not present in text
- Parse relative dates (tomorrow, Sunday, Friday, next week) to ISO datetime
- If no specific time, assume end of day
- Confidence < 0.5 for vague/inferred commitments
- Use current date as reference: ${new Date().toISOString()}
`;

    try {
      const response = await this.aiProvider.generateStructured(prompt, {
        temperature: 0.2,
        maxTokens: 3000,
      });

      const extracted = response as ExtractResult;

      for (const ec of extracted.commitments) {
        const existing = await this.prisma.commitment.findFirst({
          where: {
            userId,
            title: ec.object,
            deadline: new Date(ec.deadline),
            source: this.toPrismaSource(input.source),
          },
        });

        if (!existing) {
          const createdCommitment = await this.createCommitment(userId, {
            object: ec.object,
            description: ec.description,
            deadline: ec.deadline,
            source: input.source,
          });
        }
      }

      return extracted;
    } catch (error) {
      this.logger.error(`Commitment extraction failed: ${error}`);
      return {
        commitments: [],
        ambiguous: [],
        errors: [String(error)],
      };
    }
  }

  async getCommitmentRisks(userId: string): Promise<CommitmentRisk[]> {
    const commitments = await this.prisma.commitment.findMany({
      where: { userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      orderBy: { deadline: 'asc' },
    });
    return Promise.all(commitments.map((commitment) => this.assessRisk(userId, commitment.id)));
  }

  private async assessRisk(userId: string, commitmentId: string): Promise<CommitmentRisk> {
    const commitment = await this.prisma.commitment.findFirst({
      where: { id: commitmentId, userId },
    });

    if (!commitment) {
      throw new NotFoundException(`Commitment ${commitmentId} not found`);
    }

    const riskFactors: CommitmentRisk['riskFactors'] = [];
    let riskLevel: CommitmentRisk['riskLevel'] = 'NONE';
    const details: string[] = [];
    const suggestedActions: CommitmentRisk['suggestedActions'] = [];

    const now = new Date();
    const deadline = new Date(commitment.deadline);
    const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    const daysUntilDeadline = hoursUntilDeadline / 24;

    if (deadline < now && commitment.status !== 'COMPLETED' && commitment.status !== 'CANCELLED') {
      riskFactors.push('OVERDUE');
      riskLevel = 'CRITICAL';
      details.push('Commitment is overdue');
      suggestedActions.push({ type: 'ESCALATE', description: 'Immediate action required', priority: 'HIGH' });
    } else if (hoursUntilDeadline <= 24) {
      riskFactors.push('DEADLINE_APPROACHING');
      riskLevel = this.maxRisk(riskLevel, 'HIGH');
      details.push(`Deadline in ${hoursUntilDeadline.toFixed(1)} hours`);
      suggestedActions.push({ type: 'ALLOCATE_TIME', description: 'Allocate time today', priority: 'HIGH' });
    } else if (hoursUntilDeadline <= 72) {
      riskFactors.push('DEADLINE_APPROACHING');
      riskLevel = this.maxRisk(riskLevel, 'MEDIUM');
      details.push(`Deadline in ${daysUntilDeadline.toFixed(1)} days`);
      suggestedActions.push({ type: 'ALLOCATE_TIME', description: 'Schedule time this week', priority: 'MEDIUM' });
    }

    const timeBlocks = await this.prisma.timeBlock.findMany({
      where: {
        userId,
        OR: [
          { commitmentId },
          { relatedCommitmentId: commitmentId },
        ],
      },
    });

    const allocatedMinutes = timeBlocks.reduce((sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 60000, 0);

    if (allocatedMinutes === 0) {
      riskFactors.push('NO_TIME_ALLOCATED');
      riskLevel = this.maxRisk(riskLevel, 'HIGH');
      details.push('No time allocated for this commitment');
      suggestedActions.push({ type: 'ALLOCATE_TIME', description: 'Schedule dedicated time block', priority: 'HIGH' });
    }

    const otherCommitments = await this.prisma.commitment.findMany({
      where: {
        userId,
        id: { not: commitmentId },
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        deadline: { lte: deadline },
      },
    });

    if (otherCommitments.length > 3) {
      riskFactors.push('CONFLICTING_COMMITMENT');
      riskLevel = this.maxRisk(riskLevel, 'MEDIUM');
      details.push(`${otherCommitments.length} other commitments before same deadline`);
      suggestedActions.push({ type: 'RESCHEDULE', description: 'Reprioritize commitments', priority: 'MEDIUM' });
    }

    const postpones = await this.prisma.scheduleChange.count({
      where: {
        entityType: 'COMMITMENT',
        entityId: commitmentId,
        changeType: 'RESCHEDULE',
      },
    });

    if (postpones >= 3) {
      riskFactors.push('REPEATEDLY_POSTPONED');
      riskLevel = this.maxRisk(riskLevel, 'HIGH');
      details.push(`Rescheduled ${postpones} times`);
      suggestedActions.push({ type: 'CANCEL', description: 'Consider cancelling or delegating', priority: 'MEDIUM' });
    }

    const recommendation = this.generateRecommendation(riskLevel, riskFactors, commitment);

    const riskData = {
      commitmentId,
      riskLevel,
      riskFactors,
      details: details.join('; '),
      recommendation,
      suggestedActions,
      assessedAt: new Date().toISOString(),
    };

    return riskData;
  }

  private maxRisk(current: CommitmentRisk['riskLevel'], newRisk: CommitmentRisk['riskLevel']): CommitmentRisk['riskLevel'] {
    const levels = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    return levels.indexOf(newRisk) > levels.indexOf(current) ? newRisk : current;
  }

  private generateRecommendation(
    riskLevel: CommitmentRisk['riskLevel'],
    factors: CommitmentRisk['riskFactors'],
    commitment: { title: string; deadline: Date },
  ): string {
    if (riskLevel === 'CRITICAL') {
      return `URGENT: "${commitment.title}" is overdue. Immediate action required.`;
    }
    if (riskLevel === 'HIGH') {
      if (factors.includes('NO_TIME_ALLOCATED')) {
        return `You committed to "${commitment.title}" by ${commitment.deadline.toLocaleDateString()}, but there is currently no time allocated for it.`;
      }
      return `High risk for "${commitment.title}": ${factors.join(', ')}.`;
    }
    if (riskLevel === 'MEDIUM') {
      return `Moderate risk for "${commitment.title}": ${factors.join(', ')}. Consider scheduling time.`;
    }
    return 'No significant risks identified.';
  }

  async sendReminders(userId: string): Promise<number> {
    void userId;
    throw new NotImplementedException(
      'Commitment reminders are unavailable because reminder policies are not part of the current Prisma schema'
    );
  }

  private mapToCommitment(c: {
    id: string;
    userId: string;
    title: string;
    description: string | null;
    deadline: Date;
    status: string;
    source: string;
    createdAt: Date;
    updatedAt: Date;
  }): Commitment {
    return {
      id: c.id,
      userId: c.userId,
      object: c.title,
      description: c.description ?? undefined,
      deadline: c.deadline.toISOString(),
      status: c.status === 'MISSED' ? 'OVERDUE' : c.status as CommitmentStatus,
      source: this.fromPrismaSource(c.source),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  private toPrismaSource(source: CommitmentSource): 'USER' | 'AI_GENERATED' | 'EMAIL_INTEGRATION' {
    switch (source) {
      case 'USER_INPUT':
        return 'USER';
      case 'AI_INFERRED':
        return 'AI_GENERATED';
      case 'EMAIL_EXTRACTED':
        return 'EMAIL_INTEGRATION';
      default:
        throw new BadRequestException(
          `Commitment source "${source}" is not supported by the current Prisma schema`
        );
    }
  }

  private fromPrismaSource(source: string): CommitmentSource {
    switch (source) {
      case 'USER':
        return 'USER_INPUT';
      case 'AI_GENERATED':
        return 'AI_INFERRED';
      case 'EMAIL_INTEGRATION':
        return 'EMAIL_EXTRACTED';
      default:
        throw new BadRequestException(`Unsupported commitment source "${source}"`);
    }
  }

  private toPrismaStatus(status: CommitmentStatus): 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED' | 'MISSED' {
    return status;
  }
}
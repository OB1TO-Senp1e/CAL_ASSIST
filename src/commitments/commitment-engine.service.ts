import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { AiProviderService } from '../integrations/ai-providers/ai-provider.service';
import { RealityEngineService } from '../scheduling/reality-engine/reality-engine.service';
import { SchedulingEngineService } from '../scheduling/scheduling-engine/scheduling-engine.service';
import {
  Commitment,
  CommitmentRelatedEntityTypeSchema,
  CommitmentSource,
  CommitmentStatus,
  CreateCommitmentInput,
  UpdateCommitmentInput,
  CommitmentRisk,
  SearchCommitmentsInput,
  CommitmentStats,
  ExtractCommitmentsInput,
  ExtractResult,
  ExtractResultSchema,
  ExtractedCommitment,
  LOW_CONFIDENCE_THRESHOLD,
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
        person: input.person,
        personEmail: input.personEmail,
        confidence: input.confidence,
        context: input.context,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        // Nothing else in the API can create a Commitment->Reminder row, so
        // without this the /send-reminders job would always be a no-op.
        reminders: {
          create: this.defaultReminders(userId, new Date(input.deadline)),
        },
      },
      include: { reminders: true },
    });

    await this.assessRisk(userId, commitment.id);

    return this.mapToCommitment(commitment);
  }

  /**
   * One heads-up the day before, plus a same-day nudge. Absolute deadlines
   * inside 24h get only the same-day reminder so we never fire in the past.
   */
  private defaultReminders(
    userId: string,
    deadline: Date,
  ): Array<{
    userId: string;
    timeType: 'DAYS_BEFORE' | 'HOURS_BEFORE';
    timeValue: number;
    method: 'APP';
    isActive: true;
  }> {
    const hoursUntilDeadline = (deadline.getTime() - Date.now()) / 3_600_000;
    if (Number.isNaN(hoursUntilDeadline) || hoursUntilDeadline <= 0) {
      return [];
    }

    const reminders: Array<{
      userId: string;
      timeType: 'DAYS_BEFORE' | 'HOURS_BEFORE';
      timeValue: number;
      method: 'APP';
      isActive: true;
    }> = [
      { userId, timeType: 'HOURS_BEFORE', timeValue: 2, method: 'APP', isActive: true },
    ];

    if (hoursUntilDeadline > 24) {
      reminders.unshift({
        userId,
        timeType: 'DAYS_BEFORE',
        timeValue: 1,
        method: 'APP',
        isActive: true,
      });
    }

    return reminders;
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
        person: updates.person ?? existing.person,
        personEmail: updates.personEmail ?? existing.personEmail,
        confidence: updates.confidence ?? existing.confidence,
        context: updates.context ?? existing.context,
        relatedEntityType: updates.relatedEntityType ?? existing.relatedEntityType,
        relatedEntityId: updates.relatedEntityId ?? existing.relatedEntityId,
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
    const scored = commitments.filter(
      (c): c is typeof c & { confidence: number } =>
        c.confidence !== null && c.confidence !== undefined,
    );

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
      // Hand-entered commitments carry no confidence, so this stays undefined
      // rather than reporting a misleading 0 for users who never extract.
      averageConfidence: scored.length
        ? scored.reduce((sum, c) => sum + c.confidence, 0) / scored.length
        : undefined,
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
    "personEmail": "string or null",
    "object": "string",
    "description": "string or null",
    "deadline": "ISO datetime string",
    "confidence": 0.0-1.0,
    "context": "verbatim snippet from the text",
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

      const extracted = ExtractResultSchema.parse(response);

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
          // Everything the extractor learned has to survive the write, or the
          // review UI has nothing to show and LOW_CONFIDENCE can never fire.
          await this.createCommitment(userId, this.toCreateInput(ec, input.source));
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

    // A commitment the extractor was unsure about is one the user should confirm
    // before the engine starts scheduling against it. Hand-entered commitments
    // leave `confidence` null and are never flagged here.
    if (commitment.confidence !== null && commitment.confidence < LOW_CONFIDENCE_THRESHOLD) {
      riskFactors.push('LOW_CONFIDENCE');
      riskLevel = this.maxRisk(riskLevel, 'MEDIUM');
      details.push(`Only ${(commitment.confidence * 100).toFixed(0)}% confident this was extracted correctly`);
      suggestedActions.push({
        type: 'ESCALATE',
        description: 'Confirm the wording, deadline and person before relying on this',
        priority: 'MEDIUM',
      });
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

  /**
   * Sends every due commitment reminder as an in-app Notification.
   *
   * This replaces a NotImplementedException whose message claimed "reminder
   * policies are not part of the current Prisma schema" — but `Reminder` and
   * `Commitment.reminders` both exist and are already used by the calendar side.
   *
   * A reminder is due when its lead time (timeType/timeValue) reaches past now
   * without the deadline having passed or the commitment being settled. Each
   * reminder is fired at most once via `completedAt`, so this is safe to poll.
   */
  async sendReminders(userId: string, now: Date = new Date()): Promise<number> {
    const commitments = await this.prisma.commitment.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        reminders: {
          some: { userId, isActive: true, completedAt: null },
        },
      },
      include: {
        reminders: {
          where: { userId, isActive: true, completedAt: null },
        },
      },
    });

    let sent = 0;

    for (const commitment of commitments) {
      for (const reminder of commitment.reminders) {
        const triggerAt = this.reminderTriggerAt(reminder.timeType, reminder.timeValue, commitment.deadline);
        if (!triggerAt || triggerAt > now) continue;

        const title =
          commitment.deadline < now
            ? `Overdue commitment: ${commitment.title}`
            : `Upcoming commitment: ${commitment.title}`;
        const deadlineLabel = commitment.deadline.toISOString();
        const body =
          reminder.message ??
          (commitment.deadline < now
            ? `"${commitment.title}" was due ${deadlineLabel} and is still open.`
            : `"${commitment.title}" is due ${deadlineLabel}. Schedule time for it now.`);

        await this.prisma.$transaction([
          this.prisma.notification.create({
            data: {
              userId,
              type: 'REMINDER',
              title,
              message: body,
              priority: commitment.deadline < now ? 'URGENT' : 'HIGH',
              channel: reminder.method,
              entityType: 'COMMITMENT',
              entityId: commitment.id,
              actionUrl: `/commitments/${commitment.id}`,
              sentAt: now,
            },
          }),
          this.prisma.reminder.update({
            where: { id: reminder.id },
            data: { completedAt: now },
          }),
        ]);

        sent += 1;
      }
    }

    this.logger.log(`Committed reminders for user ${userId}: ${sent} sent`);
    return sent;
  }

  /** Converts a relative Reminder row into the instant it should fire. */
  private reminderTriggerAt(
    timeType: string,
    timeValue: number,
    deadline: Date,
  ): Date | null {
    const trigger = new Date(deadline);
    switch (timeType) {
      case 'MINUTES_BEFORE':
        trigger.setMinutes(trigger.getMinutes() - timeValue);
        return trigger;
      case 'HOURS_BEFORE':
        trigger.setHours(trigger.getHours() - timeValue);
        return trigger;
      case 'DAYS_BEFORE':
        trigger.setDate(trigger.getDate() - timeValue);
        return trigger;
      case 'AT_TIME':
      case 'ON_DATE':
        // timeValue is an absolute epoch ms for these two.
        return new Date(timeValue);
      default:
        return null;
    }
  }

  /**
   * Flattens an extraction result into a create input. `suggestedProjectId` /
   * `suggestedTaskId` become the related-entity link so the commitment stays
   * attached to whatever it was promised against.
   */
  private toCreateInput(
    ec: ExtractedCommitment,
    source: CommitmentSource,
  ): CreateCommitmentInput {
    const related = ec.suggestedProjectId
      ? ({ relatedEntityType: 'PROJECT', relatedEntityId: ec.suggestedProjectId } as const)
      : ec.suggestedTaskId
        ? ({ relatedEntityType: 'TASK', relatedEntityId: ec.suggestedTaskId } as const)
        : {};

    return {
      object: ec.object,
      description: ec.description,
      deadline: ec.deadline,
      source,
      person: ec.person,
      personEmail: ec.personEmail,
      confidence: ec.confidence,
      context: ec.context,
      ...related,
    };
  }

  private mapToCommitment(c: {
    id: string;
    userId: string;
    title: string;
    description: string | null;
    deadline: Date;
    status: string;
    source: string;
    person: string | null;
    personEmail: string | null;
    confidence: number | null;
    context: string | null;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
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
      person: c.person ?? undefined,
      personEmail: c.personEmail ?? undefined,
      confidence: c.confidence ?? undefined,
      context: c.context ?? undefined,
      relatedEntityType: this.toRelatedEntityType(c.relatedEntityType),
      relatedEntityId: c.relatedEntityId ?? undefined,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  /**
   * `relatedEntityType` is stored as a plain nullable string (no enum, no FK)
   * because the linked row may live outside the schema. Anything unrecognised is
   * dropped rather than passed through, so the `Commitment` type stays honest.
   */
  private toRelatedEntityType(
    value: string | null,
  ): Commitment['relatedEntityType'] {
    if (!value) return undefined;
    const parsed = CommitmentRelatedEntityTypeSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
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
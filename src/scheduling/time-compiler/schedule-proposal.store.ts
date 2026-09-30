import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { ScheduleProposal, ScheduledBlock } from './domain/time-compiler.types';
import { toPrismaBlockType } from './scheduling-input-loader';

const MAX_PROPOSALS_PER_USER = 50;

/**
 * Persists compiler output so proposals are addressable across requests, and
 * turns an approved proposal into real TimeBlocks.
 *
 * Previously `GET /proposals` returned a hard-coded `[]`, `apply` returned an
 * empty object cast to ScheduleProposal, and `compile-and-apply` claimed
 * `applied: true` while creating nothing.
 */
@Injectable()
export class ScheduleProposalStore {
  constructor(private readonly prisma: PrismaService) {}

  async save(userId: string, proposal: ScheduleProposal, timezone = 'UTC'): Promise<void> {
    const data = {
      userId,
      externalId: proposal.id,
      status: this.toStatus(proposal.status),
      rangeStart: new Date(proposal.timeRange.start),
      rangeEnd: new Date(proposal.timeRange.end),
      timezone,
      payload: proposal as any,
      confidence: proposal.confidence,
      blockCount: proposal.proposedBlocks.length,
      scheduledMin: proposal.metrics?.totalScheduledMinutes ?? 0,
    };

    await this.prisma.scheduleProposalRecord.upsert({
      where: { externalId: proposal.id },
      update: data,
      create: data,
    });

    await this.pruneOld(userId);
  }

  async list(userId: string, limit = 20): Promise<ScheduleProposal[]> {
    const rows = await this.prisma.scheduleProposalRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), MAX_PROPOSALS_PER_USER),
    });
    return rows.map((r) => this.hydrate(r));
  }

  async getOwned(userId: string, externalId: string): Promise<any> {
    const row = await this.prisma.scheduleProposalRecord.findFirst({
      where: { userId, externalId },
    });
    if (!row) {
      throw new NotFoundException(`Proposal ${externalId} not found`);
    }
    return row;
  }

  async get(userId: string, externalId: string): Promise<ScheduleProposal> {
    return this.hydrate(await this.getOwned(userId, externalId));
  }

  async remove(userId: string, externalId: string): Promise<void> {
    const row = await this.getOwned(userId, externalId);
    await this.prisma.scheduleProposalRecord.delete({ where: { id: row.id } });
  }

  /**
   * Set a proposal's status without writing blocks. Used by the client's
   * "discard" path, where the user rejects a proposal outright.
   */
  async setStatus(
    userId: string,
    externalId: string,
    status: 'APPLIED' | 'REJECTED'
  ): Promise<ScheduleProposal> {
    const row = await this.getOwned(userId, externalId);
    const proposal = this.hydrate(row);

    const next = { ...proposal, status };
    await this.prisma.scheduleProposalRecord.update({
      where: { id: row.id },
      data: {
        status,
        appliedAt: status === 'APPLIED' ? new Date() : row.appliedAt,
        payload: next as any,
      },
    });

    return next;
  }

  /**
   * Writes the proposal's blocks as TimeBlocks and marks the record APPLIED.
   * Idempotent per proposal: re-applying an already-applied proposal is refused
   * so a double-click cannot double-book the calendar.
   */
  async apply(userId: string, externalId: string): Promise<ScheduleProposal> {
    const row = await this.getOwned(userId, externalId);
    if (row.status === 'APPLIED') {
      throw new BadRequestException('Proposal has already been applied');
    }

    const proposal = this.hydrate(row);
    const blocks = proposal.proposedBlocks.filter(isApplicableBlock);

    for (const block of blocks) {
      await this.prisma.timeBlock.create({
        data: {
          userId,
          title: block.title,
          description: block.description ?? null,
          taskId: block.taskId ?? null,
          eventId: block.eventId ?? null,
          startDate: new Date(block.startTime),
          endDate: new Date(block.endTime),
          timezone: block.timezone || 'UTC',
          blockType: toPrismaBlockType(block.type) as any,
          status: 'SCHEDULED',
          source: 'AI_GENERATED',
        },
      });
    }

    const applied = { ...proposal, status: 'APPLIED' as const };
    await this.prisma.scheduleProposalRecord.update({
      where: { id: row.id },
      data: {
        status: 'APPLIED',
        appliedAt: new Date(),
        payload: applied as any,
      },
    });

    return applied;
  }

  private hydrate(row: any): ScheduleProposal {
    const payload = row.payload as ScheduleProposal;
    return {
      ...payload,
      id: row.externalId,
      userId: row.userId,
      status: row.status as ScheduleProposal['status'],
      appliedAt: row.appliedAt ?? undefined,
    } as ScheduleProposal;
  }

  private toStatus(status: string): 'DRAFT' | 'READY' | 'APPLIED' | 'REJECTED' | 'EXPIRED' {
    switch (status) {
      case 'READY':
      case 'APPLIED':
      case 'REJECTED':
      case 'EXPIRED':
        return status;
      default:
        return 'DRAFT';
    }
  }

  private async pruneOld(userId: string): Promise<void> {
    const stale = await this.prisma.scheduleProposalRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: MAX_PROPOSALS_PER_USER,
      select: { id: true },
    });
    if (stale.length) {
      await this.prisma.scheduleProposalRecord.deleteMany({
        where: { id: { in: stale.map((s) => s.id) } },
      });
    }
  }
}

/** Applying is limited to non-fixed, task-shaped blocks. */
function isApplicableBlock(block: ScheduledBlock): boolean {
  return !block.isFixed && (block.type === 'TASK' || block.type === 'FOCUS');
}

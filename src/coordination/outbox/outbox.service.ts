import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OutboxJobTypeSchema,
  EnqueueCoordinationJob,
  OutboxJobStatus,
} from '../coordination.types';
import {
  ClaimedOutboxJob,
  CoordinationJobView,
  OutboxJobRow,
  OutboxStatusCounts,
} from './outbox.types';
import { OutboxStore } from './outbox.store';

/**
 * The only entry point later control points (reminders, follow-ups, renewal)
 * should use to defer work. Validation lives here; SQL lives in
 * `OutboxStore`; the worker claims through `claimReady` below and never
 * touches the store's transaction mechanics.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly store: OutboxStore) {}

  /** Validate + serialize, then insert. `deduped: true` means the call found an existing active job. */
  async enqueue(
    userId: string,
    input: EnqueueCoordinationJob
  ): Promise<{ id: string; status: OutboxJobStatus; deduped: boolean }> {
    if (!OutboxJobTypeSchema.safeParse(input.jobType).success) {
      throw new BadRequestException(`Unknown job type: ${String(input.jobType)}`);
    }
    const payload = JSON.stringify(input.payload ?? {});
    const availableAt = input.availableAt ?? new Date();
    const { row, deduped } = await this.store.enqueue({
      userId,
      jobType: input.jobType,
      dedupeKey: input.dedupeKey ?? null,
      payload,
      availableAt,
      maxAttempts: input.maxAttempts,
    });
    return { id: row.id, status: row.status, deduped };
  }

  /** Claim one due job (lease + attempts handled by the store). Null = queue empty or all locked. */
  async claimReady(now: Date, leaseMs: number): Promise<ClaimedOutboxJob | null> {
    return this.store.claimOne(now, leaseMs);
  }

  async ack(id: string): Promise<void> {
    await this.store.ack(id);
  }

  async nack(id: string, error: string, retryAt: Date): Promise<OutboxJobStatus> {
    return this.store.nack(id, error, retryAt);
  }

  /** Read a user's own job; cross-user ids are indistinguishable from missing ones (404). */
  async getOwnedJob(userId: string, id: string): Promise<CoordinationJobView> {
    const row = await this.store.findOwned(userId, id);
    if (!row) throw new NotFoundException(`Job ${id} not found`);
    return toView(row);
  }

  async listJobs(userId: string, limit = 20): Promise<CoordinationJobView[]> {
    const rows = await this.store.listOwned(userId, Math.min(Math.max(limit, 1), 100));
    return rows.map(toView);
  }

  async counts(userId: string): Promise<OutboxStatusCounts> {
    return this.store.statusCounts(userId);
  }
}

/** Drops `userId` and the raw payload string from the client-facing shape. */
function toView(row: OutboxJobRow): CoordinationJobView {
  return {
    id: row.id,
    jobType: row.jobType,
    dedupeKey: row.dedupeKey,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    availableAt: row.availableAt,
    lockedUntil: row.lockedUntil,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { OutboxJobStatus } from '../coordination.types';
import {
  ClaimedOutboxJob,
  OutboxInsertRecord,
  OutboxJobRow,
  OutboxStatusCounts,
  RawSqlExecutor,
} from './outbox.types';

/** `lastError` is truncated, never rejected: a nack must always be recordable. */
const MAX_ERROR_LENGTH = 500;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * All SQL for the `"OutboxJob"` table — persistence only: no policy, no
 * validation, no opinion about payload shape beyond "it is a JSON string".
 *
 * Every statement is raw SQL because the table is intentionally **not** in
 * `prisma/schema.prisma` during C-01 (the signed-off substrate-only cut), so
 * the client has no delegate for it. Claiming runs inside `$transaction`
 * because `FOR UPDATE SKIP LOCKED` only stops two API replicas taking the
 * same job when the locking SELECT and the leasing UPDATE share one
 * transaction on one connection (D1 / R10).
 *
 * PostgreSQL only — `SKIP LOCKED` has no SQLite equivalent, which is why the
 * unit specs mock the raw layer instead of using an embedded database (D1's
 * own consequence note in `docs/coordination-audit.md` §4).
 */
@Injectable()
export class OutboxStore {
  private readonly logger = new Logger(OutboxStore.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert one job. When a `dedupeKey` is supplied, at most one **active**
   * (PENDING/CLAIMED) row may exist per `(userId, dedupeKey)`: a pre-check
   * returns the existing row, and the partial unique index settles the race
   * between two concurrent enqueues (P2002 → re-select → return the winner).
   */
  async enqueue(record: OutboxInsertRecord): Promise<{ row: OutboxJobRow; deduped: boolean }> {
    if (record.dedupeKey !== null) {
      const existing = await this.findActiveByDedupeKey(record.userId, record.dedupeKey);
      if (existing) return { row: existing, deduped: true };
    }

    const now = new Date();
    const id = randomUUID();
    try {
      const rows = await this.prisma.$queryRaw<OutboxJobRow[]>`
        INSERT INTO "OutboxJob" ("id", "userId", "jobType", "dedupeKey", "payload", "status",
          "availableAt", "lockedUntil", "attempts", "maxAttempts", "lastError", "createdAt",
          "updatedAt")
        VALUES (${id}, ${record.userId}, ${record.jobType}, ${record.dedupeKey}, ${record.payload},
          'PENDING', ${now}, NULL, 0, ${record.maxAttempts}, NULL, ${now}, ${now})
        RETURNING "id", "userId", "jobType", "dedupeKey", "payload", "status", "availableAt",
          "lockedUntil", "attempts", "maxAttempts", "lastError", "createdAt", "updatedAt"
      `;
      const row = rows[0];
      if (!row) throw new Error(`Outbox insert returned no row for id ${id}`);
      return { row, deduped: false };
    } catch (error) {
      if (record.dedupeKey !== null && isUniqueViolation(error)) {
        const raced = await this.findActiveByDedupeKey(record.userId, record.dedupeKey);
        if (raced) return { row: raced, deduped: true };
      }
      throw error;
    }
  }

  /**
   * Claim at most one due job and lease it for `leaseMs`.
   *
   * "Due" is either a PENDING row past `availableAt`, **or** a CLAIMED row
   * whose lease lapsed — that second arm is crashed-worker recovery, so a
   * replica dying mid-handler cannot strand a job forever. `attempts <
   * maxAttempts` keeps exhausted rows out of the queue; the terminal
   * transition happens in `nack`.
   *
   * Returns `null` when the queue is empty or every candidate is currently
   * locked by another replica (`SKIP LOCKED`) — never an error.
   *
   * A row whose stored `payload` is not valid JSON can never be fixed by a
   * retry, so it is failed in-transaction and the cycle returns `null` —
   * throwing here would roll the FAILED update back with it.
   */
  async claimOne(now: Date, leaseMs: number): Promise<ClaimedOutboxJob | null> {
    return this.prisma.$transaction((tx) => this.claimOneIn(tx, now, leaseMs));
  }

  private async claimOneIn(
    tx: RawSqlExecutor,
    now: Date,
    leaseMs: number
  ): Promise<ClaimedOutboxJob | null> {
    const candidates = await tx.$queryRaw<OutboxJobRow[]>`
      SELECT "id", "userId", "jobType", "dedupeKey", "payload", "status", "availableAt",
        "lockedUntil", "attempts", "maxAttempts", "lastError", "createdAt", "updatedAt"
      FROM "OutboxJob"
      WHERE "attempts" < "maxAttempts"
        AND (
          ("status" = 'PENDING' AND "availableAt" <= ${now})
          OR ("status" = 'CLAIMED' AND "lockedUntil" < ${now})
        )
      ORDER BY "availableAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    const candidate = candidates[0];
    if (!candidate) return null;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(candidate.payload) as Record<string, unknown>;
    } catch {
      await tx.$executeRaw`
        UPDATE "OutboxJob"
        SET "status" = 'FAILED', "lastError" = 'PAYLOAD_UNPARSEABLE', "lockedUntil" = NULL,
          "updatedAt" = ${now}
        WHERE "id" = ${candidate.id}
      `;
      this.logger.warn(`Failed poisoned outbox job ${candidate.id} (unparseable payload)`);
      return null;
    }

    const leaseUntil = new Date(now.getTime() + leaseMs);
    const leased = await tx.$queryRaw<OutboxJobRow[]>`
      UPDATE "OutboxJob"
      SET "status" = 'CLAIMED', "lockedUntil" = ${leaseUntil}, "attempts" = "attempts" + 1,
        "updatedAt" = ${now}
      WHERE "id" = ${candidate.id}
      RETURNING "id", "userId", "jobType", "dedupeKey", "payload", "status", "availableAt",
        "lockedUntil", "attempts", "maxAttempts", "lastError", "createdAt", "updatedAt"
    `;
    const row = leased[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.userId,
      jobType: row.jobType,
      payload,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
    };
  }

  /** Successful handler outcome — the terminal COMPLETED transition. */
  async ack(id: string): Promise<void> {
    const now = new Date();
    await this.prisma.$executeRaw`
      UPDATE "OutboxJob"
      SET "status" = 'COMPLETED', "lockedUntil" = NULL, "lastError" = NULL, "updatedAt" = ${now}
      WHERE "id" = ${id}
    `;
  }

  /**
   * Failed handler outcome. While attempts remain, the row returns to PENDING
   * with `availableAt` pushed out to `retryAt` (a retry back-off the caller
   * computes); once `attempts >= maxAttempts` — the counter was already
   * incremented at claim time — the row becomes terminal FAILED and is never
   * claimed again. Returns the status the row actually moved to.
   */
  async nack(id: string, error: string, retryAt: Date): Promise<OutboxJobStatus> {
    const now = new Date();
    const message = error.slice(0, MAX_ERROR_LENGTH);
    const rows = await this.prisma.$queryRaw<{ status: OutboxJobStatus }[]>`
      UPDATE "OutboxJob"
      SET "status" = CASE WHEN "attempts" >= "maxAttempts" THEN 'FAILED' ELSE 'PENDING' END,
        "lastError" = ${message},
        "lockedUntil" = NULL,
        "availableAt" = CASE WHEN "attempts" >= "maxAttempts" THEN "availableAt" ELSE ${retryAt} END,
        "updatedAt" = ${now}
      WHERE "id" = ${id}
      RETURNING "status"
    `;
    return rows[0]?.status ?? 'FAILED';
  }

  /** The row for a user's **own** job, or `null`. Ownership is enforced here, never above it. */
  async findOwned(userId: string, id: string): Promise<OutboxJobRow | null> {
    const rows = await this.prisma.$queryRaw<OutboxJobRow[]>`
      SELECT "id", "userId", "jobType", "dedupeKey", "payload", "status", "availableAt",
        "lockedUntil", "attempts", "maxAttempts", "lastError", "createdAt", "updatedAt"
      FROM "OutboxJob"
      WHERE "id" = ${id} AND "userId" = ${userId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /** A user's most recent jobs, newest first. */
  async listOwned(userId: string, limit: number): Promise<OutboxJobRow[]> {
    return this.prisma.$queryRaw<OutboxJobRow[]>`
      SELECT "id", "userId", "jobType", "dedupeKey", "payload", "status", "availableAt",
        "lockedUntil", "attempts", "maxAttempts", "lastError", "createdAt", "updatedAt"
      FROM "OutboxJob"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `;
  }

  /** Per-status job counts for one user; every status key is present, zero-filled. */
  async statusCounts(userId: string): Promise<OutboxStatusCounts> {
    const rows = await this.prisma.$queryRaw<{ status: OutboxJobStatus; count: number }[]>`
      SELECT "status", COUNT(*)::int AS "count"
      FROM "OutboxJob"
      WHERE "userId" = ${userId}
      GROUP BY "status"
    `;
    const counts: OutboxStatusCounts = { PENDING: 0, CLAIMED: 0, COMPLETED: 0, FAILED: 0 };
    for (const row of rows) {
      if (row.status in counts) counts[row.status] = Number(row.count);
    }
    return counts;
  }

  private async findActiveByDedupeKey(
    userId: string,
    dedupeKey: string
  ): Promise<OutboxJobRow | null> {
    const rows = await this.prisma.$queryRaw<OutboxJobRow[]>`
      SELECT "id", "userId", "jobType", "dedupeKey", "payload", "status", "availableAt",
        "lockedUntil", "attempts", "maxAttempts", "lastError", "createdAt", "updatedAt"
      FROM "OutboxJob"
      WHERE "userId" = ${userId} AND "dedupeKey" = ${dedupeKey}
        AND "status" IN ('PENDING', 'CLAIMED')
      ORDER BY "createdAt" ASC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}

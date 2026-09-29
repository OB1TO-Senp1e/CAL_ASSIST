import { OutboxJobStatus } from '../coordination.types';

/**
 * One row of the `"OutboxJob"` table exactly as `$queryRaw` returns it.
 * Column names mirror the C-01 migration verbatim (they are quoted camelCase
 * in DDL, so they survive the PostgreSQL round-trip as-is).
 *
 * `payload` is TEXT, not JSONB: serialize/deserialize in code instead of
 * relying on driver JSON parameter handling. `userId` carries **no FK** in
 * C-01 — the table is deliberately invisible to the Prisma client until the
 * schema-surface control point models it; see the migration header.
 */
export interface OutboxJobRow {
  id: string;
  userId: string;
  jobType: string;
  dedupeKey: string | null;
  payload: string;
  status: OutboxJobStatus;
  availableAt: Date;
  lockedUntil: Date | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input to `OutboxStore.enqueue`; the payload is already JSON-serialized. */
export interface OutboxInsertRecord {
  userId: string;
  jobType: string;
  dedupeKey: string | null;
  payload: string;
  availableAt: Date;
  maxAttempts: number;
}

/** A job handed to a handler after a successful claim + payload parse. */
export interface ClaimedOutboxJob {
  id: string;
  userId: string;
  jobType: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

/** The read-model shape exposed by the coordination controller. */
export interface CoordinationJobView {
  id: string;
  jobType: string;
  dedupeKey: string | null;
  status: OutboxJobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedUntil: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Per-status counts for one user's jobs (every key present, zero-filled). */
export type OutboxStatusCounts = Record<OutboxJobStatus, number>;

/**
 * The subset of `PrismaService` that also works inside an interactive
 * transaction. `FOR UPDATE SKIP LOCKED` (D1) only protects a multi-replica
 * deployment while the locking SELECT and the leasing UPDATE share one
 * transaction on one connection, so the claim path is written against this
 * minimal executor — which both Prisma's transaction client and the unit-test
 * mocks satisfy structurally.
 */
export interface RawSqlExecutor {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

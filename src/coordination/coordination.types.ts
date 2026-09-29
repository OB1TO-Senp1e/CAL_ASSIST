import { z } from 'zod';

/**
 * Coordination-layer contracts (C-01). Zod is the single source of truth (D2):
 * every coordination controller body is validated by `ZodValidationPipe`
 * against a schema exported from this file, and the inferred types below are
 * the only shapes the services accept.
 *
 * The job families are the ones the signed-off audit
 * (`docs/coordination-audit.md`, D1) assigns to the outbox: reminders (§13),
 * follow-ups (§14/§16) and calendar channel renewal (§13/§18 obligation — the
 * periodic job itself is repo-derived). Their *handlers* belong to later
 * control points; C-01 ships the substrate only, so a claimed job whose
 * handler is not registered must nack, never crash.
 */
export const OutboxJobTypeSchema = z.enum(['REMINDER', 'FOLLOWUP', 'CHANNEL_RENEWAL']);
export type OutboxJobType = z.infer<typeof OutboxJobTypeSchema>;

/**
 * Lifecycle of one outbox row:
 * PENDING → CLAIMED (leased to a worker) → COMPLETED | FAILED.
 * A CLAIMED row whose lease lapses becomes due again (crashed-worker
 * recovery), so a lost worker cannot strand a job.
 */
export const OutboxJobStatusSchema = z.enum(['PENDING', 'CLAIMED', 'COMPLETED', 'FAILED']);
export type OutboxJobStatus = z.infer<typeof OutboxJobStatusSchema>;

export const DEFAULT_JOB_MAX_ATTEMPTS = 3;

/** A caller asking to defer one unit of work (POST /coordination/jobs body). */
export const EnqueueCoordinationJobSchema = z.object({
  jobType: OutboxJobTypeSchema,
  /**
   * At most one ACTIVE (PENDING/CLAIMED) row may exist per key, enforced by a
   * partial unique index in the C-01 migration — completed history rows do
   * not block re-enqueueing the same key later. Omit the key to allow repeats.
   */
  dedupeKey: z.string().trim().min(1).max(255).nullish(),
  payload: z.record(z.unknown()).default({}),
  availableAt: z.coerce.date().optional(),
  maxAttempts: z.number().int().min(1).max(10).default(DEFAULT_JOB_MAX_ATTEMPTS),
});
export type EnqueueCoordinationJob = z.infer<typeof EnqueueCoordinationJobSchema>;

/**
 * Worker knobs, all env-driven (string-shaped so ConfigService can supply
 * defaults before coercion). Defaults keep the worker **off**: booting the
 * poll loop queries the `"OutboxJob"` table, which does not exist until the
 * C-01 migration is deployed.
 *
 * The worker reuses `PrismaService`'s single pool — it opens no second pool —
 * so `WORKER_POOL_CONNECTIONS` (D6) stays `0` for this design; the budget
 * validator only needs a non-zero value if a separate pool is ever created.
 */
export const CoordinationWorkerSettingsSchema = z.object({
  enabled: z.enum(['true', 'false']).default('false'),
  pollMs: z.coerce.number().int().min(250).max(600_000).default(5000),
  batchSize: z.coerce.number().int().min(1).max(50).default(5),
  leaseSeconds: z.coerce.number().int().min(5).max(3600).default(60),
  retrySeconds: z.coerce.number().int().min(1).max(3600).default(30),
});
export type CoordinationWorkerSettings = z.infer<typeof CoordinationWorkerSettingsSchema>;

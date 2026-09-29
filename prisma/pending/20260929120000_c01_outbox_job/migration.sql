-- ============================================================================
-- C-01: coordination outbox (D1 — Postgres outbox + FOR UPDATE SKIP LOCKED).
--
-- AUTHORED, NOT APPLIED. This file deliberately lives in `prisma/pending/`,
-- NOT in `prisma/migrations/`, because `MigrationStateGuard`
-- (src/config/migration-state.guard.ts) throws at production boot if ANY
-- directory in `prisma/migrations/` is missing from `_prisma_migrations`.
-- Moving this file into `prisma/migrations/` IS the deploy decision and must
-- happen together with `npx prisma migrate deploy` against the target DB.
--
-- Deploy (each step is a deliberate, separate act):
--   1. move this folder into prisma/migrations/
--   2. npx prisma migrate deploy      (requires DATABASE_URL -> real Postgres)
--   3. only then set COORDINATION_WORKER_ENABLED=true
--
-- Design notes:
--  * The table is intentionally NOT added to prisma/schema.prisma in C-01
--    (substrate-only scope). All access is raw SQL in src/coordination/outbox.
--    A later schema-surface control point may model it and reconcile.
--  * No FK on "userId": deleting the FK keeps the account-deletion sweep
--    (src/users/account-deletion.service.ts) unchanged for now; the trade-off
--    is that user cleanup of outbox rows is a documented follow-up, not
--    automatic. Re-adding `REFERENCES "User"("id") ON DELETE CASCADE` is the
--    intended end-state once the sweep is extended (see COORDINATION_PROGRESS).
--  * Dedupe is a PARTIAL unique index over active rows only: history
--    (COMPLETED/FAILED) never blocks re-enqueueing the same key later.
--  * payload is TEXT, not JSONB — the store serializes explicitly.
--  * Claim concurrency is enforced in code by
--    SELECT ... FOR UPDATE SKIP LOCKED inside one transaction; no application
--    lock, no advisory lock, no new dependency.
-- ============================================================================

-- CreateTable
CREATE TABLE "OutboxJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxJob_pkey" PRIMARY KEY ("id")
);

-- Claim-queue scan: the poller filters on status/availability and sorts by
-- availableAt, so the composite leads with the equality columns it can use.
CREATE INDEX "OutboxJob_status_availableAt_idx" ON "OutboxJob"("status", "availableAt");

-- Ownership reads: every controller/store read filters by userId.
CREATE INDEX "OutboxJob_userId_createdAt_idx" ON "OutboxJob"("userId", "createdAt");

-- Lease-recovery scan: expired CLAIMED rows are found by this predicate.
CREATE INDEX "OutboxJob_status_lockedUntil_idx" ON "OutboxJob"("status", "lockedUntil");

-- One active (PENDING/CLAIMED) job per user+dedupeKey; NULL keys are exempt
-- (Postgres partial unique indexes still admit multiple NULLs, and NULL
-- "dedupeKey" means "no dedupe requested" anyway).
CREATE UNIQUE INDEX "OutboxJob_userId_dedupeKey_active_key"
    ON "OutboxJob"("userId", "dedupeKey")
    WHERE "dedupeKey" IS NOT NULL AND "status" IN ('PENDING', 'CLAIMED');

-- Status vocabulary is checked in code (OutboxJobStatusSchema); no DB CHECK is
-- added so the enum can evolve with later control points without a migration.

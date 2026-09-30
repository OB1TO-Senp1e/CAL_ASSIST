-- Stage 4k: permissions / autonomy policies / rule conflicts move out of the
-- AutonomyRule + Permission compat-JSON representations into dedicated models.
--
-- Pre-flight audit (scripts/s4k-check-db.js) showed ZERO legacy rows in every
-- compat format (calassist.permission: encoded scopes, calassistPolicy
-- actionConfig blobs, conditions.resolvedConflicts arrays), so this migration
-- rebuilds Permission and adds the new tables without a data backfill. The
-- runtime code no longer reads or writes any of the compat formats.

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('CREATE_EVENT', 'MOVE_EVENT', 'CANCEL_EVENT', 'CONTACT_PEOPLE', 'NEGOTIATE_MEETING_TIMES', 'MODIFY_TASKS', 'REPLAN_SCHEDULES', 'SEND_NOTIFICATIONS', 'CREATE_TASK', 'UPDATE_TASK', 'DELETE_TASK', 'CREATE_COMMITMENT', 'MODIFY_COMMITMENT', 'EXTRACT_COMMITMENTS', 'MODIFY_GOALS', 'MODIFY_PROJECTS', 'RUN_PROACTIVE_CHECK', 'DISMISS_INTERVENTION', 'MODIFY_RULES', 'MODIFY_AUTONOMY_POLICIES', 'ACCESS_INTEGRATIONS', 'SYNC_CALENDAR', 'MODIFY_PREFERENCES');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('GLOBAL', 'CALENDAR', 'TASKS', 'COMMITMENTS', 'GOALS', 'PROJECTS', 'SCHEDULING', 'NOTIFICATIONS', 'INTEGRATIONS', 'AI_ASSISTANT', 'PROACTIVE', 'RULES');

-- CreateEnum
CREATE TYPE "PermissionDecision" AS ENUM ('ALLOW', 'DENY', 'ASK', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "AutonomyLevel" AS ENUM ('OBSERVE', 'SUGGEST', 'ASK_BEFORE_ACTION', 'AUTO_EXECUTE_LOW_RISK', 'DELEGATED_AUTHORITY');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RuleConflictType" AS ENUM ('DIRECT_CONTRADICTION', 'OVERLAPPING_CONDITIONS', 'MUTUALLY_EXCLUSIVE_ACTIONS', 'PRIORITY_AMBIGUITY', 'SCOPE_OVERLAP');

-- CreateEnum
CREATE TYPE "RuleConflictSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RuleConflictResolution" AS ENUM ('DISABLE_FIRST', 'DISABLE_SECOND', 'ADJUST_PRIORITY', 'MERGE', 'MANUAL', 'KEEP_BOTH');

-- DropTable (legacy Permission carried the whole grant URL-encoded in `scope`;
-- audited empty, so it is rebuilt rather than ALTERed)
DROP TABLE "Permission";

-- DropEnum
DROP TYPE "PermissionLevel";

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "scope" "PermissionScope" NOT NULL,
    "decision" "PermissionDecision" NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "grantedBy" TEXT NOT NULL DEFAULT 'USER',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutonomyPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "autonomyLevel" "AutonomyLevel" NOT NULL DEFAULT 'SUGGEST',
    "enabledScopes" "PermissionScope"[] DEFAULT ARRAY[]::"PermissionScope"[],
    "allowedActions" "PermissionAction"[] DEFAULT ARRAY[]::"PermissionAction"[],
    "riskThreshold" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "requireConfirmationFor" "PermissionAction"[] DEFAULT ARRAY[]::"PermissionAction"[],
    "protectedEntities" JSONB NOT NULL DEFAULT '[]',
    "timeRestrictions" JSONB NOT NULL DEFAULT '[]',
    "maxActionsPerPeriod" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutonomyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConflict" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conflictKey" TEXT NOT NULL,
    "ruleId1" TEXT NOT NULL,
    "ruleId2" TEXT NOT NULL,
    "rule1Name" TEXT NOT NULL,
    "rule2Name" TEXT NOT NULL,
    "conflictType" "RuleConflictType" NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "RuleConflictSeverity" NOT NULL,
    "suggestedResolution" "RuleConflictResolution",
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" "RuleConflictResolution",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_userId_action_scope_key" ON "Permission"("userId", "action", "scope");

-- CreateIndex
CREATE INDEX "Permission_userId_scope_idx" ON "Permission"("userId", "scope");

-- CreateIndex
CREATE INDEX "Permission_action_idx" ON "Permission"("action");

-- CreateIndex
CREATE INDEX "Permission_expiresAt_idx" ON "Permission"("expiresAt");

-- CreateIndex
CREATE INDEX "AutonomyPolicy_userId_idx" ON "AutonomyPolicy"("userId");

-- CreateIndex
CREATE INDEX "AutonomyPolicy_isActive_idx" ON "AutonomyPolicy"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RuleConflict_userId_conflictKey_key" ON "RuleConflict"("userId", "conflictKey");

-- CreateIndex
CREATE INDEX "RuleConflict_userId_idx" ON "RuleConflict"("userId");

-- CreateIndex
CREATE INDEX "RuleConflict_resolvedAt_idx" ON "RuleConflict"("resolvedAt");

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutonomyPolicy" ADD CONSTRAINT "AutonomyPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConflict" ADD CONSTRAINT "RuleConflict_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

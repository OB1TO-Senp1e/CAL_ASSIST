-- Stage 4k (part 2): the replanning engine's autonomy policies move out of the
-- shared AutonomyRule table (where they were told apart from scheduling rules
-- by marker heuristics) into a dedicated ReplanningPolicy model.
-- Pre-flight audit: zero existing policy rows in AutonomyRule, so no backfill.

-- CreateEnum
CREATE TYPE "ReplanningScope" AS ENUM ('GLOBAL', 'SCHEDULING', 'TASKS', 'MEETINGS', 'FOCUS_TIME');

-- CreateEnum
CREATE TYPE "ReplanTrigger" AS ENUM ('TASK_OVERRUN', 'MEETING_LATE', 'TASK_POSTPONED', 'DEADLINE_APPROACHING', 'DEPENDENCY_INCOMPLETE', 'SCHEDULE_DRIFT', 'NEW_TASK', 'TASK_CANCELLED', 'MEETING_CANCELLED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReplanAllowedAction" AS ENUM ('MOVE_TASK', 'RESCHEDULE_EVENT', 'SPLIT_TASK', 'MERGE_BLOCKS', 'ADD_BUFFER', 'REDUCE_SCOPE', 'REPRIORITIZE', 'EXTEND_DEADLINE', 'CANCEL_LOW_PRIORITY');

-- CreateEnum
CREATE TYPE "ReplanConfirmation" AS ENUM ('DEADLINE_CHANGES', 'MEETING_MOVES', 'FOCUS_TIME_CHANGES', 'EXTERNAL_EVENT_CHANGES', 'HIGH_PRIORITY_CHANGES');

-- CreateTable
CREATE TABLE "ReplanningPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scope" "ReplanningScope" NOT NULL DEFAULT 'GLOBAL',
    "triggers" "ReplanTrigger"[] DEFAULT ARRAY[]::"ReplanTrigger"[],
    "allowedActions" "ReplanAllowedAction"[] DEFAULT ARRAY[]::"ReplanAllowedAction"[],
    "constraints" JSONB NOT NULL DEFAULT '[]',
    "maxChangesPerOperation" INTEGER NOT NULL DEFAULT 3,
    "maxTimeShiftMinutes" INTEGER NOT NULL DEFAULT 120,
    "protectedTimeRanges" JSONB NOT NULL DEFAULT '[]',
    "requireConfirmationFor" "ReplanConfirmation"[] DEFAULT ARRAY[]::"ReplanConfirmation"[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplanningPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplanningPolicy_userId_idx" ON "ReplanningPolicy"("userId");

-- CreateIndex
CREATE INDEX "ReplanningPolicy_enabled_idx" ON "ReplanningPolicy"("enabled");

-- AddForeignKey
ALTER TABLE "ReplanningPolicy" ADD CONSTRAINT "ReplanningPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

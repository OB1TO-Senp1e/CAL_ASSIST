-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'READY', 'APPLIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DeviationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "InterventionStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'DISMISSED', 'SNOOZED');

-- CreateEnum
CREATE TYPE "MeetingArtifactKind" AS ENUM ('PREPARATION', 'POST_MEETING');

-- CreateTable
CREATE TABLE "ScheduleProposalRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "rangeStart" TIMESTAMP(3) NOT NULL,
    "rangeEnd" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "payload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "blockCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledMin" INTEGER NOT NULL DEFAULT 0,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleProposalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviationState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviationId" TEXT NOT NULL,
    "status" "DeviationStatus" NOT NULL DEFAULT 'OPEN',
    "entityType" TEXT,
    "entityId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "InterventionStatus" NOT NULL DEFAULT 'PENDING',
    "snoozedUntil" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterventionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingArtifact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "kind" "MeetingArtifactKind" NOT NULL,
    "meetingTitle" TEXT,
    "payload" JSONB NOT NULL,
    "summary" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleProposalRecord_externalId_key" ON "ScheduleProposalRecord"("externalId");

-- CreateIndex
CREATE INDEX "ScheduleProposalRecord_userId_idx" ON "ScheduleProposalRecord"("userId");

-- CreateIndex
CREATE INDEX "ScheduleProposalRecord_status_idx" ON "ScheduleProposalRecord"("status");

-- CreateIndex
CREATE INDEX "ScheduleProposalRecord_createdAt_idx" ON "ScheduleProposalRecord"("createdAt");

-- CreateIndex
CREATE INDEX "DeviationState_userId_idx" ON "DeviationState"("userId");

-- CreateIndex
CREATE INDEX "DeviationState_status_idx" ON "DeviationState"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeviationState_userId_deviationId_key" ON "DeviationState"("userId", "deviationId");

-- CreateIndex
CREATE INDEX "InterventionState_userId_idx" ON "InterventionState"("userId");

-- CreateIndex
CREATE INDEX "InterventionState_status_idx" ON "InterventionState"("status");

-- CreateIndex
CREATE INDEX "InterventionState_snoozedUntil_idx" ON "InterventionState"("snoozedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionState_userId_interventionId_key" ON "InterventionState"("userId", "interventionId");

-- CreateIndex
CREATE INDEX "MeetingArtifact_userId_idx" ON "MeetingArtifact"("userId");

-- CreateIndex
CREATE INDEX "MeetingArtifact_meetingId_idx" ON "MeetingArtifact"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingArtifact_kind_idx" ON "MeetingArtifact"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingArtifact_userId_meetingId_kind_key" ON "MeetingArtifact"("userId", "meetingId", "kind");

-- AddForeignKey
ALTER TABLE "ScheduleProposalRecord" ADD CONSTRAINT "ScheduleProposalRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationState" ADD CONSTRAINT "DeviationState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionState" ADD CONSTRAINT "InterventionState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingArtifact" ADD CONSTRAINT "MeetingArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

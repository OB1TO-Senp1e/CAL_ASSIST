-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('DRAFT', 'PROPOSED', 'PENDING_APPROVAL', 'SCHEDULED', 'INVITATIONS_SENT', 'PARTIALLY_CONFIRMED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'FOLLOW_UP', 'CLOSED', 'DECLINED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW', 'FAILED');

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "meetingType" TEXT,
    "conferenceProvider" TEXT,
    "conferenceUrl" TEXT,
    "conferenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "responseStatus" "ParticipantStatus" NOT NULL DEFAULT 'NEEDS_ACTION',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingProposal" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "priority" INTEGER,
    "reasons" TEXT[],
    "conflicts" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "status" "ProposalStatus" NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "PreferenceCategory" NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isExplicit" BOOLEAN NOT NULL DEFAULT true,
    "isHardRule" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SchedulingPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "decision" "PermissionDecision",
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "autonomyLevel" "AutonomyLevel",
    "meetingId" TEXT,
    "proposalId" TEXT,
    "reason" TEXT,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_eventId_key" ON "Meeting"("eventId");

-- CreateIndex
CREATE INDEX "Meeting_userId_idx" ON "Meeting"("userId");

-- CreateIndex
CREATE INDEX "Meeting_status_idx" ON "Meeting"("status");

-- CreateIndex
CREATE INDEX "Meeting_userId_status_idx" ON "Meeting"("userId", "status");

-- CreateIndex
CREATE INDEX "Meeting_meetingType_idx" ON "Meeting"("meetingType");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_userId_idempotencyKey_key" ON "Meeting"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_email_idx" ON "MeetingParticipant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_email_key" ON "MeetingParticipant"("meetingId", "email");

-- CreateIndex
CREATE INDEX "MeetingProposal_meetingId_idx" ON "MeetingProposal"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingProposal_start_end_idx" ON "MeetingProposal"("start", "end");

-- CreateIndex
CREATE INDEX "MeetingProposal_status_idx" ON "MeetingProposal"("status");

-- CreateIndex
CREATE INDEX "SchedulingPreference_userId_idx" ON "SchedulingPreference"("userId");

-- CreateIndex
CREATE INDEX "SchedulingPreference_category_idx" ON "SchedulingPreference"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingPreference_userId_category_key_key" ON "SchedulingPreference"("userId", "category", "key");

-- CreateIndex
CREATE INDEX "AiActionLog_userId_idx" ON "AiActionLog"("userId");

-- CreateIndex
CREATE INDEX "AiActionLog_meetingId_idx" ON "AiActionLog"("meetingId");

-- CreateIndex
CREATE INDEX "AiActionLog_action_idx" ON "AiActionLog"("action");

-- CreateIndex
CREATE INDEX "AiActionLog_decision_idx" ON "AiActionLog"("decision");

-- CreateIndex
CREATE INDEX "AiActionLog_createdAt_idx" ON "AiActionLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiActionLog_userId_createdAt_idx" ON "AiActionLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingProposal" ADD CONSTRAINT "MeetingProposal_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingPreference" ADD CONSTRAINT "SchedulingPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiActionLog" ADD CONSTRAINT "AiActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiActionLog" ADD CONSTRAINT "AiActionLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

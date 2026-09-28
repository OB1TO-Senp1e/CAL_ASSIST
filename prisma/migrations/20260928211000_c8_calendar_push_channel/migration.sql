-- C8: Google Calendar push-notification channel registry (token/channelId/
-- resourceId verification replaces the misleading HMAC scheme).
-- Additive-only change (new table); reversible by dropping it. No backfill.

-- CreateTable
CREATE TABLE "CalendarPushChannel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "channelId" TEXT NOT NULL,
    "resourceUri" TEXT NOT NULL,
    "channelToken" TEXT NOT NULL,
    "expiration" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarPushChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarPushChannel_userId_idx" ON "CalendarPushChannel"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarPushChannel_provider_channelId_key" ON "CalendarPushChannel"("provider", "channelId");

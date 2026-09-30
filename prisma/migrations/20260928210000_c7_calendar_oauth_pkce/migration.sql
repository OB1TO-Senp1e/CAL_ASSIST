-- C7: server-side PKCE store for the hand-rolled calendar OAuth flows.
-- Additive-only change (new table); reversible by dropping it. No backfill.

-- CreateTable
CREATE TABLE "CalendarOAuthPkce" (
    "id" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarOAuthPkce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarOAuthPkce_expiresAt_idx" ON "CalendarOAuthPkce"("expiresAt");

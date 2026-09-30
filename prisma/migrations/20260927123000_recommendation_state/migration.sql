-- CreateEnum
CREATE TYPE "RecommendationStateStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "RecommendationState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "deviationId" TEXT NOT NULL,
    "status" "RecommendationStateStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecommendationState_userId_idx" ON "RecommendationState"("userId");

-- CreateIndex
CREATE INDEX "RecommendationState_status_idx" ON "RecommendationState"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationState_userId_recommendationId_key" ON "RecommendationState"("userId", "recommendationId");

-- AddForeignKey
ALTER TABLE "RecommendationState" ADD CONSTRAINT "RecommendationState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

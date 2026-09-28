-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('ACTIVE', 'DEPRECATED', 'CONFLICTING', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('GLOBAL', 'SCHEDULING', 'TASKS', 'MEETINGS', 'FOCUS_TIME', 'BREAKS', 'TRAVEL', 'WORK_HOURS', 'PERSONAL');

-- AlterEnum
BEGIN;
CREATE TYPE "MemoryCategory_new" AS ENUM ('EXPLICIT_PREFERENCE', 'EXPLICIT_FACT', 'USER_RULE', 'LEARNED_PATTERN', 'TEMPORARY_CONTEXT');
ALTER TABLE "Memory" ALTER COLUMN "category" TYPE "MemoryCategory_new" USING ("category"::text::"MemoryCategory_new");
ALTER TYPE "MemoryCategory" RENAME TO "MemoryCategory_old";
ALTER TYPE "MemoryCategory_new" RENAME TO "MemoryCategory";
DROP TYPE "public"."MemoryCategory_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "MemorySource_new" AS ENUM ('USER_INPUT', 'AI_INFERENCE', 'SYSTEM_OBSERVATION', 'EXTERNAL_SYNC', 'IMPORTED');
ALTER TABLE "public"."Memory" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "Memory" ALTER COLUMN "source" TYPE "MemorySource_new" USING ("source"::text::"MemorySource_new");
ALTER TYPE "MemorySource" RENAME TO "MemorySource_old";
ALTER TYPE "MemorySource_new" RENAME TO "MemorySource";
DROP TYPE "public"."MemorySource_old";
ALTER TABLE "Memory" ALTER COLUMN "source" SET DEFAULT 'USER_INPUT';
COMMIT;

-- AlterTable
ALTER TABLE "Memory" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedBy" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isUserEditable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "scope" "MemoryScope" NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN     "status" "MemoryStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "source" SET DEFAULT 'USER_INPUT';

-- CreateTable
CREATE TABLE "MemoryConflict" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memoryId1" TEXT NOT NULL,
    "memoryId2" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "MemoryConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryConflict_userId_idx" ON "MemoryConflict"("userId");

-- CreateIndex
CREATE INDEX "MemoryConflict_memoryId1_idx" ON "MemoryConflict"("memoryId1");

-- CreateIndex
CREATE INDEX "MemoryConflict_memoryId2_idx" ON "MemoryConflict"("memoryId2");

-- CreateIndex
CREATE INDEX "MemoryConflict_resolvedAt_idx" ON "MemoryConflict"("resolvedAt");

-- CreateIndex
CREATE INDEX "Memory_status_idx" ON "Memory"("status");

-- CreateIndex
CREATE INDEX "Memory_scope_idx" ON "Memory"("scope");

-- CreateIndex
CREATE INDEX "Memory_isConfirmed_idx" ON "Memory"("isConfirmed");

-- AddForeignKey
ALTER TABLE "MemoryConflict" ADD CONSTRAINT "MemoryConflict_memoryId1_fkey" FOREIGN KEY ("memoryId1") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryConflict" ADD CONSTRAINT "MemoryConflict_memoryId2_fkey" FOREIGN KEY ("memoryId2") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryConflict" ADD CONSTRAINT "MemoryConflict_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

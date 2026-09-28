-- AlterTable: persist commitment person metadata, extraction confidence and
-- related-entity link (Stage 4). Meeting extraction produced these fields but
-- the Commitment model had nowhere to store them.
ALTER TABLE "Commitment" ADD COLUMN "person" TEXT;
ALTER TABLE "Commitment" ADD COLUMN "personEmail" TEXT;
ALTER TABLE "Commitment" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "Commitment" ADD COLUMN "context" TEXT;
ALTER TABLE "Commitment" ADD COLUMN "relatedEntityType" TEXT;
ALTER TABLE "Commitment" ADD COLUMN "relatedEntityId" TEXT;

-- CreateIndex
CREATE INDEX "Commitment_person_idx" ON "Commitment"("person");

-- CreateIndex
CREATE INDEX "Commitment_confidence_idx" ON "Commitment"("confidence");

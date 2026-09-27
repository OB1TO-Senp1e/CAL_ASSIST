ALTER TABLE "TimeBlock"
ADD COLUMN IF NOT EXISTS "commitmentId" TEXT,
ADD COLUMN IF NOT EXISTS "relatedCommitmentId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TimeBlock_commitmentId_fkey'
  ) THEN
    ALTER TABLE "TimeBlock"
    ADD CONSTRAINT "TimeBlock_commitmentId_fkey"
    FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TimeBlock_relatedCommitmentId_fkey'
  ) THEN
    ALTER TABLE "TimeBlock"
    ADD CONSTRAINT "TimeBlock_relatedCommitmentId_fkey"
    FOREIGN KEY ("relatedCommitmentId") REFERENCES "Commitment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

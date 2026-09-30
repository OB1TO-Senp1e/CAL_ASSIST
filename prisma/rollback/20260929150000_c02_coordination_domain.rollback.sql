-- C-02 LIVE ROLLBACK — PREPARED, DO NOT RUN WITHOUT USER APPROVAL.
-- Reverses exactly what `20260929150000_c02_coordination_domain` applied to the
-- live Supabase DB (accidental deploy 30 Sep). Drops ONLY C-02 objects; the 5
-- tables are brand-new and empty of pre-existing data (no legacy FK points at
-- them). Run against DIRECT_URL only (session :5432), never the pooler.
--
-- Order: FK children -> parents -> enum -> ledger row.

BEGIN;

DROP TABLE IF EXISTS "AiActionLog";
DROP TABLE IF EXISTS "SchedulingPreference";
DROP TABLE IF EXISTS "MeetingProposal";
DROP TABLE IF EXISTS "MeetingParticipant";
DROP TABLE IF EXISTS "Meeting";

DROP TYPE IF EXISTS "MeetingStatus";

DELETE FROM "_prisma_migrations"
 WHERE migration_name = '20260929150000_c02_coordination_domain';

COMMIT;

-- Verify after run:
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_name IN ('Meeting','MeetingParticipant','MeetingProposal',
--                         'SchedulingPreference','AiActionLog');            -- expect 0
--   SELECT count(*) FROM pg_type WHERE typname = 'MeetingStatus';            -- expect 0
--   SELECT count(*) FROM "_prisma_migrations";                               -- expect 11

import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { guardMigrationUrl, selectMigrationUrl } from './src/config/migration-url.guard';

/**
 * Migrations must NEVER run through the Supabase transaction pooler.
 *
 * `.env` DATABASE_URL is the PgBouncer transaction-pooler endpoint (host
 * ...pooler.supabase.com, port 6543, `?pgbouncer=true`). DDL there is unsafe:
 * the pooler multiplexes sessions, so `SET`/prepared statements and
 * multi-statement transaction state do not survive, and Prisma migrate
 * relies on both.
 *
 * DIRECT_URL is the same Supabase host on the session port (5432) with no
 * `pgbouncer=true` — the direct connection required for `migrate`/`db push`.
 * Falling back to DATABASE_URL keeps local/Docker setups (port 5432, no
 * pooler) and CI working, where the two URLs are the same database.
 *
 * The policy lives in `src/config/migration-url.guard.ts` (pure, unit
 * tested). It THROWS for schema-touching commands (`migrate`, `db push`,
 * `db execute`) with an unsafe URL — and ALSO throws for them when no URL
 * at all is resolved, rather than silently falling through to whatever
 * datasource the schema file might imply. Codegen commands
 * (`generate`, `validate`, `studio`) never fail here; they only warn.
 *
 * LIVE-DB SAFETY RAIL (added after the 30 Sep `migrate deploy` leak): an
 * explicit shell opt-in is required before ANY schema-touching command may
 * target a remote (non-loopback, non-compose-service) host. Set
 * `ALLOW_LIVE_MIGRATE=1` or pass `--allow-live-migrate` to deploy to the
 * real database; without it, remote hosts are rejected for migrate/db
 * push/db execute even when the URL is well-formed. This makes "apply to
 * live DB" a deliberate decision, not an accident of environment precedence.
 * Docker Compose service hosts (`postgres`, `db`, `database`) and CI's
 * localhost service container are unaffected.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: guardMigrationUrl(
      [...process.argv, ...(process.env.PRISMA_CLI_ARGS ?? '').split(' ').filter(Boolean)],
      selectMigrationUrl(process.env.DIRECT_URL, process.env.DATABASE_URL),
      {
        allowLive:
          process.env.ALLOW_LIVE_MIGRATE === '1' ||
          process.argv.includes('--allow-live-migrate') ||
          (process.env.PRISMA_CLI_ARGS ?? '').includes('--allow-live-migrate'),
      }
    ),
  },
});


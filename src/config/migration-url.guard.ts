/**
 * Pure helpers backing `prisma.config.ts`'s connection-URL safety check.
 *
 * Policy (C-02 review, item 8):
 *  - A migration URL carrying `pgbouncer=true` is REJECTED: it addresses a
 *    PgBouncer transaction pooler, where DDL and Prisma's
 *    migrate/transaction behaviour are unsafe.
 *  - A migration URL on port 6543 is REJECTED: that is Supabase's
 *    transaction-pooler port regardless of hostname.
 *  - `*.pooler.supabase.com:5432` (Supabase session mode, no `pgbouncer`
 *    param) is ACCEPTED — it is the legitimate `DIRECT_URL` shape on this
 *    project and the only way `prisma migrate` can talk to the live DB.
 *  - The rejection THROWS ONLY when the Prisma CLI is about to touch the
 *    schema: `migrate …`, `db push`, `db execute`. Codegen commands
 *    (`generate`, `studio`, …) never fail here; they only print a warning.
 */

const POOLER_PARAM = /pgbouncer=true/i;
const TRANSACTION_POOLER_PORT = '6543';

/** Selected URL must not carry the transaction-pooler marker. */
export function isPgbouncerUrl(url: string): boolean {
  return POOLER_PARAM.test(url);
}

/** Selected URL must not sit on Supabase's transaction-pooler port. */
export function isTransactionPoolerPort(url: string): boolean {
  try {
    return new URL(url).port === TRANSACTION_POOLER_PORT;
  } catch {
    // Unparseable (e.g. `protocol: postgresql://...` prefixes from config
    // errors, or empty): treat as not-on-6543; other checks still apply.
    return false;
  }
}

/**
 * DIRECT_URL wins when present and non-empty (the direct/session connection
 * required by migrate); otherwise fall back to DATABASE_URL so local/Docker
 * setups (one database, two identical names) keep working.
 */
export function selectMigrationUrl(
  directUrl: string | undefined,
  databaseUrl: string | undefined
): string | undefined {
  if (directUrl && directUrl.trim().length > 0) return directUrl;
  if (databaseUrl && databaseUrl.trim().length > 0) return databaseUrl;
  return undefined;
}

/** Why a URL is unsafe for schema-touching commands, or null if safe. */
export function migrationUrlViolation(url: string): string | null {
  if (isPgbouncerUrl(url)) {
    return (
      'the URL carries `pgbouncer=true` (transaction pooler). Set DIRECT_URL ' +
      'to the direct/session connection (e.g. the same pooler host on :5432, ' +
      'no pgbouncer param) — never the pooler.'
    );
  }
  if (isTransactionPoolerPort(url)) {
    return (
      'the URL targets port ' +
      TRANSACTION_POOLER_PORT +
      " (Supabase's transaction-pooler port). Schema commands need the " +
      'direct/session connection.'
    );
  }
  return null;
}

/**
 * Do the argv of a Prisma CLI invocation denote a schema-touching command?
 * true for `migrate <sub>`, `db push`, `db execute`; false for `generate`,
 * `validate`, `format`, `studio`, `db pull`, `db seed`, help, or anything
 * unrecognized (fail-open for codegen safety).
 */
export function isSchemaTouchingCommand(argv: readonly string[]): boolean {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) return false;
  const positional = args.filter((a) => !a.startsWith('-'));
  const [first, second] = positional;
  if (first === 'migrate') return true;
  if (first === 'db') return second === 'push' || second === 'execute';
  return false;
}

/** True only for localhost/127.0.0.1/::1 hostnames. */
export function isLoopbackHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * Bare single-label hostnames used by Docker Compose/CI service networks
 * (`postgres`, `db`, `database`). These address a container on a private
 * bridge network — they can never be the live managed database and are not
 * "remote" in the sense the live rail cares about. Dotted hostnames
 * (supabase.com, AWS RDS, etc.) are never matched by this rule.
 */
const COMPOSE_SERVICE_HOSTS = new Set(['postgres', 'db', 'database']);

/** True when the host is outside loopback AND not a compose service name. */
export function isLiveRemoteHost(url: string): boolean {
  if (isLoopbackHost(url)) return false;
  try {
    const host = new URL(url).hostname;
    return !COMPOSE_SERVICE_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * Gate function used by prisma.config.ts. Throws only for schema-touching
 * commands with an unsafe selected URL; warns (never throws) otherwise.
 * Returns the URL the datasource should use.
 *
 * `allowLive` (explicit operator opt-in, e.g. ALLOW_LIVE_MIGRATE=1): without
 * it, schema-touching commands are additionally refused for any NON-loopback
 * host. After the 30 Sep incident (a harness env collision let
 * `migrate deploy` reach the live Supabase DB through a technically-valid
 * DIRECT_URL), touching a remote database must be a deliberate decision,
 * not an accident of environment precedence.
 */
export function guardMigrationUrl(
  argv: readonly string[],
  url: string | undefined,
  options: { allowLive?: boolean } = {}
): string {
  if (!url) {
    throw new Error('Prisma config: set DIRECT_URL (direct, non-PgBouncer) or DATABASE_URL.');
  }
  const violation = migrationUrlViolation(url);
  const schemaTouching = isSchemaTouchingCommand(argv);
  if (schemaTouching) {
    if (violation) {
      throw new Error(`Prisma config: migration URL is unsafe — ${violation}`);
    }
    if (!options.allowLive && isLiveRemoteHost(url)) {
      throw new Error(
        'Prisma config: refusing a schema-touching command against a remote/live database ' +
          `(${new URL(url).host}). Set ALLOW_LIVE_MIGRATE=1 (or pass --allow-live-migrate) to ` +
          'explicitly approve touching the live/remote database.'
      );
    }
    return url;
  }
  if (violation) {
    // Codegen path: keep the working command (e.g. `generate`) alive, say it out loud.
    console.warn(
      `Prisma config: migration URL is unsafe — ${violation} ` +
        '(warned only: this command does not touch the schema)'
    );
  }
  return url;
}

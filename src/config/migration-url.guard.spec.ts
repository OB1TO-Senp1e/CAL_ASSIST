import {
  guardMigrationUrl,
  isSchemaTouchingCommand,
  isTransactionPoolerPort,
  isPgbouncerUrl,
  migrationUrlViolation,
  selectMigrationUrl,
} from './migration-url.guard';

/**
 * C-02 review item 8: the pooler guard must be port/param-scoped, NOT
 * hostname-scoped — `pooler.supabase.com:5432` (session mode) is this
 * project's real DIRECT_URL shape and must be ACCEPTED, while
 * `?pgbouncer=true` and the `:6543` transaction-pooler port must be
 * rejected, and rejection must THROW only for schema-touching commands so
 * `prisma generate`/build never break.
 */

const LOCAL = 'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';
const POOLER_SESSION =
  'postgresql://user:pw@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';
const POOLER_TRANSACTION =
  'postgresql://user:pw@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
const POOLER_6543_NO_PARAM =
  'postgresql://user:pw@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';
const NONPOOLER_DIRECT = 'postgresql://user:pw@db.example.supabase.co:5432/postgres';

describe('selectMigrationUrl', () => {
  it('prefers a non-empty DIRECT_URL', () => {
    expect(selectMigrationUrl(POOLER_SESSION, LOCAL)).toBe(POOLER_SESSION);
  });
  it('falls back to DATABASE_URL when DIRECT_URL is missing or blank', () => {
    expect(selectMigrationUrl(undefined, LOCAL)).toBe(LOCAL);
    expect(selectMigrationUrl('', LOCAL)).toBe(LOCAL);
    expect(selectMigrationUrl('   ', LOCAL)).toBe(LOCAL);
  });
  it('returns undefined when neither is set', () => {
    expect(selectMigrationUrl(undefined, undefined)).toBeUndefined();
  });
});

describe('isPgbouncerUrl / isTransactionPoolerPort', () => {
  it('flags ?pgbouncer=true', () => {
    expect(isPgbouncerUrl(POOLER_TRANSACTION)).toBe(true);
    expect(isPgbouncerUrl(POOLER_SESSION)).toBe(false);
  });
  it('flags port 6543 regardless of hostname', () => {
    expect(isTransactionPoolerPort(POOLER_TRANSACTION)).toBe(true);
    expect(isTransactionPoolerPort(POOLER_6543_NO_PARAM)).toBe(true);
    expect(isTransactionPoolerPort('postgresql://u:p@localhost:6543/db')).toBe(true);
    expect(isTransactionPoolerPort(LOCAL)).toBe(false);
  });
  it('does not choke on unparseable URLs', () => {
    expect(isTransactionPoolerPort('not a url')).toBe(false);
  });
});

describe('migrationUrlViolation', () => {
  it('accepts direct local, non-pooler and pooler-session :5432 URLs', () => {
    expect(migrationUrlViolation(LOCAL)).toBeNull();
    expect(migrationUrlViolation(NONPOOLER_DIRECT)).toBeNull();
    // The approved semantics: hostname `pooler.supabase.com` on 5432 without
    // pgbouncer param is the legitimate DIRECT_URL — must NOT be rejected.
    expect(migrationUrlViolation(POOLER_SESSION)).toBeNull();
  });
  it('rejects pgbouncer=true and :6543 with actionable messages', () => {
    expect(migrationUrlViolation(POOLER_TRANSACTION)).toMatch(/pgbouncer=true/);
    expect(migrationUrlViolation(POOLER_6543_NO_PARAM)).toMatch(/6543/);
  });
});

describe('isSchemaTouchingCommand', () => {
  it.each<[string[], boolean]>([
    [['node', 'prisma', 'migrate', 'deploy'], true],
    [['node', 'prisma', 'migrate', 'dev'], true],
    [['node', 'prisma', 'migrate', 'diff'], true],
    [['node', 'prisma', 'db', 'push'], true],
    [['node', 'prisma', 'db', 'execute'], true],
  ])('throws-class for %s', (argv, expected) => {
    expect(isSchemaTouchingCommand(argv)).toBe(expected);
  });
  const codegenArgv: string[][] = [
    ['node', 'prisma', 'generate'],
    ['node', 'prisma', 'validate'],
    ['node', 'prisma', 'format'],
    ['node', 'prisma', 'studio'],
    ['node', 'prisma', 'db', 'pull'],
    ['node', 'prisma', 'db', 'seed'],
    ['node', 'prisma', 'migrate', '--help'],
    ['node', 'prisma'],
  ];
  for (const argv of codegenArgv) {
    it(`codegen/other-class for ${argv.join(' ')}`, () => {
      expect(isSchemaTouchingCommand(argv)).toBe(false);
    });
  }
});

describe('guardMigrationUrl', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warnSpy.mockRestore());

  it('throws for schema-touching commands with a pooler URL', () => {
    expect(() =>
      guardMigrationUrl(['node', 'prisma', 'migrate', 'deploy'], POOLER_TRANSACTION, {
        allowLive: true,
      })
    ).toThrow(/pgbouncer=true/);
    expect(() =>
      guardMigrationUrl(['node', 'prisma', 'db', 'push'], POOLER_6543_NO_PARAM, { allowLive: true })
    ).toThrow(/6543/);
  });
  it('only WARNS for generate even with a pooler URL (build/codegen never break)', () => {
    expect(guardMigrationUrl(['node', 'prisma', 'generate'], POOLER_TRANSACTION)).toBe(
      POOLER_TRANSACTION
    );
    expect(warnSpy).toHaveBeenCalled();
  });
  it('passes a loopback URL through for every command without opt-in', () => {
    expect(guardMigrationUrl(['node', 'prisma', 'migrate', 'deploy'], LOCAL)).toBe(LOCAL);
    expect(guardMigrationUrl(['node', 'prisma', 'generate'], LOCAL)).toBe(LOCAL);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('accepts the real DIRECT_URL shape for codegen without opt-in', () => {
    expect(guardMigrationUrl(['node', 'prisma', 'generate'], POOLER_SESSION)).toBe(POOLER_SESSION);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('REFUSES schema-touching commands against a remote host without opt-in', () => {
    // The 30 Sep incident rail: a well-formed remote DIRECT_URL is not enough;
    // touching a remote DB needs ALLOW_LIVE_MIGRATE=1.
    expect(() =>
      guardMigrationUrl(['node', 'prisma', 'migrate', 'deploy'], POOLER_SESSION)
    ).toThrow(/remote\/live/);
    expect(() => guardMigrationUrl(['node', 'prisma', 'db', 'push'], NONPOOLER_DIRECT)).toThrow(
      /ALLOW_LIVE_MIGRATE/
    );
  });
  it('does NOT block Docker Compose service hosts (postgres/db/database)', () => {
    const composeUrl = 'postgresql://calassist:pw@postgres:5432/calassist?schema=public';
    expect(guardMigrationUrl(['node', 'prisma', 'migrate', 'deploy'], composeUrl)).toBe(composeUrl);
  });
  it('allows the pooler-session :5432 shape for schema commands WITH explicit live opt-in', () => {
    expect(
      guardMigrationUrl(['node', 'prisma', 'migrate', 'deploy'], POOLER_SESSION, {
        allowLive: true,
      })
    ).toBe(POOLER_SESSION);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('throws when no URL is configured at all', () => {
    expect(() => guardMigrationUrl(['node', 'prisma', 'generate'], undefined)).toThrow(
      /set DIRECT_URL/
    );
  });
});

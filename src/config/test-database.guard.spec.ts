import { isLoopbackDatabaseUrl, resolveSafeTestDatabaseUrl } from './test-database.guard';

/**
 * C-02 review item 9: DB-writing specs may only touch a loopback database or
 * an explicit TEST_DATABASE_URL — never the live URL a developer's `.env`
 * carries.
 */

describe('isLoopbackDatabaseUrl', () => {
  it('accepts localhost forms', () => {
    expect(isLoopbackDatabaseUrl('postgresql://postgres:pw@localhost:5432/db')).toBe(true);
    expect(isLoopbackDatabaseUrl('postgresql://postgres:pw@127.0.0.1:5433/db')).toBe(true);
    expect(isLoopbackDatabaseUrl('postgresql://postgres:pw@[::1]:5432/db')).toBe(true);
  });
  it('rejects remote hosts including Supabase poolers', () => {
    expect(
      isLoopbackDatabaseUrl('postgresql://u:p@aws-0.pooler.supabase.com:6543/db?pgbouncer=true')
    ).toBe(false);
    expect(isLoopbackDatabaseUrl('postgresql://u:p@db.example.supabase.co:5432/db')).toBe(false);
    expect(isLoopbackDatabaseUrl('not a url')).toBe(false);
  });
});

describe('resolveSafeTestDatabaseUrl', () => {
  const LIVE = 'postgresql://u:p@aws-0.pooler.supabase.com:6543/postgres?pgbouncer=true';
  const LOCAL = 'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';

  it('prefers TEST_DATABASE_URL even when DATABASE_URL is live', () => {
    expect(resolveSafeTestDatabaseUrl({ TEST_DATABASE_URL: LOCAL, DATABASE_URL: LIVE })).toBe(
      LOCAL
    );
  });
  it('refuses a live DATABASE_URL (returns undefined -> specs skip)', () => {
    expect(resolveSafeTestDatabaseUrl({ DATABASE_URL: LIVE })).toBeUndefined();
  });
  it('allows a loopback DATABASE_URL when TEST_DATABASE_URL is absent', () => {
    expect(resolveSafeTestDatabaseUrl({ DATABASE_URL: LOCAL })).toBe(LOCAL);
  });
  it('returns undefined when nothing is configured', () => {
    expect(resolveSafeTestDatabaseUrl({})).toBeUndefined();
  });
});

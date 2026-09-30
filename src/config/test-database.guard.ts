/**
 * C-02 review item 9 (test-DB safety): DB-writing Jest tests must refuse to
 * run against anything but a loopback database or an explicit
 * TEST_DATABASE_URL. A developer's real `.env` points DATABASE_URL at the
 * live Supabase pooler; the Jest suite must never read or write it.
 *
 * These are pure functions so they can be unit-tested without a database.
 */

/** True only for localhost/127.0.0.1/::1 hostnames. */
export function isLoopbackDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * The only URL a DB-backed spec may use: TEST_DATABASE_URL if set, else
 * DATABASE_URL but only when it is loopback. Anything else (e.g. the live
 * Supabase pooler URL from a developer's `.env`) resolves to undefined, and
 * the spec must skip — never connect.
 */
export function resolveSafeTestDatabaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  const explicit = env.TEST_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const candidate = env.DATABASE_URL?.trim();
  if (!candidate) return undefined;
  return isLoopbackDatabaseUrl(candidate) ? candidate : undefined;
}

/**
 * Jest globalSetup: decide, before test collection, whether DB-backed
 * integration specs (account deletion, PKCE store) may run at all.
 *
 * C-02 review item 9: this setup NEVER loads `.env`. A DB-backed test may
 * only use TEST_DATABASE_URL (shell or CI) or a loopback DATABASE_URL
 * exported in the shell. A live URL — e.g. the Supabase pooler in a
 * developer's `.env` — is not even read, let alone probed or connected to.
 * When no safe URL exists, DB_REACHABLE=0 and the DB specs skip.
 *
 * Never fails the suite.
 */
const net = require('net');
const { URL } = require('url');

// Deliberately NO `require('dotenv').config()` here (item 9).

function isLoopback(urlString) {
  try {
    const host = new URL(urlString).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

function resolveSafeTestDatabaseUrl(env) {
  const explicit = env.TEST_DATABASE_URL && env.TEST_DATABASE_URL.trim();
  if (explicit) return explicit;
  const candidate = env.DATABASE_URL && env.DATABASE_URL.trim();
  if (!candidate) return undefined;
  return isLoopback(candidate) ? candidate : undefined;
}

function probe(urlString) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      resolve(false);
      return;
    }
    const host = parsed.hostname;
    const port = Number(parsed.port || 5432);
    const socket = new net.Socket();
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(3000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

module.exports = async function globalSetup() {
  const safeUrl = resolveSafeTestDatabaseUrl(process.env);
  if (!safeUrl) {
    // No safe URL configured: DB specs must skip, and nothing is probed.
    process.env.DB_REACHABLE = '0';
    return;
  }
  process.env.TEST_DATABASE_URL = safeUrl;
  process.env.DB_REACHABLE = (await probe(safeUrl)) ? '1' : '0';
};


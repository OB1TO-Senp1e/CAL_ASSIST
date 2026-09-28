/**
 * Jest globalSetup: probe the dev database once, before test collection, so
 * DB-backed integration specs (e.g. account deletion) can decide at collection
 * time whether to run or surface as skipped. Never fails the suite.
 */
const net = require('net');
const { URL } = require('url');

require('dotenv').config();

module.exports = async function globalSetup() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';
  let reachable = false;
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname;
    const port = Number(parsed.port || 5432);
    reachable = await new Promise((resolve) => {
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
  } catch {
    reachable = false;
  }
  process.env.DB_REACHABLE = reachable ? '1' : '0';
};

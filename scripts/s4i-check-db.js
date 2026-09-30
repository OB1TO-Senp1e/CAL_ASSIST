// Stage 4i DB-side truth check: proves the connections scrub is a projection
// (select), not data loss — tokens + per-calendar delta cursor must still
// exist in Postgres for a connected user. Run with the userId printed by
// scripts/s4i-probe.ps1 (arg 1) while its LOCAL connection is still active.
require('dotenv').config({ override: true });
const { Client } = require('pg');

const userId = process.argv[2];
if (!userId) {
  console.error('usage: node scripts/s4i-check-db.js <userId>');
  process.exit(2);
}

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const client = new Client({ connectionString: url, ssl: /supabase|postgres\.vercel/.test(url) ? { rejectUnauthorized: false } : undefined });
  await client.connect();

  const connRes = await client.query(
    'SELECT id, "accessToken", "refreshToken", "syncToken", "lastSync" FROM "CalendarConnection" WHERE "userId" = $1 AND "provider" = $2',
    [userId, 'LOCAL'],
  );
  if (!connRes.rows.length) {
    console.log('FAIL  no LOCAL CalendarConnection row for user');
    await client.end();
    process.exit(1);
  }
  const c = connRes.rows[0];
  console.log(`PASS  connection row present (id=${c.id})`);
  console.log(`${c.accessToken ? 'PASS ' : 'FAIL '} accessToken persisted server-side`);
  console.log(`${c.refreshToken ? 'PASS ' : 'FAIL '} refreshToken persisted server-side`);

  const calRes = await client.query(
    'SELECT id, "externalId", "syncToken" FROM "Calendar" WHERE "connectionId" = $1',
    [c.id],
  );
  console.log(`${calRes.rows.length ? 'PASS ' : 'FAIL '} calendar rows linked by FK (count=${calRes.rows.length})`);
  for (const r of calRes.rows) {
    console.log(`      calendar ${r.id} externalId=${r.externalId} syncToken=${r.syncToken ? r.syncToken : '(none)'}`);
  }
  const withCursor = calRes.rows.filter((r) => r.syncToken).length;
  console.log(`${withCursor >= 1 ? 'PASS ' : 'FAIL '} per-calendar delta cursor persisted (${withCursor}/${calRes.rows.length})`);

  await client.end();
  const ok = !!c.accessToken && !!c.refreshToken && calRes.rows.length > 0 && withCursor >= 1;
  console.log('==================================================');
  console.log(ok ? 'S4I DB CHECK: ALL PASS' : 'S4I DB CHECK: FAILURES');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('S4I DB CHECK ERROR:', e.message);
  process.exit(1);
});

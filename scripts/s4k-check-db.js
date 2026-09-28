// Stage 4k pre/post-migration audit of the permissions/rule-conflict compat
// JSON. Run before migrating to see what legacy rows exist, and after to prove
// the migration moved them into the dedicated columns/tables.
require('dotenv').config({ override: true });
const { Client } = require('pg');

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const client = new Client({ connectionString: url, ssl: /supabase|postgres\.vercel/.test(url) ? { rejectUnauthorized: false } : undefined });
  await client.connect();

  const legacyCols = await client.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='Permission' ORDER BY column_name`,
  );
  console.log('Permission columns now:');
  for (const r of legacyCols.rows) {
    console.log(`  ${r.column_name}  ${r.data_type}${r.udt_name !== r.data_type ? ` (${r.udt_name})` : ''}`);
  }

  // Show whether the dedicated structures from the 4k migration exist yet.
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name IN ('RuleConflict','AutonomyPolicy')`,
  );
  console.log(`  dedicated tables present: ${tables.rows.map((r) => r.table_name).sort().join(', ') || '(none)'}`);

  const counts = await client.query(
    `SELECT
       (SELECT count(*) FROM "Permission")::int AS permissions,
       (SELECT count(*) FROM "AutonomyPolicy")::int AS policies,
       (SELECT count(*) FROM "RuleConflict")::int AS conflicts`,
  );
  console.log(`  rows: permissions=${counts.rows[0].permissions} policies=${counts.rows[0].policies} conflicts=${counts.rows[0].conflicts}`);

  await client.end();
}

main().catch((e) => {
  console.error('S4K DB CHECK ERROR:', e.message);
  process.exit(1);
});

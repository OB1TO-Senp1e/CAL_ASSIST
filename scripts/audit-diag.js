require('dotenv/config');
const { Client } = require('pg');

const raw = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');

async function main() {
  const c = new Client({ connectionString: raw, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log('--- last 5 Intent rows ---');
  const intents = await c.query(
    'select id, "originalText", "parsedJson", "errorMessage", "createdAt" from "Intent" order by "createdAt" desc limit 5'
  );
  for (const r of intents.rows) {
    console.log(`\n[${r.createdAt.toISOString()}] ${r.originalText}`);
    console.log(`  errorMessage: ${r.errorMessage ?? '(none)'}`);
    console.log(`  parsed: ${r.parsedJson}`);
  }

  console.log('\n--- last 5 AssistantAction rows ---');
  const acts = await c.query(
    'select id, "actionType", parameters, "wasApplied", outcome, "createdAt" from "AssistantAction" order by "createdAt" desc limit 5'
  );
  if (acts.rows.length === 0) console.log('  (none)');
  for (const r of acts.rows) {
    console.log(`\n[${r.createdAt.toISOString()}] ${r.actionType} applied=${r.wasApplied}`);
    console.log(`  params: ${JSON.stringify(r.parameters)}`);
    console.log(`  outcome: ${JSON.stringify(r.outcome)}`);
  }

  console.log('\n--- ConversationMessage modelOutput (last 4 assistant turns) ---');
  const msgs = await c.query(
    `select role, content, "modelOutput", "createdAt" from "ConversationMessage" where role = 'ASSISTANT' order by "createdAt" desc limit 4`
  );
  for (const r of msgs.rows) {
    console.log(`\n[${r.createdAt.toISOString()}] ${r.content.slice(0, 120)}`);
    console.log(`  modelOutput: ${r.modelOutput}`);
  }

  console.log('\n--- Task rows ---');
  const tasks = await c.query('select id, title, "createdAt" from "Task" order by "createdAt" desc limit 5');
  if (tasks.rows.length === 0) console.log('  (none)');
  for (const r of tasks.rows) console.log(`  ${r.title} (${r.createdAt.toISOString()})`);

  await c.end();
}

main().catch((e) => {
  console.error('diag failed:', e.message);
  process.exit(1);
});
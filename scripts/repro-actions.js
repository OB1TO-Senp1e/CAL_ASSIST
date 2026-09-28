/**
 * Reproduces the orchestrator's action-extraction LLM call for a stored intent
 * so we can see exactly why proposals are dropped.
 *
 * Usage: node scripts/repro-actions.js "<user message>"
 */
require('dotenv/config');
const { Client } = require('pg');

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.AUDIT_TOKEN || '';
const MESSAGE = process.argv[2] || 'Create task review Q4 budget tomorrow at 10am for 45 minutes';

function env(name, fallback) {
  const m = (require('fs').readFileSync('.env', 'utf8') || '').match(new RegExp(`^${name}=(.*)$`, 'm'));
  const v = m ? m[1].trim().replace(/^"|"$/g, '') : '';
  return v || fallback;
}

async function main() {
  // 1. Stored intent (the parser output that feeds the orchestrator)
  const c = new Client({
    connectionString: (process.env.DATABASE_URL || '').replace(/^"|"$/g, ''),
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { rows } = await c.query(
    'select "parsedJson" from "Intent" where "originalText" = $1 order by "createdAt" desc limit 1',
    [MESSAGE]
  );
  await c.end();
  if (!rows.length) {
    console.log(`No stored intent for "${MESSAGE}"`);
    return;
  }
  const intent = JSON.parse(rows[0].parsedJson);
  console.log('INTENT:', JSON.stringify(intent));

  // 2. Same tool list the orchestrator embeds in its prompt
  const toolsRes = await fetch(`${BASE}/api/assistant/tools`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const tools = await toolsRes.json();
  if (!Array.isArray(tools)) {
    console.log('Could not load tools (set AUDIT_TOKEN):', JSON.stringify(tools).slice(0, 200));
    return;
  }

  const context = {
    timezone: 'UTC',
    currentTime: new Date(),
    workingHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
    activeGoals: [],
    upcomingEvents: [],
    pendingTasks: [],
  };

  const prompt = `
You are CalAssist's assistant orchestrator. Based on the user's intent and available tools, determine which tools to call.

User Intent: ${JSON.stringify(intent)}
Available Tools: ${JSON.stringify(
    tools.map((t) => ({ name: t.name, description: t.description, category: t.category, confirmationLevel: t.confirmationLevel }))
  )}

Context:
- Timezone: ${context.timezone}
- Current time: ${context.currentTime.toISOString()}
- Working hours: ${JSON.stringify(context.workingHours)}
- Active goals: 0
- Upcoming events: 0
- Pending tasks: 0

Respond with valid JSON array of actions:
[
  {
    "toolName": "tool_name",
    "input": { ... },
    "reasoning": "why this tool",
    "confidence": 0.9,
    "requiresConfirmation": true/false,
    "confirmationLevel": "NONE|LOW|MEDIUM|HIGH|CRITICAL"
  }
]
`;

  const model = env('OLLAMA_MODEL', 'gpt-oss:20b');
  const key = env('OLLAMA_API_KEY', '');
  const url = `${env('OLLAMA_BASE_URL', 'https://ollama.com/v1')}/chat/completions`;

  console.log(`\nCalling ${url} with model ${model}...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 3000,
      stream: false,
    }),
  });
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? '';
  console.log(`HTTP ${res.status}`);
  console.log('\n=== RAW MODEL OUTPUT ===');
  console.log(raw);

  console.log('\n=== PARSED ===');
  try {
    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    console.log(JSON.stringify(parsed, null, 2));
    const actions = Array.isArray(parsed) ? parsed : parsed?.actions;
    if (Array.isArray(actions) && actions.length) {
      for (const a of actions) {
        console.log(`\n-- action ${a.toolName} --`);
        console.log('  input:', JSON.stringify(a.input));
      }
    }
  } catch (e) {
    console.log('JSON parse failed:', e.message);
  }
}

main().catch((e) => {
  console.error('repro failed:', e.message);
  process.exit(1);
});
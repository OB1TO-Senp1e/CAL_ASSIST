/**
 * Live end-to-end audit for CalAssist.
 *
 * Verifies: health, DB reachability, user inventory, auth (login/register),
 * AI provider reachability (Ollama Cloud), and the assistant pipeline
 * (POST /api/assistant/message -> proposals -> POST /api/assistant/confirm).
 *
 * Usage:  node scripts/audit-live.js
 */
require('dotenv/config');
const { Client } = require('pg');

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'testpassword123';

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

async function getJson(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function pgClient() {
  const raw = process.env.DATABASE_URL || '';
  const client = new Client({ connectionString: raw.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function main() {
  console.log(`=== CalAssist live audit against ${BASE} ===\n`);

  try {
    const health = await getJson('/api/health');
    record('GET /api/health', health.status === 200 && health.body?.status === 'ok', `HTTP ${health.status} ${JSON.stringify(health.body)}`);
  } catch (e) {
    record('GET /api/health', false, e.message);
  }

  for (const path of ['/api/health/live', '/api/health/ready']) {
    try {
      const r = await getJson(path);
      record(`GET ${path}`, r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
    } catch (e) {
      record(`GET ${path}`, false, e.message);
    }
  }

  try {
    const client = await pgClient();
    const { rows } = await client.query('select id, email, name from "User" order by "createdAt" asc limit 10');
    await client.end();
    record('Postgres: User inventory', rows.length > 0, `${rows.length} user(s): ${rows.map((r) => r.email).join(', ')}`);
  } catch (e) {
    record('Postgres: User inventory', false, e.message);
  }

  try {
    const r = await getJson('/api/assistant/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'what is on my schedule today' }),
    });
    record('Auth guard on /api/assistant/message', r.status === 401, `HTTP ${r.status} (expected 401)`);
  } catch (e) {
    record('Auth guard on /api/assistant/message', false, e.message);
  }

  let token = null;
  const registerPayload = {
    email: `audit.${Date.now()}@calassist.local`,
    password: TEST_PASSWORD,
    name: 'Audit User',
  };
  const attempts = [
    ['login (seeded test user)', '/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD }],
    ['login (primary user)', '/auth/login', { email: 'regrados2406@gmail.com', password: TEST_PASSWORD }],
    ['register (audit user)', '/auth/register', registerPayload],
    ['login (audit user)', '/auth/login', { email: registerPayload.email, password: registerPayload.password }],
  ];
  for (const [label, path, payload] of attempts) {
    if (token) break;
    try {
      const r = await getJson(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const accessToken = r.body?.access_token;
      if (accessToken) {
        token = accessToken;
        record(`Auth: ${label}`, true, `HTTP ${r.status} as ${r.body?.user?.email ?? r.body?.email}`);
      } else {
        console.log(`INFO  Auth: ${label} -> HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 140)}`);
      }
    } catch (e) {
      console.log(`INFO  Auth: ${label} -> ${e.message}`);
    }
  }
  if (!token) record('Auth: obtain JWT', false, 'no login or register strategy produced a token');

  if (!token) {
    console.log('\nNo JWT obtained; skipping authenticated assistant checks.');
  } else {
    await auditAuthenticated(token);
  }

  console.log('\n=== SUMMARY ===');
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} checks passed`);
  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(` - ${f.name}: ${f.detail}`);
  }
}

async function auditAuthenticated(token) {
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  try {
    const r = await getJson('/api/users/me', { headers: authHeaders });
    record('GET /api/users/me', r.status === 200, `HTTP ${r.status} ${r.body?.email ?? ''}`);
  } catch (e) {
    record('GET /api/users/me', false, e.message);
  }

  try {
    const r = await getJson('/api/assistant/tools', { headers: authHeaders });
    const names = Array.isArray(r.body) ? r.body.map((t) => t.name) : [];
    record('GET /api/assistant/tools', r.status === 200 && names.length > 0, `HTTP ${r.status} ${names.length} tools: ${names.slice(0, 6).join(', ')}`);
  } catch (e) {
    record('GET /api/assistant/tools', false, e.message);
  }

  let proposals = [];
  let conversationId = null;
  try {
    const started = Date.now();
    const r = await getJson('/api/assistant/message', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ message: 'Create task review Q4 budget tomorrow at 10am for 45 minutes' }),
    });
    const elapsed = Date.now() - started;
    conversationId = r.body?.conversationId ?? null;
    proposals = r.body?.proposedActions ?? [];
    record(
      'POST /api/assistant/message (create task)',
      r.status === 200 || r.status === 201,
      `HTTP ${r.status} in ${elapsed}ms; content="${String(r.body?.content ?? '').slice(0, 90)}"; proposals=${proposals.length}`
    );
    record(
      'Assistant produced an actionable proposal',
      proposals.length > 0,
      proposals.map((p) => `${p.toolName}${p.input?.title ? `:${p.input.title}` : ''}`).join(' | ') || JSON.stringify(r.body).slice(0, 200)
    );
  } catch (e) {
    record('POST /api/assistant/message (create task)', false, e.message);
  }

  const action = proposals.find((p) => p.toolName === 'create_task') || proposals[0];
  if (action) {
    try {
      const r = await getJson('/api/assistant/confirm', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ actionId: action.id, confirmed: true }),
      });
      record('POST /api/assistant/confirm', r.status === 200 || r.status === 201, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    } catch (e) {
      record('POST /api/assistant/confirm', false, e.message);
    }

    try {
      const client = await pgClient();
      const { rows } = await client.query('select id, title, "createdAt" from "Task" order by "createdAt" desc limit 3');
      await client.end();
      record('Confirm persisted a Task row', rows.length > 0, rows.map((x) => x.title).join(' | '));
    } catch (e) {
      record('Confirm persisted a Task row', false, e.message);
    }
  }

  try {
    const r = await getJson('/api/assistant/message', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ message: 'What is on my schedule today?', conversationId }),
    });
    const writeProposals = (r.body?.proposedActions ?? []).filter((p) => /create_|update_|delete_|move_/.test(p.toolName));
    record('Read-only turn stays read-only', r.status < 300 && writeProposals.length === 0, `HTTP ${r.status}; writeProposals=${writeProposals.length}; content="${String(r.body?.content ?? '').slice(0, 90)}"`);
  } catch (e) {
    record('Read-only turn stays read-only', false, e.message);
  }

  try {
    const r = await getJson('/api/assistant/conversations', { headers: authHeaders });
    record('GET /api/assistant/conversations', r.status === 200 && Array.isArray(r.body), `HTTP ${r.status} ${Array.isArray(r.body) ? `${r.body.length} conversation(s)` : ''}`);
    if (Array.isArray(r.body) && r.body.length > 0) {
      const msgs = await getJson(`/api/assistant/conversations/${r.body[0].id}/messages`, { headers: authHeaders });
      record('GET /api/assistant/conversations/:id/messages', msgs.status === 200 && Array.isArray(msgs.body), `HTTP ${msgs.status} ${Array.isArray(msgs.body) ? `${msgs.body.length} message(s)` : ''}`);
    }
  } catch (e) {
    record('GET /api/assistant/conversations', false, e.message);
  }

  for (const path of ['/api/context/user', '/api/assistant/recommendations', '/api/metrics']) {
    try {
      const r = await getJson(path, { headers: authHeaders });
      record(`GET ${path}`, r.status < 400, `HTTP ${r.status}`);
    } catch (e) {
      record(`GET ${path}`, false, e.message);
    }
  }
}

main().catch((e) => {
  console.error('Audit crashed:', e);
  process.exit(1);
});
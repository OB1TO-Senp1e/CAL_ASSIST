// Tests raw pg auth for DATABASE_URL/DIRECT_URL exactly as written in .env (override:true),
// then also tries the local Postgres as a fallback target.
require("dotenv").config({ override: true });
const { Client } = require("pg");

function parts(url) {
  const m = url.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^/]+)\/(\w+)(\?.*)?$/);
  if (!m) return null;
  return { user: m[2], pw: decodeURIComponent(m[3]), hostport: m[4], db: m[5] };
}

async function test(label, url) {
  if (!url) return console.log(label + " : not set");
  const p = parts(url);
  if (!p) return console.log(label + " regex parse fail");
  const [host, port] = p.hostport.split(":");
  const c = new Client({
    host,
    port: +port,
    user: p.user,
    password: p.pw,
    database: p.db,
    ssl: host.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await c.connect();
    const r = await c.query("select current_database() as db, version() as v");
    console.log(label + " AUTH OK -> db=" + r.rows[0].db + " | " + r.rows[0].v.split(" ")[1]);
  } catch (e) {
    console.log(label + " FAIL: " + String(e.message).split("\n")[0].slice(0, 160) +
      " (user=" + p.user + ", host=" + p.hostport + ")");
  } finally {
    await c.end().catch(() => {});
  }
}

(async () => {
  await test("env DATABASE_URL", process.env.DATABASE_URL);
  await test("env DIRECT_URL  ", process.env.DIRECT_URL);
  await test("local fallback  ", "postgresql://postgres:postgres@localhost:5432/calassist");
})();

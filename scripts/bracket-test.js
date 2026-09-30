// Try candidate passwords against the Supabase pooler to find the working one.
require("dotenv").config({ override: true });
const { Client } = require("pg");
const m = process.env.DATABASE_URL.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^/]+)\/(\w+)/);
const user = m[2];
const [host, port] = m[4].split(":");
const candidates = ["Biswajitdey@2466", "[Biswajitdey@2466]", "Biswajitdey2466", "postgres"];
(async () => {
  for (const pw of candidates) {
    const c = new Client({ host, port: +port, user, password: pw, database: "postgres", ssl: { rejectUnauthorized: false } });
    try {
      await c.connect();
      const r = await c.query("select count(*)::int as c from public.\"_prisma_migrations\"");
      console.log("PASSWORD MATCHES: [" + pw + "]  _prisma_migrations rows=" + r.rows[0].c);
      await c.end();
      break;
    } catch (e) {
      console.log("no: [" + pw + "] -> " + String(e.message).split("\n")[0].slice(0, 90));
      await c.end().catch(() => {});
    }
  }
})();

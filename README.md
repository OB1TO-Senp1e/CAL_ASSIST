# CalAssist - AI-Powered Personal Time Operating System

## Overview

CalAssist is not a calendar application — it's an AI-powered Personal Time Operating System that manages the full lifecycle of your time:

**Intent → Planning → Scheduling → Execution → Reality Detection → Replanning → Learning**

## Architecture

### Core Engines

- **Context Engine**: Assembles unified context from all data sources
- **Memory Engine**: Long-term memory management with embeddings
- **Assistant Orchestrator**: Coordinates all components

### AI Engines

- **Intent Parser**: Natural language understanding
- **Planning Engine**: Goal decomposition into tasks
- **Scheduling Engine**: Time optimization and conflict detection
- **Reality Engine**: Execution monitoring and anomaly detection
- **Replanning Engine**: Dynamic schedule adjustment

### Domain Engines

- **Goal Engine**: Goal lifecycle management
- **Commitment Engine**: External commitment tracking
- **Project Engine**: Project decomposition
- **Task Engine**: Task management with dependencies

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL 14+
- npm/yarn

### Installation

1. Clone and install dependencies:

```bash
cd CAL_ASSIST
npm ci
cd client
npm ci
cd ..
```

2. Set up environment:

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Generate Prisma client:

```bash
npx prisma generate
```

4. Run migrations:

```bash
npx prisma migrate dev --name init
```

### Development

Start the development server:

```bash
npm run start:dev
```

Run tests:

```bash
npm test
npm run test:coverage
```

### Performance checks

The CI test job builds the frontend and checks the gzipped JavaScript required
for the authenticated home route (entry, dashboard shell, and Today page). The
budget is 10% above the measured baseline in `scripts/perf-budget-check.mjs`.
Run the same check locally with:

```bash
npm ci --prefix client --legacy-peer-deps
npm run perf:budget
npm run test:perf-budget
```

For API timings, start the backend against a **local seeded development
database**, then provide a development user's JWT. The script sends only
loopback GET requests for the one-year event list, calendar connections, and
assistant reads; it does not seed data, write records, or call an LLM:

```powershell
$env:PERF_BASE_URL = "http://localhost:3000"
$env:PERF_TOKEN = "<development-user-jwt>"
$env:PERF_ITERATIONS = "20"
node scripts/perf-smoke.mjs
```

The API benchmark refuses non-loopback hosts. To include Prisma query output,
set `PRISMA_QUERY_LOGGING=true` while `NODE_ENV=development`; query logging is
disabled in other environments.

## Running behind the load balancer

The Compose stack routes public API requests through Traefik v3 on
`http://localhost:${TRAEFIK_HTTP_PORT:-8080}`. Requests with the `/api` prefix
and existing unprefixed `/auth` login/OAuth paths are routed to the API. The
root path and client-side routes are served by a separate, unprivileged Nginx
frontend container; Vite assets are compressed and content-hashed assets are
cached immutably. Health endpoints (`/health/live`, `/health/ready`,
`/health/deps`) and
Prometheus metrics (`/metrics`) are internal-only and return 404 publicly;
Traefik checks each API replica at `/health/ready`. Liveness does not depend
on services, readiness requires PostgreSQL, and `/health/deps` reports Redis
as `down` with an overall `degraded` status when Redis is unavailable without
removing otherwise-ready API replicas from service.

`CORS_ALLOWED_ORIGINS` is a comma-separated allow-list of HTTP(S) origins
(scheme, host, and optional port only); wildcard origins and URL paths are
rejected at startup. It falls back to `FRONTEND_URL`, then
`http://localhost:3001`. The `/auth/test-user*` diagnostic endpoints are
available only outside production and return 404 when `NODE_ENV=production`.
The former `/api/health` route is not exposed; use the internal `/health/*`
probes instead.

Start the stack with the intended maximum replica count already budgeted:

```powershell
$env:API_REPLICA_COUNT = "3"
docker compose up -d --build --scale api=3
docker compose ps
```

The API and frontend have no host port mappings. Traefik is the only service
publishing a host port; PostgreSQL, Redis, Prometheus, and Grafana are reachable
only on the Compose network. Enable the optional monitoring services with
`GRAFANA_PASSWORD` set from secret storage, then
`docker compose -f docker-compose.yml -f docker-compose.monitoring.yml --profile monitoring up -d prometheus grafana redis-exporter`.
Traefik checks each backend's readiness and uses a network-error circuit
breaker. It deliberately does not retry API requests: automatic retries of
write requests can duplicate side effects when a backend fails after committing.
Prometheus resolves the `api` service through DNS and scrapes each replica
directly at `/metrics`; the metrics endpoint is not published through Traefik.
The Grafana dashboard and Prometheus data source are provisioned from the
repository. Provisioned rules cover unavailable replicas, missing targets,
5xx rate, p95 latency, Redis availability and memory above 80% of `maxmemory`,
and degraded distributed throttling during a Redis outage. Without an Alertmanager
configuration, firing rules are visible in Prometheus but are not delivered
to an external paging system.

For a lightweight local comparison, the k6 profile exercises only
`GET /api/status` with at most two virtual users. Replace the network name with
the Compose project network in use:

```powershell
$network = "cal_assist_calassist-network"
$scriptPath = (Resolve-Path ".\scripts\load-test.js").Path
docker run --rm --network $network `
  --mount "type=bind,source=$scriptPath,target=/scripts/load-test.js,readonly" `
  -e BASE_URL=https://traefik -e HOST_HEADER=localhost `
  -e INSECURE_SKIP_TLS_VERIFY=true grafana/k6:0.58.0 run /scripts/load-test.js
```

This profile checks routing and a small latency/error baseline; it is not a
capacity benchmark. Use representative, anonymized data and business endpoints
before setting a production replica or throughput limit.

### Database migrations and background work

Compose runs `prisma migrate deploy` once in the one-shot `migrate` service
before starting any API replicas. The production API checks the migration
history at startup and refuses to serve traffic while a migration is pending
or unresolved. Do not run `prisma migrate dev` in production.

Prisma migrations are forward-only in the deployment path. Roll back an
application release only when the newer schema is backward-compatible with
that application version. For a destructive or incompatible schema change,
restore a verified database backup or deploy a reviewed compensating migration;
do not delete migration history or manually edit `_prisma_migrations`.

Create a verified custom-format logical backup and test its restoration into a
uniquely named temporary database without replacing the active database:

```powershell
.\scripts\db-backup.ps1 -ProjectName calassist-hardening
.\scripts\db-restore-check.ps1 -ProjectName calassist-hardening `
  -BackupPath .\backups\<backup-file>.dump
```

The restore check removes only its own temporary database after verification.
Keep backups encrypted and off-host, restrict access, and run restore checks
regularly; a successful dump alone is not proof of recoverability.

There are currently no scheduled NestJS jobs, Inngest functions, BullMQ
processors, or runtime queue producers in `src/`. Redis/BullMQ was previously
configured without any consumers; that unused configuration was removed to
avoid an incompatible Redis peer dependency. One-shot retry/delay timers are
request-scoped and do not create background work. Add an explicit distributed
idempotency/locking design and multi-worker test before introducing background
jobs.

Configure `DATABASE_POOL_MAX` for the maximum number of PostgreSQL connections
per API replica (default `10`). The API validates its configured budget during
startup and PostgreSQL is configured with `POSTGRES_MAX_CONNECTIONS` (default
`100`). Set `API_REPLICA_COUNT` to the actual maximum number of API replicas
before scaling (for example, to `3` when using `--scale api=3`); also include
aggregate worker capacity and reserve `DATABASE_CONNECTION_HEADROOM`.
`WORKER_POOL_CONNECTIONS` represents the maximum aggregate worker pool usage:

```text
API_REPLICA_COUNT * DATABASE_POOL_MAX
+ WORKER_POOL_CONNECTIONS
+ DATABASE_CONNECTION_HEADROOM
< POSTGRES_MAX_CONNECTIONS
```

For example, three API replicas at 10 connections each, one worker process
budgeted at 10, and 20 connections reserved for other activity use at most 60
of a PostgreSQL `max_connections` of 100. The startup check fails if the
configured total reaches or exceeds the server maximum. Recalculate this for
your deployment; migrations, monitoring, and other clients must be included.
Use a connection pooler if the required replica count would exceed the budget.

Compose preloads `pg_stat_statements` and creates the extension on a fresh
PostgreSQL data volume for later query profiling. On an existing volume, the
preload setting takes effect after the PostgreSQL container is recreated; then
enable the extension once in the application database with
`CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`. The extension records
aggregate query statistics, not query parameter values.

Redis is shared by OAuth sessions, rate-limit counters, AI protection state,
and the Redis-backed provider protections. `REDIS_MAXMEMORY` defaults to
`256mb`; `REDIS_MEMORY_LIMIT` defaults to `320m`, leaving container headroom
above Redis' data limit. The eviction policy is `noeviction`, so session and throttle keys are never
evicted to make room; writes fail instead when the cap is reached. Monitor
Redis memory and provision enough headroom. Do not switch this shared instance
to an evicting policy. If cache eviction is needed, put cache data in a separate
Redis service and keep session/throttle state on a `noeviction` instance.

Redis failures fail closed for sessions: a Redis-backed session read or write
returns `503 Service Unavailable` with `Retry-After: 5`; session validation and
OAuth state are never bypassed. Google OAuth initiation and callback also run a
short-lived Redis write/delete preflight, so unavailable or write-restricted
Redis fails before an authorization redirect or session cookie is issued. If
the Redis-backed throttler cannot reach Redis, it falls back to a bounded,
per-process fixed-window limiter and records
`calassist_throttler_redis_fallback_total`. The Prometheus
`CalAssistThrottlerRedisFallback` alert fires when any replica uses that
fallback. Limits are no longer coordinated across replicas during the outage,
so a client may receive up to the per-process allowance on each replica.
The Redis exporter exposes availability and memory usage;
`CalAssistRedisUnavailable` alerts when it cannot reach Redis, and
`CalAssistRedisMemoryHigh` alerts when used memory is above 80% of configured
`maxmemory` for five minutes. Health liveness skips dependencies; readiness
returns `503` only when PostgreSQL is down. `/health/deps` reports Redis
degradation separately, so Redis outages do not eject API replicas from Traefik.
The throttler fallback is for Redis command failures while a replica is still
serving requests, not a substitute for Redis recovery. `REDIS_URL` supports local
`redis://` and managed TLS `rediss://` endpoints; point it at the provider's
stable failover endpoint. The client uses a 5-second connect timeout and
capped exponential reconnect with jitter. `SESSION_SECRET` must be kept stable
across replicas. `SESSION_COOKIE_SECURE` defaults to `false` in
the local HTTP Compose stack; set it to `true` behind HTTPS in production.
`SESSION_COOKIE_SAME_SITE` accepts `lax`, `strict`, or `none` (`none` requires
secure cookies in browsers).

AI provider breaker state, half-open probe leases, concurrency slots, and
rolling request quotas are also shared through Redis. Defaults are 3
availability failures before opening, a 30-second cooldown, 10 concurrent
requests and 120 requests per provider per minute across the deployment.
`AI_PROVIDER_CAPACITY_LEASE_MS` and `AI_CIRCUIT_PROBE_LEASE_MS` must exceed the
configured provider timeout plus retry/backoff budget; startup rejects shorter
leases. Keep these settings consistent across replicas. Shared Redis is
required for these guarantees; loss of Redis makes the AI path fail explicitly
rather than reverting to process-local protection.

### Rotating OAuth token encryption keys

Keep the active AES-256 key in `OAUTH_TOKEN_KEY`. To rotate it, first deploy
the new active key on every API replica and put the old base64 key in
`OAUTH_TOKEN_PREVIOUS_KEYS` (comma-separated if more than one old key is still
needed). Replicas then encrypt new tokens with the new key and can still read
tokens encrypted with the old key. With the same variables and
`DATABASE_URL` available to an operator workstation, run
`npm run oauth:tokens:rotate -- --dry-run`, then
`npm run oauth:tokens:rotate` to re-encrypt stored calendar tokens. The update
uses compare-and-set writes and stops if a token changed concurrently; resolve
the writer conflict and rerun. Confirm a subsequent dry run reports zero rows
to rotate before removing the old key from `OAUTH_TOKEN_PREVIOUS_KEYS`. Keep
the old key available in secret storage until all database backups containing
old-key ciphertext have expired. Never put either key in source control.

To inspect replica distribution locally, set `EXPOSE_INSTANCE_ID=true` and
send repeated requests to `/api/status`; responses include an
`X-Instance-Id` diagnostic header. Leave it disabled outside development.
Every API response also includes an `X-Request-Id` header. A valid inbound
`X-Request-Id` (1-128 ASCII letters, digits, dots, underscores, or hyphens) is
preserved; invalid values are replaced with a generated UUID. Production HTTP
request logs are JSON and include that ID, the matched route template, status,
duration, and client IP without query strings or credential headers.
`scripts/lb-smoke.ps1` automates a three-replica distribution and backend-loss
check in the isolated `calassist-lb` Compose project (with its own Postgres and
Redis volumes). Use `-ProjectName calassist-hardening` to run it against that
isolated project instead. Stop a currently running default Compose stack first
to release the Traefik host port; this preserves its volumes:

```powershell
docker compose stop
.\scripts\lb-smoke.ps1
# Or target a separate, already-running verification project:
.\scripts\lb-smoke.ps1 -ProjectName calassist-hardening
```

Troubleshooting:

- **502 from Traefik:** check `docker compose ps`, API logs, and whether
  `/health/ready` succeeds in every API container. Readiness checks PostgreSQL;
  inspect `/health/deps` and Redis exporter metrics separately for Redis health.
- **Backend marked unhealthy:** readiness checks PostgreSQL only.
  Inspect `docker compose logs api postgres`; do not change the probe to
  liveness to mask a database outage.
- **OAuth state fails intermittently:** use the shared Redis session store and
  the same `SESSION_SECRET` on every replica. Sticky sessions are not required
  and are not a substitute for shared sessions.
- **Session cookie is missing:** for local HTTP, keep
  `SESSION_COOKIE_SECURE=false`; behind HTTPS, set it to `true` and verify TLS
  termination and forwarded-protocol handling at the trusted proxy.

### Deployment and incident runbook

Before scaling, set `API_REPLICA_COUNT` to the maximum intended API replicas,
validate the connection budget, and deploy with
`docker compose up -d --build --scale api=<count>`. Confirm every API and
frontend container is healthy, then check `/api/status` through Traefik and
the replica targets in Prometheus.
Prometheus alert rules identify scrape failures, a missing API target set, a
5xx ratio above 5%, and p95 latency above one second. Alerts are not paged
externally until an Alertmanager or equivalent receiver is configured.

For an API outage, inspect `docker compose ps` and
`docker compose logs api traefik`, plus readiness inside each API container.
For readiness failures, check PostgreSQL before restarting application replicas.
For Redis incidents, inspect `/health/deps`, Redis exporter metrics, and the
`CalAssistRedisUnavailable` alert; Redis is required for OAuth sessions and
shared throttling but does not affect PostgreSQL readiness. Do not make health
checks depend on optional providers or use liveness as a substitute for readiness.

Take a verified backup before a schema-changing deployment. Deploy migrations
once through the Compose `migrate` service and only roll back application code
when the new schema remains backward-compatible. For an incompatible or
destructive schema change, use a reviewed compensating migration or restore a
verified backup to a separate database, validate it, and switch traffic using
the deployment's approved database cutover procedure. Never restore over the
active database without an explicit maintenance and recovery plan.

```powershell
.\scripts\db-backup.ps1 -ProjectName calassist-hardening
.\scripts\db-restore-check.ps1 -ProjectName calassist-hardening `
  -BackupPath .\backups\<backup-file>.dump
docker compose --profile monitoring logs prometheus
docker compose logs api redis postgres traefik
```

## API Endpoints

### Authentication

- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get JWT

### Goals

- `POST /goals` - Create goal
- `GET /goals` - List goals
- `GET /goals/:id` - Get goal details
- `GET /goals/:id/progress` - Get progress
- `PATCH /goals/:id` - Update goal
- `DELETE /goals/:id` - Delete goal

### Tasks

- `POST /tasks` - Create task
- `GET /tasks` - List tasks
- `GET /tasks/:id` - Get task details
- `PATCH /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task

### Events

- `POST /events` - Create event
- `GET /events` - List events
- `PATCH /events/:id` - Update event
- `DELETE /events/:id` - Delete event

### AI Integration

- `POST /ai/intent/parse` - Parse natural language intent
- `POST /ai/planning/from-intent` - Create plan from intent
- `POST /scheduling/generate` - Generate schedule

### Core Engines

- `GET /context/user` - Get user context
- `POST /memory` - Store memory
- `GET /reality/check` - Run reality check
- `POST /replanning/trigger` - Trigger replanning

## Key Design Principles

1. **Strong Typing**: Zod validation on all inputs
2. **Permission System**: Explicit autonomy controls
3. **Explainability**: Every AI action logged with reasoning
4. **Extensibility**: Pluggable providers for AI, Calendar, Notifications
5. **Production Quality**: Full test coverage, type safety, validation

## Project Structure

```
src/
├── core/                   # Core engines (Context, Memory, Orchestrator)
│   ├── context-engine/
│   └── memory-engine/
├── ai/                     # AI components
│   ├── intent/             # Intent parsing
│   └── planning/           # Planning engine
├── scheduling/             # Scheduling system
│   ├── scheduling-engine/  # Schedule optimization
│   ├── reality-engine/     # Execution monitoring
│   └── replanning-engine/  # Dynamic replanning
├── domains/                # Domain engines
│   ├── goal-engine/
│   └── commitment-engine/
├── integrations/           # External integrations
│   ├── ai-providers/       # OpenAI, Ollama adapters
│   ├── calendar-adapters/  # Calendar sync (planned)
│   └── notification-service/ # Notifications (planned)
├── infrastructure/         # Auth, permissions, audit
├── auth/
├── goals/
├── projects/
├── tasks/
├── events/
├── time-blocks/
└── commitments/
```

## License

MIT

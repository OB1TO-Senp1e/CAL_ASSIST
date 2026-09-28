# Performance Report

## Summary

The frontend is React 18 with React Router 6 and Axios for API requests. The
backend is NestJS 10 with Prisma 7. No framework or data-fetching library was
replaced.

The measured P1 change makes `DashboardLayout` a lazy route module guarded by
React's existing Suspense fallback. This removed the authenticated shell from
the unauthenticated login entry. The login entry's gzip size decreased by
67,555 bytes (39.8%). The production build and full Jest command passed.

## Measured Before / After

All byte counts are from production Vite output and the same analyzer command.
The login-entry comparison is P0 baseline versus P1. The stylesheet was
unchanged. No database, Lighthouse, Google API, or LLM latency figures are
included because those measurements were not safely available.

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Login entry JavaScript, raw / gzip | 510,891 / 169,864 bytes | 299,701 / 102,309 bytes | -211,190 raw / -67,555 gzip (-39.8%) |
| Initial CSS, raw / gzip | 78,617 / 14,557 bytes | 78,617 / 14,557 bytes | No change |

Current production route measurements:

| Route / asset | Raw bytes | Gzip bytes |
|---|---:|---:|
| Authenticated home JS graph (entry + DashboardLayout + TodayPage and static JS dependencies) | 524,430 | 182,251 |
| DashboardLayout chunk | 20,855 | 6,301 |
| Initial CSS | 78,617 | 14,557 |

The CI gzip budget is 200,477 bytes: 10% above the measured 182,251-byte
authenticated-home graph. The guideline is 200 KB gzip; the current measured
graph is below it.

## Validation Status

The backend production build and `npm run test:ci` passed. The targeted
`App.tsx` ESLint rules reported no errors and three existing warnings. A
non-mutating repository-wide ESLint run did not pass: it reports existing
CRLF/Prettier violations in the already-dirty worktree. The repository's
`npm run lint` auto-fixes files, so it was not used; unrelated user changes
were left untouched.

## Changes and Rationale

- Deferred `DashboardLayout` with React `lazy()` and a route-level `Suspense`
  fallback. This reduced JavaScript required by the login route while
  preserving authentication guards and all route definitions.
- Added a Vite output analyzer that records raw/gzip sizes for emitted JS/CSS,
  the login entry graph, and the authenticated home route graph.
- Added a CI budget check for the authenticated home route, plus a test proving
  the check rejects a size one byte above its limit.
- Added a local-only GET benchmark for event range reads, calendar connection
  status, and assistant reads. It refuses non-loopback hosts, does not seed or
  write data, and does not call the LLM.
- Added opt-in Prisma query logging, enabled only when
  `NODE_ENV=development` and `PRISMA_QUERY_LOGGING=true`.
- No new dependencies, database migrations, caches, Google calls, or LLM
  requests were introduced for measurement.

## Re-running Measurements

Build and inspect every production JS/CSS asset and the route graphs:

```powershell
npm --prefix client run build
node scripts/perf-bundle.mjs
```

Run the budget and its pass/fail tests:

```powershell
npm run perf:budget
npm run test:perf-budget
```

The CI test command runs the frontend build and budget guard, the synthetic
budget tests, and Jest:

```powershell
npm run test:ci
```

For API timings, use only a local API configured against a local seeded
development database. Set a development user's JWT and run:

```powershell
$env:PERF_BASE_URL = "http://localhost:3000"
$env:PERF_TOKEN = "<development-user-jwt>"
$env:PERF_ITERATIONS = "20"
node scripts/perf-smoke.mjs
```

The script prints one JSON line per endpoint with request count and p50/p95
latency. It stops on non-2xx responses and limits repetitions to 500. To enable
Prisma query logs for local development, set
`PRISMA_QUERY_LOGGING=true`; do not share or commit raw query logs because
development logs can contain query parameters.

## HUMAN Items

The following items need an owner-provided or production-like environment and
were not estimated:

- Mobile Lighthouse (LCP, INP, CLS) and a production Lighthouse run.
- A local seeded database for event-list/assistant/connection p50/p95, query
  counts per request, N+1 detection, and `EXPLAIN` evidence.
- Hosting region close to users and CDN/reverse-proxy configuration.
- Production database plan, pooler settings, and connection-pool limits.
- An authorized test Google Calendar and API-call counter for sync measurements.
- An isolated test LLM/provider fixture and TTFT measurement; no user content was
  sent to an external model.
- Authenticated interaction profiling, request waterfalls, render counts,
  measured hot-endpoint cache hit rates, and main-flow layout-shift timing.

`PERF_LOOP.md` contains the full baseline, exact measurement log, checklist, and
decisions. The local `.env` points to a hosted Supabase pooler; database seeding
and query-plan experiments were intentionally not run against it.

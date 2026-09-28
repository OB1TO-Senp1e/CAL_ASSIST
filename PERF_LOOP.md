# Performance Loop

## Baseline

Measurements are from the current worktree on `perf/optimise` and use the production Vite build. The worktree had pre-existing changes when the branch was created; they are excluded from performance commits.

| Area | Baseline | Target / status |
|---|---:|---|
| Login entry JS | Before P1: 510,891 bytes raw / 169,864 bytes gzip; after P1: 299,701 bytes raw / 102,309 bytes gzip | Initial JS guideline <= 200 KB gzip |
| Authenticated shell JS chunk | After P1: 20,855 bytes raw / 6,301 bytes gzip | Loaded only for authenticated routes |
| Authenticated home route JS graph | 524,430 bytes raw / 182,251 bytes gzip | Includes entry, DashboardLayout, TodayPage, and their static JS dependencies |
| Authenticated home route gzip budget | 200,477 bytes | Current measured route graph + 10% |
| Initial stylesheet | 78,617 bytes raw / 14,557 bytes gzip | Measured |
| Async Calendar route chunk | 46,842 bytes raw / 13,374 bytes gzip | Per emitted chunk; see build report |
| Async Tasks route chunk | 17,065 bytes raw / 5,266 bytes gzip | Per emitted chunk; see build report |
| Async Today route chunk | 6,762 bytes raw / 2,284 bytes gzip | Per emitted chunk; see build report |
| Async Assistant route chunk | 3,009 bytes raw / 1,291 bytes gzip | Per emitted chunk; see build report |
| Async Architecture route chunk | 300 bytes raw / 231 bytes gzip | Per emitted chunk |
| Lazy/shared JS chunk | 103,304 bytes raw / 24,888 bytes gzip | Per emitted chunk |
| PageHeader JS chunk | 1,810 bytes raw / 882 bytes gzip | Per emitted chunk |
| Field JS chunk | 1,525 bytes raw / 661 bytes gzip | Per emitted chunk |
| Work JS chunk | 939 bytes raw / 303 bytes gzip | Per emitted chunk |
| Chevron-left JS chunk | 675 bytes raw / 345 bytes gzip | Per emitted chunk |
| Mobile Lighthouse (LCP / INP / CLS) | HUMAN — no local headless Chrome/Lighthouse executable available | LCP <= 2.5 s; INP <= 200 ms; CLS <= 0.1 |
| Local seeded event-list p50 / p95 | HUMAN — configured `.env` targets a hosted Supabase pooler, not a local dev database | p95 <= 300 ms |
| Local assistant and connection endpoint p50 / p95 | HUMAN — no safe local seeded DB/API credentials available | Record real p50 / p95 |
| Queries per request | HUMAN — no local seeded DB; query logging is opt-in in development | No N+1 list queries |

## Checklist

| ID | Status | Evidence |
|---|---|---|
| P0-build | DONE | `npm --prefix client run build` and `node scripts/perf-bundle.mjs`; exact output is in the measurements log. |
| P0-lighthouse | HUMAN | No local headless Chrome or Lighthouse command was found; no scores were estimated. |
| P0-api | HUMAN | The configured database is hosted, so no seed or database-backed request was run. Local-only GET benchmark tooling is in `scripts/perf-smoke.mjs`. |
| P0-query-logging | DONE | Prisma query logging is guarded by `NODE_ENV=development` and explicit `PRISMA_QUERY_LOGGING=true`; per-request counts remain HUMAN pending a local seeded run. |
| P1 | DONE | DashboardLayout is lazy; login entry gzip fell from 169,864 to 102,309 bytes (39.8%). Client build and full Jest suite passed; ESLint reported 0 errors on App.tsx (3 existing warnings). |
| P2 | HUMAN | No React/render profiler or authenticated interaction session is available; no render counts or INP claim is inferred from source inspection. |
| P3 | HUMAN | No authenticated local seed/session for a representative waterfall; the loopback GET benchmark is ready in `scripts/perf-smoke.mjs` but was not run against the hosted DB. |
| P4 | HUMAN | `.env` targets the hosted pooler; no local PostgreSQL instance is available for seeded p95s or `EXPLAIN`. No migration or external DB request was made. |
| P5 | HUMAN | No test Google account/calendar or API-call counter is available; did not trigger OAuth, calendar sync, or external Google requests. |
| P6 | HUMAN | No isolated local/test LLM or TTFT harness is available; assistant requests persist user content and may call a billable provider, so no baseline request was sent. |
| P7 | HUMAN | P0 did not produce request-frequency/latency evidence; cache remains intentionally absent rather than being added speculatively. |
| P8 | HUMAN | No mobile Lighthouse/CLS or authenticated main-flow timing is available; no skeleton/motion changes made without layout-shift or feedback measurements. |
| P9 | DONE | `npm run test:ci` builds and checks the authenticated-home graph (182,251 <= 200,477 gzip bytes), executes a synthetic over-budget failure test, and runs Jest; CI installs client dependencies and uses this command. README documents local reruns. |
| P10 | TODO | Final report remains to be written after iterations. |

## Measurements Log

| Iteration | Metric | Before | After | Exact command |
|---:|---|---:|---:|---|
| 0 | Frontend production build | — | PASS; TypeScript and Vite production build | `npm --prefix client run build` |
| 0 | Login / app-shell entry JS | — | 510,891 bytes raw / 169,864 bytes gzip | `npm --prefix client run build` then `node scripts/perf-bundle.mjs` |
| 0 | Initial CSS | — | 78,617 bytes raw / 14,557 bytes gzip | `npm --prefix client run build` then `node scripts/perf-bundle.mjs` |
| 0 | Backend production build | — | PASS | `npm run build` |
| 0 | Full Jest suite | — | PASS | `$env:DATABASE_URL='postgresql://127.0.0.1:1/calassist'; npm test -- --runInBand` |
| 0 | Backend ESLint | — | FAIL; existing CRLF/Prettier violations across the dirty worktree; no auto-fixes applied | `.\node_modules\.bin\eslint.cmd "src/**/*.ts"` |
| 0 | Lighthouse mobile | — | HUMAN; tool unavailable | `Get-Command chrome,msedge,chromium,lighthouse -ErrorAction SilentlyContinue` |
| 0 | Seeded API p50 / p95 and per-request query counts | — | HUMAN; no local database available; no requests sent to hosted DB | `node scripts/perf-smoke.mjs` (requires a local API and `PERF_TOKEN`) |
| 1 | Login entry JavaScript | 510,891 bytes raw / 169,864 bytes gzip | 299,701 bytes raw / 102,309 bytes gzip | `npm --prefix client run build` then `node scripts/perf-bundle.mjs` |
| 1 | DashboardLayout async chunk | Eagerly included in initial bundle | 20,855 bytes raw / 6,301 bytes gzip, loaded on authenticated routes | `npm --prefix client run build` then `node scripts/perf-bundle.mjs` |
| 1 | Initial CSS | 78,617 bytes raw / 14,557 bytes gzip | 78,617 bytes raw / 14,557 bytes gzip | `npm --prefix client run build` then `node scripts/perf-bundle.mjs` |
| 1 | Frontend typecheck and production build | — | PASS | `npm --prefix client run build` |
| 1 | Full Jest suite | — | PASS | `$env:DATABASE_URL='postgresql://127.0.0.1:1/calassist'; npm test -- --runInBand` |
| 1 | App.tsx ESLint rules | — | PASS with 0 errors and 3 existing warnings; repository Prettier check still fails on this CRLF worktree file | `.\node_modules\.bin\eslint.cmd --parser-options '{"project":"client/tsconfig.json"}' --rule 'prettier/prettier: off' client/src/App.tsx` |
| 2 | Render count / interaction profile | — | HUMAN; profiler and authenticated interaction setup unavailable | No browser performance profiler is installed; interactive routes require a development session |
| 3 | Request counts and endpoint waterfall | — | HUMAN; no local seeded user session or safe endpoint target available | `node scripts/perf-smoke.mjs` requires `PERF_TOKEN` and is loopback-only |
| 4 | Local read-endpoint p95 and query plans | — | HUMAN; no local PostgreSQL instance; hosted database intentionally not queried | `node scripts/perf-smoke.mjs` and `EXPLAIN (ANALYZE, BUFFERS)` require a local seeded DB |
| 5 | Google API calls per sync/view | — | HUMAN; no test calendar or request counter; OAuth/consent flow not triggered | Google sync integration tests require test credentials and an authorized calendar |
| 6 | Assistant time-to-first-token / fallback | — | HUMAN; no local model or isolated test provider; no user content sent to an external LLM | Requires a controlled assistant fixture and TTFT-capable client measurement |
| 7 | Cache hit rate / latency / invalidation | — | HUMAN; no endpoint identified as hot from measured traffic | No caching change made without per-user hit-rate and invalidation evidence |
| 8 | Main-flow feedback / layout shift | — | HUMAN; no mobile Lighthouse/CLS run or authenticated main-flow timing | Browser only verified the public login page; no interaction timing inferred |
| 9 | Authenticated home gzip budget | No guard | PASS at 182,251 bytes; enforced ceiling 200,477 bytes | `npm run perf:budget` |
| 9 | Budget guard pass/fail behavior | No guard test | PASS; exact ceiling accepted and ceiling + 1 rejected | `npm run test:perf-budget` |
| 9 | CI test command | `npm test` | PASS; budget build/check, guard tests, and full Jest suite | `$env:DATABASE_URL='postgresql://127.0.0.1:1/calassist'; npm run test:ci` |
| 9 | Backend production build | — | PASS | `npm run build` |

The bundle script reports raw and gzip bytes for every emitted JS/CSS asset and the HTML entry's static JS dependency graph. The API smoke script is deliberately loopback-only, issues GET requests, performs no seeding or writes, and does not call an external LLM.

## Decisions Log

| Iteration | Decision |
|---:|---|
| 0 | Created and used `perf/optimise`; left the pre-existing worktree changes untouched and only staged files belonging to this performance iteration. |
| 0 | Did not seed or benchmark the configured hosted database. P0 database-backed figures remain HUMAN until a local seeded database is configured. |
| 0 | Did not estimate Lighthouse metrics; no local headless Chrome/Lighthouse executable was available. |
| 0 | Added dependency-free local benchmark tooling; no package dependency was added. |
| 0 | Did not run the repository's `npm run lint` script because it auto-fixes files; the non-mutating ESLint run found CRLF/Prettier violations in existing dirty files, so unrelated formatting was left untouched. |
| 1 | Split DashboardLayout behind React.lazy and a matching route-level Suspense fallback; this reduced login entry JS by 67,555 gzip bytes (39.8%) without changing routes or auth guards. |
| 1 | Kept the measured split despite the app shell now loading one 6,301-byte gzip chunk after authentication; login avoids that module, and the route fallback covers its asynchronous load. |
| 2 | Made no render optimization without an interaction profile; memoization and virtualization are not applied speculatively. |
| 3 | Made no caching, optimistic-update, or cancellation change without a representative authenticated network waterfall; existing Axios behavior remains unchanged. |
| 4 | Made no query/index change without local query-plan evidence; avoids running seed data, `EXPLAIN ANALYZE`, or migrations against the hosted pooler. |
| 5 | Made no Google sync changes without a measurable API-call baseline; did not access external calendars or alter consent/scope behavior. |
| 6 | Made no assistant streaming/context change without controlled TTFT and fallback measurements; no content was sent to the configured provider. |
| 7 | Added no cache: the measured baseline does not identify a hot endpoint, and user-scoped cache invalidation cannot be validated without a local seed. |
| 8 | Made no perceived-performance UI changes without a mobile CLS/interaction measurement; preserved existing loading and reduced-motion behavior. |
| 9 | Budget is based on the exact emitted JS graph for the authenticated home route and fixed at 10% above its measured 182,251-byte gzip baseline; CI runs it before unit tests. |

## Iteration Counter

9 — P0 baseline, P1 route split, P2-P8 HUMAN, and P9 regression guard.

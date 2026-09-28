# Performance Loop

## Baseline

Measurements are from the current worktree on `perf/optimise` and use the production Vite build. The worktree had pre-existing changes when the branch was created; they are excluded from performance commits.

| Area | Baseline | Target / status |
|---|---:|---|
| Login and authenticated-shell entry JS | 510,891 bytes raw / 169,864 bytes gzip | Initial JS guideline <= 200 KB gzip |
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
| P1 | TODO | Route-level emitted chunks exist; initial shell entry is 169,864 gzip bytes. Further bundle changes require a measured improvement. |
| P2 | TODO | No render/interaction profile captured. |
| P3 | TODO | No request waterfall captured. |
| P4 | TODO | Query plans and local endpoint latency not measured; no DB schema change made. |
| P5 | TODO | Google API call count not captured. |
| P6 | TODO | No assistant time-to-first-token benchmark captured. |
| P7 | TODO | No cache target established from measured hot traffic. |
| P8 | TODO | No interaction/perceived-performance benchmark captured. |
| P9 | TODO | Budget guard and README benchmark instructions remain to be implemented. |
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

The bundle script reports raw and gzip bytes for every emitted JS/CSS asset and the HTML entry's static JS dependency graph. The API smoke script is deliberately loopback-only, issues GET requests, performs no seeding or writes, and does not call an external LLM.

## Decisions Log

| Iteration | Decision |
|---:|---|
| 0 | Created and used `perf/optimise`; left the pre-existing worktree changes untouched and only staged files belonging to this performance iteration. |
| 0 | Did not seed or benchmark the configured hosted database. P0 database-backed figures remain HUMAN until a local seeded database is configured. |
| 0 | Did not estimate Lighthouse metrics; no local headless Chrome/Lighthouse executable was available. |
| 0 | Added dependency-free local benchmark tooling; no package dependency was added. |
| 0 | Did not run the repository's `npm run lint` script because it auto-fixes files; the non-mutating ESLint run found CRLF/Prettier violations in existing dirty files, so unrelated formatting was left untouched. |

## Iteration Counter

0 — baseline collection.

# CAL_ASSIST Build Log

> Loop state file. Read this first every turn. One unit per turn, stages in order.
> (Template source `CAL_ASSIST_OPUS_BUILD_LOOP.md` was not present in the repo; this log was
> created from the loop prompt's stage definitions.)

## Current position
- **Stage:** 5 — AI provider hardening (5a complete); Stage 4 fully closed incl. 4k schema migration.
- **Status:** Stage 4k (dedicated Permission/AutonomyPolicy/RuleConflict/ReplanningPolicy models,
  migrations applied + legacy JSON compatibility rows drained to 0) and Stage 5a (shared provider
  HTTP transport, typed provider errors, circuit breaker + health, capability registry, AI metrics,
  provider-health endpoint, s5a probe) are live-verified. Google login OAuth (strategy/guard,
  session middleware, login route, callback token handoff) is committed as 5a-b.
- **Verification of record (2026-09-28, Stage 4k + 5a):** `npx tsc --noEmit` 0 · `npx jest --silent`
  **245/245** (20 suites) · `npx prisma migrate status` via DIRECT_URL: both stage4k migrations
  finished, dedicated tables present, legacy compat rows 0 (`scripts/s4k-check-db.js`) ·
  `scripts/s5a-probe.ps1` → **17 PASS / 0 FAIL / 5 INFO** (live LLM + metrics + breaker) ·
  `scripts/stage3-probe.ps1` → **100 PASS / 0 FAIL / 1 INFO** · `GET /auth/google` → 302 to
  accounts.google.com · backend + client builds green.
  Earlier (Stage 4j): `npx tsc --noEmit` 0 · `npx jest --silent`
  **135/135** (12 suites; +8 from the new `calendar-boundary.spec.ts`) ·
  `scripts/s4j-probe.ps1` → **ALL PASS** (10 checks) · backend restarted from current `dist` before
  probing. Before that (4i): `scripts/s4i-probe.ps1` all PASS incl. `s4i-check-db.js` DB truth ·
  `scripts/stage3-probe.ps1` → **100 PASS / 0 FAIL / 1 INFO** · `scripts/s4-gate-probe.ps1` steps
  1–10 all OK. Stage 1 ✅, Stage 2 ✅ (13/13), Stage 3 ✅ (13/13), Stage 4 ✅.
- **Live backend right now:** Nest (`node dist/main.js` of the latest build) on
  `http://localhost:3000/api` (`GET /api/health` → 200), Vite **dev** server on `http://localhost:3001`
  with `/api` + `/auth` proxied to 3000.
  _Note: auth routes are excluded from the `api` prefix (`main.ts` `setGlobalPrefix` exclude list), so
  `/api/auth/login` is a genuine 404 — the client calls `/auth/login`. If the backend ever looks
  "fixed but still wrong", check whether a pre-rebuild process owns :3000 — a stale non-watch
  `node dist/main` plus an idle `nest start --watch` sat on that port through the 4h fixes._
  `npx prisma migrate deploy` → 7 migrations applied, "All migrations have been successfully applied."
  Both `npm run build` (nest) and `cd client && npm run build` (vite) are green.
- **Runtime:** `.env` now exists (Supabase Postgres pooler + `DIRECT_URL`, Ollama Cloud provider),
  so the API boots on `http://localhost:3000/api` and live smoke tests are runnable. `.env` is
  git-ignored; recreate it locally from `.env.example` on a fresh clone.
  `AI_PROVIDER="ollama"` with `OLLAMA_BASE_URL=https://ollama.com/v1` + `OLLAMA_MODEL=gpt-oss:20b`;
  the OpenAI key is still a placeholder, so use the Ollama route for real-LLM verification.
- **Frontend build:** `cd client && npm run build` → green (2026-09-27; Vite chunk-size warning only)
- **Auth:** live API by default in Stage 3; `VITE_AUTH_USE_MOCK=1` restores offline demo login, and
  `VITE_AUTH_BYPASS=1` bypasses the sign-in route in dev.
- **Stage 3 default:** live API mode. Offline full-mock preview requires both
  `VITE_USE_MOCK=1` and `VITE_AUTH_USE_MOCK=1`; dev-only `VITE_AUTH_BYPASS=1` skips auth.
- **Previews:** live-auth server on `http://localhost:3001`; offline mock-auth preview on
  `http://localhost:3002` (auth-only mock; use both flags for all mock data).

## Stage status
| Stage | Status |
|---|---|
| 1 — Design Foundation | ✅ DONE (2026-09-27) |
| 2 — Frontend Screens | ✅ DONE (13/13, 2026-09-27) |
| 3 — Backend Tie-in | ✅ DONE (13/13 wired and live-verified, 2026-09-27) |
| 4 — Backend Hardening | ✅ DONE (4f–4k closed, verification complete) |
| 5 — AI Provider Hardening | 🟡 IN PROGRESS (5a + 5a-b done; 5b+ not started) |

### Stage 2 screen-groups
| Unit | Status |
|---|---|
| 2a App shell + routing + nav + auth | ✅ DONE (2026-09-27) |
| 2b Calendar (day/week/month/agenda, drag/drop, detail) | ✅ DONE (2026-09-27) |
| 2c AI Assistant panel (thread, tool-call cards, confirm/reject) | ✅ DONE (2026-09-27) |
| 2d Goals / Projects / Tasks | ✅ DONE (2026-09-27) |
| 2e Time Compiler / Planning | ✅ DONE (2026-09-27) |
| 2f Commitments | ✅ DONE (2026-09-27) |
| 2g Reality Engine / Replanning | ✅ DONE (2026-09-27) |
| 2h Memory Center | ✅ DONE (2026-09-27) |
| 2i Rules UI | ✅ DONE (2026-09-27) |
| 2j Proactive feed + Permissions/autonomy | ✅ DONE (2026-09-27) |
| 2k Integrations | ✅ DONE (2026-09-27) |
| 2l Meeting Intelligence | ✅ DONE (2026-09-27) |
| 2m Command Center | ✅ DONE (2026-09-27) |

### Stage 3 tie-ins
| Unit | Status |
|---|---|
| 3a App shell + routing + nav + auth | ✅ DONE (2026-09-27) |
| 3b Calendar | ✅ DONE (2026-09-27) — create blocker CLOSED same day, see "3b addendum" |
| 3c AI Assistant | ✅ DONE (2026-09-27) |
| 3d Goals / Projects / Tasks | ✅ DONE (2026-09-27) — live CRUD + status transitions verified |
| 3e Time Compiler / Planning | ✅ DONE (2026-09-27) — compile produces blocks, apply persists TimeBlocks, re-apply refused |
| 3f Commitments | ✅ DONE (2026-09-27) — live CRUD + `/risks` + reminders (person metadata still Stage 4) |
| 3g Reality Engine / Replanning | ✅ DONE (2026-09-27) — stable deviation ids; ack/resolve/reopen persist |
| 3h Memory Center | ✅ DONE (2026-09-27) — live `/api/memory` CRUD + conflicts; bad payload → 400 |
| 3i Rules UI | ✅ DONE (2026-09-27) — live `/api/rules`, NL rule without LLM key; bad payload → 400 |
| 3j Proactive feed + Permissions/autonomy | ✅ DONE (2026-09-27) — interventions + preferences round-trip live |
| 3k Integrations | ✅ DONE (2026-09-27) — travel-time returns clean 503 without a key; OAuth callback live |
| 3l Meeting Intelligence | ✅ DONE (2026-09-27) — preparation/post-meeting retrievable, not placeholders |
| 3m Command Center | ✅ DONE (2026-09-27) — daily/current, morning, briefing, context, health live |

### 2026-09-28 — Stage 5a-b: Google login OAuth (strategy, session, callback handoff) ✅ (live-verified)

- `GoogleStrategy` (passport-google-oauth20) + `GoogleAuthGuard`; `express-session` middleware in
  `main.ts` (state=true round-trip needs it); `auth/google` + `auth/google/callback` excluded from
  the `api` prefix; `AuthService.loginWithGoogle` provisions-or-looks-up by verified email and mints
  the app JWT. `.env.example`/`docker-compose.yml` document the new vars.
- Client: "Continue with Google" on the login page; `AuthContext.loginWithToken` consumes the
  `#access_token` handoff from the callback redirect, then clears the hash.
- Live: `GET /auth/google` → **302** to `accounts.google.com/o/oauth2/v2/auth` with the configured
  client id/redirect. Full round-trip needs a real Google account and is not probe-automatable.

### 2026-09-28 — Stage 5a: AI provider transport hardening ✅ (live-verified)

**Built**
- `provider-http.ts`: shared fetch transport — timeout per attempt, typed retries (429/5xx/timeout/
  network only; hard 4xx never retried), structured `AiProviderError` kinds (`auth`, `rate_limit`,
  `timeout`, `network`, `server`, `parse`, `unsupported`). OpenAI/Ollama/Nemotron now ride it via
  `openai-compatible.provider.ts`.
- `provider-health.ts`: per-provider circuit breaker. Availability failures trip; **auth failures
  never do** (bad key ≠ outage). Half-open probe budget configurable, off by default.
- `ai-capabilities.ts`: declared + env-overridable capability registry (chat/tools/json/embed per
  provider); `embed()` throws `unsupported` instead of returning `[]`, which had disguised outages
  as zero-relevance memory results.
- `MetricsService` AI family: requests/duration/errors(by kind)/retries/tokens/fallbacks/circuit
  state; `GET /api/assistant/providers/health` exposes capabilities + breaker state read-only.
- Memory search gains an honest recency+keyword fallback (counted as fallback) when embedding is
  unavailable; assistant counts provider-silence separately from transport failure.
- Travel-time provider: `traffic_model` only sent with a departure time (Directions rejects it
  otherwise); upstream REQUEST_DENIED/billing now degrades to **503**, not a raw 500. Mode schema
  accepts lowercase client values.
- Calendar OAuth state contract corrected: adapters pass the self-contained signed JWT verbatim
  (the old `userId:jwt` prefix broke `verifyOAuthState`). Probe expectation updated to match.

**Verified (2026-09-28)**
- `scripts/s5a-probe.ps1` (new) → **17 PASS / 0 FAIL / 5 INFO** against live backend: env
  consistency, auth, live read→proposal path, 2-task fan-out, provider health, breaker closed,
  every metric family incremented, latency observed, error taxonomy labelled, auth never trips
  breaker. (Fix during run: probe's latency regex had an unclosed group.)
- `scripts/stage3-probe.ps1` → **100 PASS / 0 FAIL / 1 INFO**. OpenAI live leg returned a genuine
  429 "no credits" — surfaced as typed `rate_limit`, breaker stayed closed: exactly the behaviour
  this unit exists to guarantee.

### 2026-09-28 — Stage 4k: dedicated permission/policy models (JSON compatibility retired) ✅ (live-verified)

- Prisma: first-class `Permission`, `AutonomyPolicy`, `RuleConflict`, `ReplanningPolicy` models with
  proper enums/scopes; migrations `20260928120000_stage4k_permission_models` +
  `20260928121000_stage4k_replanning_policy` **applied to dev DB** (verified via `_prisma_migrations`
  through DIRECT_URL — the Supabase session pooler breaks the CLI's prepared statements).
- Permission service, rules engine (conflict persistence), and replanning engine rewritten against
  the models; the JSON/string compatibility representations are gone.
- `/api/permissions/check` is zod-validated on the real contract (`action`+`scope`); stage3 probe
  updated (the old `actionType`-only body is now genuinely a 400).
- `scripts/s4k-check-db.js`: new columns/tables present, legacy compat rows **0**.
- New specs: `permission-storage.spec.ts`, `memory-engine.service.spec.ts`, rules/replanning
  coverage → Jest **245/245 (20 suites)**.

### 2026-09-28 — Stage 4j: calendar boundary closed (Luxon serialisation + id flavour) ✅ (live-verified)

The last two calendar items still listed as open Stage 4 candidates. Both fixes were found **already
present in source but never tied-in-verified** — the `_utc` shape had been observed live as recently
as the cal2/cal3 captures — so this unit is verification + regression-pinning, not new behaviour.

**Luxon `DateTime` → bare ISO at every JSON boundary**
- `src/calendar/domain/calendar-event.ts` `DateTime.toJSON()` returns `toISOString()`; live probe
  `scripts/s4j-probe.ps1` (A1–A3) confirms **no `_utc`/`_timeZone` key anywhere** in
  `POST/GET /api/calendar/events` payloads, and `start` round-trips as an exact ISO string.
- Client `toIso()` (`client/src/lib/datetime.ts`) stays as a harmless defence; the server no longer
  requires it.

**Id flavour: CUIDs pass the zod boundary**
- `EntityIdSchema` = `z.string().min(1).max(64)` replaces `z.string().uuid()` on
  `CreateEventSchema.calendarId` and `BulkEventSchema.eventIds`. Live probe B0/B1: a LOCAL-synced
  calendar row (cuid `cmuk…`) accepts an id-bearing create through the controller's
  `ZodValidationPipe`; B2: an empty-string `calendarId` is still refused with 400.
- Route-collision audit item also verified closed: the adapters module's duplicate `@Get('events')`
  was removed in Stage 4; `CalendarController` is the sole owner and A2 exercises it live.

**Verified (2026-09-28)**
- Backend restarted from the current `dist` (08:24 build) before probing — the running server had
  been two builds behind.
- `scripts/s4j-probe.ps1` → **ALL PASS** (10 checks: A1×3, A2×2, A3, B0, B1×2, B2).
- New `src/calendar/domain/calendar-boundary.spec.ts` → **8/8** (toJSON shape/nesting/equality; CUID,
  external-id, omitted-id accept; empty-id reject; length bound).
- `npx tsc --noEmit` 0 · `npx jest --silent` **135/135 (12 suites)** · `npm run build` green.

**Files touched**
- Tests/scripts: `src/calendar/domain/calendar-boundary.spec.ts` (new), `scripts/s4j-probe.ps1` (new)
- Repo: `BUILD_LOG.md` (3 checklist items closed, entry added)

### 2026-09-28 — Stage 4i: connections token scrub + per-calendar delta sync ✅ (live-verified)

The last two open calendar-integration items from the Stage 4 audit, closed together because they
live in the same two services.

**Scrub: OAuth material no longer leaves the server**
- `GET /api/calendar/connections` and `GET /api/calendar/connections/:provider` previously returned
  whole Prisma rows: `accessToken`, `refreshToken`, and the connection's `syncToken` — plus, via
  `calendars: true`, every `Calendar` column including its own `syncToken` delta cursor.
- `calendar-connection.service.ts` now reads with explicit projections:
  `PUBLIC_CONNECTION_SELECT` (id/userId/provider/externalUserId/scopes/isActive/lastSync/syncError/
  createdAt/updatedAt/tokenExpiresAt + nested `PUBLIC_CALENDAR_SELECT`) and
  `PUBLIC_CALENDAR_SELECT` (drops `syncToken` + `connectionId`). `getPublicConnection(s)` are the
  service's public readers; `getAllConnections()` delegates to `getPublicConnections()`, so the
  `GET /api/calendar/calendars` flatMap is scrubbed too. `getConnection()` (raw row) stays internal
  — the sync path needs the tokens.
- `tokenExpiresAt` is deliberately kept: the UI renders "needs reconnection" from it and it is not a
  secret. Client contract follows: `CalendarConnectionDTO` and the mock seeds drop `syncToken`.
- Guards: `calendar-connection.service.spec.ts` asserts the select objects handed to Prisma contain
  no forbidden key at any depth (the 2 tests that took the suite count 125 → 127).

**Delta sync: the sync pipeline was structurally broken, not just unoptimised**
- `syncCalendarsList()` fed **raw provider calendar objects** into `syncCalendarEvents()`, which
  used `calendar.id` as the `Event.calendarId` FK — an external id like `local_primary`, so any real
  sync would have thrown on the FK. It now upserts each calendar and returns the **DB rows**
  (`select: { id, syncToken }`), which also gives each calendar its persisted delta cursor.
- `syncCalendarEvents()` receives that stored `syncToken` and, on success, writes
  `nextSyncToken` back to the `Calendar` row — previously the cursor was discarded and every sync
  was a full sync.
- The connection-level `syncToken` write was removed: delta state is per-calendar (the adapter
  returns one `nextSyncToken` per calendar); `CalendarConnection.syncToken` is no longer written and
  now only tracks health via `lastSync`/`syncError`.
- `externalId` is coerced with `String(cal.id ?? cal.externalId ?? '')` so the composite
  `userId_connectionId_externalId` upsert key is stable across re-syncs.

**Verified (live, against the rebuilt backend on :3000)**
- `scripts/s4i-probe.ps1` (new) → **all PASS**: fresh user empty list → `POST callback/LOCAL` →
  `accessToken`/`refreshToken`/`syncToken` absent at every depth on `/connections`,
  `/connections/LOCAL`, `/calendars`, and the `sync/all` summary, while `tokenExpiresAt`/
  `syncError`/`isActive` remain → `POST sync/LOCAL` **200, calendarsSynced=1** (pre-4i this path
  could only 500 on the FK) → second sync exercises the stored-cursor delta path → disconnect
  empties the list.
- `scripts/s4i-check-db.js` (new, run mid-probe): proves the scrub is a projection, not data loss —
  connection row still holds `accessToken`+`refreshToken`, calendar row linked by FK with
  `externalId=local_primary` and a persisted `syncToken` cursor. **ALL PASS**.
- Regression: `scripts/stage3-probe.ps1` → **100 PASS / 0 FAIL / 1 INFO** (the 3f reminder INFO is
  by-design); `scripts/s4-gate-probe.ps1` steps 1–10 all OK. `npx tsc --noEmit` 0 ·
  `npx jest --silent` **127/127** · `npm run build` green · client build green.

**Files touched**
- Backend: `src/integrations/calendar-adapters/calendar-connection.service.ts` (public selects),
  `src/integrations/calendar-adapters/calendar-sync.service.ts` (DB-row sync, per-calendar cursor),
  `src/integrations/calendar-adapters/calendar-connection.service.spec.ts` (new)
- Client: `client/src/services/workflow-types.ts`, `client/src/lib/mock/integrations.ts`
  (`syncToken` removed from the connection DTO/seed)
- Scripts: `scripts/s4i-probe.ps1`, `scripts/s4i-check-db.js` (new)

**Remaining Stage 4 candidates** (now verified/closed by 4j, or key-blocked): Luxon `DateTime`
serialisation at the calendar boundary and the `calendarId` UUID-vs-CUID zod check — both closed by
4j; proactive-intervention persistence (closed earlier, `InterventionState`); permissions/rule-conflict
compatibility JSON → dedicated models; notification-preferences follow-ups; meeting-result retrieval
breadth; real-provider answer quality once keys rotate.

### 2026-09-28 — Stage 4h: assistant LLM path repaired + Memory schema drift closed ✅ (live-verified)

The two live assistant bugs (prompt-as-title, dropped LLM proposals) plus a latent schema drift
the Memory Center probes exposed. All fixes verified against a rebuilt, freshly started backend.

**Assistant: why LLM proposals were silently dropped (`Executed 0 action(s): 0 succeeded`)**
- Root cause found with `scripts/repro-actions.js` + `scripts/check-zod.js`: `gpt-oss:20b` answered
  a create-task intent with `{ durationMinutes, dueDate: "", endDate … }`, which violated
  `CreateTaskInputSchema` (`estimatedDurationMinutes` required; `dueDate` must be ISO), so
  `safeParse` failed and `validateAndPrepareActions` skipped the proposal.
- New `src/ai/assistant/interfaces/normalize-tool-input.ts`: `normalizeToolInput()` (datetime
  coercion + blank-optional removal + duration-alias mapping + enum/int clamping),
  `applyRequiredDurationDefault()` (60-minute fallback mirroring the local mapper), and
  `describeToolInputSchema()` (embeds each tool's real field names in the orchestrator prompt so
  the model stops guessing). Wired into both the LLM path (`extractIntentActions`) and the
  validation path (`validateAndPrepareActions`); covered by `normalize-tool-input.spec.ts`.
- Prompt now lists per-tool `inputFields`; the orchestrator logs dropped proposals with the zod
  issues instead of discarding silently.

**Intent: title extraction + `CREATE_PROJECT` (Stage 4 audit items 1–2 now truly closed)**
- New `src/ai/intent/local-intent.classifier.ts` (`classifyLocally`, `extractTitle`) and
  `src/ai/intent/date-time.parser.ts` (chrono-based relative/explicit date, duration, priority,
  read-only query routing). `IntentType` gained `CREATE_PROJECT`; `intent-parser.service.ts` falls
  back to the local classifier when no provider answers (the only path available locally, since
  `OPENAI_API_KEY` is still a placeholder — `.env` routes to Ollama Cloud meanwhile).
- Live proof: `audit-live.js` "Assistant produced an actionable proposal" now shows
  `create_task:review Q4 budget` (clean title, not the whole prompt) through the **real LLM**, and
  confirm persists the Task row. 18/18.

**Tests: cross-midnight flake fixed**
- `date-time.parser.spec.ts` failed after the wall clock crossed local midnight: `classifyLocally`
  parsed "tomorrow" against `new Date()` while the assertion used the spec's fixed reference.
  `classifyLocally(text, reference = new Date())` now threads the reference into
  `parseDateTimePhrase`, so the spec pins time and the production default is unchanged.

**Schema drift: every `/api/memory*` route returned 500**
- `The column 'Memory.description' does not exist` — the checked-in schema/migrations (init +
  stage3 + commitment-metadata) were ahead of what had ever been applied: `Memory` status/scope/
  tags/metadata/confirmation columns, `MemoryStatus`/`MemoryScope` enums, the modern
  `MemoryCategory`/`MemorySource` values, and the whole `MemoryConflict` table had no migration.
- Generated the exact diff with `npx prisma migrate diff --from-config-datasource
  --to-schema prisma/schema.prisma --script` (via `DIRECT_URL`; the :6543 pooler times out on DDL
  sessions) and checked it was additive on an empty table (0 Memory rows; enum casts safe) before
  committing it as `prisma/migrations/20260927210000_memory_schema_sync/`. `migrate deploy` →
  "All migrations have been successfully applied." (7 migrations). `prisma generate` re-run.
- stage3-probe 3h afterwards: all six memory routes PASS.

**Probe honesty fix**
- `s4-gate-probe.ps1` step 7 compiled for a brand-new user and tripped the *correct* 400
  "No tasks to schedule"; the probe now seeds one task, compiles with `taskIds`, and gained step
  7b asserting `PATCH /proposals/:id/apply → APPLIED`. All steps green.

**Environment hygiene**
- Killed the stale pre-rebuild `node dist/main.js` (and an idle `nest start --watch`) that owned
  :3000, and restarted Nest from the new `dist` — the running server was two builds behind when
  this unit started, which masked whether fixes were live.
- `.gitignore` now covers the throwaway `*.log` / `*.out` / `*.err` captures the BUILD_LOG audit
  flagged; generated diff SQL was deleted.

**Verified (2026-09-28)**
- `npx tsc --noEmit` (backend + client): exit 0 · `npm run build` + `cd client && npm run build`: green
- `npx jest --silent`: **10 suites / 125 tests passed**
- `scripts/audit-live.js`: **18/18** incl. real-LLM proposal + confirm + persisted Task
- `scripts/stage3-probe.ps1`: **100 PASS / 0 FAIL / 0 WARN / 1 INFO** (3f reminder INFO is
  by-design: 0 notifications due)
- `scripts/s4-gate-probe.ps1`: steps 1–10 all OK (7 now compiles + applies real TimeBlocks)

**Files touched**
- Backend: `src/ai/assistant/interfaces/normalize-tool-input.ts` (new, + spec),
  `src/ai/assistant/assistant-orchestrator.service.ts`,
  `src/ai/intent/local-intent.classifier.ts` (new, + spec), `src/ai/intent/date-time.parser.ts`
  (new, + spec), `src/ai/intent/intent-parser.service.ts`,
  `src/ai/intent/interfaces/intent.interface.ts` (`CREATE_PROJECT`), `prisma/schema.prisma` (drift
  recorded by the new migration), `prisma/migrations/20260927210000_memory_schema_sync/` (new)
- Scripts: `scripts/repro-actions.js`, `scripts/check-zod.js`, `scripts/audit-live.js`,
  `scripts/audit-diag.js` (diagnostics kept for reuse), `scripts/s4-gate-probe.ps1` (steps 7/7b)
- Repo: `.gitignore`


### 2026-09-27 — Stage 3 closed: 3e–3m wired and live-verified ✅ (100 PASS / 0 FAIL / 0 WARN)



Finishes Stage 3. `scripts/stage3-probe.ps1` was rewritten as a stage-aware probe (3a–3m) that uses the
payloads the real client sends and asserts response **shape**, not just HTTP status. Final run against
the live Nest server on `:3000`: **100 PASS, 0 FAIL, 0 WARN, exit 0**. Backend and client builds green,
`npx jest src/scheduling/time-compiler src/scheduling/reality-engine` → 25/25.

**Backend defects found by the probe and fixed**
1. **Meetings `500`** — `meeting-intelligence.service.ts` used an invalid Prisma relation/field set, so
   `POST /api/meetings/prepare` and every `GET /api/meetings/:id/*` threw. Preparation and post-meeting
   results now persist and are retrievable (`action-items` / `commitments` / `follow-ups` included), and
   an unknown meeting id returns `404` instead of `500`.
2. **Rules `500`** — `rules-engine.service.ts` parsed `conditions` *after* the schema check, so a
   malformed payload reached Prisma. Validation now happens first: bad payload → `400`.
3. **Time Compiler produced zero blocks** for a user with no `AvailabilityRule` rows (the common case).
   `buildAvailableSlots()` now falls back to `preferences.workingHoursStart/End` as a derived DAILY rule
   instead of yielding no slots.
4. **`GET /api/reality/check` ignored `?includeResolved`** — the handler hard-coded `includeResolved:
   false`, so acknowledged/resolved deviations could never be reviewed; and since query strings are
   strings, the naive `||` form would have made `"false"` truthy. It now coerces explicitly (`=== 'true'`)
   and also honours `?entityTypes=`.
5. **Travel-time failed opaque `500` with no API key.** `google-maps.provider.ts` gained an
   `isConfigured` getter and `assertConfigured()`, now called at the top of every public method
   (`getTravelTime`, `getRouteMatrix`, `geocode`, `searchPlaces`, `getPlaceDetails`; `reverseGeocode`
   inherits it via `geocode`). Missing `GOOGLE_MAPS_API_KEY` is a deployment-config problem, so it
   surfaces as **`503 Service Unavailable`** with an actionable message. `GET /api/travel/status` reports
   `configured` from the provider getter rather than re-reading `process.env`.

**Calendar OAuth return leg** — `calendar-oauth-callback.controller.ts` is deliberately *not* JWT-guarded:
provider redirects carry no `Authorization` header, so the callback lives outside
`calendar.controller.ts`. Verified live: `GET /api/calendar/auth-url/google` returns an authUrl whose
`state` decodes to `connectionId:signedJwt`, and `GET /api/calendar/callback/google?code=bad&state=bad`
with no auth header → `302` to `/integrations?error=...`.

**Probe bugs fixed (it was reporting false failures)**
- `Hit()` treated every 4xx/5xx as a failure, so its own negative-path checks could never pass. It takes
  an `$expect` list now; `-> 400`, `-> 404` and the no-key `503` are PASSes.
- **PowerShell unrolls a single-element array on assignment.** `$devs = if ($x) { @($x.deviations) }`
  loses `.Count` when exactly one deviation exists, so `deviations detected` read as empty. The `@()`
  wrap must surround the whole `if` expression: `@(if ($x) { $x.deviations })`.
- The probe compiled "today". **On a weekend `allowWeekendScheduling=false` makes zero blocks correct**,
  so scheduling assertions now target `NextWeekday`, and task `dueDate` sits after the compile window
  (a same-day deadline clipped every slot). Tasks are created with `goalId` so the `goalId`-scope
  compile has rows to find.
- `state=eyJ` never matched because the query value is percent-encoded (`%3A`); it is URL-decoded first.
- 3g now seeds 5 past `MISSED` blocks — `SCHEDULE_DRIFT` only fires above 3 — giving ack/resolve/reopen
  real state to act on, and reopen calls `/reopen` (it previously re-called `/acknowledge`).
- `re-apply must be idempotent` asserted the wrong contract: the store refuses a second apply with `400`,
  which is the correct guard against duplicate TimeBlocks.

**Still open (Stage 4, not Stage 3)**
- Real Google travel estimates need a valid `GOOGLE_MAPS_API_KEY` (`503` is the designed no-key path).
- Assistant answer quality is unverified: `OPENAI_API_KEY` is still the literal placeholder, so only the
  rule-based fallback routes. The two title/intent bugs in the audit entry below remain live.
- External OAuth completion needs real provider credentials and a registered redirect URI; only the
  return leg is verified.
- Audit lines the probe did not close: commitment person/confidence persistence,
  `IntentType.CREATE_PROJECT`, `connections` token leak, `calendarId` UUID-vs-CUID, client-side
  command-center search.

### 2026-09-27 — Stage audit: which Stages are actually completed

This is a verification-of-record, not a build unit. Every claim was re-checked against source, git
history, or a live request — never against BUILD_LOG/PROGRESS prose alone.

**Stage 1 — Design Foundation: ✅ DONE (verified)**
`DESIGN_SYSTEM.md` present (9,983 B); tokens are real Tailwind v4 theme config rather than prose;
reference app shell + nav + week-grid built from it; `cd client && npm run build` green.

**Stage 2 — Frontend Screens: ✅ DONE 13/13 (verified)**
All routes in `client/src/App.tsx` resolve to real components (`TodayPage`, `CalendarPage`,
`TasksPage`, `AssistantPage`, `GoalsPage`, `ProjectsPage`, `CommitmentsPage`, `CompilerPage`,
`RealityPage`, `InsightsPage`, `MemoryPage`, `RulesPage`, `PermissionsPage`, `ProactivePage`,
`MeetingsPage`, `IntegrationsPage`, `SettingsPage`, `SearchPage`) plus the `Ctrl/⌘K` palette.
No `PlannedPage` placeholders remain.

**Stage 3 — Backend Tie-in: ⏳ 4/13 verified DONE, 9/13 wired-but-unverified**
_(Superseded the same day by "Stage 3 closed: 3e–3m wired and live-verified" above — 13/13 now.)_
- **3a ✅ 3b ✅ (create blocker now closed) 3c ✅ 3d ✅** — each has its own verified entry.
- **The table was wrong about 3e–3m, in both directions.** Commit `7080f70` ("Stage 3 (in progress)")
  bulk-rewrote `operations.ts`, `knowledge.ts`, `integrations.ts`, `calendar.ts`, `work.ts` and
  `time-blocks.ts` to call the live API in one shot, while the table kept saying "⬜". The code is
  further along than logged, but **no unit was individually tied-in-verified**, which is what DONE
  means in this loop. They are now marked `⚠️ WIRED, UNVERIFIED` rather than `⬜`.
- Backends genuinely missing underneath that wired code (grep of live `throw`s; `NotImplementedException`
  at `src/ai/proactive/proactive-assistant.service.ts:715,723,732`): Time Compiler apply, reality
  ack/resolve, recommendation status updates, proactive preferences + ack/dismiss/snooze,
  travel-time (no controller at all), OAuth callback wiring, meeting-result retrieval.

**Stage 4 — Backend Hardening: ⬜ NOT STARTED — but 4 of the 17 list items are already fixed**
- ✅ "no HTTP controller exposes the orchestrator" → `src/ai/assistant/assistant.controller.ts`
  (`@Controller('assistant')`, JWT-guarded, user-scoped).
- ✅ "`getPendingAction()` hard-coded `null`" → orchestrator now uses `prisma.assistantAction`
  (`assistant-orchestrator.service.ts:102,143,157,180`). Live-verified in `assistant-focus2.ps1`:
  confirm succeeds and a **re-confirm returns "Action not found or expired." with no duplicate row**
  (tasks 0→1 then holds; goals 0→1; events 0→1).
- ✅ "service writes `category`/`color` columns absent from Prisma `Event`" → 3b addendum below.
- ✅ (partial) "apply the pending migration / schema push" → 3 migrations applied, DB in sync.
- ❌ `IntentType` still lacks `CREATE_PROJECT`:
  `src/ai/intent/interfaces/intent.interface.ts` has exactly 9 members
  (`CREATE_GOAL, CREATE_TASK, CREATE_EVENT, SCHEDULE_TASK, RESCHEDULE_EVENT, CANCEL_EVENT,
  QUERY_AVAILABILITY, CHECK_CONFLICTS, GET_RECOMMENDATIONS`) while `create_project` is registered.
- ❌ commitment person/confidence persistence; proactive intervention persistence; permissions and
  rule-conflict JSON/string compat models; calendar route collision; `calendarId` UUID-vs-CUID;
  `connections` token leak; notification-preferences contract; meeting-result persistence
  (`GET /:meetingId/{preparation,post-meeting,action-items,commitments,deadlines,follow-ups}` all
  return `{ message: 'Retrieve …' }` stubs); Time Compiler ignoring `taskIds`/`goalId`/`projectId`
  (`src/scheduling/time-compiler/time-compiler.controller.ts:94` is still `tasks: []`).

**Two live assistant bugs confirmed by `scripts/assistant-focus2.ps1` (highest-value next work)**
1. **Title extraction is broken.** The whole prompt becomes the title — `"Create task buy milk"` →
   `{title: "Create task buy milk"}`, `"Create goal learn spanish"` → `{title: "Create goal learn spanish"}`.
   The mock responder strips the command prefix by regex (`client/src/lib/mock/assistant.ts:439,457,531`);
   the real orchestrator/tool path takes `title` verbatim.
2. **Intent routing misfires.** `"Create project redesign website"` → `create_task`, not a project,
   because `CREATE_PROJECT` doesn't exist and `IntentParserService` uses substring/date-first keyword
   matching. **No real AI provider is reachable:** `.env` sets `AI_PROVIDER="openai"` but
   `OPENAI_API_KEY` is still the literal placeholder `"your-openai-api-key"`, so the LLM path fails and
   the rule-based fallback is the *only* routing in effect locally — both bugs are user-visible, not
   theoretical.

**Hygiene at audit time**
Uncommitted: 8 modified files + untracked `scripts/` and the new migration dir. `live.out`, `live.err`,
`vite.out`, `vite.err` and `scripts/*.out|*.err|*.log` are throwaway captures from the background Nest
(:3000) and Vite (:3001) servers. A stale git worktree sits at `.kilo/worktrees/flame-situation/` with
older sources and an older BUILD_LOG — do not audit against it.

### 2026-09-27 — Stage 4g: workflow/calendar contract cleanup + stale client gating removed ✅ (live-verified)

Audit of the remaining Stage 4 surfaces (workflow, reality, calendar, time-compiler) followed by
the fixes that audit proved safe.

**Calendar contract canonicalization**
- The adapter `CalendarController` (`@Controller('calendar')`) had a dead `@Get('events')` route:
  the domain controller at `calendar/events` always wins `/api/calendar/events`, and the adapter
  version reached into `connectionService['prisma']` to return raw rows. **Removed** (with a
  comment explaining why).
- The domain `GET /api/calendar/events` now **accepts both query shapes**: `startDate/endDate`
  (canonical) and `timeMin/timeMax` (Google-style aliases). Aliases only fill in missing values.
  The client sends the canonical pair again.
- **New route: `PATCH /api/calendar/calendars/:id/visibility`** (adapter controller →
  `CalendarConnectionService.setCalendarVisibility`) persists `Calendar.isVisible`. Verified live:
  unknown id returns our 400 (`Calendar ... not found`), non-boolean body returns 400.
- `UpdateEventSchema` / `UpdateEventRequest` / domain `CalendarEvent` now carry `source`
  (`USER | AI_GENERATED | SYNCED`), and `updateEvent` writes it. Accepting an AI-generated event
  is now one live PATCH (`status: CONFIRMED, source: USER`); the response includes `source` via
  `toCalendarEvent`.
- **Route-order bug fixed:** `POST calendar/sync/:provider` was declared before `POST sync/all`,
  so `sync/all` matched as provider `ALL` and 500'd inside Prisma (`Invalid value for argument
  provider`). Static route now comes first; `sync/all` returns 200 `{}` for a user with no
  connections.

**Daily experience**
- `generateScheduleAdjustments()` was a `// Placeholder` returning `[]` — and its result was
  computed but never sent (the response hard-coded `scheduleAdjustments: []`). It now derives
  real suggestions from data already loaded in `generateEveningWrapup`: carried-over high-priority
  tasks, overdue commitments, back-to-back tomorrow meetings (<15 min gap), and tomorrow overload
  (>70% of an 8h day). Wired into the response. `GET /api/daily/evening` verified live.

**Client stale-gating cleanup (all verified against backend routes before enabling)**
- Proactive page: Acknowledge / Snooze / Dismiss no longer disabled; the "Backend returns 501"
  copy is gone (routes persist to `InterventionState` since earlier Stage 4 work).
- Reality page: deviation Acknowledge / Resolve no longer disabled; "not exposed by the current
  reality API" replaced with accurate persistence copy.
- Time Compiler: Apply now calls `PATCH /api/time-compiler/proposals/:id/apply` (new
  `operationsService.applyProposal`) which really writes TimeBlocks; Discard uses `:id/status`.
  Both un-disabled. The false "backend compiler currently receives no task records" warning
  (fixed by `scheduling-input-loader` earlier) was replaced with a generic empty-blocks note.
  Apply confirmation dialog text now differs between mock and live.
- `calendar.ts`: `canToggleCalendarVisibility` and `canAcceptProposal` flipped to `true`;
  `setCalendarVisible` calls the new visibility route and refetches instead of throwing.
- Removed a dead `API_UNAVAILABLE` constant in `assistant.ts` whose message was false (all
  assistant endpoints exist and pass in stage3-probe).

**Verified (2026-09-27)**
- `npx tsc --noEmit` (backend + client): exit 0 · `npm run build` (backend + client): exit 0
- `npx jest --silent`: 5 suites / 96 tests passed
- `scripts/stage3-probe.ps1`: 100 PASS / 0 FAIL (after rebuild + restart of the dist server)
- `scripts/s4f-commitment-probe.ps1`: all PASS
- `scripts/proxy-smoke.ps1` (through the :3001 Vite proxy): all 11 steps green
- `scripts/s4-gate-probe.ps1` (new): events accept both query shapes; PATCH status+source
  round-trips (`source=USER` read back); compile→apply writes `status=APPLIED`; daily evening
  emits adjustments. Calendar visibility PATCH confirmed wired (400 from handler, not 404).
- ESLint: no new non-prettier findings on edited files (the repo-wide CRLF prettier noise is
  pre-existing and untouched).

**Files touched**
- Backend: `src/calendar/calendar.controller.ts`, `src/calendar/interfaces/calendar.interface.ts`,
  `src/calendar/services/calendar.service.ts`, `src/calendar/domain/calendar-event.ts`,
  `src/integrations/calendar-adapters/calendar.controller.ts`,
  `src/integrations/calendar-adapters/calendar-connection.service.ts`,
  `src/daily-experience/daily-experience.service.ts`
- Client: `client/src/services/calendar.ts`, `client/src/services/operations.ts`,
  `client/src/services/types.ts`, `client/src/services/assistant.ts`,
  `client/src/pages/WorkflowPages.tsx`, `client/src/pages/CalendarPage.tsx`
- New script: `scripts/s4-gate-probe.ps1`


### 2026-09-27 — Stage 3b addendum: calendar category/color blocker CLOSED ✅ (live-verified)

3b's "Blocked (backend contract)" item — *"Live event creation throws by design"* — is fixed and
verified against a running backend. This closes the `(3b)` Stage 4 line inside Stage 3, because it
is a genuine backend contract bug, which the stage rules permit repairing.

**Backend (schema-level)**
- `prisma/schema.prisma`: added `Event.category EventCategory @default(PERSONAL)`,
  `Event.color String?`, `@@index([category])`, and `enum EventCategory`
  (`PERSONAL WORK MEETING APPOINTMENT REMINDER HOLIDAY BIRTHDAY TRAVEL FOCUS_TIME CUSTOM`).
  Values copied verbatim from the existing zod `CreateEventSchema.category` and
  `src/calendar/domain/calendar-event.ts` — nothing invented.
- Migration `20260927110000_add_event_category_color` applied; `npx prisma migrate status` →
  "Database schema is up to date!" (3 migrations). Prisma client regenerated.
- `src/ai/assistant/interfaces/tool-schemas.ts`: `CreateEventInputSchema` gained `category`
  (same 10-value enum) + `color`; `CreateEventOutputSchema` gained `category` + `color`.
- `src/ai/assistant/tools/create-event.tool.ts`: forwards `category` (default `PERSONAL`) and
  `color` into `CalendarService.createEvent` and returns both.

**Real backend bug found and fixed (this was NOT a schema problem)**
- `CalendarService.getEvents` assumed `options.status`/`options.category` were arrays, but Express
  gives a **bare string** for a single query value. `?category=MEETING` passed `.length > 0` on a
  string and produced a wrong/empty `IN` filter.
- Added `toArrayOption()` (normalises `undefined | string | string[]`, splits comma lists) and
  routed both filters through it. Single- and multi-value filters verified.

**Client**
- `client/src/services/calendar.ts`: `createEvent()` now does a real `POST /api/calendar/events`
  (maps `recurrenceRule` → `recurrence`, sends `category`/`color`) and returns `normalizeEvent(data)`.
  The hard `throw` is gone.
- `canCreateEvent` and `canPersistCategory` are now `true` (previously `USE_MOCK`-only).
  `canToggleCalendarVisibility` and `canAcceptProposal` stay `USE_MOCK` — still no route behind them.
- `CalendarPage.tsx`, `services/types.ts`, `lib/design-tokens.ts` comments/strings updated.

**Live verification — `scripts/calendar-check.ps1`**
```
A GET /api/calendar/events     HTTP OK count=0
B POST /api/calendar/events    HTTP OK id=cmujq49z3001ewguoa2ry2s3t
   category persisted          MEETING
   color persisted             #6366f1
C read after POST              count=1
   category on read            MEETING
   color on read               #6366f1
```

**Live verification — `scripts/calendar-check2.ps1` (assistant → calendar)**
```
1 proposed tool                create_event  action_...
1 confirm message              ✓ Create "…" completed successfully.
1 events visible to client     1
2 raw category                 PERSONAL      (default path works)
4 other user event count       0 (expect 0)  ← user scoping holds
```

**`ValidationPipe` check (why no DTO decorator change was needed)**
`CreateEventRequest` is a plain interface, so `whitelist`/`forbidNonWhitelisted` have no
class-validator metadata to strip against — `category`/`color` survive the pipe. Zod validation
runs inside `CalendarService` via `CreateEventSchema`.

**Resolved, was suspected:** the assistant `id` / `messageId` mismatch was a false alarm — the
orchestrator returns `messageId`, the controller maps it to `id`, the client reads `raw.id`.

**Still open after this addendum (carried to Stage 4, NOT fixed)**
- `calendarId: z.string().uuid()` in `CreateEventSchema` vs CUID ids in Prisma — latent contract bug.
- Two controllers register `GET /api/calendar/events` (`CalendarController` @ `calendar/events`,
  `CalendarAdaptersModule` @ `calendar`) — route collision unresolved.
- `GET /api/calendar/connections` still returns token fields to the browser.
- Luxon `DateTime` serialises as `{_utc,_timeZone}`, not ISO — confirmed live:
  `raw start type = PSCustomObject`, `{"_utc":"2026-09-27T12:16:49.442Z","_timeZone":"UTC"}`.
  Client `toIso()` absorbs it; the backend boundary is the correct place to fix it.
- No HTTP route exposes calendar `isVisible` — 3b's blocked visibility path is unchanged.

**Build + environment status at addendum time (re-run 2026-09-27)**
- `cd client && npm run build` → green, 2.31s, no type errors (known 500 kB entry-chunk warning only).
- `npm run build` (nest) → green.
- Nest serving on `http://localhost:3000/api` — `GET /api/health` → 200 `{"status":"ok","service":"CalAssist"}`.
- Vite preview on `http://localhost:3001` proxying `/api` + `/auth` to :3000 — the `scripts/*.ps1`
  harnesses use that base URL, so they exercise the real client proxy path, not just the raw API.
- `npx prisma migrate status` → "Database schema is up to date!" (3 migrations).

**Files touched**
- Modified: `prisma/schema.prisma`, `src/calendar/services/calendar.service.ts`,
  `src/ai/assistant/interfaces/tool-schemas.ts`, `src/ai/assistant/tools/create-event.tool.ts`,
  `client/src/services/calendar.ts`, `client/src/services/types.ts`,
  `client/src/pages/CalendarPage.tsx`, `client/src/lib/design-tokens.ts`
- New: `prisma/migrations/20260927110000_add_event_category_color/`, and `scripts/`
  (`calendar-check.ps1`, `calendar-check2.ps1`, `assistant-focus.ps1`, `assistant-focus2.ps1`,
  `proxy-smoke.ps1`) — verification harnesses, plus throwaway `*.out`/`*.err` capture files
  that should be deleted or git-ignored.


### 2026-09-27 — Stage 3, unit 3c: AI Assistant ✅

**Wired**
- `client/src/services/assistant.ts` now calls the real endpoints on the assistant controller:
  `POST /api/assistant/message`, `POST /api/assistant/confirm`, `GET/POST/PATCH/DELETE
  /api/assistant/conversations[/:id][/messages]`, `GET /api/assistant/tools`,
  `GET /api/assistant/recommendations`. Mock store remains only the `USE_MOCK` fallback.
- New `src/ai/assistant/assistant.controller.ts` — the assistant previously had no HTTP surface at
  all, so every client call would have 404'd. All routes are JWT-guarded and user-scoped.
- Orchestrator now owns persistence: the user turn and the assistant turn are written to
  `ConversationMessage` (proposals travel in `modelOutput` so cards resurrect after reload),
  pending proposals are recorded as `AssistantAction` rows, and `lastMessageAt` is bumped so the
  conversation list stays sorted. `confirmAction` resolves/replays a stored action instead of
  expecting the client to send the whole action back, and records the applied/rejected outcome.
- `IntentParserService` gained the typed `parseIntent(userId, text)` entry point the orchestrator
  calls, plus work/goal extraction so the calendar and work tools receive real parameters.
- `AssistantModule` imports the providers the orchestrator now injects.
- `AssistantContext` live-mode fixes: `removeConversation` and `send` refresh the conversation list
  from `GET /assistant/conversations` instead of the localStorage store, and the mock-only
  rename-after-create path is skipped in live mode because the controller already stores the title
  given to `POST /conversations`.

**Deferred**
- ~~`applyAction` still writes calendar changes through `calendarService` client-side~~ — superseded
  by the follow-up below: live confirms are server-owned and the client no longer re-applies them.
  `create_event` remains unavailable in live mode until the 3b category/color gap closes.
- ~~tasks/goals/projects actions are receipt-only until 3d~~ — resolved in 3d: the backend work tools
  execute for real (verified below).

**Follow-up fixes (same unit)**
- Confirm could never find its action: the orchestrator stored proposals with `createMany`, which
  assigns its own cuids, while `confirmAction` looked up the proposal id the client had received.
  The row is now created with `id: action.id`, so a confirm resolves the exact pending claim.
- The message route no longer guesses the turn with a global `findFirst(role: ASSISTANT,
  order: createdAt desc)` query (which misattributed the reply when a user has several
  conversations). `processMessage` now returns the stored `conversationId` + `messageId`, and the
  controller echoes them. The dead `...result` spread (which leaked raw orchestrator fields over
  the DTO) was removed.
- Live-mode double-write: the backend tool already mutates data during confirm, so
  `AssistantContext.confirmAction` no longer runs `applyAction` when live. Previously it called
  `calendarService.createEvent`, which throws in live mode (see 3b), so every accepted
  calendar proposal failed the UI even though the server had applied it.

**Verified**
- `cd client && npm run build` → green (2026-09-27, exit 0); `npm run build` (nest) → green, exit 0.
- **Live end-to-end smoke test now run** (2026-09-27, after creating `.env`; Postgres reachable,
  `prisma migrate status` → up to date, server boots and connects). Against the running API:
  - `POST /auth/register` + `POST /auth/login` → 201/200, `access_token` issued. Note auth login and
    register are deliberately unprefixed (`/auth/*`, see `setGlobalPrefix` excludes), everything
    else is `/api/*`; the Vite dev proxy forwards both.
  - `POST /assistant/conversations` → row persisted; `GET` lists it; `DELETE` removes it (list then 0).
  - `POST /assistant/message` → returns a real stored cuid `id` and real `conversationId` (not
    `assistant_<ts>`/`null`), and proposals carry the `action_<ts>_<rand>` id.
  - `GET /assistant/conversations/:id/messages` → 3 rows after send+confirm: USER, ASSISTANT
    (proposal payload present in `modelOutput`), and a SYSTEM receipt for the confirm outcome.
  - `POST /assistant/confirm` → resolves the stored action and executes server-side (previously
    "Action not found or expired"). A `create_task` confirm produced exactly **one** new task row
    (count 1 → 2), confirming the live double-apply fix from the client side is also correct at the
    data layer.
  - The AI providers are unconfigured (placeholder `OPENAI_API_KEY`, no Ollama running), so every
    turn falls back to the deterministic rule-based intent parser. The assistant flow therefore
    works offline, but tool *selection* is rule-based — live LLM behaviour is still unverified.
- Not covered: `create_event` confirm in live mode (blocked by the 3b `category`/`color` Prisma
  mismatch), and calendar UI refresh after an accepted event proposal — the client no longer
  re-applies writes live, so the calendar screen must refetch from the API instead.

**Files touched**
- New: `src/ai/assistant/assistant.controller.ts`
- Modified: `src/ai/assistant/assistant-orchestrator.service.ts`, `src/ai/assistant/assistant.module.ts`,
  `src/ai/assistant/interfaces/assistant-tools.interface.ts`,
  `src/ai/intent/intent-parser.service.ts`, `client/src/services/assistant.ts`,
  `client/src/contexts/AssistantContext.tsx`, `BUILD_LOG.md`

### 2026-09-27 — Stage 3, unit 3d: Goals / Projects / Tasks ✅

**Wired / verified against the live API** (server + Postgres running, real JWT user):
- `client/src/services/work.ts` calls `GET/POST/PATCH/DELETE /api/{goals,projects,tasks}[/:id]` and
  the routes all exist and are JWT-guarded. Confirmed live:
  - Create goal → `GoalDTO` shape matches exactly (`status: PENDING`, `targetDate`, timestamps).
  - Create project with `goalId` → `ProjectDTO` matches (`goalId`, `dueDate`).
  - Create task with `projectId` + `goalId` → `TaskDTO` matches, and the request field
    `estimatedDurationMinutes` is correctly mapped to the persisted `estimatedDurationMin`
    (returned as `45`). A minimal `{ title }` create also succeeds with Prisma defaults
    (`status PENDING`, `source USER`, `flexibility/energyRequirement MEDIUM`).
  - List endpoints return **plain arrays** as the service types promise, and the query filters the
    client sends actually work: `?status=COMPLETED&projectId=…`, `?status=IN_PROGRESS`,
    `GET /projects?goalId=…`.
  - PATCH + DELETE work; user scoping is enforced (a second user sees 0 goals/tasks and gets 404
    reading another user's goal).
- Client status unions match the Prisma enums exactly (`GoalStatus`, `ProjectStatus`, `TaskStatus`,
  `TaskSource`, `TaskFlexibility`, `EnergyLevel`), so no normalizer is needed for 3d. API responses
  carry extra additive fields the client types omit (`deletedAt`, `intentId`, `parentTaskId`,
  `dependencies`, `dependentOf`, `timeBlocks`) — harmless to the typed UI.

**Fixed — completion timestamps now derive from status transitions**
The three services disagreed with each other and with the Stage 2 mock rule
(complete ⇒ stamp `completedAt`, reopen ⇒ clear it):
- `tasks.service.ts` only set `completedAt` when the client explicitly sent it, so PATCHing
  `{ status: 'COMPLETED' }` left it null (observed live). It now stamps `new Date()` on completion,
  clears it when a completed task moves to any other status, and still honours an explicit
  `completedAt`.
- `goals.service.ts` stamped on completion but never cleared on reopen — now clears.
- `projects.service.ts` never touched `completedAt` at all despite the column existing — now
  matches the goal/task rule.
Verified live after rebuild: task/goal/project → COMPLETED returns a timestamp, → IN_PROGRESS /
PENDING returns null. `client/src/services/work.ts` needed no change; its mock branch already
implemented this rule, so the fix brings live behaviour in line with what the UI already assumed.

**Found but not fixed (Stage 4 candidates)**
- No runtime request validation on these routes: `@Body()` is typed with
  `Create/UpdateXxxRequest = z.infer<…>`, but the global pipe in `src/main.ts` is class-validator's
  `ValidationPipe`, which ignores Zod-inferred types. Bad payloads therefore reach Prisma — the
  first live task create returned a raw **500** from an invalid `projectId` FK instead of a 400.
  Fixing this belongs in the backend-hardening stage, not a data-source swap.
- `priority` defaults differ: Prisma uses `0`, the mock store uses `5`. Omitting priority on a live
  create yields `0`, which can silently reorder priority-sensitive UI.
- Hard deletes only: `deletedAt` exists on all three models but the services `delete()` and never
  filter on it, so it is a dead column here (soft-delete support would also need `findAll` filters).
- Work pages refresh by calling their loader on mount, so an assistant-confirmed `create_task`
  appears on the next navigation/refetch rather than instantly — same class of caveat as calendar.

**Verified**
- `npm run build` (nest) → green, exit 0. `cd client && npm run build` → green, exit 0 (pre-existing
  chunk-size warning only). No client code changed in this unit, so the 3d contract was confirmed by
  live HTTP calls rather than UI-only inspection.

**Files touched**
- Modified: `src/tasks/tasks.service.ts`, `src/goals/goals.service.ts`,
  `src/projects/projects.service.ts`, `BUILD_LOG.md`

### 2026-09-27 — Stage 3, unit 3b: Calendar ✅ (with one blocked path)

**Wired**
- `client/src/services/calendar.ts` reads the live engine: `GET /api/calendar/events`
  (+ `week/:weekStart`, `month/:year/:month`, `agenda`), `PATCH /api/calendar/events/:id`,
  `/:id/move`, `/:id/resize`, `DELETE /:id`, `POST /bulk`, `POST /conflicts/check`, and
  `GET /api/calendar/calendars`. Every response goes through `normalizeEvent()` so the grid
  tolerates `DateTime` class instances (`{_utc,_timeZone}`) as well as ISO strings.
- Capability flags degrade the UI honestly in live mode: `canCreateEvent`, `canPersistCategory`,
  `canToggleCalendarVisibility` are `USE_MOCK`-only, and the editor/rail/dialogs disable those
  controls instead of throwing at the user.
- Live `updateEvent` strips `category`/`color` before `PATCH`, because the Prisma `Event` model has
  no such columns (writing them fails the create/update).

**Blocked (backend contract, carried forward)**
- Live event creation throws by design: `CalendarService.createEvent` writes `category` and `color`
  onto `prisma.event.create`, which the schema rejects.
- Calendar visibility has no HTTP route — `isVisible` exists on the Prisma `Calendar` model but no
  controller exposes a patch.

**Verified**
- `cd client && npm run build` → green (2026-09-27); calendar routes smoke-checked against the
  controller source; no live DB was reachable during this turn.
  _(Superseded the same day — live DB later reachable and create/read/filter verified; see the
  "Stage 3b addendum" entry above. The original turn genuinely had no live DB.)_

**Files touched**
- Modified: `client/src/services/calendar.ts`, `client/src/services/types.ts`,
  `client/src/pages/CalendarPage.tsx`, `client/src/components/calendar/*`, `BUILD_LOG.md`

### 2026-09-27 — Stage 3, unit 3a: App shell + routing + nav + auth ✅

**Wired**
- Auth now uses the live API by default while the not-yet-integrated screen groups keep their independent mock switch.
- Login stores the returned JWT; session restore reads the real profile from `GET /api/users/me`.
- Registration follows the verified two-step contract: `POST /auth/register` creates the user but returns no token, then `POST /auth/login` establishes the session and stores its JWT.
- Logout calls `POST /api/auth/logout` and always clears the local token. The backend's global prefix excludes login/register but not logout.
- The demo credential button is shown only with `VITE_AUTH_USE_MOCK=1`; registration copy no longer calls the live account a local-only account.

**Deferred**
- Other data facades remain mocked until their Stage 3 units. A live backend was not available for end-to-end requests during this turn.
- Offline UI review remains available with `VITE_AUTH_USE_MOCK=1` (or dev-only `VITE_AUTH_BYPASS=1`).

**Verified**
- `cd client && npm run build` → green (2026-09-27); only the existing Vite chunk-size warning remains.
- Browser check: live-auth login screen has no demo-login control by default; mock-auth sign-in on port 3002 reaches Today as Demo User.
- Backend availability check: `localhost:3000` is not listening, so live login/register/profile/logout requests were not exercised.

**Files touched**
- Modified: `client/src/services/auth.ts`, `client/src/components/auth/LoginForm.tsx`, `client/src/components/auth/RegisterForm.tsx`, `client/src/contexts/AuthContext.tsx`, `client/src/vite-env.d.ts`, `BUILD_LOG.md`

### Stage 4 hardening items (known from PROGRESS.md)

> Status re-checked 2026-09-27 against source + a live backend (see "Stage audit" entry above).
> Four items below are now CLOSED by Stage 3 work; the rest remain open.

- [x] ~~Persist commitment person/related-entity metadata + confidence~~ — **CLOSED 2026-09-27 (4f)**:
      `Commitment` now stores `person`/`personEmail`/`confidence`/`context`/`relatedEntityType`/
      `relatedEntityId`; migration `20260927190000_commitment_person_metadata` applied. `LOW_CONFIDENCE`
      is now reachable for the first time. See the Stage 4f log entry.
- [ ] Proactive intervention persistence + ack/dismiss/snooze (currently 501)
- [ ] Replace JSON/string compat fields for permissions + rule conflicts with real models
- [x] ~~Apply pending migration / schema push~~ — **CLOSED 2026-09-27**: `npx prisma migrate status`
      → "Database schema is up to date!" (3 migrations, incl. `20260927110000_add_event_category_color`).
- [x] ~~**NEW (2c): no HTTP controller exposes `AssistantOrchestratorService`.**~~ — **CLOSED in 3c**:
      `src/ai/assistant/assistant.controller.ts` (`@Controller('assistant')`) exposes `POST /message`
      and `POST /confirm`, JWT-guarded and user-scoped.
- [ ] **NEW (2c): `IntentType` has no `CREATE_PROJECT` member** although a `create_project` tool is
      registered — "create a project" parses to no intent. Add the member or map it to `CREATE_GOAL`.
      **Still open and live-confirmed 2026-09-27**: `"Create project redesign website"` routes to
      `create_task`. `src/ai/intent/interfaces/intent.interface.ts` still has exactly 9 members.
- [x] ~~**NEW (2c): `getPendingAction()` returns a hard-coded `null`**~~ — **CLOSED in 3c**: the
      orchestrator persists proposals to `prisma.assistantAction`
      (`assistant-orchestrator.service.ts:102,143,157,180`). Live-verified 2026-09-27: confirm applies
      exactly one row, re-confirm returns "Action not found or expired." without duplicating.
- [ ] **NEW (2e): Time Compiler ignores its requested work.** `TimeCompilerController.buildSchedulingInput()`
  currently supplies `tasks: []` and empty fixed events/availability; `taskIds`, `goalId`, and
  `projectId` do not populate the input. Proposal list/get/apply endpoints are placeholders, and
  `compile-and-apply` does not create time blocks.
- [ ] **NEW (2k): Integration routes differ from PROGRESS.md.** The source controller is
  `@Controller('calendar')` (`/api/calendar/...`), not `/api/integrations/calendar/...`; no
  travel-time controller is present, despite the documented route. Stage 3 must not call a
  nonexistent travel endpoint.
- [ ] **NEW (2k): Notification preferences are not a usable read contract.**
  `GET /api/notifications/preferences` returns a message directing callers elsewhere; the
  POST body is `any`. Resolve the actual preference endpoint/model before the Stage 3 swap.
- [ ] **NEW (2l): Meeting results are not persisted/retrievable.** Preparation/process endpoints
  exist, but all `GET /:meetingId/...` methods return placeholder messages rather than saved
  outputs.
- [x] ~~**NEW (3b/3k): `GET /api/calendar/connections` returns token fields.**~~ — **CLOSED 2026-09-28
      (4i)**: `CalendarConnectionService` now answers the public routes with explicit Prisma
      `select`s (`PUBLIC_CONNECTION_SELECT` / `PUBLIC_CALENDAR_SELECT`) that exclude
      `accessToken`/`refreshToken`/`syncToken` at every depth; `getAllConnections()` delegates to
      `getPublicConnections()`. Live-verified by `scripts/s4i-probe.ps1` (incl. DB-truth check that
      tokens are still *stored*, just not returned). See the 4i log entry.
- [x] ~~**NEW (3b): Calendar event creation contracts cannot currently succeed.**~~ — **CLOSED 2026-09-28
      (4j)**: the `category`/`color` half closed 2026-09-27 (migration `20260927110000_add_event_category_color`);
      the zod half closed with `EntityIdSchema` (`z.string().min(1).max(64)`) replacing `z.string().uuid()`
      on `calendarId`/`eventIds` — live-verified: CUID create now round-trips through
      `ZodValidationPipe` (`scripts/s4j-probe.ps1` B1) and pinned by `calendar-boundary.spec.ts`.
- [x] ~~**NEW (3b): Calendar route collisions.**~~ — **CLOSED**: the adapters controller's
  `@Get('events')` was removed in Stage 4 (see the NOTE at `calendar.controller.ts:104` of the
  adapters module); `CalendarController` @ `calendar/events` is the sole owner, and 4j's probe A2
  exercises it live.
- [x] ~~**NEW (2f/2l): Commitment person metadata is not in the write/read DTO or Prisma model.**~~ — **CLOSED 2026-09-27 (4f)**, same work as the item above: columns, zod input/output schemas and the client `CommitmentDTO` all carry person/confidence/context/related entity now.
  Meeting extraction includes a person, but creating a commitment currently cannot persist it.
- [ ] _(further Stage 3 mismatches get appended here)_
- [x] ~~**NEW (3b addendum): `start`/`end` serialise as Luxon `DateTime` objects, not ISO strings.**~~
      — **CLOSED 2026-09-28 (4j)**: domain `DateTime.toJSON()` returns `toISOString()`, so
      `JSON.stringify` emits bare ISO at every boundary (events, views, participants, week/day
      shapes). Live-verified by `scripts/s4j-probe.ps1` (A1–A3: no `_utc`/`_timeZone` anywhere in
      raw payloads) and pinned by `src/calendar/domain/calendar-boundary.spec.ts`. The client's
      `toIso()` remains as a harmless defence for old captures; the server no longer needs it.
- [ ] **NEW (3c): Assistant event tool uses `startDate`/`endDate` while the calendar API uses
      `start`/`end`.** `CreateEventInputSchema` (`src/ai/assistant/interfaces/tool-schemas.ts`) and
      `CreateEventOutputSchema` are `startDate`/`endDate`; `CreateEventSchema` and the client
      `CalendarEventDTO` are `start`/`end`. `create-event.tool.ts` translates, so it works, but the
      two vocabularies will keep tripping people up — pick one.
- [ ] **NEW (3c): Tool argument extraction copies the whole prompt into `title`.** Observed live:
      `"Create task buy milk"` → `{"title":"Create task buy milk"}`, `"Create goal learn spanish"` →
      `{"title":"Create goal learn spanish"}`, `"Create event design review"` →
      `{"title":"Create event design review"}`. The mock responder strips the command prefix with a
      regex (`client/src/lib/mock/assistant.ts:439,457,531`); the real path does not.
- [ ] **NEW (3c): `IntentParserService` misroutes with substring/date-first matching.** Observed live:
      `"Create project redesign website"` → `create_task`. Needs word-boundary/explicit command
      triggers and priority ordering for `Create goal|project|task|event`. Compounded by there being
      no AI provider keys configured, so the rule-based fallback is the only routing in effect.

---

## Log

### 2026-09-27 — Stage 1: Design Foundation ✅

**Design decisions and reasons** (full rationale in `DESIGN_SYSTEM.md`)
1. **Moved Tailwind v3 → v4** (`@tailwindcss/vite`, CSS-first `@theme`). The existing shadcn
   `base-nova` primitives were already written in v4 syntax (`gap-(--card-spacing)`,
   `ring-3`, `data-open:`, `in-data-[…]`), which v3 silently dropped, so they were rendering
   unstyled. Deleted `tailwind.config.js` and `postcss.config.cjs`; `components.json` now has
   `tailwind.config: ""`.
2. **OKLCH tokens, light + designed dark mode**, all in `client/src/index.css`. Graphite
   neutrals, one brand hue (Iris 268), one reserved AI hue (Aurora 300).
3. **Violet is reserved for the AI layer.** It is excluded from the calendar palette so AI
   proposals can never be mistaken for user data.
4. **Level scale** (`none/low/medium/high/critical`) mapped 1:1 to the backend
   `ToolConfirmationLevelSchema`, `CommitmentRisk.riskLevel` and daily-experience
   `RiskLevelSchema` (verified by grep).
5. **Calendar palette**: 8 hues at matched L/C, defaults keyed on the Prisma `TimeBlockType`
   enum, plus `snapToCalendarHue()` for `Calendar.color` (Prisma default `#3b82f6`).
   `EventStatus` is shown by shape (dashed/opacity), not color.
6. **Dense type scale**: 13px body, 48px top bar, 28/32px rows, 8px base radius, 4px grid.
7. **Motion tokens** 80/140/200/280ms, decelerate only, no springs; reduced-motion honored.
8. **Assistant as a docked layer** (pushes content on desktop, sheet on mobile), `⌘J` from anywhere.
   `.proposal` style = dashed violet = "not yet real". `REQUIRES_CONFIRMATION` =
   MEDIUM/HIGH/CRITICAL, to be enforced in 2c/3.
9. **Keyboard-first**: `useHotkeys`, `G`+letter navigation, `[` sidebar, calendar
   `T/J/K/D/W/M/A`, `.kbd` hints.
10. **Reference screen**: the new shell (collapsible sidebar, top bar, mobile drawer, assistant
    panel) plus an empty Calendar week grid (working-hours wash, now-line, all-day lane,
    floating empty-state CTA). Checked in Playwright at 1440×900 and 390×844, light and dark,
    with zero console errors. Assumptions: weeks start Monday; phones default to Day view.

**Incidental fixes**
- `client/package.json`: `@types/react-dom` `^19.3.0` → `^18.3.1` (peer conflict with
  React 18 blocked `npm install`).
- `lib/utils.ts` now re-exports `cn` from the `cn` package (was bare `clsx`, no tailwind-merge).
- Added dev-only `VITE_AUTH_BYPASS=1` mock user (guarded by `import.meta.env.DEV`).

**Deferred**
- Today / Tasks / Login keep their old markup inside a temporary `LegacyPage` wrapper and use
  token-remapped legacy classes. Rebuild in 2a (Login) and 2d (Tasks); Today gets rebuilt when
  its data groups land.
- The "+ Event" button is disabled and the Month/Agenda views are placeholders (2b).
- The assistant composer is disabled (2c). The `⌘K` button dispatches `calassist:open-command`
  with no listener yet (2m).
- JS bundle is 314 kB (105 kB gzip). Route-level code splitting to be added in 2a.

**Files touched**
- New: `DESIGN_SYSTEM.md`, `BUILD_LOG.md`, `client/src/lib/design-tokens.ts`,
  `client/src/lib/hotkeys.ts`, `client/src/contexts/ThemeContext.tsx`, `client/src/vite-env.d.ts`,
  `client/src/components/ui/{kbd,badge}.tsx`,
  `client/src/components/layout/{Sidebar,PageHeader,LegacyPage,nav-config,shell-context}.tsx|ts`,
  `client/src/components/assistant/AssistantPanel.tsx`,
  `client/src/components/calendar/WeekGrid.tsx`
- Modified: `client/src/index.css`, `client/src/App.tsx`,
  `client/src/components/layout/DashboardLayout.tsx`, `client/src/pages/CalendarPage.tsx`,
  `client/src/pages/index.tsx`, `client/src/contexts/AuthContext.tsx`, `client/src/lib/utils.ts`,
  `client/index.html`, `client/vite.config.ts`, `client/components.json`,
  `client/package.json`, `client/package-lock.json`
- Deleted: `client/tailwind.config.js`, `client/postcss.config.cjs`

### 2026-09-27 — Stage 2, unit 2a: App shell + routing + nav + auth ✅

**Built**
- **Mock data layer** (`client/src/lib/mock/db.ts`) — the Stage 2 seam. In-memory store seeded with a
  demo user, persisted to `localStorage` (so a login survives reload), with simulated latency
  (220–480ms) so loading states are real and observable. Exposes `authenticate`, `createUser`,
  `setSession/getSessionUserId/clearSession`, `resetMockDb`.
- **Auth service facade** (`client/src/services/auth.ts`) — components never touch the mock directly.
  `USE_MOCK` is derived from `VITE_USE_MOCK`; Stage 3 flips it and the same call sites hit the real
  API. Endpoint paths and error strings were copied from the backend source, not the docs.
- **Real auth screens** — `AuthCard` (split layout; product statement on the right, hidden below `lg`),
  `LoginForm`, `RegisterForm`, `LoginPage`, `RegisterPage`, `RequireAuth`.
- **Shell/routing** — `App.tsx` rewritten around lazy routes; nav completed in `nav-config.ts`;
  `RouteFallback` + `Skeleton` + `Spinner` primitives added.

**Decisions and reasons**
1. **Auth contract verified against source, not PROGRESS.md.** `JwtStrategy.validate` returns
   `{ id, email }`; `usersService.findById` selects `id, email, name, createdAt, updatedAt, preferences,
   goals, projects`; `POST /auth/logout` deletes the `Session` row. `/auth/login|register|logout` sit
   outside the `api` prefix (`main.ts` `setGlobalPrefix` exclude list) while `/api/users/me` is inside
   it — the service mirrors that split exactly.
2. **`AuthContext` no longer navigates.** It exposes `status: 'loading' | 'authenticated' | 'anonymous'`
   and `RequireAuth` owns the redirect, passing `state.from`. The old context called `navigate('/')`
   inside `login`, which destroyed the "return to the page you asked for" behaviour and made the
   `/login` route unreachable on refresh.
3. **Session restore renders a shell-shaped skeleton, not a spinner** (`RequireAuth`). Same layout,
   zero layout shift, and no flash of the login screen on a deep-link refresh.
4. **Mock mode is the default in Stage 2 and is stated in the UI.** The sign-in screen offers a
   one-click demo account rather than hiding the fact that there is no backend yet. `VITE_AUTH_BYPASS=1`
   is retained for the Stage 1 design-review workflow.
5. **Register signs you straight in.** `POST /auth/register` returns the user but no token, so the form
   establishes a session immediately afterwards; the copy states plainly that there is no email
   verification step rather than implying one.
6. **Nav now covers the whole product surface** (Today · Calendar · Assistant | Plan: Goals, Projects,
   Tasks, Commitments, Compiler | Run: Meetings, Reality, Insights | System: Memory, Rules,
   Permissions, Integrations, Proactive). Every entry has a real route. Unbuilt groups render a
   `PlannedPage` that names the unit that will build it, so no stub reads as finished.
7. **Suspense boundary moved into `DashboardLayout`** (around `<Outlet/>`) so a lazy chunk resolves
   inside the real shell — sidebar and top bar never flicker. `LegacyPage` is now purely a header
   wrapper and needs no boundary of its own.

**Verified**
- `cd client && npm run build` → green. Main bundle 313.90 kB (104.81 kB gzip); pages now emit as
  separate chunks (`CalendarPage` 7.57 kB, `TodayPage` 8.18 kB, `TasksPage` 3.54 kB).

**Deferred (unchanged from Stage 1)**
- Today/Tasks keep their pre-design-system markup (`page-eyebrow`, `page-title`, `surface-card`,
  `field-control`). They are wrapped by `LegacyPage`; Tasks is rebuilt in 2d, Today when its data
  groups land. `LoginPage`/`LoginForm` are now built natively.
- `resetMockDb` is exported and unused — it is wired to the developer menu in 2m, not dead code to delete.
- Assistant composer still disabled (2c); `⌘K` still dispatches with no listener (2m).
- No real loading/error handling against a live backend yet — that is Stage 3's job; the mock layer's
  latency and thrown errors exercise the same UI paths in the meantime.

**Files touched**
- New: `client/src/lib/mock/db.ts`, `client/src/services/auth.ts`, `client/src/services/types.ts`,
  `client/src/components/auth/{AuthCard,RegisterForm}.tsx`, `client/src/pages/RegisterPage.tsx`,
  `client/src/components/layout/RouteFallback.tsx`, `client/src/components/ui/{skeleton,spinner}.tsx`
- Modified: `client/src/App.tsx`, `client/src/contexts/AuthContext.tsx`,
  `client/src/components/auth/{LoginForm,RequireAuth}.tsx`, `client/src/pages/{LoginPage,index}.tsx`,
  `client/src/components/layout/{DashboardLayout,LegacyPage,nav-config}.tsx|ts`,
  `client/src/vite-env.d.ts`

### 2026-09-27 — Stage 2, unit 2b: Calendar ✅

**Built**
- **Calendar contract types** (`client/src/services/types.ts`) — `EventStatus`, `EventSource`,
  `EventVisibility`, `EventCategory` (10 members), `CalendarProvider`, `ParticipantStatus`,
  `ParticipantRole`, `EventParticipantDTO`, `ReminderDTO`, `CalendarEventDTO`, `CalendarDTO`,
  `WorkingHours`, `DayViewDTO` / `WeekViewDTO` / `MonthViewDTO`, `CreateEventInput`,
  `UpdateEventInput`, `ResizeEventInput`, `BulkEventInput`, `ConflictDTO`. All enum members were
  grepped from `prisma/schema.prisma` and `src/calendar/interfaces/calendar.interface.ts`.
- **Date/geometry helpers** (`client/src/lib/datetime.ts`) — `toIso()` (tolerates the raw
  `{_utc,_timeZone}` shape the backend currently emits), `startOfIsoWeek`, `isoWeekDays`,
  `minutesOfDay`, `formatTime/formatRange/formatDuration`, `overlaps`, `offsetMinutes`,
  `snapTo(d, 15)`, and `layoutDay()` — the cluster/column overlap algorithm (same approach as
  Google Calendar: group transitively-overlapping events, then assign columns and event width).
- **RRULE engine** (`client/src/lib/rrule.ts`) — `parseRRule` (accepts both the string form stored on
  `Event.recurrenceRule` and the parsed object form), `toRRuleString`, `weeklyRule`, `dailyRule`,
  `monthlyRule`, `expandOccurrences(event, rangeStart, rangeEnd, max=400)`. Handles
  FREQ/INTERVAL/COUNT/UNTIL/BYDAY and subtracts `exceptionDates`.
- **Mock calendar store** (`client/src/lib/mock/calendar.ts`) — versioned `localStorage` envelope
  (`version: 3`), 4 calendars matching real `Calendar.color` semantics (personal `#3b82f6`,
  work `#6366f1`, focus `#14b8a6`, travel `#f59e0b`), and a ~22-event week seed: normal events,
  all-day items, a weekly-recurring `Weekly planning` (BYDAY=MO), a `Standup` (daily, COUNT=20),
  a multi-participant meeting, a travel block, and one **`source: 'AI_GENERATED'`** event in
  `NEEDS_ACTION` (`Deep work — Q4 planning`) so the violet `.proposal` treatment and the
  Accept/Reject path are exercised by real mock data.
- **Calendar service facade** (`client/src/services/calendar.ts`) — `normalizeEvent()` plus
  `calendarService.{listCalendars,setCalendarVisible,listEvents,weekView,monthView,agenda,
  createEvent,updateEvent,moveEvent,resizeEvent,deleteEvent,bulk,checkConflicts}`. Endpoint paths
  mirror the 18 routes on `@Controller('calendar/events')` exactly; components never import the mock.
- **UI components** — `TimeGrid` (pointer-event move/resize, 15-min snap, 3px drag threshold,
  violet ghost, all-day lane, now-line, working-hours wash), `MonthGrid` (6×7 Monday-first, max 3
  chips + "+N more"), `AgendaList` (day-grouped, today scrolled into view), `CalendarRail`
  (mini-month, calendar visibility toggles, type/status filters), `EventCard` / `AllDayChip` /
  `EventSummary`, `EventDetailDialog` (Accept/Reject/Adjust for AI proposals, Edit/Confirm/
  Duplicate/Delete for user events), `EventEditorDialog` (create/edit, recurrence presets,
  debounced 350 ms conflict probe). Added `client/src/components/ui/field.tsx` (Select, Textarea,
  Checkbox, Field) because no shadcn select/textarea existed yet.
- **`CalendarPage`** rewritten: day / week / month / agenda over one shared range query, all four
  states (loading skeleton, empty, error, populated), optimistic move/resize with revert on
  failure, hotkeys `t/j/k/←/→/d/w/m/a/n`.

**Decisions and reasons**
1. **Drag/resize is pointer-event based, not HTML5 DnD.** HTML5 drag has no reliable continuous
   position, so a 15-minute snap grid can't be rendered live. Pointer capture + `snapTo(15)` gives a
   real ghost and works with touch. A 3 px threshold keeps click-to-open from being eaten by a
   micro-drag.
2. **The AI proposal colour is a style, not a hue.** `.proposal` (dashed violet border) marks
   "not yet real"; accepting flips `status → CONFIRMED` and `source → USER` locally so the card
   loses the violet treatment. Violet stays reserved for AI, per Stage 1 §3.
3. **`normalizeEvent` is the compatibility shim for two real backend bugs** (see below) — it
   defaults a missing `category` and maps `eventParticipants → participants`, `recurrence →
   recurrenceRule`. Stage 4 should remove the need for it; until then it makes the Stage 3 data swap
   a one-line flag flip.
4. **Filters live in page state, not in the query.** The backend has no filter params on
   `GET /calendar/events`, so filtering client-side now means Stage 3 changes nothing in the
   component tree.
5. **`WeekGrid.tsx` deleted**, superseded by `TimeGrid` (same responsibilities, now with
   drag/resize). It was the Stage 1 reference screen.

**⚠ Two backend contract mismatches found (Stage 4 items, already appended to the hardening list)**
1. `src/calendar/services/calendar.service.ts` `toCalendarEvent()` reads `prismaEvent.category` and
   `prismaEvent.color`, and `createEvent()` writes `category`/`color` into `eventData` — but the
   Prisma `Event` model has **neither field**. `category` is therefore always `undefined` on the
   wire and a created event's category/colour are silently dropped.
2. `toCalendarEvent()` returns raw `DateTime` class instances for `start`/`end`. `DateTime` has no
   `toJSON()`, so they serialise as `{_utc, _timeZone}` instead of ISO-8601 strings, which breaks
   every consumer that expects `new Date(start)` to work.

**Verified**
- `cd client && npm run build` → green. `CalendarPage` chunk 114.76 kB (36.77 kB gzip); main
  `index` 315.52 kB (105.52 kB gzip); CSS 70.42 kB (13.22 kB gzip).

**Deferred**
- No save/update against a live backend (Stage 3). The AI Accept/Reject path mutates local state only.
- Recurring-event *editing* semantics ("this event / this and following / all") is not offered — the
  editor always edits the whole series, which matches the current `PATCH /:id` contract. Split-series
  editing needs `recurrenceId` support the backend does not expose yet.
- Conflict detection uses the debounced `POST /conflicts/check` shape but resolves locally in mock mode.

### 2026-09-27 — Stage 2, unit 2d: Goals / Projects / Tasks ✅

**Built**
- Three connected work surfaces with status filters, search, progress counts, due-date risk, and responsive list rows. Each row opens a detail dialog; create/edit forms share the API's supported fields, and task completion is a one-click status update.
- Added persistent, realistic mock goal/project/task data and a typed service facade. The mock handles CRUD, status changes, and task duration field translation; the real branch uses the verified `/api/goals`, `/api/projects`, and `/api/tasks` endpoints.
- Added loading skeletons, empty/no-match states, inline errors with retry, related goal/project labels, and cross-navigation between all three routes.
- Replaced the legacy Tasks surface and removed the placeholder wrapper around Goals and Projects.

**Contract decisions**
1. Goal reads support `ON_HOLD` per Prisma, but goal update validation does not; the detail editor omits that option rather than sending a rejected value.
2. Task create/update input is `estimatedDurationMinutes`; returned Prisma task records are `estimatedDurationMin`. The typed facade preserves both names at the boundary.
3. Projects and tasks may omit a parent goal/project; the UI keeps the API's nullable/optional relationship semantics.

**Deferred**
- Milestone editing and task dependency editing are not part of this unit's CRUD forms; the backend has separate milestone and dependency surfaces.
- Stage 3 replaces mock data with live endpoint responses and adds live-network behavior. This unit does not change backend code.

**Verified**
- `cd client && npm run build` → green (2026-09-27). The existing Vite chunk-size warning remains; no build errors.

**Files touched**
- New: `client/src/lib/mock/work.ts`, `client/src/services/work.ts`, `client/src/pages/WorkPage.tsx`
- Modified: `client/src/services/types.ts`, `client/src/pages/TasksPage.tsx`, `client/src/pages/index.tsx`, `client/src/App.tsx`, `BUILD_LOG.md`
- Free/busy remains outside the Stage 2 mock; 2e proposals use selected task estimates and working-hour preferences only.

**Files touched**
- New: `client/src/lib/datetime.ts`, `client/src/lib/rrule.ts`, `client/src/lib/mock/calendar.ts`,
  `client/src/services/calendar.ts`, `client/src/components/ui/field.tsx`,
  `client/src/components/calendar/{EventCard,TimeGrid,MonthGrid,AgendaList,CalendarRail,
  EventDetailDialog,EventEditorDialog}.tsx`
- Modified: `client/src/services/types.ts`, `client/src/lib/design-tokens.ts`
  (`EVENT_CATEGORY_HUE`, `EVENT_CATEGORY_LABEL`, `EVENT_STATUS_LABEL`, `eventColor()`, `calendarSwatch()`),
  `client/src/pages/CalendarPage.tsx`
- Deleted: `client/src/components/calendar/WeekGrid.tsx`

### 2026-09-27 — Stage 2, unit 2c: AI Assistant panel ✅

**Built**
- **Assistant contract types** (`client/src/services/types.ts`) — `ToolCategory`,
  `ToolConfirmationLevel`, `ToolResultStatus`, `ToolResult<T>`, `ToolCall`, `ProposedAction`,
  `AssistantResponse`, `ConfirmationRequest`, `MessageRole`, `ChatMessage`, `ConversationDTO`,
  `RecommendationType`/`Status`, `AssistantRecommendationDTO`, `AssistantToolDescriptor`,
  `IntentType`. All grep'd from `src/ai/assistant/interfaces/assistant-tools.interface.ts`,
  `src/ai/intent/interfaces/intent.interface.ts` and the prisma models — none invented.
- **Mock assistant store** (`client/src/lib/mock/assistant.ts`) — the 13-tool catalog copied
  verbatim from `src/ai/assistant/tools/*.tool.ts` (name/description/category/confirmationLevel),
  mirrors of the orchestrator's own `estimateImpact`/`isReversible` buckets, a seeded prior
  conversation with an already-applied proposal, and a **deterministic responder** that classifies
  with the backend's nine `IntentType` values and then emits proposals whose `input` objects satisfy
  the real tool schemas field-for-field. Conflict/availability answers are computed from the actual
  mock events, so what the assistant says matches the grid.
- **Service facade** (`client/src/services/assistant.ts`) — `listTools`, `listConversations`,
  `listMessages`, `send`, `confirm`, `createConversation`, `renameConversation`,
  `deleteConversation`, `listRecommendations`. Mock behind `USE_MOCK`; the real branch points at the
  proposed endpoints. Cancel/unknown-action copy matches `confirmAction`'s literal strings.
- **`AssistantContext`** — one shared conversation store for both surfaces. Optimistic send with
  failed-bubble revert, conversation auto-creation + title backfill from the first message, and
  `confirmAction` that **actually calls `calendarService`** for create/move/delete/update event, so
  an accepted proposal appears on the calendar exactly as if the user had done it by hand.
- **Components** — `AssistantThread` (role-distinct turns, collapsed tool-call disclosure, "Why
  this?", confidence badge, `ai-shimmer` thinking state, tail-follow that never yanks a scrolled-up
  reader), `ProposalCard` (level badge, full input table, **Adjust** in-place editing of primitive
  fields, impact + reversibility, Confirm/Reject), `AssistantComposer` (Enter sends, Shift+Enter
  newlines, auto-grow), `ConversationList`, and rewritten `AssistantPanel` (conversation switcher in
  the header).
- **Full-page `client/src/pages/AssistantPage.tsx`** — conversation rail, page-sized thread, plus a
  **Tools tab** listing all 13 tools with their real confirmation levels.

**Decisions and reasons**
1. **One context for both surfaces.** The docked panel and `/assistant` render the same thread; a
   proposal started in the panel is still there on the page. Two stores would have meant two truths.
2. **Confirming is real, not a receipt.** A confirmed `create_event`/`move_event`/`delete_event`/
   `update_event` goes through `calendarService`, so 2b and 2c are actually wired together — the
   strongest available proof that the mock seam is in the right place. Tasks/goals/projects are
   receipt-only because their stores are 2d's, and pretending otherwise would be a lie in the UI.
3. **`Adjust` edits before applying.** `ConfirmationRequest.modifiedInput` is in the real contract,
   so the UI exposes it rather than silently dropping a field the backend supports.
4. **The responder is deterministic and documented as such.** No LLM call in Stage 2, no fake
   "thinking" claims. Reason strings state the actual rule used (working hours, gaps found, count of
   events scanned).
5. **No new shadcn/ui primitives were added** — `Badge`, `Button`, `Skeleton`, `Kbd`,
   `DropdownMenu`, `Dialog` were all sufficient.

**⚠ Four more backend contract mismatches found (appended to Stage 4)**
1. **No controller exposes the orchestrator.** `processMessage`/`confirmAction` are service-only.
2. **`IntentType` lacks `CREATE_PROJECT`** even though a `create_project` tool exists.
3. **`getPendingAction()` is hard-coded to return `null`**, so `confirmAction` always answers
   "Action not found or expired." — confirmation is non-functional server-side today. The unused
   `AssistantAction` prisma model is the obvious home for it.
4. (carried from 2b) `Event.category`/`Event.color` absent from the Prisma `Event` model; `DateTime`
   does not serialise to ISO.

**Verified**
- `cd client && npm run build` → green. 6.15s, no type errors.

**Deferred**
- **The main chunk regressed to 501 kB (167 kB gzip)** from 316 kB, because `AssistantPanel` is
  imported eagerly by `DashboardLayout` and now pulls the thread + proposal card into the entry
  chunk. Route-level splitting of the assistant internals, or lazy-loading the panel body until
  first open, is the fix — do it in 2m alongside the command palette.
- Tool-call *argument* values are not shown (only the tool names + category); a full JSON viewer is
  a dev affordance, not a user one.
- `listRecommendations()` is implemented but currently returns `[]` in mock; the recommendation
  surface belongs to the Proactive feed (2j).
- Streaming responses are not simulated; `ai-shimmer` stands in for a token stream.

**Files touched**
- New: `client/src/lib/mock/assistant.ts`, `client/src/services/assistant.ts`,
  `client/src/contexts/AssistantContext.tsx`, `client/src/pages/AssistantPage.tsx`,
  `client/src/components/assistant/{AssistantThread,ProposalCard,AssistantComposer,ConversationList}.tsx`
- Modified: `client/src/services/types.ts`, `client/src/components/assistant/AssistantPanel.tsx`
  (rewritten), `client/src/components/layout/DashboardLayout.tsx` (AssistantProvider),
  `client/src/App.tsx` (real AssistantPage route), `client/src/pages/index.tsx` (stub removed)

### 2026-09-27 — Stage 2, units 2e–2m: Planning through Command Center ✅

**Built**
- **2e Time Compiler / Planning:** task and goal selection, date window, ordering strategy, generated schedule proposal, fixed review state, alternatives, tradeoffs, unsatisfied-window warning, and explicit apply confirmation. Applying updates only the local proposal; it does not write calendar blocks.
- **2f Commitments:** persistent mock create/edit/delete/status flow, deadline and risk summaries, risk factors, and detail view. Commitments use the service contract's `object`/`deadline`/`source` fields; person metadata is not represented as saved data.
- **2g Reality / Replanning:** deviation and impact summaries, recommendations with what/why/options, A/B/C re-plan review, and explicit confirmation before mock apply.
- **2h Memory Center:** search/type filtering, create/edit/archive, confirm inferred entries, confidence/scope/tags, and conflict resolution.
- **2i Rules:** natural-language entry with a reviewable interpretation before save, enabled/disabled rule list, structured condition display, and conflict resolution. Stage 2 interpretation is deterministic mock logic, not an AI parse.
- **2j Proactive / Permissions:** intervention ranking, acknowledge/dismiss/snooze, preference controls, autonomy templates, active policy boundaries, risk threshold, confirmation requirements, and explicit permission list. Delegate requires an extra confirmation.
- **2k Integrations:** mock Google/Outlook/local calendar connection state and sync feedback, travel-time estimate form, and notification channel/working-hours preferences.
- **2l Meeting Intelligence:** calendar meeting selection, preparation checklist/context/agenda, note processing, confidence-scored action/commitment/deadline/follow-up suggestions, and per-item confirmation before adding selected mock tasks, commitments, and deadlines.
- **2m Command Center:** searchable `Ctrl/⌘K` palette from the sidebar and keyboard, routes to all product surfaces, assistant-panel toggle, theme cycle, plus a searchable full-page command directory.
- All routes were switched from the `PlannedPage` placeholder to real components. The mock stores persist in `localStorage`; screen components use typed facades rather than importing seed data directly.

**Contract decisions and verified limitations**
1. Client DTOs were copied from the relevant source schemas/interfaces and serialized response mappings. Travel-time preview is explicitly a local estimate; source inspection found no travel-time HTTP controller.
2. Proactive action controls work in Stage 2 mock only. The documented backend ack/dismiss/snooze routes remain `501` and must be visibly disabled in Stage 3.
3. Integration connection paths come from `src/integrations/calendar-adapters/calendar.controller.ts` (`/api/calendar/...`), not the broader `/api/integrations/*` description in PROGRESS.md.
4. All consequential post-meeting extractions remain suggestions until individually selected and confirmed. A commitment person is displayed from extraction but is not persisted because the current commitment contract has no person field.

**Deferred**
- No live API calls or backend edits; Stage 3 performs the data-source swap in 3a–3m order.
- Real OAuth, provider sync, route estimation, and server-side meeting extraction/storage are not exercised by mock mode.
- Stage 2 schedule generation does not account for real calendar free/busy, and applying the mock proposal does not create time blocks.
- Audit history/undo and editing every autonomy-policy constraint are not included in the Permissions screen.

**Verified**
- `cd client && npm run build` → green (2026-09-27); TypeScript and Vite succeed. Vite reports the existing large-chunk warning (entry chunk about 514 kB).
- Browser smoke-tested `/compiler`, `/commitments`, `/reality`, `/memory`, `/rules`, `/proactive`, `/permissions`, `/integrations`, `/settings`, `/meetings`, `/insights`, `/search`, and the global command palette. All rendered expected headings with no page errors.

**Files touched**
- New: `client/src/services/workflow-types.ts`, `client/src/lib/mock/operations.ts`, `client/src/services/operations.ts`, `client/src/lib/mock/knowledge.ts`, `client/src/services/knowledge.ts`, `client/src/lib/mock/integrations.ts`, `client/src/services/integrations.ts`, `client/src/lib/commands.ts`, `client/src/components/layout/CommandCenter.tsx`, `client/src/pages/WorkflowPages.tsx`
- Modified: `client/src/pages/index.tsx`, `client/src/App.tsx`, `client/src/components/layout/DashboardLayout.tsx`, `BUILD_LOG.md`

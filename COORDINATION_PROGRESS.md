# COORDINATION_PROGRESS.md — Coordination layer upgrade loop

Working memory between iterations. Re-read at the start of every iteration; update at the end.
Mirrors the convention of `COMPLIANCE_LOOP.md` (per-item table with `file:line` + command evidence).

Repo: `d:\CAL_ASS_V1\CAL_ASSIST` · Branch: `feat/cross-functional-coordination` · created from verified tip `21e6997` (parent: `feature/redis-health-oauth-session`)
`TARGET_PHASE=1` · Planned isolated compose project: `calassist-coordination`

> **Naming warning — read this first.**
> This repo already uses `C1..C10` for the **Google OAuth / Limited-Use compliance loop**
> (`COMPLIANCE_LOOP.md:6`, `docs/GOOGLE_VERIFICATION.md:1` = "Owner Handoff (C10)").
> The upgrade work is tracked here under `C-00..C-11` — but those ids come from the **task brief**,
> **not** from the specification: the spec contains no ids of that form (grep `C-[0-9]{2}` → 0 hits)
> and no control-point table, so the series must never be attributed to it.
> Never write a bare `C10`/`C4` in this upgrade's docs or commit messages — always use the
> hyphenated `C-10`/`C-04` form. The two series are unrelated and must not be cross-referenced.

## Iteration status

Iteration counter: **2 — canonical C-01 delivered** (this pass). C-00 signed off (D1–D8 as proposed +
Phase 1 scope).

> **⚠ Id-namespace collision — resolved this pass.** The row below that the substrate commit
> (`75315a4`, subject "feat(coordination): **C-01** substrate …") labelled `C-01` is **not** canonical
> C-01. In the authoritative Phase-1 checklist, **C-01 = `CalendarProvider` contract (spec §6) +
> `MockCalendarAdapter` + shared contract suite**, and the coordination substrate is **C-00 supporting
> infrastructure** (decision D1's job runner). Canonical dependency order:
> `C-00 → C-01 → C-02 → C-06 → C-05 → C-07 → C-03 → C-04 → C-08 → C-10 → C-09 → C-11 → C-12`.
> Checklist IDs decide what is done; commit subjects do not. `75315a4` is **retained as-is** — not
> reverted, not re-counted as C-01. Canonical C-01 evidence is the new section further down.

| ID | Item | Status | Evidence (file:line + command output) |
|----|------|--------|----------------------------------------|
| C-00 | Repo/architecture audit vs. spec, decisions recorded before any code | **CLOSED — SIGNED OFF** | `docs/coordination-audit.md`. G1 + G2 closed; fresh-clone verification green (44 suites / 358 tests on clean clone of `8d5e510`); D1–D8 confirmed as proposed + Phase 1 scope agreed; branch `feat/cross-functional-coordination` created from `21e6997` (audit §8 all checked). |
| C-00b | **Substrate** (retlabelled this pass — commit `75315a4` called it "C-01"): `src/coordination/` outbox + job worker (D1) | **DELIVERED — MIGRATION NOT APPLIED** | 12 files under `src/coordination/` + `prisma/pending/20260929120000_c01_outbox_job/migration.sql`. Evidence: `npx tsc --noEmit` exit 0; `npx eslint --quiet src/coordination` exit 0; `npm test` **48/48 suites, 391/391 tests** (baseline 44/358 + 4 new suites / 33 tests); `npm run build` exit 0. Claim = `$queryRaw` `SELECT ... FOR UPDATE SKIP LOCKED` + leasing `UPDATE` inside ONE `$transaction` (`outbox.store.ts` `claimOne`). Zero new production deps; no `@nestjs/schedule` (the worker is a self-scheduled `setTimeout`). Worker **default OFF** (`COORDINATION_WORKER_ENABLED`) because polling hits a table that does not exist until the migration ships. No Prisma schema change (option C's schema surface not started). |
| **C-01 (canonical)** | `CalendarProvider` contract (spec §6) + `MockCalendarAdapter` + shared contract suite | **DELIVERED — PASS** | 4 new files under `src/integrations/calendar-adapters/`: `calendar-provider.interface.ts` (spec §6's six methods verbatim + Zod input/output schemas + `CalendarProviderError`/`EventNotFoundError`), `mock-calendar.adapter.ts` (`@Injectable`, deterministic: injected fixed clock `MOCK_FIXED_NOW`, monotonic id counters, no `Date.now`/`Math.random`), `calendar-provider.contract.ts` (reusable `describeCalendarProviderContract()`), `calendar-provider.contract.spec.ts` (runner: 13 contract tests + 8 mock-specific + 1 teeth-check). Evidence: `npx jest src/integrations/calendar-adapters` **8 suites / 61 tests** (was 7/39; +22); `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npx eslint --quiet <4 new files>` exit 0; `npm test` **49/49 suites, 413/413 tests** exit 0. No DB/network/OAuth. |
| C-02 (canonical) | §8 domain schema — `Meeting`/`MeetingParticipant`/`MeetingProposal`/`SchedulingPreference`/`AiActionLog` (+ `CalendarConnection`, `MeetingTemplate`, `MeetingBrief`, `FollowUp`, `Reminder`) | **NEXT — NOT STARTED** | Prisma **enums already exist** (`ProposalStatus`, `ParticipantStatus`, `PreferenceCategory`, `MeetingArtifactKind`, `Autonomy*`); the five **models are absent** (`grep '^model'` → no `Meeting`/`MeetingParticipant`/`MeetingProposal`/`SchedulingPreference`/`AiActionLog`). Per audit D5, `Event` stays the anchor and `Meeting` is a 1:1 extension. |
| (old "C-02+") | Substrate handlers still unregistered | DEFERRED | A claimed job with no handler nacks `NO_HANDLER_FOR_<type>` and retries — never crashes or loses the row. Wiring handlers belongs to C-08/C-09/C-11, not to the C-01→C-02 path. |

## Gate — closed, C-00 signed off

| # | Blocker | Detail | Who resolves |
|---|---------|--------|--------------|
| G1 | ~~Specification file is not present~~ | **CLOSED.** Spec placed at `docs/specs/CAL_ASSIST_Upgrade_Implementation_Specification.html` (19,898 B, 99 lines) and read in full — 26 sections + Appendix A (first sprint) + Appendix B (engineering rule). | ✅ done |
| G2 | ~~Branch base is undecided~~ | **CLOSED — user chose (a): commit, NOT stash.** No `git stash`/`reset`/`checkout` was used. The 83-path worktree became coarse commits over `6304ef6` — R3 fix alone first (`f04c4e2`), then infra/scripts (`545a54f`), app code (`e2c55ea`), tests (`dba6a46`), docs. Deliberately left uncommitted: the 4 deleted `calassist-architecture.visual-check.*.png`. Fresh-clone gate **met**; branch since created from `21e6997`. | ✅ done |

**Consequence:** the `PROVISIONAL` marker is **retired**. Every §3 row now cites a real spec section, or an
explicit **`none`** where the spec is genuinely silent — so silence is never misread as support.
**Two fabricated citations were removed** in pass 2: `§22.2` (a sub-section that does not exist, used to
justify "per-channel consent") and `§12` (used as the job runner's governor — but `§12` is *Executive/Boss
Mode*). Full before/after table in `docs/coordination-audit.md` §3.2.

**R3 follow-on (now done):** the **R3** email-provider fix was staged **alone** (provider + its spec file)
as the first commit on the branch (`f04c4e2`). The pre-fix content needs no working-tree backup — it is
exactly `git show 6304ef6:src/integrations/notification-service/email-notification.provider.ts`; the
scratch copy `.tmp-spec/email-provider.pre-r3.ts` (hash-verified equal) survives only as gitignored
scratch under the new `.tmp-spec/` ignore rule.

## Baseline capture (working tree)

| Fact | Value |
|------|-------|
| Branch / HEAD | `feature/redis-health-oauth-session` @ prep commits over `6304ef6` (R3 `f04c4e2` → infra → app → tests → docs) |
| Working tree | was dirty — **83 paths** (33 modified + 4 deleted + 46 untracked); now committed under G2 (a). Remaining: only the 4 deleted `*.visual-check.*.png`, left uncommitted by instruction |
| Node / npm / Docker | `v24.19.0` / `11.17.0` / `29.8.0` (build `88096ef`) |
| `src/coordination/` | absent (`Test-Path` → `False`) — zero collision with the planned module path |
| Server test suites | **44** `*.spec.ts` under `src/` (43 baseline + `email-notification.spec.ts` added by the R3 fix); Jest `rootDir: 'src'`, `testRegex: '.*\.spec\.ts$'` |
| Client test runner | **none** — `client/package.json:9` is `tsc && vite build` only |
| Spec | `docs/specs/CAL_ASSIST_Upgrade_Implementation_Specification.html` — 19,898 B, 99 lines, 26 sections + 2 appendices |
| Live containers (observed, untouched) | 3 compose projects already running: `calassist-hardening` (12), `calassist-lb` (9), `calassist-migration-audit` (5), plus Supabase `GRUB-POS` |

## Carry-forward decisions (from C-00, already decided — see audit §4, D1–D8)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Job runner (D1) | **Outbox table + `FOR UPDATE SKIP LOCKED`** | `pg-boss`/bullmq/cron are all absent; `pg` is **devDependency only** (`package.json:117`) while `@prisma/adapter-pg` is a production dep (`:70`) and `PrismaService` already builds a `PrismaPg` pool — so raw SQL via Prisma needs **zero** new production deps. **Repo-derived, not spec-derived:** the spec never names a runner (`queue`/`job`/`cron`/`worker` → 0 hits); only the *obligations* are in `§13`/`§22` |
| Validation (D2) | **Existing Zod `^3.24.1` + `ZodValidationPipe`** | Already the house pattern; global `ValidationPipe` is class-validator-only and does nothing for `z.infer` DTOs (`§18` requires "validate every request with Zod") |
| Frontend (D3) | **React 18 + Vite 5.4.11 + Tailwind 4** | 52 `.tsx`, 0 `.vue`; `§19` names screens only and prescribes no framework, so the brief's Vue 3 + shadcn-vue is factually wrong |
| Autonomy (D4) | **Extend `PermissionAction`/`PermissionScope` additively** | `src/permissions/` is a working service with `ASK`/`ALLOW`/`DENY` + audit + undo; `§9` names the exact granular actions to add |
| Meeting model (D5) | **`Event` stays the anchor; `Meeting` = 1:1 extension** | `EventParticipant` (`schema.prisma:379`) already carries attendee identity/RSVP; `§8` says "reuse existing Event…" and `§25` step 4 links `Meeting` to `Event` |
| Worker budget (D6) | Any poller must set `WORKER_POOL_CONNECTIONS` + `API_REPLICA_COUNT` | `src/config/connection-budget.ts:52-59` **throws at boot** when the total exceeds the budget |
| Phase scope (D7) | Outbound email, invite/Meet link, multi-attendee availability are **parked** | Blocked on §5 decisions R3/R4/R11 — not half-implemented. **R3's false success was still removed**: the provider now reports failure instead of fabricating a `messageId` |
| Isolation (D8) | `COMPOSE_PROJECT_NAME=calassist-coordination` + override file | Existing labels/ports key off `${COMPOSE_PROJECT_NAME:-cal_assist}` |

## Environment hygiene (constraints on every future iteration)

- Do **not** run `docker compose up/down` against the default project: `api` carries
  `deploy.replicas: 2` (`docker-compose.yml:147`), so `--scale api=3` emits a replicas warning,
  and Traefik ports `8080/8443` are already bound by running stacks.
- Any new stack needs its own `COMPOSE_PROJECT_NAME` **and** a port/env override file.
- `promtool` is available without a local install:
  `docker run --rm -v ${PWD}/prometheus:/etc/prometheus prom/prometheus:v2.52.0 promtool check rules /etc/prometheus/alerts.yml`

## Gate-closure checklist (iteration 1 — all items done; the forward step is at the end of this file)

1. ~~User places the spec at `docs/specs/...`~~ — **done** (G1 closed).
2. ~~User picks G2 (branch base: a, b, or c)~~ — **done: option (a), commit not stash.** R3 fix committed alone first (`f04c4e2`), then infra/app/tests/docs coarse commits. Nothing stashed, reset, or discarded; the 4 deleted visual-check PNGs stay uncommitted by instruction.
3. ~~**Fresh-clone verification** of the cleaned branch tip~~ — **DONE, GREEN.** Clone of `8d5e510` at
   `d:\CAL_ASS_V1\_freshclone` (nothing copied in): `npm ci` exit 0 (1118 pkgs); `npm run build` exit 0 —
   **after** `npx prisma generate`, which bare `npm ci` does not run (no `prepare` script; CI already does
   this, so pre-existing, not a G2 regression); `npm test` exit 0 — **44 suites / 358 tests passed**.
4. ~~Create `feat/cross-functional-coordination` from the cleaned tip and request gate approval~~ — **DONE: branch created from `21e6997`; user gave full sign-off (D1–D8 as proposed + Phase 1 scope).**
5. ~~No code until the user kicks off C-01~~ — **done: substrate kicked off and delivered** (option B).
   *Note: the substrate is **C-00b**, not canonical C-01 — see the id-namespace warning above.*

## Substrate (C-00b) delivered state + open follow-ups (iteration 1)

Shipped: `src/coordination/{coordination.module.ts, coordination.types.ts, coordination.controller.ts,
outbox/{outbox.types.ts, outbox.store.ts, outbox.service.ts}, jobs/{job-handlers.ts, job-worker.service.ts}}`
+ 4 co-located specs. Layout follows audit §6 exactly; D1 (no `@nestjs/schedule`, no new prod dep), D2 (Zod +
`ZodValidationPipe`), D6 (worker shares the budgeted `PrismaService` pool → `WORKER_POOL_CONNECTIONS` stays
`0`), D7 (no email/Meet/availability code) all honoured. Deliberately **not** done in this cut: the option-C
schema surface (`Meeting`/`MeetingParticipant`/`MeetingProposal`), the §9 permission additions, and R8/R9
(CI on `feat/*` + lint path list — option A, still open, so **these tests are not yet enforced on this
branch by CI**).

| Follow-up | Why it is not silently closed |
|-----------|-------------------------------|
| **Deploy the migration** | `prisma/pending/20260929120000_c01_outbox_job/migration.sql` is authored, NOT applied — it sits outside `prisma/migrations/` precisely so `MigrationStateGuard` cannot fail production boot while undeployed. Deploying = move it into `prisma/migrations/` + `npx prisma migrate deploy`, which **touches the live DB `.env` points at** (`aws-0-ap-northeast-1.pooler.supabase.com`) and therefore needs a separate explicit yes. Only then set `COORDINATION_WORKER_ENABLED=true`. |
| **PgBouncer vs. `SKIP LOCKED`** | `.env` `DATABASE_URL` uses `?pgbouncer=true` (Supabase transaction pooler). Row locks are transaction-scoped so the claim stays correct in principle, but Prisma interactive transactions over a transaction-pooling pooler **must be smoke-tested before enabling the worker** — use the session/direct connection if the pooler rejects them. |
| **No FK on `OutboxJob.userId`** | Deliberate: adding a FK now would break nothing but forces a schema-model change that belongs to the option-C cut. Consequence: deleting a user leaves outbox rows behind until `src/users/account-deletion.service.ts` (or a `ON DELETE CASCADE` FK) covers the table. Recorded, not hidden. |
| **Claim path has no real-DB test** | `SKIP LOCKED` is PostgreSQL-only (D1 forbids testing it on SQLite/emulated layers), so the 33 new specs mock the raw SQL layer and pin the SQL text. A true multi-replica claim test needs a real Postgres — local target available (`supabase_db_GRUB-POS` on `localhost:54322`). |
| **Zero job handlers registered** | By design. `OutboxJobTypeSchema` declares `REMINDER`/`FOLLOWUP`/`CHANNEL_RENEWAL`; claiming one nacks `NO_HANDLER_FOR_<type>` and retries — no crash, no lost row. Wiring a handler is a later control point. |
| **Worker env knobs** | `COORDINATION_WORKER_ENABLED` (default `false`), `_POLL_MS` (5000), `_BATCH_SIZE` (5), `_LEASE_SECONDS` (60), `_RETRY_SECONDS` (30) — validated at construction; out-of-range values throw instead of silently defaulting. Nothing added to `.env` in this cut. |

## Canonical C-01 delivered state (iteration 2)

**Spec anchors:** §6 "Provider Interface" (six methods + provider-neutral `conference`) and §3's suggested
files `calendar-provider.interface.ts` / `mock-calendar.adapter.ts`; Appendix A step 1 "Create calendar
provider interface and mock adapter"; §11 "hard constraints enforced in application code; human-readable
reasons, not opaque scores"; Appendix B "deterministic services validate and execute".

**Files (4, all new, all `src/integrations/calendar-adapters/`):**
- `calendar-provider.interface.ts` — `CalendarProvider` (spec §6 verbatim: `listCalendars`, `listEvents`,
  `createEvent`, `updateEvent`, `deleteEvent`, `findAvailability`), Zod schemas for calendar/event/query/
  result shapes, `CalendarProviderError` + `EventNotFoundError`, DI token `CALENDAR_PROVIDER` (documented
  as **not registered** — registering the mock would ship it as a production default).
- `mock-calendar.adapter.ts` — deterministic in-memory `@Injectable` implementation: fixed clock
  (`MOCK_FIXED_NOW`), monotonic `mock-evt-N`/`mock-cal-N` ids (contrast `LocalCalendarAdapter`, which uses
  `Date.now()`+`Math.random()` and so cannot anchor the suite), pure-arithmetic `findAvailability`
  honouring `bufferMinutes`, `workingHours`, `limit`/`truncated`.
- `calendar-provider.contract.ts` — reusable `describeCalendarProviderContract(name, ctx)` + `contractEvent()`
  fixture (13 assertions). Intentionally **not** a `.spec.ts`: Jest's `testRegex: '.*\.spec\.ts$'` would
  collect it as an empty failing suite.
- `calendar-provider.contract.spec.ts` — runner (13 contract + 8 mock-specific + 1 "suite has teeth"
  negative-control).

**Design decision recorded (naming):** spec §6's helper names collide with existing `src/` symbols
(`CreateEventInput`/`UpdateEventInput` in `tool-schemas.ts`; `CalendarProvider` is a Prisma enum). Auxiliary
types are `Provider*`-prefixed with an explicit §6→file mapping in the header; `CalendarProvider` itself
keeps the spec name because **no `src/` file imports the enum** (client-only). No existing file was renamed.

**Scope discipline:** no Google OAuth/Meet (C-03/C-04), no Prisma model change (C-02), no worker/migration
touch, no new dependencies. The legacy `CalendarAdapter` implementations are **not** bridged — they are
event/OAuth-oriented and do not implement `CalendarProvider`; faking compliance was rejected.

**Gate evidence (iteration 2):** `npx jest src/integrations/calendar-adapters` → **8 suites / 61 tests**;
`npx tsc --noEmit` → exit 0; `npx eslint --quiet <the 4 new files>` → exit 0; `npm run build` → exit 0;
`npm test` → **49/49 suites / 413/413 tests** (413 = 391 substrate-era baseline + 22 new).

**Known pre-existing conditions, NOT introduced here:** (a) linting whole directories (`src/calendar`,
`src/coordination`) reports `Delete ␍` on every file because `core.autocrlf=true` checks the tree out CRLF
while `.prettierrc` sets `endOfLine: "lf"` — repo-wide and unrelated to C-01, so new files were written
LF-first; (b) `npm test` once failed `src/common/redis/redis.module.spec.ts` with a `@redis/client`
`XPENDING` resolution error under parallel runs — it passes standalone (2/5) and on rerun, a node_modules
flake with zero coupling to C-01 (grep of the 4 new files for `redis` → 0).

## Next action (single, explicit)

6. **Canonical C-02** (now the live next step in `C-00 → C-01 → C-02 → …`; C-01 is PASS): add the §8 Prisma
   **models** — `Meeting` (1:1 extension of `Event` per D5), `MeetingParticipant`, `MeetingProposal`,
   `SchedulingPreference`, `AiActionLog` — over the enums that already exist. Then **C-06**.
   The outbox migration **stays unapplied** and the worker **stays disabled** until the PgBouncer
   `SKIP LOCKED` smoke test passes and the user explicitly approves touching the live DB.

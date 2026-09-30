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

Iteration counter: **3 — canonical C-02 delivered + review-corrected (schema diff pure-additive
231/0; migration regenerated & re-proved on isolated DBs; guard + test-DB safety unit-tested;
⚠ live DB touched by an accidental deploy late in the iteration — see INCIDENT in the C-02
evidence section)**. C-00 signed off (D1–D8 as proposed + Phase 1 scope); C-01 delivered.

> **⚠ Id-namespace collision — resolved this pass.** The row below that the substrate commit
> (`75315a4`, subject "feat(coordination): **C-01** substrate …") labelled `C-01` is **not** canonical
> C-01. In the authoritative Phase-1 checklist, **C-01 = `CalendarProvider` contract (spec §6) +
> `MockCalendarAdapter` + shared contract suite**, and the coordination substrate is **C-00 supporting
> infrastructure** (decision D1's job runner). Canonical dependency order:
> `C-00 → C-01 → C-02 → C-06 → C-05 → C-07 → C-03 → C-04 → C-08 → C-10 → C-09 → C-11 → C-12`.
> Checklist IDs decide what is done; commit subjects do not. Canonical C-01 evidence is the section
> further down.
>
> **Update (iteration 3):** the substrate commit `75315a4` has since been **reverted** in `2cc716d`
> — a normal forward commit, **no history rewriting**, `75315a4` remains an ancestor and its code is
> recoverable with `git show 75315a4`. The revert removed `src/coordination/`, the coordination API and
> `prisma/pending/20260929120000_c01_outbox_job/migration.sql` (which was applied to **no** database).
> The job runner returns in **Phase 2** behind an explicit Inngest-vs-outbox decision, recorded as the
> **D1 addendum** in `docs/coordination-audit.md` §4.

| ID | Item | Status | Evidence (file:line + command output) |
|----|------|--------|----------------------------------------|
| C-00 | Repo/architecture audit vs. spec, decisions recorded before any code | **CLOSED — SIGNED OFF** | `docs/coordination-audit.md`. G1 + G2 closed; fresh-clone verification green (44 suites / 358 tests on clean clone of `8d5e510`); D1–D8 confirmed as proposed + Phase 1 scope agreed; branch `feat/cross-functional-coordination` created from `21e6997` (audit §8 all checked). |
| C-00b | **Substrate** (commit `75315a4` called it "C-01"): `src/coordination/` outbox + job worker (D1) | **REVERTED in `2cc716d`** (was DELIVERED) | Reverted as a normal forward commit — **no history rewrite**; `75315a4` remains an ancestor and is recoverable via `git show 75315a4`. Removed: 12 files under `src/coordination/`, its `app.module.ts` registration, and `prisma/pending/20260929120000_c01_outbox_job/migration.sql` (applied to **no** database, live or otherwise). Post-revert gates: `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npm test` **45/45 suites, 380/380 tests** (49/413 − the 4 substrate suites / 33 tests). Job runner returns in **Phase 2** with an explicit Inngest-vs-outbox decision — audit §4 **D1 addendum**. |
| **C-01 (canonical)** | `CalendarProvider` contract (spec §6) + `MockCalendarAdapter` + shared contract suite | **DELIVERED — PASS** | 4 new files under `src/integrations/calendar-adapters/`: `calendar-provider.interface.ts` (spec §6's six methods verbatim + Zod input/output schemas + `CalendarProviderError`/`EventNotFoundError`), `mock-calendar.adapter.ts` (`@Injectable`, deterministic: injected fixed clock `MOCK_FIXED_NOW`, monotonic id counters, no `Date.now`/`Math.random`), `calendar-provider.contract.ts` (reusable `describeCalendarProviderContract()`), `calendar-provider.contract.spec.ts` (runner: 13 contract tests + 8 mock-specific + 1 teeth-check). Evidence: `npx jest src/integrations/calendar-adapters` **8 suites / 61 tests** (was 7/39; +22); `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npx eslint --quiet <4 new files>` exit 0; `npm test` **49/49 suites, 413/413 tests** exit 0. No DB/network/OAuth. |
| C-02 (canonical) | §8 domain schema — `Meeting`/`MeetingParticipant`/`MeetingProposal`/`SchedulingPreference`/`AiActionLog` (+ `CalendarConnection`, `MeetingTemplate`, `MeetingBrief`, `FollowUp`, `Reminder`) | **DELIVERED LOCALLY — REVIEW CORRECTED — ⚠ APPLIED TO LIVE DB BY ACCIDENT (30 Sep; see INCIDENT in C-02 evidence section)** | 5 models added + 1 enum `MeetingStatus`; additive-only, `Event` remains the calendar anchor and `Meeting.eventId` is a nullable **unique** 1:1 extension (D5). C-02 review refinements folded in: `Meeting.version Int @default(0)`, `Meeting.idempotencyKey String?` + `@@unique([userId, idempotencyKey])`, `MeetingProposal.expiresAt DateTime?` (column now, expiry *behaviour* owned by **C-07** per audit **D9**), `AiActionLog.eventType String`, `AiActionLog.decision` made nullable. Scope note: `CalendarConnection`/`Reminder` already existed; **no C-02 column was added to `CalendarConnection`** — deliberate deviation, deferred to C-03 (audit **D10**); `MeetingTemplate`/`MeetingBrief`/`FollowUp` absent by design (C-06/C-08). Migration `prisma/migrations/20260929150000_c02_coordination_domain/migration.sql` (178 lines / 6,228 B; 5 `CREATE TABLE`, 17 `CREATE INDEX`, 4 `CREATE UNIQUE INDEX`, 1 `CREATE TYPE`, 7 FK `ADD CONSTRAINT`; `DROP`/`TRUNCATE`/`DELETE FROM`/`RENAME` → **0**; every `ALTER TABLE` targets only the 5 new C-02 tables) generated **offline** with `prisma migrate diff` (schema HEAD → final schema, so pre-existing schema↔migration drift is not smuggled in), validated on isolated Docker Postgres `localhost:5433` only — see the C-02 evidence section at the end of this file. `prisma/schema.prisma` diff vs HEAD is now **231 insertions / 0 deletions** (normal diff == `git diff -w` — semantically equivalent). Whitespace churn eliminated by rebuilding the file from HEAD bytes + hand-aligned C-02 insertions only; `prisma format` was **not** run on the whole file (review item 5). Pooler guard rebuilt as a pure, unit-tested module (`src/config/migration-url.guard.ts`): rejects `?pgbouncer=true` and port `6543`, **accepts** `pooler.supabase.com:5432` (session mode), throws for `migrate`/`db push`/`db execute` only (never for `generate`) and — since the 30 Sep incident — requires `ALLOW_LIVE_MIGRATE=1` for any remote host. |
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

> **⚠ SUPERSEDED in iteration 3.** Everything below describes code that commit `2cc716d` **reverted**;
> `src/coordination/` and `prisma/pending/…c01_outbox_job/migration.sql` no longer exist in the tree.
> The section is retained because several rows remain **live constraints on Phase 2** (PgBouncer vs.
> `SKIP LOCKED`, pool budgeting, "no real-DB claim test") — the future Inngest-vs-outbox decision must
> answer them. Read it as history + open questions, not as shipped state.

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

## Canonical C-02 delivered state + review corrections (iteration 3)

**Scope:** the §8 Prisma domain spine — `Meeting`, `MeetingParticipant`, `MeetingProposal`,
`SchedulingPreference`, `AiActionLog` — plus the one new enum `MeetingStatus`. Purely additive;
no existing model, column, enum or table is altered. `Meeting.version`/`idempotencyKey` (with
`@@unique([userId, idempotencyKey])`), `MeetingProposal.expiresAt`, `AiActionLog.eventType` and the
nullable `AiActionLog.decision` were added per the C-02 review; approvals/expiry/single-use
semantics are decided in audit **D9** (C-07 owns the behaviour; single-use must be an atomic
conditional update), and the `CalendarConnection` deferral to C-03 is recorded as a deliberate
deviation in audit **D10**.

**Schema diff hygiene:** `prisma/schema.prisma` vs HEAD is **231 insertions / 0 deletions**
(normal diff == `git diff -w` — semantically equivalent). Achieved by rebuilding the file from
HEAD bytes plus hand-aligned C-02 insertions only; `prisma format` was **not** run on the whole
schema (review item 5).

**Migration:** `20260929150000_c02_coordination_domain/migration.sql` — 178 lines / 6,228 B;
5 `CREATE TABLE`, 17 `CREATE INDEX`, 4 `CREATE UNIQUE INDEX`, 1 `CREATE TYPE`, 7 FK
`ADD CONSTRAINT`; static scan: `DROP`/`TRUNCATE`/`DELETE FROM`/`RENAME` = **0**; all `ALTER TABLE`
targets are the 5 new tables. Regenerated offline via `prisma migrate diff --from-schema
<HEAD schema> --to-schema <final schema>` (schema→schema, so the known pre-existing schema↔migration
drift — `PermissionLevel` enum + two legacy `DROP DEFAULT` alter-tables present at HEAD — is *not*
smuggled into C-02; that drift stays recorded as a separate pre-existing condition).

**Isolated-DB proofs (Docker Postgres `localhost:5433`, container `c02-pg` only; full logs in
`.tmp-spec/`):** *(headline correction: the live DB was touched by accident during the CLI guard
proofs — see the INCIDENT block below this section.)*
- Scenario A (clean): deploy all 12 migrations → exit 0; `tables=57`, `c02tables=5`,
  `MeetingStatus` enum present, 3 FKs referencing `Meeting`; redeploy → "No pending migrations to
  apply." (`A_clean_deploy.log`, `A_redeploy.log`, `A_clean_chk.log`)
- Scenario B (backup-restore): deploy the 11 pre-C-02 migrations, seed legacy user/events,
  `pg_dump` → restore into fresh DB → counts identical (`tables=52`, `users=1`, `events=2`,
  `c02tables=0`); apply C-02 only → `tables=57`, `users=1`, `events=2` **preserved**, ledger 11→12;
  redeploy → no-op. Functional smoke (`c02-smoke.ts`, Prisma client): Meeting↔Event 1:1,
  cascade delete, `@@unique([meetingId, email])`, `version=0` default, idempotency replay rejected,
  nullable `decision`, `expiresAt` persisted, audit `SetNull` on meeting deletion →
  `C02_SMOKE_OK`. (`B_full.log`)

**⚠ INCIDENT — live DB was touched (30 Sep, this iteration).** While running the CLI-level guard
proofs, a cmd-harness env collision (`set DIRECT_URL=` clears the variable, then `dotenv/config`
re-loads the real `.env` DIRECT_URL) sent an unintended `npx prisma migrate deploy` at the **live
Supabase database** (`aws-0-ap-northeast-1.pooler.supabase.com:5432`). It applied exactly one
migration — `20260929150000_c02_coordination_domain` — the final 178-line, provably additive-only
SQL (5 CREATE TABLE, 21 CREATE INDEX incl. uniques, 1 CREATE TYPE, 7 FK constraints; 0
DROP/TRUNCATE/DELETE/RENAME; no existing table or column altered). The CLI reported the other 11
migrations already present, so the live ledger is now the full 12. **No legacy rows, schema
objects, or data were modified**; the live delta is the 5 new tables + 1 enum + indexes + FKs.
This is still a gate violation (the apply was never approved) and is disclosed here un-softened.
**Response:** a new live-opt-in rail in `prisma.config.ts` + `migration-url.guard.ts` now REFUSES
any schema-touching Prisma command against a non-loopback host unless `ALLOW_LIVE_MIGRATE=1` is
explicitly set (proven: rerunning the exact same harness now fails before connecting —
`.tmp-spec/ITEM1_rail_proof.log`). A prepared-but-**unexecuted** rollback script (5 drops +
`DROP TYPE` + ledger row delete) is tracked at
`prisma/rollback/20260929150000_c02_coordination_domain.rollback.sql`; whether to keep the
applied additive schema (recommended: it matches what C-02 will ship anyway) or roll the live DB
back is the user's call at this gate.

**Pooler guard (review item 1):** `src/config/migration-url.guard.ts` — pure functions consumed by
`prisma.config.ts`. Rejects `?pgbouncer=true` and port `6543`; **accepts**
`pooler.supabase.com:5432` (this project's real DIRECT_URL shape — the earlier hostname-based
rejection was wrong). Throws only when argv indicates `migrate`/`db push`/`db execute`; codegen
(`generate`, `validate`, `studio`) only warns; schema commands against a remote host additionally
require `ALLOW_LIVE_MIGRATE=1` (see INCIDENT above; Docker-compose service hosts and CI localhost
are unaffected). 29 unit tests + 6 test-DB-guard tests
(`src/config/migration-url.guard.spec.ts`, `src/config/test-database.guard.spec.ts`).

**Test-DB safety (review item 2):** DB-writing Jest specs now resolve their URL through
`src/config/test-database.guard.ts` — `TEST_DATABASE_URL` or a **loopback** `DATABASE_URL` from the
shell only; `.env` is never loaded by specs or by `scripts/jest-global-setup.js` any more. Proof
with the real `.env` (live Supabase URL) in place: `npm test` → 46 suites passed, 1 suite + 6 tests
skipped — no DB test connected (`NPMTEST_ITEM2.log`). With `TEST_DATABASE_URL` pointed at the
isolated container, the account-deletion spec runs against the restored C-02 DB and exercises the
new C-02 tables in its fixture/assertions.

**Account deletion (review item 7):** `account-deletion.service.ts` now clears
`MeetingParticipant`/`MeetingProposal` by parent meeting ids (step 2, FK-safe), then
`aiActionLog` → `schedulingPreference` → `meeting` in `USER_ID_TABLES` before `event`/`user`. The
`AiActionLog.meetingId onDelete: SetNull` policy is compatible: full erasure deletes audit rows by
`userId` explicitly, so nothing survives account deletion.

## Next action (single, explicit)

6. ~~**Canonical C-02**~~ — **DELIVERED LOCALLY + review-corrected (iteration 3; see the C-02 section
   above)**. Stopped at the explicit gate: the C-02 migration is **NOT applied to the live Supabase
   DB** and will not be until the user approves it. **Correction (incident, iteration 3):** the live
   DB WAS touched by an accidental `migrate deploy` during the CLI guard proofs — the additive C-02
   migration is now applied on the live Supabase DB. See the INCIDENT block in the C-02 evidence
   section; decision needed: keep (recommended) or run the prepared rollback. Then **C-06**.
   The outbox migration **stays unapplied** and the worker **stays disabled** until the PgBouncer
   `SKIP LOCKED` smoke test passes and the user explicitly approves touching the live DB.

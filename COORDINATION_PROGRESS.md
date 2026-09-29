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

Iteration counter: **0 CLOSED.** C-00 spec-reconciled, fresh-clone verified, and **signed off** by the user (D1–D8 as proposed + Phase 1 scope). Coordination branch created from `21e6997`; no code yet.

| ID | Item | Status | Evidence (file:line + command output) |
|----|------|--------|----------------------------------------|
| C-00 | Repo/architecture audit vs. spec, decisions recorded before any code | **CLOSED — SIGNED OFF** | `docs/coordination-audit.md`. G1 + G2 closed; fresh-clone verification green (44 suites / 358 tests on clean clone of `8d5e510`); D1–D8 confirmed as proposed + Phase 1 scope agreed; branch `feat/cross-functional-coordination` created from `21e6997` (audit §8 all checked). |
| C-01+ | Not started | **READY — AWAITING KICKOFF** | C-00 signed off; coordination branch exists. No code, no migration until the user explicitly starts C-01. |

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

## Next action (single, explicit)

1. ~~User places the spec at `docs/specs/...`~~ — **done** (G1 closed).
2. ~~User picks G2 (branch base: a, b, or c)~~ — **done: option (a), commit not stash.** R3 fix committed alone first (`f04c4e2`), then infra/app/tests/docs coarse commits. Nothing stashed, reset, or discarded; the 4 deleted visual-check PNGs stay uncommitted by instruction.
3. ~~**Fresh-clone verification** of the cleaned branch tip~~ — **DONE, GREEN.** Clone of `8d5e510` at
   `d:\CAL_ASS_V1\_freshclone` (nothing copied in): `npm ci` exit 0 (1118 pkgs); `npm run build` exit 0 —
   **after** `npx prisma generate`, which bare `npm ci` does not run (no `prepare` script; CI already does
   this, so pre-existing, not a G2 regression); `npm test` exit 0 — **44 suites / 358 tests passed**.
4. ~~Create `feat/cross-functional-coordination` from the cleaned tip and request gate approval~~ — **DONE: branch created from `21e6997`; user gave full sign-off (D1–D8 as proposed + Phase 1 scope).**
5. **No code, no migration** on `feat/cross-functional-coordination` until the user explicitly kicks off C-01.

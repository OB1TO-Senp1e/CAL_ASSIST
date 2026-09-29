# Coordination Layer — C-00 Repository Audit

| | |
|---|---|
| Repo | `d:\CAL_ASS_V1\CAL_ASSIST` |
| Branch / HEAD | `feature/redis-health-oauth-session` @ `6304ef6` + prep commits (R3 `f04c4e2`, infra `545a54f`, app `e2c55ea`, tests `dba6a46`, docs) |
| Working tree | **committed** under G2 option (a) — the 83 dirty paths (33 M + 4 D + 46 U, `git status --porcelain -uall`) became coarse commits over `6304ef6`; only the 4 deleted visual-check PNGs remain uncommitted, by instruction |
| Target phase | `TARGET_PHASE=1` |
| Iteration | 0 (C-00) — spec reconciliation, **pass 2**: every `Spec ref` re-verified against spec text |
| Spec | `docs/specs/CAL_ASSIST_Upgrade_Implementation_Specification.html` — 99 lines / 19,898 B, read in full |
| Status | **SPEC-REVIEWED — GATE CLEARED** (G1 + G2 closed; fresh-clone verification of the cleaned tip pending; see §1) |

## 1. Pre-conditions, and what that means for this document

Two inputs were required before C-00 could be signed off. **Both G1 and G2 are now closed.**

**G1 — CLOSED. The specification is now present and has been read.** It was **not** at `docs/specs/`;
the copy used here was placed from the user's Downloads folder (identical bytes, and the repo path is
now tracked as an untracked addition):

```
Placed at  docs/specs/CAL_ASSIST_Upgrade_Implementation_Specification.html   (19,898 B, 99 lines)
Source     C:\Users\Biswajit Dey\Downloads\CAL_ASSIST_Upgrade_Implementation_Specification.html
Structure  26 sections + Appendix A (first sprint) + Appendix B (engineering rule)
```

The original search that failed — recorded for audit traceability — was:

```
Test-Path docs/specs                                        -> False
docs/                    -> GOOGLE_VERIFICATION.md, PERFORMANCE.md   (nothing else)
repo-wide *.html (excl. node_modules) -> calassist-architecture.html,
                                          calassist-architecture.visual-check.html,
                                          client/index.html,
                                          client/public/calassist-architecture.html
Downloads / Desktop / Documents  -> CAL_ASSIST_Upgrade_Implementation_Specification.html  (found)
```

> **Scope boundary — read before trusting §3 row numbers.** The specification is a *capability and
> architecture* document. It contains **no** `C-00..C-11` identifiers, no control-point table, and no
> `UNVERIFIED` status vocabulary:
>
> ```
> spec grep 'C-[0-9]{2}|C[0-9]{1,2}\b'    -> 0 hits
> spec grep 'UNVERIFIED'                  -> 0 hits
> spec grep 'Inngest|workflow engine|queue|worker|cron|job'  -> 0 hits
> ```
>
> Those `C-00..C-11` ids and the `UNVERIFIED` marker come from the **task brief**, not from this spec.
> They are therefore tracked in this repo's own progress ledger (`COORDINATION_PROGRESS.md`), never
> attributed to the specification. Every `PROVISIONAL` row from iteration 0 has now been re-anchored to
> a real, cited **spec section** (§3–§26), or to an explicit **`none`** where the spec is genuinely
> silent — see the **Spec ref** column in §3 and the correction log in §3.2.

**G2 — CLOSED. The user chose (a): commit, do not stash.** The 83-path worktree on
`feature/redis-health-oauth-session` was committed in coarse groups — **infra/scripts**, **app code**,
**tests**, **docs** — preceded by the **R3 fix as its own commit** (`f04c4e2`, provider + spec only). No
`git stash`, `reset` or `checkout` was used, so nothing was discarded; the only paths deliberately left
uncommitted are the **4 deleted `calassist-architecture.visual-check.*.png`** files. Rejected: (b)
carrying the dirty worktree onto the new branch, and (c) branching from `origin/main`, which is
**regressive** — it drops `scripts/lb-smoke.ps1`, the Redis throttler storage
(`src/common/redis/redis-throttler.storage.ts`) and `src/config/connection-budget.spec.ts`.

**Branch-base rule for C-01:** `feat/cross-functional-coordination` is created **from the cleaned tip**,
but only after a **fresh clone** of that branch (nothing copied from the working tree) passes `npm ci`,
`npm run build` and `npm test`. Results are recorded in `COORDINATION_PROGRESS.md`.

**The R3 fix is now committed in isolation, so the risk this paragraph described is gone.** `f04c4e2`
contains **only** `email-notification.provider.ts` + `email-notification.spec.ts` — it can be reviewed or
reverted on its own. The pre-fix file needs no backup copy: it is exactly
`git show 6304ef6:src/integrations/notification-service/email-notification.provider.ts` (hash-verified
equal to the scratch copy that was kept at `.tmp-spec/email-provider.pre-r3.ts`, which is now gitignored
with the rest of `.tmp-spec/`).

**Evidence classes — what can be trusted, and how far:**

- **Repo-derived** (§2, §3 `Exists?`/`Where`, §4 D1–D8, §5 R3–R13) rest on `file:line` evidence or a
  re-runnable command. Complete and actionable.
- **Spec-derived** rows now cite a real **spec section** in the §3 `Spec ref` column (`§8 Database Model`,
  `§13 Templates/Invitations/Confirmations & Reminders`, ...), or an explicit **`none`** where the spec is
  silent (with the nearest analogue named in parentheses, so silence is never misread as support).
  All **25** rows were re-verified line-by-line against spec text in this pass, which **corrected 20 wrong
  citations** (22 rows changed in total — 2 silent rows also had their marker normalized) — see the
  correction log in §3.2. **No §3 citation now names a section that does not exist, and no §3 row is
  `PROVISIONAL` — the marker is retired.**
- **Brief-derived** is the only remaining unattributable class. It holds exactly two assertions that the
  spec does **not** support, both corrected here rather than treated as requirements:
  1. the `C-00..C-11` control-point ids (spec grep → 0 hits), and
  2. an `UNVERIFIED` availability status (spec grep → 0 hits; no such member exists in any repo type).
- The brief's **Vue 3 + shadcn-vue** frontend claim is likewise absent from the spec — `§19 Frontend`
  names *screens and components only* and prescribes **no** framework. The repo is React (§2), so this is
  a brief-side error with no spec backing; see D3.

**Deliverable that cannot be produced — stated plainly:** the brief asks for each `C-nn` to be mapped to
spec text. That is **impossible by construction**, because the specification assigns no such ids. This
document therefore anchors work to **spec sections** (which do exist) and keeps the brief's `C-nn` labels
solely in `COORDINATION_PROGRESS.md` as a task-ordering device.

> **Numbering collision — operational hazard.** This repository *already* uses `C1..C10` for the
> Google OAuth / Limited-Use compliance loop (`COMPLIANCE_LOOP.md:6` — "C1..C10 ALL DONE";
> `docs/GOOGLE_VERIFICATION.md:1` — "Owner Handoff (C10)"; `src/users/account-deletion.service.ts:14` — "C4").
> The brief's upgrade series (`C-00..C-11`) is an **unrelated series the specification never mentions**.
> Bare `C4`/`C10` must never appear in upgrade artefacts. Always hyphenate: `C-04`, `C-10`.

## 2. Inventory — what actually exists

| Area | Reality | Evidence |
|------|---------|----------|
| Framework | NestJS 10.4.22, TypeScript strict, CommonJS, `@app/* → src/*` | `package.json:61-69`, `tsconfig.json:3,29` |
| Persistence | Prisma; 62 models, 61 enums | `prisma/schema.prisma` (`^model`/`^enum` grep) |
| Tests | Jest + ts-jest, `rootDir: 'src'`, 43 specs | `jest.config.js:2-6` |
| Client | **React 18** + Vite 5.4.11 + Tailwind 4 + `@base-ui/react` — 52 `.tsx`, **0 `.vue`** | `client/package.json:13,25,27,44,46` |
| Client tests | **none** — build is `tsc && vite build` | `client/package.json:9` |
| Cache / rate limit | `redis ^4.7.1` (`createClient`), `RedisThrottlerStorage`, `@nestjs/throttler ^6.7.1` | `package.json:69,88`, `src/common/redis/redis.module.ts` |
| Validation | **Zod `^3.24.1`** + custom `ZodValidationPipe`; global pipe is class-validator `ValidationPipe` | `package.json:94`, `src/common/pipes/zod-validation.pipe.ts:33`, `src/main.ts:73-77` |
| Permissions / autonomy | Working service: `AutonomyPolicy`, templates, `ASK`/`ALLOW`/`DENY`, audit + undo | `src/permissions/permission.service.ts`, `permission.types.ts:3-37` |
| Calendar I/O | `CalendarProvider` interface + Google/Outlook/Apple/Local adapters, subscription sync, webhooks, PKCE, AES-256-GCM token crypto | `src/integrations/calendar-adapters/` (14 files) |
| Meeting intelligence | **already exists** — `src/meetings/` (5 files) + `MeetingArtifact` model | `src/meetings/*`, `prisma/schema.prisma:1183` |
| AI + consent | Provider abstraction, health, Redis protection; **consent gate already built** | `src/integrations/ai-providers/`, `src/ai/consent/ai-consent.service.ts` |
| Notifications | in-app / email / push / SMS providers behind one interface | `src/integrations/notification-service/` (9 files) |
| Scheduling engines | 6 engines, ~180 KB of `src/scheduling/**` | `src/scheduling/*` |
| Timezone / recurrence | Real `TimeZoneEngine` (Intl-based, DST-aware) + `RecurrenceEngine` | `src/calendar/domain/timezone-engine.ts:37`, `recurrence-engine.ts` |
| **Job runner / scheduler** | **NONE** — no `@nestjs/schedule`, `@Cron`, `@Interval`, bull, pg-boss, outbox, or advisory locks | grep `@nestjs/schedule\|@Cron\|@Interval\|@Timeout` → only a *comment* at `src/users/account-deletion.service.ts:23`; `SKIP LOCKED\|idempotenc\|outbox\|advisory` → only `openai-compatible.provider.ts:151` |
| **`src/coordination/`** | **absent** | `Test-Path src/coordination` → `False` |
| Docs | `README.md`, `ARCHITECTURE.md`, `BUILD_LOG.md`, `PROGRESS.md`, `COMPLIANCE_LOOP.md`, `PERF_LOOP.md`, `SCHEMA_DESIGN.md`, `DESIGN_SYSTEM.md`, `docs/GOOGLE_VERIFICATION.md`, `docs/PERFORMANCE.md` | root `*.md` listing |

**Baseline gap:** there is no scheduler/queue of any kind, and no idempotency or outbox primitive.
Whatever "Coordination layer" means, its execution substrate does not exist yet — this is the single
largest piece of net-new infrastructure in the upgrade.

## 3. Gap analysis

Every row below is **verified against the specification** (read in full; citations re-verified section by
section in **pass 2**). The `Spec ref` column cites the governing section — or says **`none`** where the
spec is genuinely silent, in which case the nearest *real* analogue is named in the note so that silence
is never misread as support. `Exists?` is repo fact. The former `PROVISIONAL` marker is retired — no row
depends on unread text any more, and no row cites a section that does not exist.

| # | Spec item | Spec ref | Exists? | Where | Gap / note |
|---|-----------|----------|---------|-------|-----------|
| 1 | Spec doc at `docs/specs/` | — | **Yes** | `docs/specs/CAL_ASSIST_Upgrade_Implementation_Specification.html` (19,898 B, 99 lines) | **G1 closed.** 26 sections + 2 appendices; contains **no** `C-nn` ids |
| 2 | `src/coordination/` module | §3, §25 | **No** | — | Clean path; `Test-Path src/coordination` → `False`. Zero collision. `§3` prescribes the literal directory (`src/coordination/ coordination-engine/ meeting-engine/ availability-engine/ invitation-engine/ confirmation-engine/ reminder-engine/ briefing-engine/ followup-engine/ src/preferences/`); `§25` step 5 routes new creation through it |
| 3 | Job runner / durable queue | **none** | **No** | — | **The spec never names a runner.** `queue`/`job`/`cron`/`worker` → **0 hits each**. The *need* is implied only by `§13` (24h/1h/15m reminders) and `§22` ("reminder fires"), so the mechanism is a **repo-derived** decision (**D1**) — no section can be cited for it or against it. Largest net-new item; no dep, no scheduler, no outbox |
| 4 | Idempotency keys | **none** | **No** (partial) | `openai-compatible.provider.ts:151` (unrelated comment) | `idempot*` → **0 hits** in the spec. Implied by `§22` ("failure recovery") and `§13` (each reminder fires once) but never specified — so the dedupe key is designed here, not wired from spec text |
| 5 | Distributed lock / single-flight | **none** | **No** | — | `replica`/`cluster` → **0 hits**; the spec is single-process in its vocabulary. Justified instead by `§18` ("enforce ownership/authorization at **service level**, not only controller level") and `§22` ("cross-user access denial"), which break under N replicas. 3 API replicas live today (`calassist-lb-api-1..3`), so this is real, not theoretical |
| 6 | Outbox / transactional delivery | **none** | **No** | — | `outbox` → **0 hits**. Required to avoid a dual-write between DB and provider, but the spec only states the *observable* requirement (`§13` confirmations/reminders tracked; `§22` "reminder fires"). **Not a second job system — see D1** |
| 7 | `Meeting` model + attendees | §8, §25 | **No** (overlap) | `MeetingArtifact` `schema.prisma:1183`; `EventParticipant` `:379` | **Not greenfield.** Census: `Meeting`, `MeetingParticipant`, `MeetingProposal`, `SchedulingPreference`, `MeetingTemplate` **ABSENT**; `Event`, `EventParticipant`, `MeetingArtifact`, `Reminder`, `Task`, `Goal`, `Project`, `Commitment`, `Preference` exist. Adding a `Meeting` table risks a second source of truth — see D5. `§8` lists all five missing entities; `§25` step 4 adds `Meeting` **"as a domain object linked to Event"** |
| 8 | Attendee availability, multi-person | §11, §12 | **No** | `src/calendar/services/availability-calculator.ts` (single-user) | Partial; live route `calendar.controller.ts:68` (`@Get('availability')`). `§11` names "**required attendees**, working hours, **time zones**" as hard constraints and requires "multiple candidate slots with explanations"; `§12` carries the per-user "preferred timezone". Process-local `toDate().getHours()` at `:211-212,259-260` → **wrong under DST** and wrong for attendees in other zones |
| 9 | `UNVERIFIED` availability / reasons | **none** | **No** | — | **Not a spec item** — the spec never uses this vocabulary (grep → 0 hits); the brief asserted it. Nearest real analogue: `ParticipantStatus` (`schema.prisma:1391` — `NEEDS_ACTION`, `ACCEPTED`, `DECLINED`, `TENTATIVE`, `DELEGATED`) and `EventStatus` (`:1359`). `§11` requires slots be returned **"with explanations"**, which is met by human-readable reasons, not by a new status. Left as a product question, **not** an invented enum |
| 10 | Calendar write with caller-supplied event ID | **none** | **No** | `calendar-adapter.interface.ts:133-141` | `createEvent(input)` returns only `{externalId, externalETag}`; the caller cannot dictate the ID → **no round-trip idempotency**. `§6` fixes this exact signature (`createEvent(input: CreateEventInput): Promise<CalendarEvent>`) and takes **no** caller id, and `idempot*` → **0 hits**, so the spec does not ask for one. Idempotency is met by the outbox dedupe key instead (R5) |
| 11 | `sendUpdates` / `conferenceData` (invite + Meet link) | §5, §6 | **No** | grep `conferenceData\|sendUpdates` → **0 hits** | `§5` requires "**For Meet-enabled events, request Calendar conference data** using the Google Meet conference solution" and scopes "minimized to the features actually enabled", plus "**attendee handling**". `§6` requires the abstract shape: `conference: { enabled: boolean; provider: 'google_meet' \| 'none' \| string }`. The Google field names are **not** in the spec — they are the implementation. `google-calendar.adapter.ts:25-29` requests only `calendar.events` + `openid` + `email` — **no attendee/invite scope**. Parked by D7 |
| 12 | Email send | §13 | **Fake** | `email-notification.provider.ts:47-55` | **The provider simulated**: logged and returned `success: true` + `messageId: email_<ts>` with the real `sendMail` commented out. `§13` allows only "*optionally* send via a connected provider **after approval**", and requires in-app/email/push "as available" — so a fabricated success is both a false claim and an approval bypass. **Corrected under R3** — see §5; delivery itself stays parked by D7 |
| 13 | Consent gate for external send | §13, §18 | **Exists** | `src/ai/consent/ai-consent.service.ts` | Reusable: versioned, revocable, audited. **Covers AI processing, not outbound email.** `§13` gates sending on **approval** ("send via a connected provider after approval"); `§18` requires "audit permission checks, proposals, **approvals**, executions". **Invention removed:** the former `§22.2` citation does not exist — `§22` has no sub-sections, and `consent`/`privacy`/`per-channel` → **0 hits** in the spec |
| 14 | Autonomy / permission checks | §9 | **Exists** | `src/permissions/permission.types.ts:13-37` | `CONTACT_PEOPLE`, `NEGOTIATE_MEETING_TIMES`, `SYNC_CALENDAR`, `MODIFY_AUTONOMY_POLICIES` exist. `§9` **names the required granular set verbatim**: `calendar.read`, `calendar.create`, `calendar.update`, `calendar.delete`, `meeting.create`, `meeting.reschedule`, `meeting.cancel`, `email.draft`, `email.send`, `reminder.create`, `external_contact` — the repo has none of the `email.*`/`meeting.*`/`reminder.*` members. Extend additively (D4) |
| 15 | Audit trail for actions | §9, §18 | **Exists** | `PermissionService` audit + `AuditLog` `schema.prisma:1088` | No collision; `AiActionLog` is absent and not required. `§9` — "Every execution path must pass permission checks and **write an audit record**"; `§18` — "Audit permission checks, proposals, approvals, executions, provider errors and user overrides". Do **not** clone `AuditLog` |
| 16 | Conflict detection | §11, §16 | **Exists** | `src/calendar/services/conflict-detector.ts` (10.7 KB) | Reuse; extend for attendees rather than rewrite. `§11` lists "existing events … explicit blocked periods, commitments" as hard constraints; `§16` requires each replan proposal to list "impacted items, proposed new times, **conflicts** and why" |
| 17 | Timezone correctness | §11, §12 | **Exists** | `src/calendar/domain/timezone-engine.ts:37` | `AvailabilityCalculator` bypasses it. `§11` lists "**time zones**" as a hard constraint; `§12` requires a "preferred timezone"; `§22` requires unit tests for "**timezone conversions**". Fixing #8 = route through `TimeZoneEngine`, not new code |
| 18 | Metrics / alerts for new subsystem | §22 | **Partial** | `src/metrics/`, `prometheus/alerts.yml` | `metric` → **0 hits**, so there is **no spec requirement to add dashboards** — only `§22` "Performance: add benchmarks for availability queries, event synchronization and meeting proposal generation", which must be runnable in CI. Add alert rules only where they guard a spec-required flow. Verify with `docker run --rm ... prom/prometheus:v2.52.0 promtool check rules ...` |
| 19 | CI for `feat/*` | **none** | **No** | `.github/workflows/ci-cd.yml` | Runs on `main`/`develop` only → a `feat/coordination-*` branch gets **no CI at all**. Lint step pins 6 paths (`:32-37`). Neither CI triggers nor lint scope is the spec's subject; what the spec does demand is `§22` (unit/integration/E2E/security/performance suites) and `§26` ("tests covering the workflow") — **unenforceable without CI on the branch**. Repo-derived prerequisite |
| 20 | Client UI for coordination | §19 | **No** | `client/` (52 `.tsx`) | `§19` names **screens/components only and prescribes no framework** (`Vue`/`React`/`shadcn` → 0 hits) — the brief's "Vue 3 + shadcn-vue" has no spec basis. `§19`'s list maps 1:1 onto our plan: Ask composer, Schedule Meeting modal, Candidate Slots, Meeting Detail, Calendar Connections, Executive Preferences, Autonomy Controls, Meeting Dashboard, Meeting Brief, Follow-up panel, Daily Briefing — plus "**show what CAL_ASSIST understood before execution**" and "every external or destructive action should have a **visible approval state**". Build in React (D3). Hard blocker for any `§19` screen: **no client test runner** (`client/package.json:9` = `tsc && vite build`) |
| 21 | Webhook-driven sync | §18 | **Exists** | `src/integrations/calendar-adapters/calendar-webhook.*` | Real watch/stop + `CalendarPushChannel`. `§18` requires tokens refreshed securely and connections revoked cleanly; `webhook`/`watch`/`renew` → **0 hits**, so push delivery is a repo capability, not a spec one. **Nothing auto-registers watches on connect** |
| 22 | Channel/watch renewal job | §13, §18 | **No** | `COMPLIANCE_LOOP.md` §7 (open follow-up) | Natural first consumer of the job runner (#3). `§13` obliges the system to keep reminders/confirmations live (24h/1h/15m) and `§18` to revoke connections cleanly — both decay silently if a watch lapses. `renew` → 0 hits: the *job* is unspec'd (its runner is D1), only the *obligation* has a spec anchor |
| 23 | Per-user model routing | **none** | **No** | `src/integrations/ai-providers/` | **Not a spec requirement.** `routing` → 0 hits; `§2` requires only "pluggable providers", which exists. The nearest real spec items are `§12`'s per-user *scheduling* preferences (duration, buffer, timezone, conference provider) — **model** choice per user is not among them. `Preference` (`schema.prisma:99`) could carry it — `PreferenceCategory` (`:1281-1289`) has `AI_PERSONALITY` — but that is product scope, not a spec gap |
| 24 | Tasks/goals/projects as coordination surfaces | §14, §15 | **Exists** | `Task` `:190`, `Goal` `:115`, `Project` `:140`, `Commitment` `:420` | Models exist; the spec's coordination *behaviour* over them is the new part. `§14` — follow-up engine turns notes into "proposed action items, owners, due dates … **linked to the meeting/project**"; `§15` — Reality Engine compares planned vs actual "to compare planned vs actual" and flag "downstream schedule impact" on commitments. `§16` adds replanning over "affected events/tasks/commitments" |
| 25 | Privacy / GDPR beyond the compliance loop | §18 | **Exists** (partial) | `src/users/account-deletion.service.ts`, `AiConsentService`, `CalendarConnection` `:317` | Token crypto + revocation exist. **`§18` is the anchor, not `§22`:** encrypt tokens at rest, least-privilege scopes, **service-level** authorization, prompt-injection defence ("treat external text as untrusted data … never allow external content to redefine permissions or tool policy"), audit, and "do not store private chain-of-thought". **Invention removed:** `consent`/`privacy`/`GDPR`/`per-channel` → **0 hits**; `§22` contains **no** per-channel-consent requirement |

**Not greenfield — the net-new surface is narrower than the section count suggests.** Measuring §3–§26
against the census above, the genuinely missing pieces are the **execution substrate** (#3/#4/#5/#6/#22),
the **meeting aggregate** (#7), **multi-attendee availability** (#8) and the **outbound side-effects**
(#10/#11/#12). Everything else extends an existing, working service.

### 3.1 What this revision changed

This table **replaces** the iteration-0 §3. Removed as **unsupported by the spec** and recorded here so
the deletion is auditable:

| Iteration-0 claim | Disposition | Reason |
|---|---|---|
| "`C-nn` maps to spec text" | **Dropped** | The spec contains no `C-nn` ids (grep → 0 hits). The mapping is unconstructible |
| A `UNVERIFIED` availability status as a spec capability | **Dropped from scope** | Not in the spec and not in the repo. Row 9 records this explicitly rather than inventing an enum |
| "Job runner" as a bare capability | **Kept, but re-anchored** | The spec never mentions a runner (`queue`/`job`/`cron`/`worker` → 0 hits), so D1 now names the engine concretely as a **repo-derived** decision instead of citing a section that does not exist |

### 3.2 Citation correction log (pass 2)

Iteration 0 wrote §3's `Spec ref` values **from the task brief's topic names, before the spec existed**.
Pass 1 then read the spec but accepted those guesses; **pass 2 re-derived every citation from the spec's own
table of contents and body text**. Result: **22 of the 25 rows changed** — **20 carried a citation that was
simply wrong**, and 2 (`9`, `19`) were already silent but unmarked. Only rows **1**, **12** and **20** were
correct as written. The spec's real section list is:

```
 1 Executive Summary            10 Natural-Language Scheduling   19 Frontend
 2 Existing Architecture        11 Availability and Scheduling   20 Example End-to-End Workflow
 3 New Engines and Modules      12 Executive/Boss Mode           21 Implementation Roadmap
 4 Product Capabilities         13 Templates, Invitations,       22 Testing & Acceptance Criteria
 5 Google Integration              Confirmations & Reminders     23 Free-First Strategy
 6 Provider Interface           14 Meeting Briefing & Follow-up  24 Prioritized Backlog
 7 Meeting Lifecycle            15 Reality Engine Integration    25 Migration Plan
 8 Database Model               16 Replanning                    26 Definition of Done
 9 Autonomy and Approval        17 API Expansion                A/B Appendices
```

| Row | Cited before (wrong) | Cited now | Actual spec content that exposed the error |
|---|---|---|---|
| 3 Job runner | `§12`, `§21` | **none** | `§12` = **Executive/Boss Mode**; `§21` = the 4-phase roadmap. `queue`/`job`/`cron`/`worker` → **0 hits**; the runner is implied, never named |
| 4 Idempotency | `§12`, `§21` | **none** | Same. `idempot*` → **0 hits** |
| 5 Lock | `§12` | **none** | Same. `replica`/`cluster` → **0 hits** |
| 6 Outbox | `§12` | **none** | Same. `outbox` → **0 hits** |
| 7 Meeting | `§8`, `§6` | `§8`, **`§25`** | `§25` step 4 — "Add Meeting **as a domain object linked to Event**" |
| 8 Availability | `§9`, `§10` | **`§11`**, `§12` | `§11` is *Availability and Scheduling* (attendees, notes, slots+explanations); `§9` is *Autonomy*, `§10` is *NL Scheduling* |
| 10 Caller event ID | `§10` | **none** | `§6` fixes `createEvent(input)` with **no** caller id; `§10` is NL scheduling |
| 11 Meet/conference | `§10` | **`§5`**, `§6` | `§5` — "request **Calendar conference data** using the Google Meet conference solution" |
| 13 Consent gate | `§22`, **`§22.2`** | **`§13`**, `§18` | `§22` has **no sub-sections**; the "per-channel consent" requirement was **invented**. `§13` = "send … after **approval**" |
| 14 Permissions | `§11` | **`§9`** | `§9` enumerates the exact permission strings (`calendar.read`, `email.send`, `meeting.cancel`, …) |
| 15 Audit | `§8`, `§22` | **`§9`**, `§18` | `§9` — "must … **write an audit record**"; `§18` — "Audit permission checks, proposals, approvals …" |
| 16 Conflict | `§9` | **`§11`**, `§16` | `§11` hard constraints; `§16` proposal format including "**conflicts**" |
| 17 Timezone | `§9`, `§23` | **`§11`**, `§12` | `§11` "time zones" hard constraint; `§12` "preferred timezone"; `§23` is *Free-First Strategy*. `§22` also tests "timezone conversions" |
| 18 Metrics | `§25` | **`§22`** | `metric` → **0 hits** in the spec; the only real anchor is `§22`'s benchmark requirement |
| 21 Webhooks | `§5`, `§18` | **`§18`** | `webhook`/`watch`/`renew` → **0 hits**. `§5` covers OAuth/scopes/token storage, not push channels |
| 22 Renewal job | `§12`, `§18` | **`§13`**, `§18` | `§13` keeps reminders/confirmations live; `§18` requires clean revocation. The *obligation* is in the spec, the *job* is not |
| 23 Model routing | `§7` | **none** | `§7` = **Meeting Lifecycle** states; `routing` → **0 hits**. Not a spec requirement at all |
| 24 Tasks/goals | `§15`, `§16` | **`§14`**, `§15` | `§14` — follow-ups become "action items … **linked to the meeting/project**" |
| 25 Privacy | `§22` | **`§18`** | `§18` is *Security* (encryption at rest, least privilege, prompt injection). `consent`/`privacy`/`GDPR` → **0 hits** |
| 2 Module path | `§3`, `§5` | `§3`, **`§25`** | `§3` gives the literal directory tree; `§5` is Google integration |
| 9 Row marker | `none` (unbolded) | **`none`** | Silent in both versions — marker normalized to the bold convention |
| 19 CI triggers | `—` (em dash) | **`none`** | Silent in both versions; `—` read as "not applicable", which is not the same claim as "the spec is silent" |

**Correct with no change:** rows **1**, **12**, **20** — the `—`/`none` on row 1 (`§1` G1 is a repo
precondition, not a spec item), `§13` for email send, and `§19` for frontend including its no-framework
finding, all held up against spec text without amendment.

**Two defects were more than mis-numbering**, because they asserted requirements the spec never makes:

1. **`§22.2` per-channel consent** (row 13) — a non-existent sub-section used to justify scope. Removed;
   the real gate is `§13`/`§18` **approval**, which is what the repo's consent service must integrate with.
2. **`§12` as the job runner's governor** (rows 3–6, D1, §5 R3) — the spec's `§12` is *Executive/Boss Mode*,
   a per-user scheduling-preferences section. D1 is now explicitly **repo-derived**, which is honest:
   the runner's *observable* obligations come from `§13`/`§22`, but the mechanism is our choice.

**Ready for sign-off.** Every row above is closed against spec text. There are no `PROVISIONAL`,
`TBD` or "cannot be assessed" rows left in this section, and every citation was resolved against the
section list above rather than carried over from iteration 0.

## 4. Decisions taken at C-00 (`TARGET_PHASE=1`)

These are decisions about **how** to build, reachable from repo evidence alone. They are independent
of the spec's wording and should hold regardless of what the spec says. Product scope questions are
*not* decided here — they are listed in §5 as contradictions to reconcile.

### D1 — One job system only: Postgres outbox + `FOR UPDATE SKIP LOCKED`. Inngest is **not** used.

**Answering the brief's D1 question directly.** The brief names **Inngest** as "the chosen workflow engine"
and asks me to state which mechanism handles **reminders** and **follow-ups**. So, explicitly:

| Deferred work (spec ref) | Owner | Why this one |
|---|---|---|
| **Reminders** (`§13`) | **Outbox**, consumed by the in-process job worker | Fires at a *stored* instant; each reminder has a row, a dedupe key and a terminal state. The outbox already models exactly that |
| **Follow-ups** (`§16`, `§18`) | **Outbox** | Same shape: created as a side-effect of a completed/recurring meeting, then delivered once |
| **Watch/channel renewal** (`§13`, `§18`) | **Outbox** | A periodic sweep with an idempotency key per `CalendarConnection`. The *obligation* to keep reminders live is `§13` and to revoke connections cleanly is `§18`; the periodic job itself is unspec'd, so its runner is D1, not a spec mandate |
| Anything else deferred | **Outbox** | Single mechanism — no exceptions |

**The outbox is the single job system; Inngest is not introduced.** These are not two alternatives to run
side-by-side, and this decision deliberately avoids running two. **Correcting the brief's premise:**
Inngest is **not** installed, **not** referenced anywhere, and **not** mentioned by the specification:

```
package.json deps+devDeps grep 'inngest|temporal|bull|pg-boss|agenda|bree|kafkajs|amqp|nats|sqs|rabbit'
                                        -> NONE
src/ scripts/ .github/ prisma/ grep 'inngest|Inngest|temporal.io|workflow engine'
                                        -> NONE
spec (full text) grep 'inngest|Inngest|temporal|workflow engine|durable execution'
                                        -> 0 / 0 / 0 / 0 / 0 hits
spec (full text) grep 'queue|worker|cron|job'
                                        -> 0 hits for each
```

So there is no "chosen workflow engine" to honour — the choice is being made **here, for the first time**,
and it is made on repo evidence. **Rejected** on that evidence: `pg-boss`, `bullmq`, `@nestjs/schedule`/
`@Cron`, an external broker, **and Inngest**.

| Consideration | Evidence |
|---|---|
| No queue library is installed | `package.json` deps + devDeps — no `pg-boss`, `bull`, `kafkajs`, `amqp`, `nats`, `inngest` |
| No scheduler exists | grep `@nestjs/schedule\|@Cron\|@Interval` → only a comment at `src/users/account-deletion.service.ts:23` |
| `pg` is **dev-only**, so importing it in `src/` breaks production | `package.json:96,117` — `pg` sits in `devDependencies`. A raw `pg.Pool` in runtime code would fail in a `--omit=dev` image |
| Prisma already has a production-grade driver | `package.json:70` `@prisma/adapter-pg ^7.10.0` (in `dependencies`); `src/common/services/prisma.service.ts:3,22` — `new PrismaPg({ connectionString, max: poolMax })` under a validated budget |
| Shared mutable state would need a new lock primitive | Redis exists (`redis ^4.7.1`) but its client is used for throttling/sessions only; a Redis queue would need `SETNX`-style locking that also does not exist |
| **Inngest would add a new production dependency the spec never asks for** | The spec describes *behavioural* requirements around deferred work (reminders that fire, confirmations tracked, idempotent delivery — `§13`, `§22`) and **no vendor**: `inngest`/`queue`/`job`/`worker`/`cron` → **0 hits**, and `§12` is *Executive/Boss Mode*, not a runner. Choosing it would add a hosted service, an API/SDK dependency, an outbound-call surface and a second set of failure modes for **zero** spec coverage |

**Consequence — one engine, by construction.** The outbox is a table polled with Prisma `$queryRaw` inside a
transaction using `SELECT ... FOR UPDATE SKIP LOCKED`, so N API replicas share the workload safely with
**zero new production dependencies**. `SKIP LOCKED` requires PostgreSQL (present: `postgres:16-alpine`), so
this is safe, but **must not be unit-tested against SQLite** — specs need a real DB or a mocked raw layer.

**Hard rule for every later phase — no dualing:** if a workflow engine (Inngest or otherwise) is ever
adopted, it becomes the **orchestrator** and the outbox is **demoted to the delivery primitive only** —
it keeps claim/ack/retry/dedupe, and the two never own the same responsibility. Adding an engine *beside*
a live outbox that still schedules the same reminder is a **defect**, not an upgrade: it produces duplicate
reminders, contradictory retry counts, and two places to look when a follow-up is not sent.

### D2 — Validation: existing Zod + `ZodValidationPipe`; never bare `z.infer` DTOs

- `zod ^3.24.1` is already a **production** dep (`package.json:94`) and used in 28+ files
  (`permission.types.ts:1`, `src/meetings/meeting-intelligence.types.ts:1`, `src/calendar/…`).
- The global pipe is class-validator's (`src/main.ts:73-77`, `whitelist: true`, `forbidNonWhitelisted: true`),
  which **does nothing** for `@Body() body: SomeZodInferredType` — the type vanishes at compile time.
- `src/common/pipes/zod-validation.pipe.ts` documents exactly this failure mode (a live 500 from Prisma
  instead of a 400) and is the house fix: `@Body(new ZodValidationPipe(Schema)) body: T`.
- **Rule for the coordination layer:** every controller body uses `ZodValidationPipe` with a schema from
  a `*.types.ts` beside it, mirroring `src/meetings/` and `src/permissions/`.

### D3 — Frontend work must be React

The brief's "Vue 3 + shadcn-vue" conflicts with fact: `client/package.json:25,27` = React 18.3.1 +
react-dom, `:46` Vite 5.4.11, `:44` Tailwind 4, `:13` `@base-ui/react`; **0 `.vue`**, **52 `.tsx`**.
There is also **no client test runner** (`:9` = `tsc && vite build`), so any client acceptance criterion
requiring component tests needs a runner added first — a scope item to surface, not to assume.

### D4 — Autonomy: extend the existing permission layer additively

`src/permissions/` is complete and in use: 5-level `AutonomyLevel` (`permission.types.ts:3-9`),
5 templates with `ASK`/`ALLOW`/`DENY` (`permission.service.ts:22-…`), audit records, and undo.
`CONTACT_PEOPLE` and `NEGOTIATE_MEETING_TIMES` already exist (`permission.types.ts:17-18`).
`§9` (Autonomy and Approval) requires "granular permissions instead of a single AI autonomy switch" and
**names the members**: `calendar.read`, `calendar.create`, `calendar.update`, `calendar.delete`,
`meeting.create`, `meeting.reschedule`, `meeting.cancel`, `email.draft`, `email.send`, `reminder.create`,
`external_contact`; it also fixes the 5 levels ("Suggest only ... Auto-coordinate") and the default
("external communication and destructive calendar changes should default to approval").
**Do not create a parallel autonomy model.** Add the missing members additively — expected:
`email.draft`, `email.send`, `external_contact`, `meeting.*` — plus any needed `PermissionScope`.
Adding enum members is a Prisma migration and must be additive-only.

### D5 — `Meeting` reuses existing structures; do not create a second source of truth

Already present: `src/meetings/meeting-intelligence.{service,controller,module,types}.ts`,
`meeting-artifact.store.ts`, `MeetingArtifact` (`schema.prisma:1183`), `EventParticipant`
(`:379`, with `email`/`displayName`/`status`/`isOrganizer`/`responseStatus`), and `Event`
(`:340`, with `recurrenceRule`, `timezone`, `calendarExternalId`, `externalETag`).
**Decision:** any coordination "meeting" links to `Event` (the time-anchored truth) and extends
`EventParticipant` rather than introducing an independent `Meeting`+`MeetingAttendee` pair. **The spec
concedes the point rather than contradicting it:** `§8` lists `Meeting`/`MeetingParticipant` as recommended
new entities but says "**Reuse existing** Event, Commitment, Task, Project, Goal and User entities where
appropriate", and `§25` migration step 4 states "Add Meeting **as a domain object linked to Event**". If the
spec demands a `Meeting` aggregate, it must be modelled as a **1:1 extension of `Event`** through a FK so
that scheduling, sync, timezone and deletion logic keep one authority. This preserves the existing
account-deletion sweep, which enumerates children by parent id
(`src/users/account-deletion.service.ts:28-35`) and would otherwise silently leak new tables.

### D6 — New worker capacity must go through the connection budget

`src/config/connection-budget.ts` already models `apiConnections + workerConnections + headroom` and
**throws at boot** if `total >= POSTGRES_MAX_CONNECTIONS` (`:52-59`). Defaults are
`DATABASE_POOL_MAX=10`, `API_REPLICA_COUNT=2`, `WORKER_POOL_CONNECTIONS=0`, `POSTGRES_MAX_CONNECTIONS=100`,
`DATABASE_CONNECTION_HEADROOM=20` → current total **40** (`.env.example:6-10`, `docker-compose.yml:82-86`).
**Consequence:** any poller/worker process must set `WORKER_POOL_CONNECTIONS` and
`API_REPLICA_COUNT` to match reality, or the app will refuse to start. With a default budget of 40/100
there is room for a small worker pool — but each replica's pool counts, so a 3-replica API plus workers
must be re-budgeted deliberately.

### D7 — `TARGET_PHASE=1` scope discipline

Only Phase 1 items are built. Capabilities below are explicitly **parked** and must not be
half-implemented inside Phase 1 work: any outbound email actually leaving the process (#12), the
`sendUpdates`/`conferenceData` calendar-write extensions (#11), and multi-attendee availability (#8).
Each gets its own phase; each is blocked on a decision in §5.

### D8 — Isolation of runtime verification

All runtime checks for this upgrade use a **dedicated** compose project, e.g.
`COMPOSE_PROJECT_NAME=calassist-coordination`, with a port/env override file. Reason from fact:
three unrelated stacks are already running and hold `8080/8443`; `api` declares `deploy.replicas: 2`
(`docker-compose.yml:147`) so `--scale api=3` emits a replicas warning; Traefik middlewares are keyed
to `${COMPOSE_PROJECT_NAME:-cal_assist}` (`:169`). **No existing volume may be touched** — the audit
observed but did not modify `cal_assist_*`, `calassist-lb_*`, `calassist-hardening_*`,
`calassist-migration-audit_*` or Supabase `GRUB-POS` data.

## 5. Contradictions and risks to reconcile against the spec

Reconciled against the spec read in full, with every citation re-verified in **pass 2** (§3.2). The former
"Impact if left unresolved" column is replaced by **Spec ref**: the row now cites the governing section, or
says **none** where the spec is genuinely silent (so silence is never misread as support). Every row ends in
a **decision or an explicit scope exclusion** — none is left "to decide later".

| # | Contradiction / risk | Spec ref | Resolution |
|---|---------------------|----------|------------|
| R1 | **Spec expected but unread** (§1 G1) | — | **CLOSED — and re-running §3 found defects.** Spec placed at `docs/specs/` and read in full; §3 now has 25 rows each carrying a real `Spec ref` (or an explicit **`none`**), and the `PROVISIONAL` marker is retired. Re-running §3 **corrected 20 wrong citations** (22 of 25 rows touched) that iteration 0 had guessed from the brief rather than the spec — most notably `§12`/`§16`/`§18` were attached to the job runner, but the spec's `§12` is *Executive/Boss Mode* and its `§16` is *Replanning*; it never mentions queues or jobs at all. All corrections are listed in §3.2 |
| R2 | **Brief's "Vue 3 + shadcn-vue" vs. React 18 + `@base-ui/react`; 0 `.vue` / 52 `.tsx`** | §19 | **Resolved by D3 — the brief is wrong, not the repo.** `§19 Frontend` names screens/components only and prescribes **no** framework (spec grep `Vue` → 0, `React` → 0, `shadcn` → 0). Build in React |
| R3 | **Email "sending" is simulated** — `nodemailer` absent, `sendMail` commented out, returned `success: true` + a fabricated `messageId` | §13 | **CLOSED — fixed in code, committed alone as `f04c4e2`.** The provider fabricated `sim_<ts>` when unconfigured and `email_<ts>` when configured, while delivering nothing; because `NotificationService` writes `NOTIFICATION_SENT` off `result.success`, undelivered mail was recorded as sent. It now returns `success: false` with `EMAIL_NOT_CONFIGURED` / `EMAIL_TRANSPORT_NOT_IMPLEMENTED` and **no** `messageId`. `email-notification.spec.ts` fails if any fabricated id ever returns (confirmed by reverse-mutation: 6 failures). **D7 still parks real outbound delivery in Phase 1** — this removes the false claim, it does not switch sending on |
| R4 | **Calendar invite semantics absent** — no `sendUpdates`, no `conferenceData` (0 grep hits) | §5, §6 | **Descoped to Phase 2 (D7); the contract is extended now, the Google write later.** `§5` requires Meet-enabled events via "Calendar conference data"; `§6` makes it **provider-neutral** (`conference: { enabled, provider: 'google_meet' \| 'none' \| string }`). Phase 1 lands the provider-neutral `conference` + attendee fields in the adapter contract and mock adapter; the Google `sendUpdates`/`conferenceData` write is Phase 2 |
| R5 | **No caller-supplied external event ID** — create returns `{externalId, externalETag}` only | §6, §18 | **Resolved by the outbox (D1), not by an adapter change.** The spec's `createEvent(input)` takes no caller id and uses no idempotency vocabulary (`idempot*` → 0 hits), so idempotency belongs to the **outbox dedupe key**, not to Google. No contract change |
| R6 | **`Meeting` overlap** — `src/meetings/` + `MeetingArtifact` + `EventParticipant` already exist | §8, §25 | **Resolved by D5, and the spec agrees with it.** `§8` lists `Meeting` as a new entity but says "**Reuse existing** Event, Commitment, Task, Project, Goal and User"; `§25` migration step 4 is "add Meeting **as a domain object linked to Event**". So `Event` stays the anchor and `Meeting` is a 1:1 extension through a FK. No second source of truth; the account-deletion sweep keeps working |
| R7 | **`C1..C10` (compliance) vs `C-00..C-11` (upgrade)** | none | **Resolved by the numbering rule; spec-verified as a brief-side artefact.** The spec contains **no** ids of either form (`C-[0-9]{2}` → 0 hits), so it can arbitrate nothing here. The upgrade series stays **hyphenated** (`C-04`, `C-10`) and lives only in `COORDINATION_PROGRESS.md`; the repo's Google-compliance `C1..C10` is untouched |
| R8 | **No CI on `feat/*`** (`.github/workflows/ci-cd.yml` triggers on `main`/`develop` only) | §22 | **Confirmed; Phase-1 prerequisite, spec-independent wiring.** `§22` requires unit, integration, E2E acceptance, security and performance tests, but says nothing about CI triggers — so this is a repo gap, not a spec contradiction. Add the branch pattern **before** Phase 1 code, or `§22`'s test requirements are unenforceable on the coordination branch |
| R9 | **Lint scope is pinned to 6 paths** (`ci-cd.yml:32-37`); `npm run lint` = `eslint "src/**/*.ts" --fix` | none | **Confirmed repo-only; extend the pinned list.** The spec prescribes no lint policy. Without this, new module paths are lint-clean in CI but dirty repo-wide (or the reverse) |
| R10 | **Multi-replica reality vs. no locking** — 3 API replicas already run in `calassist-lb` | §18 | **Resolved by D1; the spec independently requires it.** `§18` demands service-level authorization and clean refresh/revoke, and `§22` tests "cross-user access denial" — all of which break if N replicas each execute a "run once" job. `SELECT … FOR UPDATE SKIP LOCKED` is the mechanism; **every** periodic job must use it. The spec never names a locking primitive, so this is a repo-derived implementation decision |
| R11 | **DST/zone bugs in availability** — `toDate().getHours()` at `availability-calculator.ts:211-212,259-260` | §11, §12 | **Resolved: route through `TimeZoneEngine`, treat as a correctness fix.** `§11` lists "time zones" among hard constraints and `§12` requires a "preferred timezone"; `§22` requires tests for "timezone conversions". A process-local `getHours()` cannot satisfy that. The repo already has a DST-aware `TimeZoneEngine` (`:37`), so this is a bug fix, not new code |
| R12 | **No client test runner** | §19, §22 | **Deferred to the frontend phase; not a Phase-1 blocker.** `§19` names screens only; `§22`'s E2E acceptance ("approved request creates event and Meet") tests the **API** workflow, not React components. So `§19` screens can be built only once a runner exists — surface it as an explicit scope item when frontend work starts, not in Phase 1 |
| R13 | **Dirty worktree** (§1 G2) | none | **CLOSED — the user chose (a): commit, do not stash.** Precise state (at decision time): **83 paths** (`git status --porcelain -uall`) = **33 modified + 4 deleted + 46 untracked files**, against `feature/redis-health-oauth-session` @ `6304ef6` (33+4+46 = 83; the earlier "59" counted untracked **directories** as one, and **4** of those paths are deleted `*.visual-check.*.png`, not modifications). The header table at the top of this document now carries this same count. The spec gives no guidance — branch topology is not its subject |

**Closed:** R1–R13 all end in a decision or an explicit scope exclusion, each anchored to a spec section or
recorded as repo-derived where the spec is silent. **R13 closed with the G2 (a) commits** — the worktree was
committed in coarse groups (R3 fix first, alone) and nothing was stashed, reset, or checked out. The
coordination branch itself is still deliberately **not created** until the fresh-clone check in §1 passes.

## 6. Proposed module layout (Phase 1, subject to spec review)

Mirrors house structure (`service` + `controller` + `module` + `*.types.ts` + co-located `.spec.ts`):

```
src/coordination/
  coordination.module.ts            # registered in src/app.module.ts imports
  coordination.types.ts             # Zod schemas + inferred types (D2)
  outbox/
    outbox.service.ts               # enqueue + claim ($queryRaw FOR UPDATE SKIP LOCKED) + ack/nack
    outbox.store.ts                 # persistence only, mirrors schedule-proposal.store.ts
    outbox.types.ts
  jobs/
    job-worker.service.ts           # poll loop (no @Cron — self-scheduled, shutdown-aware)
    job-handlers.ts                 # dispatch table: type -> handler
  coordination.controller.ts        # thin; ZodValidationPipe on every body
```

Constraints this layout must honour: no `@nestjs/schedule` (D1); no new production dependency;
register the module in `src/app.module.ts` (`:50-116`); keep `PrismaService` injection consistent with
`src/permissions/permission.module.ts`; apply `ZodValidationPipe` on all bodies (D2).

## 7. Verification plan for C-00 → gate

| Check | Command | Expected |
|-------|---------|----------|
| Types | `npx tsc --noEmit` | exit 0 |
| Tests | `npx jest` | all suites pass (baseline: **44** specs under `src/` — 43 before the R3 fix added `email-notification.spec.ts`) |
| Lint (scoped) | `npx eslint --quiet src/<new paths>` | 0 errors |
| Prometheus rules | `docker run --rm -v ${PWD}/prometheus:/etc/prometheus prom/prometheus:v2.52.0 promtool check rules /etc/prometheus/alerts.yml` | SUCCESS |
| Docs-only iteration | §7 scope above writes **only** `COORDINATION_PROGRESS.md` + `docs/coordination-audit.md` | no `src/` change, no branch, no migration. **Exception, already made and committed:** the **R3** fix is now `f04c4e2` (provider + spec only); the G2 (a) decision further committed the pre-existing 83-path worktree — see §1 G2 and §5 R13 |
| Fresh clone | `git clone` of the branch, `npm ci`, `npm run build`, `npm test` | all green **before** `feat/cross-functional-coordination` is created from the cleaned tip |

## 8. Sign-off checklist — C-00 gate

- [x] G1: spec present at `docs/specs/`, read in full
- [x] G2: branch base chosen — **(a) commit, not stash** (executed: coarse commits over `6304ef6`, R3 alone first)
- [x] Every `PROVISIONAL` row in §3 re-checked against spec text (marker retired; 20 wrong citations corrected — §3.2)
- [x] §5 risks R1–R13 either resolved or explicitly accepted as out of scope (all closed; **R13 closed by the G2 (a) commits**)
- [ ] Fresh-clone verification (`npm ci` / `npm run build` / `npm test`) green on a clean clone of the branch
- [ ] `feat/cross-functional-coordination` created **only** from the verified cleaned tip
- [ ] D1–D8 confirmed, or amended with reasons
- [ ] Phase 1 in-scope / out-of-scope list agreed

**No code, no branch, no migration, no compose stack is created until this checklist is complete.**

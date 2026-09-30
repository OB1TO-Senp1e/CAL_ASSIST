# CAL_Assist — Coordination Upgrade: Phased Audit-and-Build Loop

Paste everything below the line into your coding agent (Copilot Agent mode, strongest model) from the repo root, on a fresh branch (`git checkout -b feat/coordination-p1`). Set `TARGET_PHASE` first. Run one phase per loop; each phase ends at a gate for your review.

The source specification is `CAL_ASSIST_Upgrade_Implementation_Specification.html`. Put it in the repo at `docs/specs/` (or paste its text) before starting so the agent can read it.

---

## TARGET_PHASE = 1

(Change to 2, 3 or 4 for later runs. Phase 0 always runs first. Do not start a phase whose predecessor gate has not been approved by the user.)

## ROLE

You are a principal backend engineer extending CAL_Assist (`D:\CAL_ASS_V1\CAL_ASSIST`) with a **Coordination layer**: understand scheduling intent, find feasible times, get approval where required, create Google Calendar events with Google Meet links, track confirmations, and later brief, follow up, and replan. CAL_Assist must remain a Personal Time Operating System, not a conventional calendar.

**Engineering rule (from the spec, non-negotiable): AI proposes and interprets; deterministic services validate and execute.** The LLM never calls Google APIs or any provider directly, never decides permissions, and never sends external messages.

You work in a strict loop: **audit, build, verify, re-audit**. You do not stop until every checklist item in the target phase is PASS with hard evidence, or BLOCKED / BLOCKED-HUMAN with an exact next step.

## CONTEXT (verify each claim against the code before relying on it)

- NestJS API, Prisma with `@prisma/adapter-pg`, PostgreSQL, Redis (sessions, throttler, AI protection), Vue 3 + shadcn-vue frontend, Traefik fronting N `api` replicas, Prometheus/Grafana, a hardened Docker Compose setup, `scripts/lb-smoke.ps1`, backup/restore scripts, one-shot `migrate` service, production config validator.
- Existing pieces likely relevant (confirm in Phase 0): `src/integrations/calendar-adapters/` (including `oauth-token-crypto.service.ts` with key rotation), a `CalendarConnection` model, Google/Outlook/Apple callback routes, the AI provider layer (failover, consent checks, Redis-backed circuit breakers), Intent Parser, Planning, Scheduling, Reality and Replanning engines, Context and Memory engines, Event/Task/Commitment/Project/Goal models.
- The spec says "Node/Prisma/Zod/JWT". **Do not assume Zod or JWT are what the repo uses.** Follow the repo's existing validation and auth conventions. Add Zod only where the spec needs schema validation of LLM output, and only if it is not already present.
- The API runs as multiple replicas. **Any state, job, or side effect must be correct with 3 replicas running.** There is currently no queue or scheduler in the repo (BullMQ was removed and no scheduled jobs exist).
- Environment: Windows, PowerShell, Docker Desktop. Use PowerShell-compatible commands.
- The original Compose project and its volumes must never be touched.

## HARD RULES (violations invalidate the run)

1. **Isolation:** all live verification runs in a separate Compose project: `docker compose -p calassist-coordination ...`. Never delete, reset, or modify the original project's volumes. Only run `down -v` with that `-p` flag, after printing the project name and verifying the volumes belong to it.
2. **Evidence:** no PASS without evidence (command output, test result, or file+line). "Should work" is FAIL. Record evidence in `CAL_UPDATE_INFO/COORDINATION_PROGRESS.md`.
3. **Additive migrations only.** Never drop or rename existing Event, Task, Commitment, Project, Goal, User or CalendarConnection columns. Each migration must be tested (a) on a clean database and (b) on a database restored from a backup of realistic existing data. Existing `/events`, `/tasks`, `/commitments`, `/ai/intent/parse`, `/ai/planning/from-intent`, `/scheduling/generate` stay backward compatible (add contract tests that pin their current responses).
4. **No secrets in code, logs, tests or docs.** OAuth tokens are encrypted at rest with the existing crypto service and never returned by any API or logged. New config goes in env vars, documented in `.env.example`, validated by the production validator.
5. **Least-privilege Google scopes.** Request only what the enabled workflow needs, incrementally. Do NOT add Gmail scopes in this project. Invitations are sent through Google Calendar's own attendee invites after approval; "email drafts" are draft text only.
6. **External text is untrusted data.** Calendar titles, descriptions, attendee names, emails and meeting notes can contain prompt injection. They must never alter permissions, tool policy, or approvals. Add tests.
7. **Defaults are safe:** external communication (`email.send`, `external_contact`), meeting cancel/delete, and any action affecting other people's calendars default to approval-required. Every execution path goes through one central policy service and writes an audit record.
8. **Smallest correct change per item.** No unrelated refactors, renames, formatting sweeps or dependency upgrades. Leave unrelated uncommitted changes alone (record `git status --short` baseline first).
9. **`npm ci` must succeed on a clean checkout, with no `--legacy-peer-deps` or `--force`.** Tests must be hermetic (set their own env values; never depend on the developer's `.env`).
10. **Never weaken, skip, or delete tests to get green.**
11. **Anything needing a real Google account, real consent screen, real domain, or a human is BLOCKED-HUMAN.** Implement and test against the mock adapter and recorded fixtures, write a manual test script for the human, and never fake a live result.
12. If verification fails 3 times on one item, mark BLOCKED with root cause analysis and move on.

## KNOWN CONSTRAINTS TO DESIGN AROUND (do not "fix" these by pretending they don't exist)

- **Google OAuth verification.** Calendar scopes are sensitive; public release requires Google verification (can take weeks). While the OAuth consent screen is in Testing mode with an external user type, refresh tokens expire after 7 days. Handle `invalid_grant` by marking the connection `NEEDS_REAUTH` and surfacing it in the UI. Document this in the README.
- **Availability of other people.** Free/busy is only visible for calendars shared with the user or in the same Workspace. For external attendees (for example, "ABC Agency"), availability is **unknown**, not "available". The Availability Engine must label such attendees `UNVERIFIED`, still propose slots, and rely on invite responses.
- **Exactly-once side effects across replicas.** Use idempotency for every external call: client-generated Google event IDs on insert (`events.insert` accepts a caller-supplied `id`) and a stable `conferenceData.createRequest.requestId` for Meet creation. Use a Redis lock (single-flight) around token refresh per connection.
- **Durable jobs.** Reminders and follow-up jobs need a durable scheduler safe with N replicas. Decide in Phase 0 between (a) `pg-boss` (Postgres-backed, no Redis client conflict) and (b) a hand-rolled outbox table with `FOR UPDATE SKIP LOCKED`. Record the decision and reasoning in the audit doc. Do not reintroduce a dependency that conflicts with the repo's Redis client.
- **Confirmation tracking** starts with incremental sync (`syncToken`) polling. Google push notification channels require a public HTTPS endpoint and renewal; implement them only behind a feature flag and only if time allows.

## CHECKLIST

Statuses: `TODO | IN PROGRESS | PASS | BLOCKED | BLOCKED-HUMAN`. Only items in `TARGET_PHASE` (plus Phase 0 and the cross-cutting items) are in scope for a run.

### Phase 0: Audit (always first)

| ID | Requirement | Evidence required |
|----|-------------|-------------------|
| C-00 | Write `CAL_UPDATE_INFO/docs/coordination-audit.md`: inventory what already exists against the spec (calendar adapters, CalendarConnection, OAuth flows, intent/planning/scheduling/reality/replanning engines, context/memory engines, autonomy/consent mechanisms, validation library in use, module structure). Include a gap analysis table (spec item, exists?, file, gap) and the decisions: job runner choice, validation approach, module layout under `src/coordination/`, how Meeting links to the existing Event. | The document, reviewed against actual files (file:line references) |

### Phase 1 (P0): Scheduling core

| ID | Requirement | Evidence required |
|----|-------------|-------------------|
| C-01 | `CalendarProvider` interface exactly covering: listCalendars, listEvents, createEvent, updateEvent, deleteEvent, findAvailability. Provider-neutral conference type. `MockCalendarAdapter` (in-memory, deterministic, supports attendees, conference, failure injection). A **shared contract test suite** that both the mock and Google adapters must pass. | Contract suite passing against the mock; Google adapter runs the same suite against recorded fixtures |
| C-02 | Additive Prisma migrations: `Meeting`, `MeetingParticipant`, `MeetingProposal`, `AiActionLog`, minimal `SchedulingPreference`; extend `CalendarConnection` (status, scopes, needs-reauth, last-sync token) only additively. Proper FKs, ownership (`userId`) and indexes for every query path. Meeting links to existing Event. | Migration applied on a clean DB and on a DB restored from a backup of existing data; row counts of legacy tables unchanged |
| C-03 | Google OAuth connect / revoke with minimal, incremental scopes. Tokens encrypted (existing crypto service), never exposed to the browser or logs. Refresh with per-connection single-flight lock. `invalid_grant` sets `NEEDS_REAUTH`. Clean revoke removes stored tokens. Production validator covers new env vars. | Unit tests, a two-replica concurrent-refresh test proving one refresh, token-leak test (grep of API responses and logs with fake tokens) |
| C-04 | Google Calendar adapter: list calendars, incremental event listing with `syncToken`, create/update/delete, attendees with an explicit `sendUpdates` policy, Meet creation via `conferenceData.createRequest` (`conferenceDataVersion=1`, stable `requestId`), persist provider event ID, conference ID and join URL. Idempotent inserts (caller-supplied event ID). Error mapping, retry with backoff and jitter for 429/5xx, quota errors surfaced clearly. Time zones handled explicitly. | Fixture-based tests for each operation and each error class; idempotency test (double execute creates one event); live Google run = BLOCKED-HUMAN with a manual script |
| C-05 | Availability Engine (pure, deterministic, no LLM). Hard constraints: existing events, required attendees, working hours, time zones, blocked periods, commitments. Soft constraints: preferred windows, duration, buffers, lunch, focus time, meeting density. Attendees without visible free/busy are `UNVERIFIED`. Returns multiple candidate slots, each with **human-readable reasons and conflicts** (no opaque score exposed). | Unit and property-based tests: interval intersection, DST transitions, cross-timezone, buffers, back-to-back edge cases, UNVERIFIED handling; benchmark for availability query |
| C-06 | Meeting lifecycle state machine with an explicit legal-transition table covering DRAFT, PROPOSED, PENDING_APPROVAL, SCHEDULED, INVITATIONS_SENT, PARTIALLY_CONFIRMED, CONFIRMED, IN_PROGRESS, COMPLETED, FOLLOW_UP, CLOSED, DECLINED, CANCELLED, RESCHEDULED, NO_SHOW, FAILED. Illegal transitions rejected. Optimistic concurrency so two replicas cannot double-transition. Each transition audited. | Exhaustive transition-matrix test; concurrent-transition test |
| C-07 | Granular autonomy: permissions `calendar.read/create/update/delete`, `meeting.create/reschedule/cancel`, `email.draft`, `email.send`, `reminder.create`, `external_contact`; levels Suggest only, Prepare drafts, Ask before external action, Auto-schedule, Auto-coordinate. Single `PolicyService` used by every execution path (no controller-only checks). Approval records with expiry and single-use. `AiActionLog` written for every permission check, proposal, approval, execution, provider error and user override; concise operational summaries only (no chain-of-thought). | Test matrix (permission x level x action); approval-bypass, replay and expired-approval tests; log-content test |
| C-08 | Coordination Engine + endpoints: `GET /calendar/connections`, `GET /calendar/availability`, `POST/GET /meetings`, `GET/PATCH /meetings/:id`, `POST /meetings/:id/confirm|cancel|reschedule`, `GET /meetings/:id/proposals`, `POST /coordination/analyze|propose|execute`, `GET/PATCH /autonomy/permissions`, `GET/PATCH /preferences/scheduling`. All validated; ownership enforced in the service layer. `execute` is idempotent (idempotency key). Legacy endpoints unchanged. | API tests incl. cross-user denial; contract tests pinning legacy endpoints; replay test for `execute` |
| C-09 | Basic UI (Vue 3 + shadcn-vue): Ask CAL_ASSIST composer showing **what was understood before execution**, Candidate Slots panel with reasons, visible approval state on every external/destructive action, Calendar Connections (with NEEDS_REAUTH state), Autonomy Controls. Frontend bundle budget and existing perf smoke still pass. | Component tests; screenshot or DOM assertion for the approval state; `perf-budget` output |
| C-10 | Security tests: cross-user access denial on every new endpoint, invalid/expired tokens, malicious event descriptions and attendee names (prompt injection cannot change permissions or trigger tool calls), unauthorized tool calls, approval bypass attempts, mass-assignment on PATCH bodies. | Test files and results |
| C-11 | Multi-replica correctness and ops: 3-replica isolated stack; concurrent `execute` calls across replicas create exactly one Google/mock event; metrics (proposal latency, provider errors, approval outcomes), alert rules (validated with `promtool`), Grafana panels, README/runbook section, `.env.example`, production validator updates. | Live isolated-stack test output; `promtool check rules`; dashboard JSON provisioned |
| C-12 | End-to-end acceptance on the mock adapter: request produces a validated proposal; approval required when configured; approved request creates event + Meet; participant states tracked; audit trail complete. Include a manual live-Google test script for the human. | E2E test output; the manual script file |

### Phase 2 (P1): Natural language, preferences, coordination

| ID | Requirement | Evidence required |
|----|-------------|-------------------|
| C-20 | Natural-language scheduling: LLM produces structured intent (`schedule_meeting`, duration, dateRange, preferredTime, participants, conference) validated by a schema before anything else; then permission check, Coordination Engine, Availability Engine, approval, provider. Reuse the existing AI provider layer (consent, failover, Redis protection). LLM output that fails validation is rejected, never "repaired" into an action. | Schema tests incl. malformed and adversarial outputs; test proving the LLM code path cannot import or call provider adapters |
| C-21 | Preferences / Executive mode: working hours, preferred times, minimum buffer, max meetings/day, lunch window, focus hours, default duration, timezone, conference provider, per-meeting-type rules. **Explicit preferences and learned patterns stored separately; learned ones surface only as suggestions.** | Tests; migration test |
| C-22 | Meeting templates (Client, Interview, Internal Standup, Board): duration, conference provider, agenda starter, buffers, reminder rules. | Tests; seed data |
| C-23 | Invitation drafts: professional draft generation; sending only through Calendar attendee invites after approval; `email.send` stays disabled by default. | Tests proving no send without approval |
| C-24 | Confirmation tracking: PENDING, ACCEPTED, DECLINED, TENTATIVE, UNKNOWN via `syncToken` polling; dashboard counts; lifecycle moves to PARTIALLY_CONFIRMED / CONFIRMED automatically. Push channels behind a flag only. | Fixture-driven tests; poller runs safely on 3 replicas (single execution per connection per interval) |
| C-25 | Reminders (24h, 1h, 15m, custom; in-app first) on the durable job runner chosen in C-00: exactly-once across replicas, survives restarts, idempotent delivery, retry with backoff, dead-letter visibility. | Test: 3 replicas, one reminder fires exactly once; kill-and-restart test |
| C-26 | Recurring meetings (RRULE, exceptions, single-instance edit, DST correctness). | Unit tests across DST boundaries and time zones |
| C-27 | Time-zone intelligence: store and display in user and attendee zones; ambiguity handling ("Tuesday afternoon" in whose zone), tested. | Unit tests |

### Phase 3 (P2): Briefing and follow-up

| ID | Requirement | Evidence required |
|----|-------------|-------------------|
| C-30 | Meeting briefs from Context Engine + Memory Engine + meeting data: purpose, participants, prior interactions, open items, suggested agenda, related tasks. External text treated as untrusted. | Tests; injection test |
| C-31 | Agenda generation from templates plus context. | Tests |
| C-32 | Follow-up engine: notes to proposed action items with owner, due date and email draft; **confirmation required before creating externally assigned tasks or sending anything**. Example: "Rahul will send the revised proposal by Friday" becomes a proposed task linked to the meeting/project. | Tests incl. approval-required paths |
| C-33 | Daily briefing (schedule, pending approvals, unconfirmed meetings, at-risk commitments). | Tests |

### Phase 4 (P3): Reality and replanning

| ID | Requirement | Evidence required |
|----|-------------|-------------------|
| C-40 | Reality integration: planned vs actual, overruns, early finishes, missed meetings, no-shows, downstream impact. | Tests with fixtures |
| C-41 | Replanning proposals ("I'm running 30 minutes late"): impacted items, proposed new times, conflicts, reasons; hard commitments and buffers protected; external commitments never changed without approval or explicit autonomy. | Tests incl. hard-commitment protection |
| C-42 | Learned preference suggestions (proposed, never silently promoted to rules). | Tests |
| C-43 | Multi-provider readiness: an Outlook adapter skeleton passing the shared contract suite against fixtures. | Contract suite output |

### Cross-cutting (every run)

| ID | Requirement | Evidence required |
|----|-------------|-------------------|
| C-90 | CI gates: `npm ci` (no legacy flags), lint (report honestly: list failing files and whether you changed them), typecheck, unit + integration tests, contract tests, `docker compose config`, image build, promtool, and the smoke test. | Command outputs |
| C-91 | Regression of the previous hardening work: `scripts/lb-smoke.ps1`, three-replica health, shared throttling, migration-once behavior, Redis-down readiness. | Smoke output |
| C-92 | Performance: benchmarks for availability queries, event sync, and proposal generation; frontend bundle budget and loopback API smoke still pass. | Numbers before and after |
| C-93 | Docs: README section for the coordination layer, Google setup (including the Testing-mode 7-day token note and verification requirement), env vars, runbook entries, rollback notes for each migration. | Diff |

## LOOP PROTOCOL

Create `CAL_UPDATE_INFO/COORDINATION_PROGRESS.md` (tracked in git — it is the loop's durable working memory, so keep it; do not delete it at the end). Record the baseline: `git status --short`, `git rev-parse --short HEAD`, Node/npm/Docker versions, `TARGET_PHASE`, and the isolated project name `calassist-coordination`.

Repeat until done:

**Iteration N**
1. **AUDIT:** Re-read the actual code and config for every in-scope item not yet PASS. Re-verify PASS items whose files changed. Update the table (status, evidence, gaps, newly found risks).
2. **PLAN:** Pick the next 1 to 3 items by dependency order (C-00, then C-01, C-02, C-06, C-05, C-07, C-03, C-04, C-08, C-10, C-09, C-11, C-12 for Phase 1; cross-cutting last). State the exact files to change and how each will be verified.
3. **BUILD:** Implement with tests first where the logic is deterministic (availability, state machine, policy).
4. **VERIFY:** Run tests and live checks in the isolated project. Capture real output. Try to break your own change (negative tests, concurrency, bad input, injected text).
5. **RECORD:** Update the progress file with evidence and risks.
6. **DECIDE:** If any in-scope item is TODO or IN PROGRESS and not BLOCKED, run the next iteration without asking the user.

Loop rules:
- A failed verification is fixed and re-run in the same iteration.
- If a change breaks a previously PASS item, that item returns to IN PROGRESS.
- Keep a running **Risks and Assumptions** section, especially anything the spec asserts that the code or Google's behavior contradicts. If the spec is wrong or unsafe on a point, say so, implement the safe version, and record why.
- Ask the user only for BLOCKED-HUMAN items or genuinely destructive-action decisions, never for routine continuation.

## FINAL AUDIT (mandatory before declaring the phase done)

1. Print the project name, verify the volumes belong to `calassist-coordination`, run `down -v` for that project only, then rebuild from scratch with `up -d --build --scale api=3`.
2. Clean-clone check: fresh checkout or temp copy, `npm ci`, build, tests, all with no legacy flags.
3. Run the full suite, lint (honest report), typecheck, contract tests, promtool, `scripts/lb-smoke.ps1`, and the phase's E2E acceptance test.
4. Chaos pass: kill an API replica during an `execute`; stop Redis; stop Postgres; make the mock provider fail with 429, 5xx and timeouts; make the AI provider layer fail entirely. Confirm: no duplicate events, no lost approvals, scheduling still works without AI where the spec says it must, clear errors, automatic recovery. Document whether each dependency failure fails open or closed.
5. Re-run the security tests (C-10) against the final build.
6. `git diff --check`, `git status --short` shows only intended changes, and confirm the original project's volumes still exist.

If anything regresses, resume looping.

## DEFINITION OF DONE (per phase)

Every in-scope item is PASS, or BLOCKED / BLOCKED-HUMAN with an exact next step. The final audit is clean. Original volumes untouched. Only intended changes in the worktree. `CAL_UPDATE_INFO/COORDINATION_PROGRESS.md` kept up to date (it is tracked). For Phase 1, the outcome is: a user can connect Google, submit a scheduling request, see what was understood, get feasible slots with explanations, approve or reject, and get a calendar event with a Meet link and tracked attendee state, with permissions, audit logs, validation, error handling and tests covering it (live Google verified by the human using the manual script).

## FINAL REPORT FORMAT

1. Full checklist table for the phase with status and one-line evidence per item.
2. Files changed, grouped (domain code, migrations, adapters, API, UI, tests, infra, docs).
3. Places where the spec was wrong, unsafe or unimplementable, and what you did instead.
4. Benchmarks and test counts.
5. Exact commands to run locally, and the manual live-Google test steps for the human.
6. BLOCKED / BLOCKED-HUMAN items with step-by-step actions.
7. Risks and follow-ups ranked by severity, and a recommendation on whether to proceed to the next phase.

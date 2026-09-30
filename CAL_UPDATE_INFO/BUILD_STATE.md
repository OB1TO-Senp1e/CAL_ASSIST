# BUILD_STATE.md  (v2, merged with Cline coordination state)

## Project
CAL_ASSIST. React/TS + NestJS + Prisma/PostgreSQL + Redis/BullMQ. LLM via DeepSeek V4.1 Flash (env-configured,
optional fallback). Two workflows share this repo:
- AI-LAYER LOOP (this file): schema-free code, developed and tested against fakes and a LOCAL/STAGING database only.
- CLINE 5-STEP LOOP (CAL_UPDATE_INFO/COORDINATION_PROGRESS.md): owns every schema change, migration and live-DB action.

## Ownership rules (both loops obey)
1. Any task that needs a Prisma schema change or migration is BLOCKED here. Write it under "Needs Cline" and stop.
2. Nothing in this loop connects to the live database. Tests use mocks or a local/staging DB.
3. Commit one task per commit, with a clean message (no BOM). Never commit the unrelated dirty working tree.
4. Evidence over prose: every task ends with command output that shows the acceptance line passing.

## Current status (from Cline, at the current tip — hash deliberately not embedded)
- C-01 (canonical) DELIVERED: `CalendarProvider` interface + `MockCalendarAdapter` + shared contract suite.
- C-02 DELIVERED: coordination domain schema + additive migration tracked in-tree
  (`prisma/migrations/20260929150000_c02_coordination_domain/migration.sql`); rollback script tracked and unexecuted.
- C-02 live-incident gate CLOSED (KEEP, re-verified). 12 applied migrations, 57 tables, 499 rows (baseline sha256 aaa50c5e...).
- Present in live schema and empty: Meeting, MeetingParticipant, MeetingProposal, SchedulingPreference, AiActionLog, MeetingStatus.
- Next canonical item: **C-06** (meeting lifecycle state machine), spec'd against the live schema state proven by the ITEM7 artifacts.

## Decisions
- Reuse existing AiActionLog as the AI audit trail before proposing any new table.
- (add more as made)

## Known issues
- Working tree: doc relocation committed (loop/progress ledgers now under `CAL_UPDATE_INFO/`); the 4 visual-check PNGs were restored byte-identical. Remaining untracked: the two loop prompts, `BUILD_STATE.md`, `CAL_UPDATE_INFO/scripts/`, `__agent__/`. Only the first three are in scope for commit 2.
- Pre-existing schema-vs-migration drift (AutonomyPolicy/ReplanningPolicy defaults, PermissionLevel type). Owned by Cline; do not touch here.
- Earlier list (verify each still applies): JWT expiry env name mismatch, compose default credentials, CI/CD deploy placeholders.

## Tasks

### Stage 0: hygiene (before any AI code)
- [x] T0.0 Resolve working tree: review diff, commit doc reorg as its own commit. Done when: `git status` is clean. (Commit 1 landed; commits 2-3 pending.)
- [ ] T0.1 Confirm JWT env name is unified and env is validated at startup. Done when: app refuses to boot on invalid env.

### Stage 1: AI foundation (all schema-free)
- [ ] T1.1 LlmService: OpenAI-compatible client from env, fallback on 5xx only, returns usage. Done when: unit tests cover success, 5xx failover, 4xx no failover.
- [ ] T1.2 Tool interface + ToolRegistry (zod + JSON schema, destructive flag). Done when: bad schema fails at startup.
- [ ] T1.3 Read-only tools: listEvents, listGoals, listCommitments, filtered by userId. Done when: test proves user A cannot read user B.
- [ ] T1.4 ContextBuilder with token budget. Done when: output never exceeds configured budget.
- [ ] T1.5 AgentService loop (MAX_STEPS, parallel reads, sequential writes, errors as data). Done when: fake-LLM test shows a 2-step loop and a bad-arguments retry.
- [ ] T1.6 Audit via existing AiActionLog: write one row per tool call. Done when: test asserts rows. If AiActionLog lacks needed columns, add to "Needs Cline".
- [ ] T1.7 POST /assistant/chat with SSE, JWT protected. Done when: curl shows streamed tokens.
- [ ] T1.8 Assistant page: chat panel wired to T1.7.
- [ ] T1.9 Today recommendation cards use live agent output, no hardcoded strings.

### Stage 2: memory and retrieval
- [ ] T2.1 Memory/instructions storage design. Likely NEEDS CLINE (schema). Write the spec, then hand off.
- [ ] T2.2 pgvector search tool. NEEDS CLINE (extension + tables).

### Stage 3: guarded actions
- [ ] T3.1 ChangeSet (before/after/reason/status) with propose/apply/undo. NEEDS CLINE for schema; service logic can be written against an interface first.
- [ ] T3.2 Destructive tools via propose(). T3.3 Autonomy levels in policy. T3.4 Diff review UI.

### Stage 4: continue canonical order
- [ ] C-06 onward per Cline's coordination file, one item at a time, using the Cline 5-step loop.
- [ ] Differentiators: Time Compiler, Reality engine, Replanning, Commitments, What-if.

### Needs Cline
- (DeepSeek lists schema/migration requests here with exact table/column needs)

### Discovered
- (DeepSeek adds items here)

---

# .clinerules  (put in repo root so Cline follows the same rules; check your Cline version supports it)

- Read BUILD_STATE.md at the start of every task. Do only the first unchecked task.
- Never run any command against the live database unless the task is in the Cline 5-step loop and I approved it in this session.
- Never modify Prisma schema or create migrations outside a Cline 5-step item.
- Do not commit files unrelated to the task. Commit messages must be plain UTF-8 without BOM.
- End every task with: the exact command output proving the acceptance line, then the updated BUILD_STATE.md.

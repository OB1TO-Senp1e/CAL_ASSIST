# DeepSeek build loop for CAL_ASSIST (Notion-class AI layer)

How it works: DeepSeek forgets everything between calls, so a file called `BUILD_STATE.md` is the memory.
Every loop: paste the MASTER prompt (once per chat), then the LOOP prompt plus the current BUILD_STATE.md.
DeepSeek does ONE task, returns code and an updated BUILD_STATE.md. You run it, then paste results or errors back.

---

## 1. MASTER prompt (paste once at the start of each new chat, or set as the system prompt)

```
You are a senior TypeScript engineer building CAL_ASSIST, an AI executive assistant built around a calendar
(a "Personal Time Operating System"). You work in small verified steps.

STACK (do not change without asking): React + TypeScript client; NestJS API; Prisma + PostgreSQL (pgvector for
embeddings); JWT auth; Redis + BullMQ for background jobs; zod for validation; Jest for tests.
LLM: OpenAI-compatible client to DeepSeek V4.1 Flash, configured only through env vars
(LLM_BASE_URL, LLM_API_KEY, LLM_MODEL). Optional fallback provider via LLM_FALLBACK_*.

ARCHITECTURE RULES (non-negotiable):
1. The model never touches the database. It proposes tool calls; deterministic code validates and applies.
2. Every tool is a typed function: name, description, zod schema, JSON schema, destructive flag, run().
3. Destructive tools never write directly. They create a ChangeSet (before/after diff + reason) that needs approval
   or a matching autonomy rule. Every applied ChangeSet is undoable.
4. Every retrieval and tool call is filtered by userId. No cross-user data, ever.
5. Tool errors are returned to the model as data ({ error }), never thrown out of the agent loop.
6. Keep the system prompt and tool schemas byte-stable and first in the message list (prompt caching).
7. Log token usage per call to a credits/usage table.
8. No secrets in code. No placeholder credentials. Read config from env with validation at startup.

ENGINES (domain code, plain TypeScript, no LLM inside unless stated): Context, Memory, Goal, Commitment,
Planning, Scheduling, Time Compiler, Reality, Replanning, Assistant Orchestrator.

WORKING RULES:
- Do exactly ONE task per reply: the first unchecked task in BUILD_STATE.md. Never start the next one.
- If something is ambiguous, state your assumption in one line and continue. Ask at most one question, and only if blocked.
- Prefer small, complete files over snippets. Show full file contents for new files; for edits show the whole changed function.
- Never invent APIs. If you are unsure a library option exists, say so and give the safest alternative.
```

---

## 2. LOOP prompt (paste every iteration, with the current BUILD_STATE.md below it)

```
Follow the MASTER rules. Read BUILD_STATE.md below and do ONLY the first unchecked task.

Reply in exactly this format:

1. PLAN: at most 5 lines. Include any assumption.
2. FILES: every file to create or change, with the full path and full content. Include Prisma schema and migration
   changes if needed.
3. TESTS: Jest tests that prove the acceptance criteria of this task.
4. RUN: exact commands to install, migrate, test and manually verify, and what output I should see.
5. RISKS: up to 3 bullets: what could break, or what you did not verify.
6. BUILD_STATE.md: the full updated file. Tick this task, add any new task you discovered under "Discovered",
   and update "Decisions" and "Known issues". Keep it under 120 lines.

Then stop. Do not start the next task.

--- BUILD_STATE.md ---
<paste current file here>
```

---

## 3. REPAIR prompt (use when tests or the build fail)

```
The task did not pass. Do NOT start a new task. Fix only what is broken.

Failing command:
<paste command>

Full error output:
<paste output, unedited>

Rules: explain the root cause in 2 lines, then give only the files that change (full content),
then the command to re-run. If you cannot tell the cause from the output, tell me exactly which
file or output you need to see. Then return the updated BUILD_STATE.md "Known issues" section.
```

---

## 4. REVIEW prompt (run after each phase, in a fresh chat)

```
You are a strict code reviewer. Review the files below against the MASTER architecture rules.
List violations by severity (blocker, major, minor) with file and line, especially: missing userId filters,
destructive tools that write directly, unvalidated tool arguments, secrets in code, missing tests.
Do not rewrite code; give the fix in one sentence each.
<paste files>
```

---

## 5. Seed BUILD_STATE.md (paste as the first state, then let DeepSeek maintain it)

```
# BUILD_STATE.md

## Project
CAL_ASSIST. React/TS + NestJS + Prisma/PostgreSQL + Redis. LLM via DeepSeek V4.1 Flash (env-configured).

## Current status
API and DB readiness check work locally. Goals, Projects, Commitments, Assistant, Insights, Settings pages are
placeholders. Today page loads real data but its recommendation cards show sample text.

## Decisions
- (none yet)

## Known issues
- JWT_EXPIRES_IN vs JWT_EXPIRATION env name mismatch between auth module and docker-compose
- docker-compose has dev-default DB credentials and a placeholder JWT secret
- CI/CD staging and production deploy steps are placeholders

## Tasks

### Stage 0: cleanup
- [ ] T0.1 Unify JWT expiry env var name; validate all env at startup with zod. Done when: app refuses to boot on missing/invalid env.
- [ ] T0.2 Remove default credentials and placeholder secret from compose; use .env.example. Done when: no secret literal in repo.

### Stage 1: foundation
- [ ] T1.1 LlmService: OpenAI-compatible client from env, optional fallback on 5xx, usage returned. Done when: unit test with mocked client covers success, 5xx failover, 4xx no failover.
- [ ] T1.2 Tool interface + ToolRegistry (register, get, schemas(user), zod to JSON schema). Done when: registering a tool with a bad schema fails at startup.
- [ ] T1.3 Read-only tools: listEvents, listGoals, listCommitments (all filtered by userId). Done when: test proves user A cannot read user B.
- [ ] T1.4 ContextBuilder: assemble system prompt, relevant records, token budget trim. Done when: output stays under a configurable token budget.
- [ ] T1.5 AgentService loop (MAX_STEPS, parallel reads, sequential writes, errors as data, credits charge). Done when: test with a fake LLM shows a 2-step tool loop and a bad-arguments retry.
- [ ] T1.6 Usage/credits table + charge() + AuditLog table. Done when: every agent run writes usage rows.
- [ ] T1.7 POST /assistant/chat with SSE streaming, JWT protected. Done when: curl shows streamed tokens.
- [ ] T1.8 Assistant page in React: chat panel wired to T1.7. Done when: message round trip works in the browser.
- [ ] T1.9 Replace sample text on Today recommendation cards with live agent output. Done when: no hardcoded recommendation strings remain.

### Stage 2: memory and retrieval
- [ ] T2.1 UserMemory table (instructions + facts) and CRUD API. Done when: agent context includes the user's instructions.
- [ ] T2.2 pgvector embeddings for notes/events and a search tool filtered by userId. Done when: relevance test passes on seeded data.
- [ ] T2.3 Settings page: edit memory/instructions. Done when: edits change agent behaviour in the next run.

### Stage 3: guarded actions
- [ ] T3.1 ChangeSet model (before, after, reason, status) and propose/apply/undo services. Done when: apply then undo restores exact prior state in a test.
- [ ] T3.2 Destructive tools: createTask, moveEvent, deleteEvent via propose(). Done when: no destructive tool can write without a ChangeSet.
- [ ] T3.3 Autonomy levels per user (suggest / ask / act) enforced in policy. Done when: each level tested.
- [ ] T3.4 Diff review UI: approve, reject, undo. Done when: full flow works in the browser.

### Stage 4: differentiators
- [ ] T4.1 Scheduling engine: free/busy, capacity per day. Done when: pure-function tests.
- [ ] T4.2 Time Compiler: goal + constraints => proposed blocks with reasoning, as a ChangeSet.
- [ ] T4.3 Reality engine: planned vs actual, per-user estimation error.
- [ ] T4.4 Replanning: minimal-change repair after overrun, as a ChangeSet.
- [ ] T4.5 Commitment engine: detect promises in text, track, warn before slip.
- [ ] T4.6 What-if simulator: run a change on a copy, return ripple effects, never touch real data.

### Stage 5: triggers and integrations
- [ ] T5.1 BullMQ queue: scheduled and event-triggered agent runs with checkpoints and resume.
- [ ] T5.2 Two-way integration (start with one calendar provider) using ChangeSet approval.
- [ ] T5.3 MCP server exposing the tool registry.

### Discovered
- (DeepSeek adds items here)
```

---

## Tips for using it well

- One task per loop. If DeepSeek tries to do more, reply: "Stop. Do only the first unchecked task."
- Keep BUILD_STATE.md under about 120 lines. When it grows, ask: "Compress Decisions and Known issues, keep all unchecked tasks."
- After each stage, run the REVIEW prompt in a fresh chat so a second pass catches what the builder missed.
- Commit to git after every passing task. If a loop goes wrong, revert and re-run it rather than patching forever.
- Paste real errors unedited into the REPAIR prompt. Paraphrased errors are the top cause of wasted loops.

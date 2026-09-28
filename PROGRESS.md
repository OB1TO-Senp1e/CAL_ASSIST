# CAL_ASSIST - Implementation Progress

## Project Overview
AI-Powered Personal Time Operating System built with NestJS, Prisma, PostgreSQL

## Current Prisma-backed capability limits (updated 2026-09-28, Stage 4h)
- The API now builds against the checked-in Prisma schema; Prisma Client generation is required after schema changes.
- Commitments persist all fields including person/related-entity metadata and confidence; risk assessments are computed from persisted data and commitment reminder delivery runs through the notification service.
- Proactive interventions persist to `InterventionState`; acknowledge, dismiss, and snooze are implemented (the former `501 Not Implemented` responses were removed). Reality-engine deviation acknowledge/resolve/reopen and recommendation status updates persist to `DeviationState`/`RecommendationState`. Time Compiler proposals persist and `PATCH /api/time-compiler/proposals/:id/apply` writes real TimeBlocks. Calendar visibility persists via `PATCH /api/calendar/calendars/:id/visibility`; `GET /api/calendar/events` accepts both `startDate/endDate` and `timeMin/timeMax` and is served solely by the domain controller.
- Permission records and permission-service autonomy policies are represented in existing schema JSON/string fields. Rule conflicts are computed on demand and their resolutions are stored with the rule; a future schema migration should replace these compatibility representations with dedicated models.
- Schema migrations through `20260927210000_memory_schema_sync` are applied to the dev database. That migration closed a latent drift in which the `Memory` model (status/scope/tags/metadata/confirmation), `MemoryConflict`, and the modern `MemoryCategory`/`MemorySource` enums existed in schema but had never been deployed — every `/api/memory*` route was 500.
- The assistant now works end-to-end through a real LLM (Ollama Cloud `gpt-oss:20b`): the orchestrator prompt embeds each tool's actual zod input fields, LLM tool arguments are normalised (`normalize-tool-input.ts`) before zod validation instead of being dropped, and the local fallback classifier extracts clean titles and routes `CREATE_PROJECT` (live-verified: `audit-live.js` 18/18 with a clean `create_task` proposal + confirm).

---

## Phase 1-3: Foundation + AI Integration + Planning (COMPLETED)
- Auth (JWT, LocalStrategy), Users, Goals, Projects, Tasks, Events, TimeBlocks, Commitments
- AI Providers: OpenAI + Ollama with fallback
- Intent Parser, Planning Engine, Memory Engine, Context Engine
- Scheduling Engine, Reality Engine, Replanning Engine
- All modules wired in AppModule, build passes, tests pass

---

## Phase 4: Advanced Features - Calendar Integrations & Notifications (COMPLETED)

### Calendar Adapters Module (`src/integrations/calendar-adapters/`)
| Component | Description |
|-----------|-------------|
| `CalendarAdapter` interface | Common interface for all providers |
| `LocalCalendarAdapter` | Local calendar implementation |
| `GoogleCalendarAdapter` | Google Calendar API v3 with OAuth2, token refresh |
| `OutlookCalendarAdapter` | Microsoft Graph API with OAuth2, token refresh |
| `CalendarConnectionService` | Manages OAuth connections, token refresh, multi-provider |
| `CalendarSyncService` | Bidirectional sync (list calendars, sync events, push local) |
| `CalendarController` | REST: connections, OAuth callbacks, sync, calendars, events |

**Prisma Updates:**
- `@@unique([userId, provider])` on CalendarConnection
- `syncToken` field on CalendarConnection
- `@@unique([userId, connectionId, externalId])` on Calendar

### Notification Service (`src/integrations/notification-service/`)
| Component | Description |
|-----------|-------------|
| `NotificationProvider` interface | Common interface for channels |
| `EmailNotificationProvider` | SMTP with HTML templates |
| `SmsNotificationProvider` | Twilio SMS |
| `PushNotificationProvider` | Web Push (VAPID) |
| `InAppNotificationProvider` | Database-backed in-app |
| `NotificationService` | Multi-channel delivery, preferences, working hours, mute |
| `NotificationController` | REST: notifications, preferences, reminders, alerts |

---

## Phase 5: Calendar Engine - Reusable Domain Module (COMPLETED)

### Structure
```
src/calendar/
├── domain/
│   ├── calendar-event.ts      # Core entities & value objects
│   ├── recurrence-engine.ts   # RRULE parsing & expansion
│   └── timezone-engine.ts     # IANA timezones, DST, offsets
├── services/
│   ├── calendar.service.ts    # CRUD, move/resize, bulk, conflicts, availability
│   ├── conflict-detector.ts   # Overlap detection, recurrence conflicts
│   └── availability-calculator.ts # Free/busy, optimal meeting time
├── views/
│   └── view-generator.ts      # Day/Week/Month/Agenda/Timeline views
├── interfaces/
│   └── calendar.interface.ts  # Zod schemas & types
├── calendar.controller.ts     # 18 REST endpoints
├── calendar.module.ts
└── __tests__/
```

### Domain Entities
- `DateTime`, `Duration` - Timezone-aware value objects
- `RecurrenceRule` - FREQ (DAILY/WEEKLY/MONTHLY/YEARLY), INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, COUNT, UNTIL, WKST
- `EventParticipant` - Email, name, status, role
- `EventCategory` - PERSONAL, WORK, MEETING, APPOINTMENT, REMINDER, HOLIDAY, BIRTHDAY, TRAVEL, FOCUS_TIME, CUSTOM
- `EventStatus` - CONFIRMED, TENTATIVE, CANCELLED, NEEDS_ACTION
- `CalendarEvent` - Full event with recurrence, participants, reminders
- Views: `DayView`, `WeekView`, `MonthView`, `TimeSlot`

### RecurrenceEngine
- Parse RRULE strings → RecurrenceRule objects
- Expand recurrences with `maxInstances` limit
- Handle exception dates (EXDATE)
- Generate RRULE strings from objects

### TimeZoneEngine
- IANA timezone support via `Intl.DateTimeFormat`
- DST transition detection (ambiguous/skipped times)
- UTC ↔ local conversion
- Offset calculation at any date
- Search/supported timezones

### ConflictDetector
- Conflict types: OVERLAP, CONTAINS, ADJACENT, RECURRENCE_OVERLAP
- Buffer time support
- All-day event conflicts
- Recurrence vs single event conflicts
- Recurrence vs recurrence conflicts
- `findAvailableSlots()` for scheduling

### AvailabilityCalculator
- Working hours per day of week
- Free/busy calculation
- Optimal meeting time across multiple attendees
- Next available slot finder

### ViewGenerator
- Day view: time slots + all-day events
- Week view: 7 day views
- Month view: weeks + events by date
- Agenda view: sorted events with recurrence expansion
- Timeline view: conflict visualization

### API Endpoints (`/api/calendar/events/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Create event |
| `/` | GET | List with filters (date, status, category) |
| `/availability` | GET | Find available slots |
| `/day/:date` | GET | Day view |
| `/week/:weekStart` | GET | Week view |
| `/month/:year/:month` | GET | Month view |
| `/agenda` | GET | Agenda view |
| `/:id` | GET/PATCH/DELETE | Single event |
| `/:id/move` | PATCH | Drag/drop reschedule |
| `/:id/resize` | PATCH | Resize event |
| `/bulk` | POST | Bulk delete/cancel/confirm/move/resize |
| `/:id/instances` | GET | Recurring instances |
| `/conflicts/check` | POST | Conflict detection |
| `/timezone/convert` | GET | Timezone conversion |
| `/timezone/info` | GET | Timezone info |
| `/timezone/list` | GET | All IANA timezones |
| `/timezone/search` | GET | Search timezones |

---

## Phase 6: Production & Scale (COMPLETED)

### Rate Limiting (`@nestjs/throttler`)
- Global ThrottlerGuard with configurable TTL and limit
- Per-route throttling via `@Throttle()` decorator
- Config: `THROTTLE_TTL` (default 60s), `THROTTLE_LIMIT` (default 100)

### Caching (`@nestjs/cache-manager` + Redis)
- Global Redis cache with `cache-manager-redis-store`
- TTL-based expiration (default 5min)
- Max entries limit (default 1000)
- Config: `REDIS_HOST`, `REDIS_PORT`, `CACHE_TTL`, `CACHE_MAX`

### Background Jobs (`@nestjs/bullmq` + BullMQ)
- Queue-based job processing with Redis backend
- Job types: scheduling, notifications, AI processing, sync
- Retry policies, delayed jobs, priority queues

### Monitoring & Observability
| Component | Description |
|-----------|-------------|
| **Metrics** (`prom-client`) | Prometheus metrics at `/metrics` - HTTP requests, durations, AI calls, active users |
| **Health Checks** (`@nestjs/terminus`) | `/health`, `/health/live`, `/health/ready` with DB connectivity |
| **Logging** (Winston) | Structured JSON logs, daily rotation, console + file output |
| **Tracing** | Request correlation IDs, duration tracking |

### Docker
| File | Description |
|------|-------------|
| `Dockerfile` | Multi-stage build (builder → production), non-root user, health checks |
| `docker-compose.yml` | PostgreSQL, Redis, API, optional Ollama, Prometheus, Grafana |
| `prometheus.yml` | Metrics scrape config for API |
| `grafana/` | Datasources + API overview dashboard |

### CI/CD (GitHub Actions)
| Workflow | Triggers | Steps |
|----------|----------|-------|
| `ci-cd.yml` | push/PR to main/develop | lint → typecheck → test → build → docker push → deploy |

---

## Phase 7: Time Compiler (COMPLETED)

### Core (`src/scheduling/time-compiler/`)
- Deterministic scheduling engine converting tasks → time blocks
- Inputs: tasks, durations, deadlines, dependencies, calendar events, availability, preferences
- Output: `ScheduleProposal` with blocks, conflicts, tradeoffs, alternatives, metrics
- Test coverage: hard deadlines, fixed events, flexible tasks, dependencies, insufficient time, conflicting constraints, protected focus, travel buffers

### Algorithm
1. Build available slots from availability rules
2. Extract fixed blocks from calendar events
3. Sort tasks by strategy (PRIORITY/DEADLINE/DEPENDENCY/ENERGY/BALANCED)
4. Topological sort for dependencies
5. Greedy slot allocation with constraint checking
6. Add buffers/breaks per preferences
7. Calculate metrics & confidence
8. Generate alternatives

---

## Phase 8: AI Assistant Layer (COMPLETED)

### Architecture (`src/ai/assistant/`)
```
User message
  → Intent extraction (LLM)
  → Context retrieval (goals, events, tasks, preferences)
  → Tool selection (LLM + registry)
  → Deterministic service execution
  → Validation
  → Proposed/confirmed action
  → Response
```

### Typed Tools (13 functions)
| Tool | Category | Confirmation | Description |
|------|----------|--------------|-------------|
| `create_event` | CALENDAR | MEDIUM | Create calendar event |
| `update_event` | CALENDAR | MEDIUM | Update event |
| `delete_event` | CALENDAR | HIGH | Delete event |
| `move_event` | CALENDAR | HIGH | Move event (conflict check) |
| `find_availability` | AVAILABILITY | NONE | Find free slots |
| `create_task` | TASKS | LOW | Create task |
| `update_task` | TASKS | LOW | Update task |
| `create_goal` | GOALS | MEDIUM | Create goal |
| `create_project` | PROJECTS | MEDIUM | Create project |
| `create_schedule_proposal` | SCHEDULING | MEDIUM | Generate schedule via Time Compiler |
| `detect_conflicts` | CONFLICTS | NONE | Check scheduling conflicts |
| `explain_schedule` | INSIGHTS | NONE | Explain schedule reasoning |
| `plan_day` | SCHEDULING | MEDIUM | Daily plan via Time Compiler |

### Safety
- No direct DB mutations by LLM
- All mutations through validated services
- Confirmation levels: NONE/LOW/MEDIUM/HIGH/CRITICAL
- Reversible operations tracked
- Audit logging via `AssistantAction` entity

---

## Phase 9: Personal Memory System (COMPLETED)

### Architecture (`src/core/memory-engine/`)
```
User input / AI inference
  → Memory extraction & categorization
  → Conflict detection
  → Storage with metadata
  → Memory Center (user inspection & control)
```

### Memory Types (5 Categories)
| Type | Description | Example |
|------|-------------|---------|
| `EXPLICIT_PREFERENCE` | User-stated preferences | "I don't like meetings before 10" |
| `EXPLICIT_FACT` | User-stated facts | "My timezone is UTC-5" |
| `USER_RULE` | Hard scheduling rules | "Keep Friday afternoons free" |
| `LEARNED_PATTERN` | AI-observed patterns | "User typically works 9-11am" |
| `TEMPORARY_CONTEXT` | Session-specific context | "Currently preparing for board meeting" |

### Memory Entry Properties
Every memory has:
- **Source**: USER_INPUT, AI_INFERENCE, SYSTEM_OBSERVATION, EXTERNAL_SYNC, IMPORTED
- **Confidence**: 0.0 - 1.0 (never treat uncertain AI inferences as confirmed facts)
- **Timestamp**: Created, updated, last accessed
- **Type**: One of the 5 categories above
- **User-editable status**: Can user modify/delete?
- **Confirmation status**: User-confirmed vs AI-inferred
- **Scope**: GLOBAL, SCHEDULING, TASKS, MEETINGS, FOCUS_TIME, BREAKS, TRAVEL, WORK_HOURS, PERSONAL
- **Tags & Metadata**: For filtering and relationships
- **Expiration**: Optional TTL for temporary context

### Memory Service Features
| Feature | Description |
|---------|-------------|
| Full CRUD | Create, read, update, delete (soft/hard) |
| Search | By type, source, scope, tags, semantic similarity |
| Conflict Detection | AI-powered contradiction/duplicate/outdated detection |
| Conflict Resolution | KEEP_FIRST, KEEP_SECOND, MERGE, DELETE_BOTH, MANUAL |
| Bulk Actions | Delete, archive, confirm, update confidence/scope |
| Export/Import | Full memory portability |
| Insights | Pattern detection, anomaly alerts, suggestions |
| Stats Dashboard | Counts by type/source/scope/status, confidence avg |

### Memory Center API (`/api/memory/*`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Create memory |
| `/` | GET | Search with filters |
| `/stats` | GET | Memory statistics |
| `/conflicts` | GET | List detected conflicts |
| `/conflicts/:id/resolve` | PUT | Resolve conflict |
| `/:id` | GET/PUT/DELETE | Single memory |
| `/bulk` | POST | Bulk operations |
| `/export` | GET | Export all memories |
| `/import` | POST | Import with conflict handling |

### Safety & Control
- **User has full control**: Every memory user-editable by default (except system observations)
- **AI inferences marked**: Source=AI_INFERENCE, isConfirmed=false, requires user confirmation
- **Audit trail**: Full history of changes via AuditLog
- **Conflict transparency**: All detected conflicts surfaced for user resolution
- **No silent overrides**: User must explicitly confirm or reject AI-suggested memories

---

## Phase 10: Reality Engine (COMPLETED)

### Purpose
Compare planned activity with actual activity and identify deviations that materially affect the user's plan.

### Deviation Types Detected
| Type | Trigger | Example |
|------|---------|---------|
| `TASK_OVERRUN` | Actual duration > 125% of estimate | 60min task takes 2 hours |
| `TASK_UNDERRUN` | Actual duration < 75% of estimate | 60min task takes 30 min |
| `MEETING_LATE` | Meeting exceeds scheduled duration | 30min meeting runs 45 min |
| `TASK_POSTPONED` | Task rescheduled ≥ 3 times | "Write proposal" moved 5 times |
| `DEADLINE_APPROACHING` | Deadline near/passed with incomplete work | Proposal due tomorrow, 20% done |
| `DEPENDENCY_INCOMPLETE` | Blocking dependencies not done | Design review blocks development |
| `SCHEDULE_DRIFT` | > 3 time blocks missed in period | Multiple focus blocks skipped |

### Output: RealityCheckResult
```typescript
{
  timestamp: ISOString,
  deviations: Deviation[],
  impactAnalyses: ImpactAnalysis[],
  recommendations: Recommendation[],
  summary: { totalDeviations, bySeverity, byType, criticalCount, highCount, actionableRecommendations }
}
```

### Impact Analysis (per deviation)
- **Direct Impact**: Affected entities (tasks, events, goals, projects, commitments)
- **Schedule Consequences**: Time shifts, cascading delays
- **Deadline Risk**: Which deadlines at risk, risk level (LOW/MEDIUM/HIGH/CRITICAL)
- **Resource Impact**: Overallocated/underutilized resources
- **Cascading Effects**: Probability-weighted predicted delays
- **Overall Impact Level**: NEGLIGIBLE → SEVERE
- **Confidence**: 0.0 - 1.0

### Recommendations (per deviation)
Every recommendation explains:
- **What Changed**: Observable deviation (e.g., "Task took 120 min vs 60 min estimated")
- **Why It Matters**: Consequence (e.g., "Without additional allocation, task remains incomplete affecting downstream work")
- **Options**: Multiple actionable choices with:
  - Label & description
  - Estimated effort (minutes/hours/days)
  - Pros & cons
  - Feasibility score (0.0 - 1.0)

### Example Output
> "The proposal is 90 minutes behind its expected progress. The current Monday deadline is still achievable if 90 minutes are allocated tomorrow."
> - What changed: Task overrun of 90 minutes
> - Why it matters: Deadline at risk without intervention
> - Options: 
>   1. Extend task today (feasibility 0.7, displaces other work)
>   2. Schedule completion tomorrow (feasibility 0.9, delays by 1 day)

### Reality Engine API (`/api/reality/*`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/check` | POST | Full reality check with custom params |
| `/check` | GET | Quick reality check (last 7 days) |
| `/task/:taskId/analysis` | GET | Task execution analysis |
| `/project/:projectId/health` | GET | Project health with deviations |
| `/drift` | GET | Daily schedule drift report |

### Integration
- Feeds **Replanning Engine** for automatic schedule repair
- Provides **Assistant** with factual basis for recommendations
- Exposes **Metrics** for observability (deviation rates, resolution times)

---

## Phase 11: Replanning Engine (COMPLETED)

### Purpose
When reality changes, generate a new schedule proposal with multiple options (A, B, C) showing tradeoffs, and respect user autonomy policies.

### Architecture (`src/scheduling/replanning-engine/`)
```
Reality deviation detected
  → Generate 3 schedule options (A/B/C)
  → Evaluate against autonomy policies
  → Present options with full tradeoffs
  → User selects or auto-applies per policy
  → Execute selected changes
  → Audit log
```

### Schedule Options (per replan)
Each option shows:
- **What moves**: Entity, from/to times, reason
- **What remains unchanged**: Fixed blocks preserved
- **Deadline impact**: Affected deadlines, days shift, risk level
- **Constraint violations**: Hard/soft violations with severity
- **Tradeoffs**: Pros/cons per area (deadlines, focus time, meetings, breaks, work-life balance, priorities)
- **Confidence**: 0.0 - 1.0
- **Estimated effort**: Minutes to implement

### Example Output
**Original Schedule:**
- 09:00–11:00 Proposal
- 11:00 Meeting
- 14:00 Design
- 16:00 Admin

**Reality:** Proposal requires another 90 minutes

**Option A: Extend current task**
- Moves: Proposal 09:00-11:00 → 09:00-12:30
- Unchanged: Meeting, Design, Admin
- Deadline impact: None
- Tradeoffs: Completes task quickly (+), encroaches on break (-)

**Option B: Cascade shift later items**
- Moves: All items shifted 90 min later
- Unchanged: Proposal duration
- Deadline impact: Admin pushed to 17:30
- Tradeoffs: Preserves structure (+), cascade delays (-)

**Option C: Reprioritize & restructure**
- Moves: Full regeneration with updated priorities
- Deadline impact: May shift multiple deadlines
- Tradeoffs: Optimal global (+), significant disruption (-)

### Autonomy Policies (`src/scheduling/replanning-engine/`)
Users define what changes can happen automatically:

| Policy Setting | Description |
|----------------|-------------|
| **Scope** | GLOBAL, SCHEDULING, TASKS, MEETINGS, FOCUS_TIME |
| **Triggers** | Which deviations trigger auto-replan (TASK_OVERRUN, DEADLINE_APPROACHING, etc.) |
| **Allowed Actions** | MOVE_TASK, RESCHEDULE_EVENT, SPLIT_TASK, MERGE_BLOCKS, ADD_BUFFER, REDUCE_SCOPE, REPRIORITIZE, EXTEND_DEADLINE, CANCEL_LOW_PRIORITY |
| **Constraints** | MAX_MOVES_PER_DAY, MAX_TIME_SHIFT_MINUTES, PROTECT_TIME_RANGES, RESPECT_HARD_CONSTRAINTS |
| **Max changes per operation** | Default 3 |
| **Max time shift** | Default 120 minutes |
| **Protected time ranges** | Time/day ranges that cannot be moved (e.g., "Gym 18:00-19:00 Mon-Fri") |
| **Require confirmation for** | DEADLINE_CHANGES, MEETING_MOVES, FOCUS_TIME_CHANGES, EXTERNAL_EVENT_CHANGES, HIGH_PRIORITY_CHANGES |
| **Priority** | Policy ordering for conflicts |

### Replanning API (`/api/replanning/*`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/options` | POST | Generate replan options (A/B/C) |
| `/execute` | POST | Execute selected option |
| `/suggestions` | GET | Auto-detected replan needs |
| `/apply/:planId` | POST | Apply confirmed replan |
| `/autonomy-policies` | GET/POST/PUT/DELETE | Manage autonomy policies |

---

## Phase 12: Natural Language Rules Engine (COMPLETED)

### Purpose
Users create scheduling rules in plain English. System parses, validates, detects conflicts, enforces, and explains them.

### Architecture (`src/scheduling/rules-engine/`)
```
User: "Never schedule meetings before 10 AM"
  → NLP parsing → Structured rule
  → Validation → Conflict detection
  → Storage with metadata
  → Enforcement on every scheduling action
  → Explanation on demand
```

### Rule Types (7 categories)
| Type | Description | Example |
|------|-------------|---------|
| `TIME_RESTRICTION` | Block times | "Never schedule meetings before 10 AM" |
| `BUFFER_RULE` | Add buffers | "Always leave 30 min before investor meetings" |
| `CONSECUTIVE_LIMIT` | Limit sequences | "Don't schedule more than 3 meetings consecutively" |
| `PROTECTION_RULE` | Protect time | "Keep Friday afternoon free", "Protect my gym time" |
| `PREFERENCE_RULE` | Soft preferences | "Prefer morning focus time" |
| `ENERGY_RULE` | Energy-based | "Schedule creative work 9-11 AM" |
| `TRAVEL_RULE` | Travel buffers | "Add 15 min travel between locations" |

### Rule Components
- **Triggers**: SCHEDULE_EVENT, SCHEDULE_TASK, SCHEDULE_MEETING, CREATE_TIME_BLOCK, MOVE_BLOCK, RESIZE_BLOCK, GENERATE_SCHEDULE
- **Conditions**: Field + Operator + Value (BEFORE_TIME, AFTER_TIME, BETWEEN_TIMES, ON_DAY, CONTAINS, GREATER_THAN, etc.)
- **Actions**: BLOCK, WARN, ADJUST, REQUIRE_CONFIRMATION, SUGGEST_ALTERNATIVE, SPLIT, RESCHEDULE
- **Priority**: Integer (higher = evaluated first)
- **Scope**: GLOBAL, MEETINGS, TASKS, FOCUS_TIME, BREAKS, WORK_HOURS, PERSONAL, SPECIFIC_ENTITY

### Natural Language Parsing
- Input: "Never schedule meetings before 10 AM"
- Output: Structured rule with type=TIME_RESTRICTION, condition=BEFORE_TIME 10:00, action=BLOCK
- Ambiguity detection: Shows multiple interpretations when unclear
- Confidence scoring: 0.0 - 1.0 per parsed rule

### Conflict Detection (5 types)
| Conflict Type | Description | Example |
|---------------|-------------|---------|
| `DIRECT_CONTRADICTION` | Same trigger, opposite actions | "No meetings before 10" vs "Urgent client meetings ASAP" |
| `OVERLAPPING_CONDITIONS` | Overlapping time scopes | "No meetings before 10" + "No meetings after 5" |
| `MUTUALLY_EXCLUSIVE_ACTIONS` | Same scope, different actions | "Block Friday PM" vs "Allow Friday PM for clients" |
| `PRIORITY_AMBIGUITY` | Same priority, same scope | Two rules at priority 100 for MEETINGS |
| `SCOPE_OVERLAP` | Parent/child scope conflict | GLOBAL rule vs MEETINGS rule |

### Conflict Resolution
- System shows conflict instead of silently choosing
- User selects: DISABLE_FIRST, DISABLE_SECOND, ADJUST_PRIORITY, MERGE, KEEP_BOTH, MANUAL
- Example prompt: *"Your rule to keep Friday afternoon free conflicts with your rule to schedule urgent client meetings immediately. Which rule should take precedence?"*

### Rules API (`/api/rules/*`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST/GET | Create/list rules |
| `/:id` | GET/PUT/DELETE | Single rule CRUD |
| `/:id/explain` | GET | Plain-language explanation |
| `/conflicts` | GET | List all conflicts |
| `/conflicts/:id/resolve` | PUT | Resolve conflict |
| `/enforce` | POST | Enforce rules on input |
| `/parse` | POST | Parse natural language to structured rule |
| `/from-natural-language` | POST | Create rule from English |

### Rule Enforcement
On every scheduling action:
1. Match applicable rules by trigger
2. Evaluate conditions against input
3. Apply actions in priority order:
   - **BLOCK**: Reject the action
   - **WARN**: Allow but notify
   - **ADJUST**: Modify input (time, duration, etc.)
   - **REQUIRE_CONFIRMATION**: Pause for user
   - **SUGGEST_ALTERNATIVE**: Offer options
   - **SPLIT**: Break into smaller blocks
   - **RESCHEDULE**: Move to preferred time
4. Track applied adjustments
5. Return enforcement summary with blocked/confirmation status

---

## Build & Test Status
```
✅ npm run build    - SUCCESS
✅ npm test         - 28 tests pass
⚠️  npm run lint    - Pre-existing style issues (512 errors, not blocking)
```

---

## Phase 13: Commitment Engine (COMPLETED)

### Purpose
The system represents commitments such as "I'll send John the proposal tomorrow" with full metadata, and identifies commitment risk by comparing commitments against scheduled time.

### Architecture (`src/commitments/`)
```
User input / AI extraction
  → Commitment creation with full metadata
  → Risk assessment (no time allocated, deadline approaching, conflicts, etc.)
  → Commitment Center (user inspection & control)
```

### Commitment Properties
Every commitment has:
- **Person**: Who the commitment is to/with
- **Object**: What was committed ("send proposal", "call Mom")
- **Deadline**: When it's due
- **Status**: PENDING, IN_PROGRESS, COMPLETED, OVERDUE, CANCELLED, DELEGATED
- **Source**: USER_INPUT, AI_INFERRED, EMAIL_EXTRACTED, MEETING_ACTION_ITEM, CHAT_MESSAGE, VOICE_TRANSCRIPT, IMPORTED
- **Related Task/Project**: Optional links to existing work
- **Confidence**: 0.0 - 1.0 (AI-inferred commitments have lower confidence)
- **Reminder Policy**: Configurable intervals, channels, custom messages

### Risk Detection (8 Risk Factors)
| Risk Factor | Trigger | Example |
|-------------|---------|---------|
| `NO_TIME_ALLOCATED` | Zero time blocks for commitment | "Call Mom Sunday" but no time blocked |
| `DEADLINE_APPROACHING` | Deadline ≤ 72 hours | Proposal due tomorrow |
| `OVERDUE` | Deadline passed, not complete | "Finish report Friday" - it's Saturday |
| `CONFLICTING_COMMITMENT` | Multiple commitments same deadline | 3 commitments due Friday |
| `DEPENDENCY_BLOCKING` | Related task blocked | "Send proposal" blocked by "Review draft" |
| `LOW_CONFIDENCE` | AI-inferred, unconfirmed | Confidence < 0.5 |
| `REPEATEDLY_POSTPONED` | Rescheduled ≥ 3 times | "Finish report" moved 5 times |
| `MISSING_PREPARATION` | No prep time before commitment | Meeting needs prep but none scheduled |

### Risk Output: CommitmentRisk
```typescript
{
  commitmentId: string,
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  riskFactors: RiskFactor[],
  details: string,
  recommendation: string,
  suggestedActions: Array<{type, description, priority}>
}
```

### Example Risk Output
> "You committed to sending the proposal tomorrow, but there is currently no time allocated for it."
> - Risk: HIGH (NO_TIME_ALLOCATED, DEADLINE_APPROACHING)
> - Suggested actions: Allocate 60min today (HIGH), Schedule tomorrow morning (MEDIUM)

### Natural Language Extraction
- Input: "I'll send John the proposal tomorrow"
- Output: Structured commitment with person="John", object="send proposal", deadline=tomorrow EOD
- Ambiguity detection for vague inputs
- Confidence scoring (0.0 - 1.0)

### Commitment Engine API (`/api/commitments/*`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST/GET | Create/list commitments |
| `/stats` | GET | Commitment statistics |
| `/risks` | GET | All commitment risks |
| `/assess-risks` | POST | Re-assess all risks |
| `/:id` | GET/PUT/DELETE | Single commitment CRUD |
| `/:id/risk` | GET | Single commitment risk |
| `/extract` | POST | Extract commitments from text |
| `/send-reminders` | POST | Send due reminders |

### Safety
- **Never invent commitments**: Only extract from explicit user input or AI analysis of user content
- **Confidence tracking**: AI-inferred commitments marked with confidence < 1.0
- **User confirmation**: Low-confidence commitments require user confirmation
- **Full audit trail**: All changes tracked via AuditLog

---

## Phase 14: Proactive Assistant (COMPLETED)

### Purpose
Periodically evaluates the user's schedule and commitments to surface high-value interventions without overwhelming the user.

### Architecture (`src/ai/proactive/`)
```
Scheduled/Triggered Check
  → Evaluate 10 intervention types
  → Filter by user preferences & priority
  → Rank by expected usefulness
  → Present top-N interventions
  → User acknowledges/dismisses/snoozes
  → Track effectiveness
```

### Intervention Types (10 Categories)
| Type | Trigger | Example Output |
|------|---------|----------------|
| `DEADLINE_AT_RISK` | Task due ≤ 72h, insufficient time allocated | "Deadline at risk: Proposal due tomorrow, only 30/90min allocated" |
| `CALENDAR_OVERLOAD` | ≥ 5 meetings/day, < 2h focus time | "Tomorrow has 6 meetings and no focus block" |
| `UNSCHEDULED_PRIORITY` | Priority ≥ 7 tasks with no time blocks | "3 high-priority tasks have no time allocated" |
| `CONFLICT_DETECTED` | Reality engine detects overlaps | "2 scheduling conflicts detected in your schedule" |
| `MISSING_PREPARATION` | Meeting > 30min with no prep buffer | "Preparation time missing for Board Meeting" |
| `TRAVEL_CONSTRAINT` | Events at different locations, gap < 30min | "Travel time needed between Meeting A and Meeting B" |
| `UNFINISHED_COMMITMENT` | Commitment with no time allocated | "You committed to sending proposal tomorrow, but no time allocated" |
| `GOAL_OFF_TRACK` | Goal < 50% complete, deadline ≤ 7 days | "Goal 'Q4 Launch' is 30% complete with 5 days remaining" |
| `REPEATED_POSTPONEMENT` | Task rescheduled ≥ 3 times | "You've postponed 'Finish report' 3 times" |
| `NO_TIME_ALLOCATED` | Commitment/deadline with zero scheduled time | "No time allocated for 'Call Mom Sunday'" |

### Intervention Output
Each intervention includes:
- **What**: Clear title and description
- **Why**: Reason based on observable data
- **Affected entities**: Tasks, events, commitments, goals involved
- **Recommended action**: One of 13 action types
- **Options**: Multiple choices with effort estimates, pros/cons, feasibility
- **Confidence**: 0.0 - 1.0
- **Priority**: LOW, MEDIUM, HIGH, URGENT

### Ranking & Filtering
1. **Priority filter**: Only show ≥ user's minimum priority (default MEDIUM)
2. **Group similar**: Combine same-type interventions (keep highest priority)
3. **Rank by**: Priority (URGENT > HIGH > MEDIUM > LOW) → Confidence
4. **Limit**: Max 5 interventions per check (configurable)

### User Preferences (`/api/proactive/preferences`)
| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | true | Master toggle |
| `checkIntervalMinutes` | 60 | How often to evaluate |
| `quietHours` | none | Do-not-disturb window |
| `enabledTypes` | all | Which intervention types to surface |
| `minPriority` | MEDIUM | Minimum priority to surface |
| `maxInterventionsPerCheck` | 5 | Max interventions per evaluation |
| `deliveryChannels` | ['IN_APP'] | IN_APP, EMAIL, PUSH, SMS |
| `groupSimilar` | true | Combine similar interventions |
| `snoozeDurationMinutes` | 30 | Default snooze time |

### Proactive Assistant API (`/api/proactive/*`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/check` | POST/GET | Run proactive check (full/quick) |
| `/interventions` | GET | List active interventions |
| `/interventions/:id/acknowledge` | POST | Mark as seen |
| `/interventions/:id/dismiss` | POST | Dismiss permanently |
| `/interventions/:id/snooze` | POST | Snooze for N minutes |

### Integration
- Feeds **Assistant** with proactive context for conversations
- Respects **Autonomy Policies** for automatic actions
- Uses **Reality Engine** deviations as input
- Checks **Commitment Engine** risks
- Triggers **Replanning Engine** when schedule repair needed

---

## Build & Test Status
```
✅ npm run build    - SUCCESS
✅ npm test         - 28 tests pass
⚠️  npm run lint    - Pre-existing style issues (512 errors, not blocking)
```

---

## Resume Instructions

**To resume work:**
1. Navigate to `D:\FreeLLM MODEL\CAL_ASSIST`
2. Run `npm run build` to verify
3. Run `npm test` to verify tests

**Key files to review:**
- `src/calendar/` - Calendar domain module
- `src/integrations/calendar-adapters/` - External calendar sync
- `src/integrations/notification-service/` - Multi-channel notifications
- `src/scheduling/time-compiler/` - Time Compiler
- `src/ai/assistant/` - AI Assistant Layer
- `src/core/memory-engine/` - Personal Memory System (Phase 9)
- `src/scheduling/reality-engine/` - Reality Engine (Phase 10)
- `src/scheduling/replanning-engine/` - Replanning Engine (Phase 11)
- `src/scheduling/rules-engine/` - Natural Language Rules Engine (Phase 12)
- `src/commitments/` - Commitment Engine (Phase 13)
- `src/ai/proactive/` - Proactive Assistant (Phase 14)
- `src/app.module.ts` - All modules registered
- `prisma/schema.prisma` - Updated schema (Memory, MemoryConflict, AutonomyRule, AutonomyRuleConflict, Commitment, CommitmentRisk, ProactiveIntervention, etc.)
- `Dockerfile`, `docker-compose.yml` - Containerization
- `.github/workflows/ci-cd.yml` - CI/CD pipeline

---

## Frontend Status
- `client/` - React + Vite + TypeScript
- shadcn/ui initialized (base-nova style)
- Components: button, input, label, card, dropdown-menu, dialog, calendar, popover, select, tabs, toast
- Build: `npm run build` ✅
- Proxy: `/api/*` → `http://localhost:3000`

---

## Phase 15: Permission System (COMPLETED)

### Purpose
Fine-grained control over what autonomous actions the AI can perform, with full audit trail and user control.

### Architecture (`src/permissions/`)
```
User/AI Action
  → Permission Check (explicit permissions → autonomy policy → risk assessment)
  → Decision: ALLOW / DENY / ASK / CONDITIONAL
  → Audit Log (every action)
  → User Control (Undo, Review, Disable, Restrict)
```

### Autonomy Levels (5 Levels)
| Level | Name | Description |
|-------|------|-------------|
| 0 | `OBSERVE` | Read-only, AI only observes and reports |
| 1 | `SUGGEST` | AI suggests actions, requires confirmation for all changes |
| 2 | `ASK_BEFORE_ACTION` | AI executes low-risk automatically, asks for medium/high risk |
| 3 | `AUTO_EXECUTE_LOW_RISK` | AI handles routine scheduling automatically, asks for significant changes |
| 4 | `DELEGATED_AUTHORITY` | Full autonomy within defined boundaries |

### Granular Permissions (21 Actions)
| Action | Scope | Description |
|--------|-------|-------------|
| `CREATE_EVENT` | CALENDAR | Create calendar events |
| `MOVE_EVENT` | CALENDAR | Reschedule events |
| `CANCEL_EVENT` | CALENDAR | Delete events |
| `CONTACT_PEOPLE` | INTEGRATIONS | Send messages to contacts |
| `NEGOTIATE_MEETING_TIMES` | CALENDAR | Negotiate scheduling with attendees |
| `MODIFY_TASKS` | TASKS | Create/update/delete tasks |
| `REPLAN_SCHEDULES` | SCHEDULING | Trigger replanning |
| `SEND_NOTIFICATIONS` | NOTIFICATIONS | Send any notification |
| `CREATE_TASK` | TASKS | Create new tasks |
| `UPDATE_TASK` | TASKS | Update existing tasks |
| `DELETE_TASK` | TASKS | Delete tasks |
| `CREATE_COMMITMENT` | COMMITMENTS | Create commitments |
| `MODIFY_COMMITMENT` | COMMITMENTS | Update commitments |
| `EXTRACT_COMMITMENTS` | COMMITMENTS | Extract from text |
| `MODIFY_GOALS` | GOALS | Modify goals |
| `MODIFY_PROJECTS` | PROJECTS | Modify projects |
| `RUN_PROACTIVE_CHECK` | PROACTIVE | Trigger proactive evaluation |
| `DISMISS_INTERVENTION` | PROACTIVE | Dismiss proactive interventions |
| `MODIFY_RULES` | RULES | Create/modify scheduling rules |
| `MODIFY_AUTONOMY_POLICIES` | RULES | Change autonomy settings |
| `ACCESS_INTEGRATIONS` | INTEGRATIONS | Access external providers |
| `SYNC_CALENDAR` | INTEGRATIONS | Sync external calendars |
| `MODIFY_PREFERENCES` | RULES | Change user preferences |

### Autonomy Policies
Users define what changes can happen automatically:
- **Scope**: GLOBAL, SCHEDULING, TASKS, MEETINGS, FOCUS_TIME, etc.
- **Triggers**: Which deviations trigger auto-actions
- **Allowed Actions**: Whitelist of actions per scope
- **Risk Threshold**: NONE/LOW/MEDIUM/HIGH/CRITICAL
- **Require Confirmation For**: DEADLINE_CHANGES, MEETING_MOVES, FOCUS_TIME_CHANGES, etc.
- **Protected Entities**: Specific events/tasks that cannot be moved
- **Time Restrictions**: Do-not-act windows (e.g., "No changes 22:00-07:00")
- **Rate Limits**: Max actions per time period
- **Priority**: Policy ordering for conflicts

### Permission Templates (5 Presets)
| Template | Autonomy Level | Use Case |
|----------|----------------|----------|
| Observer | OBSERVE | Read-only access |
| Advisor | SUGGEST | AI suggests, user confirms all |
| Collaborator | ASK_BEFORE_ACTION | Low-risk auto, asks for rest |
| Assistant | AUTO_EXECUTE_LOW_RISK | Routine automation |
| Delegate | DELEGATED_AUTHORITY | Full autonomy within bounds |

### Audit Trail & User Control
- **Every action audited**: User/AI initiated, entity, before/after state, decision, risk level
- **Undo**: 24-hour window to reverse any autonomous action
- **Review**: Full audit history with filters
- **Disable/Restrict**: Per-action or per-scope restrictions
- **Inspect**: Why an action occurred (policy, rule, risk assessment)

### Permission API (`/api/permissions/*`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/check` | POST | Check if action allowed |
| `/permissions` | GET/POST | List/grant explicit permissions |
| `/permissions/:id` | DELETE | Revoke permission |
| `/autonomy-policies` | GET/POST/PUT/DELETE | Manage autonomy policies |
| `/apply-template` | POST | Apply permission template |
| `/templates` | GET | List available templates |
| `/undo` | POST | Undo autonomous action (24h window) |
| `/audit` | GET | Audit history with filters |

---

## Phase 16: Provider-Independent Integrations (COMPLETED)

### Architecture
```
Core Business Logic
  → Adapter Interface (provider-agnostic)
  → Provider Adapters (Google, Outlook, Apple, Local)
  → OAuth + Token Management
  → Sync + Webhooks
  → Retry + Rate Limiting
  → Conflict Resolution
  → Disconnect/Reconnect
```

### Calendar Adapters (`src/integrations/calendar-adapters/`)

| Provider | Adapter | Features |
|----------|---------|----------|
| Google Calendar | `GoogleCalendarAdapter` | OAuth2, push notifications, sync tokens, webhooks |
| Microsoft Outlook | `OutlookCalendarAdapter` | Microsoft Graph, delta sync, webhooks |
| Apple Calendar | `AppleCalendarAdapter` | CalDAV/iCloud, JWT auth, webhooks |
| Local | `LocalCalendarAdapter` | In-memory, no external deps |

#### Base Adapter (`BaseCalendarAdapter`)
- **Retry Logic**: Exponential backoff (3 retries, 1s base, 30s max)
- **Rate Limiting**: 10 req/s, 100 req/min, burst 20
- **Webhook Support**: Register/unregister, signature verification, event processing
- **Token Management**: OAuth2 flow, refresh, validation, revocation
- **Disconnect/Reconnect**: Clean disconnect, token revocation, reconnection

#### Adapter Interface
```typescript
interface CalendarAdapter {
  // OAuth
  getAuthUrl(userId, state): string
  handleCallback(code): Promise<TokenData>
  refreshAccessToken(refreshToken): Promise<TokenData>
  
  // Retry & Rate Limiting
  getRetryConfig(): RetryConfig
  getRateLimitConfig(): RateLimitConfig
  executeWithRetry<T>(operation, context): Promise<T>
  
  // Webhooks
  getWebhookConfig(accessToken, userId): Promise<WebhookConfig>
  registerWebhook(accessToken, config): Promise<string>
  unregisterWebhook(accessToken, webhookId): Promise<void>
  verifyWebhookSignature(payload, signature, secret): boolean
  processWebhookEvent(payload, signature): Promise<WebhookEvent[]>
  
  // Disconnect/Reconnect
  disconnect(accessToken, refreshToken): Promise<void>
  isTokenValid(accessToken): Promise<boolean>
  revokeAccess(refreshToken): Promise<void>
  
  // Event CRUD
  createEvent(accessToken, event): Promise<{externalId, externalETag}>
  updateEvent(accessToken, externalId, event): Promise<{externalETag}>
  deleteEvent(accessToken, externalId): Promise<void>
  getEvent(accessToken, externalId): Promise<Event | null>
  
  // Sync
  listEvents(accessToken, options): Promise<{events, nextSyncToken}>
}
```

#### Sync Service (`CalendarSyncService`)
- Bidirectional sync (pull remote → local, push local → remote)
- Sync tokens for incremental updates
- Conflict resolution (ETag comparison, last-write-wins with user override)
- Multi-provider sync coordination
- Error handling with retry and audit logging

### Travel Time Provider (`src/integrations/travel-time/`)

| Provider | Adapter | Features |
|----------|---------|----------|
| Google Maps | `GoogleMapsTravelTimeProvider` | Directions, distance matrix, geocoding, places, place details |

#### Travel Time Interface
```typescript
interface TravelTimeProvider {
  getTravelTime(request): Promise<TravelTimeResult>
  getRouteMatrix(request): Promise<RouteMatrixResult>
  geocode(request): Promise<GeocodeResult>
  reverseGeocode(lat, lng): Promise<GeocodeResult>
  searchPlaces(request): Promise<PlaceSearchResult>
  getPlaceDetails(placeId): Promise<PlaceDetails>
}
```

#### Travel Time Features
- Multiple modes: DRIVING, WALKING, BICYCLING, TRANSIT, FLIGHT
- Traffic-aware durations (best_guess, pessimistic, optimistic)
- Route matrix for multi-origin/destination
- Geocoding (address ↔ coordinates)
- Place search & details (businesses, POIs)
- Rate limit: 50 req/s, 100k/day
- Configurable avoid options (tolls, highways, ferries)

### Communication Integrations (Existing)
- **Email**: SMTP with templates
- **SMS**: Twilio
- **Push**: Web Push (VAPID)
- **In-App**: Database-backed notifications
- Multi-channel delivery with preferences, working hours, mute

### Adapter Architecture Principles
1. **Never couple core logic to providers** - All through interfaces
2. **Standardized OAuth** - Consistent token handling across providers
3. **Unified Sync** - Sync tokens, conflict resolution, audit trail
3. **Webhook Support** - Push notifications for real-time updates
4. **Retry & Rate Limit** - Exponential backoff, configurable limits
5. **Conflict Resolution** - ETag comparison, user override
6. **Disconnect/Reconnect** - Clean token revocation, reconnection
7. **Audit Trail** - All sync actions logged
8. **Health Checks** - Token validity, connection status

### Integration API (`/api/integrations/*`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/calendar/connect/:provider` | GET | OAuth URL |
| `/calendar/callback/:provider` | GET | OAuth callback |
| `/calendar/connections` | GET | List connections |
| `/calendar/sync` | POST | Trigger sync |
| `/calendar/webhook/:provider` | POST | Webhook endpoint |
| `/travel-time` | POST | Get travel time |
| `/travel-time/matrix` | POST | Route matrix |
| `/travel-time/geocode` | POST | Geocode address |
| `/travel-time/places` | POST | Search places |

---

## Build & Test Status
```
✅ npm run build    - SUCCESS
✅ npm test         - 28 tests pass
⚠️  npm run lint    - Pre-existing style issues (512 warnings, 0 errors)
```

---

## Resume Instructions

**To resume work:**
1. Navigate to `D:\FreeLLM MODEL\CAL_ASSIST`
2. Run `npm run build` to verify
3. Run `npm test` to verify tests

**Key files to review:**
- `src/calendar/` - Calendar domain module
- `src/integrations/calendar-adapters/` - External calendar sync (Google, Outlook, Apple, Local)
- `src/integrations/travel-time/` - Travel time provider (Google Maps)
- `src/integrations/notification-service/` - Multi-channel notifications
- `src/scheduling/time-compiler/` - Time Compiler
- `src/ai/assistant/` - AI Assistant Layer
- `src/core/memory-engine/` - Personal Memory System (Phase 9)
- `src/scheduling/reality-engine/` - Reality Engine (Phase 10)
- `src/scheduling/replanning-engine/` - Replanning Engine (Phase 11)
- `src/scheduling/rules-engine/` - Natural Language Rules Engine (Phase 12)
- `src/commitments/` - Commitment Engine (Phase 13)
- `src/ai/proactive/` - Proactive Assistant (Phase 14)
- `src/permissions/` - Permission System (Phase 15)
- `src/integrations/calendar-adapters/` - Calendar Adapters (Phase 16)
- `src/integrations/travel-time/` - Travel Time Provider (Phase 16)
- `src/app.module.ts` - All modules registered
- `prisma/schema.prisma` - Complete schema (all entities)
- `Dockerfile`, `docker-compose.yml` - Containerization
- `.github/workflows/ci-cd.yml` - CI/CD pipeline

---

## Frontend Status
- `client/` - React + Vite + TypeScript
- shadcn/ui initialized (base-nova style)
- Components: button, input, label, card, dropdown-menu, dialog, calendar, popover, select, tabs, toast
- Build: `npm run build` ✅
- Proxy: `/api/*` → `http://localhost:3000`

---

## Phase 17: Meeting Intelligence (COMPLETED)

### Purpose
Provide intelligent meeting preparation and post-meeting processing. Before meetings, generate comprehensive preparation materials. After meetings, extract actionable insights and convert them to structured tasks/commitments with user confirmation.

### Architecture (`src/meetings/`)
```
Pre-Meeting:
  Meeting + Context → AI Analysis → Preparation Package
    → Checklist, Previous Context, Outstanding Commitments, Relevant Tasks, Suggested Agenda

Post-Meeting:
  Transcript/Notes → AI Extraction → Structured Outputs
    → Action Items, Commitments, Deadlines, Follow-ups → User Confirmation → Structured Creation
```

### Pre-Meeting Preparation
Given a meeting, the system generates:

| Output | Description |
|--------|-------------|
| **Preparation Checklist** | Categorized items (MATERIALS, RESEARCH, DECISIONS, UPDATES, FOLLOW_UPS, LOGISTICS, TECHNICAL, OTHER) with priority, time estimates |
| **Previous Context** | Related previous meetings with summaries, action items, decisions, attendees |
| **Outstanding Commitments** | Relevant commitments with deadline risk assessment |
| **Relevant Tasks** | Related tasks filtered by project/goal, with priority and due dates |
| **Suggested Agenda** | Context-aware agenda items based on meeting type (TEAM_SYNC, ONE_ON_ONE, CLIENT_MEETING, RETROSPECTIVE, PLANNING, etc.) |

### Post-Meeting Processing
Given transcript/notes, the system extracts:

| Output | Description |
|--------|-------------|
| **Action Items** | Structured tasks with assignee, due date, priority, confidence |
| **Commitments** | Structured commitments with person, deadline, confidence |
| **Deadlines** | Extracted deadlines with assignee, date, confidence |
| **Follow-Ups** | Follow-up items with assignee, due date, confidence |
| **Decisions** | Key decisions made |
| **Blockers/Risks** | Identified blockers and risks |

### Key Features

| Feature | Description |
|---------|-------------|
| **Meeting-Type Aware Agendas** | Pre-built agenda templates for TEAM_SYNC, ONE_ON_ONE, CLIENT_MEETING, RETROSPECTIVE, PLANNING, etc. |
| **Context-Aware Preparation** | Pulls previous meetings, outstanding commitments, relevant tasks automatically |
| **Confidence Scoring** | Every extracted item has confidence (0.0-1.0) |
| **User Confirmation Required** | Consequential items (commitments, deadlines) require explicit user confirmation |
| **No Silent Creation** | System never creates consequential items without explicit user authorization |
| **Confidence Threshold** | Configurable minimum confidence threshold for auto-creation |
| **Attendee Context** | Uses attendee list to find relevant commitments and previous context |

### Meeting Intelligence API (`/api/meetings/*`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/prepare` | POST | Generate pre-meeting preparation package |
| `/process` | POST | Process post-meeting transcript/notes |
| `/:meetingId/preparation` | GET | Retrieve saved preparation |
| `/:meetingId/post-meeting` | GET | Retrieve saved post-meeting result |
| `/:meetingId/action-items` | GET | Get extracted action items |
| `/:meetingId/commitments` | GET | Get extracted commitments |
| `/:meetingId/deadlines` | GET | Get extracted deadlines |
| `/:meetingId/follow-ups` | GET | Get extracted follow-ups |

### Safety & Control
- **Never auto-creates consequential items**: User must explicitly confirm commitments, deadlines
- **Confidence thresholds**: Configurable minimum confidence for auto-suggestions
- **Explicit authorization**: Users must explicitly authorize automatic creation
- **Audit trail**: All extractions and creations logged
- **Selective auto-creation**: Configurable which item types can be auto-created

---

*Last updated: 2026-09-26*
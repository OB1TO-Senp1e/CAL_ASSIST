# CAL_ASSIST Build Log

> Loop state file. Read this first every turn. One unit per turn, stages in order.
> (Template source `CAL_ASSIST_OPUS_BUILD_LOOP.md` was not present in the repo; this log was
> created from the loop prompt's stage definitions.)

## Current position
- **Stage:** 3 — Backend Tie-in (real data)
- **Next unit:** 3e — Time Compiler / Planning
- **Runtime:** `.env` now exists (copied from `.env.example`, local Postgres, migrations up to date),
  so the API boots on `http://localhost:3000/api` and live smoke tests are runnable. `.env` is
  git-ignored; recreate it locally from `.env.example` on a fresh clone.
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
| 3 — Backend Tie-in | ⏳ IN PROGRESS (1/13) |
| 4 — Backend Hardening | ⬜ NOT STARTED |

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
| 3b Calendar | ✅ DONE (2026-09-27) — live create blocked by backend schema gap, see 3b notes |
| 3c AI Assistant | ✅ DONE (2026-09-27) |
| 3d Goals / Projects / Tasks | ✅ DONE (2026-09-27) — live CRUD + status transitions verified |
| 3e Time Compiler / Planning | ⬜ NEXT |
| 3f Commitments | ⬜ |
| 3g Reality Engine / Replanning | ⬜ |
| 3h Memory Center | ⬜ |
| 3i Rules UI | ⬜ |
| 3j Proactive feed + Permissions/autonomy | ⬜ |
| 3k Integrations | ⬜ |
| 3l Meeting Intelligence | ⬜ |
| 3m Command Center | ⬜ |

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
- [ ] Persist commitment person/related-entity metadata + confidence
- [ ] Proactive intervention persistence + ack/dismiss/snooze (currently 501)
- [ ] Replace JSON/string compat fields for permissions + rule conflicts with real models
- [ ] Apply pending migration / schema push
- [ ] **NEW (2c): no HTTP controller exposes `AssistantOrchestratorService`.** `processMessage()` /
      `confirmAction()` exist as service methods only; the sole AI route is `POST /api/ai/intent/parse`.
      Stage 3 must add `POST /api/assistant/message` + `/confirm` (client already calls those paths).
- [ ] **NEW (2c): `IntentType` has no `CREATE_PROJECT` member** although a `create_project` tool is
      registered — "create a project" parses to no intent. Add the member or map it to `CREATE_GOAL`.
- [ ] **NEW (2c): `getPendingAction()` returns a hard-coded `null`**, so `confirmAction` can never
      succeed today — every confirm returns "Action not found or expired." Proposed actions need
      persistence (the `AssistantAction` model exists and is unused).
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
- [ ] **NEW (3b/3k): `GET /api/calendar/connections` returns token fields.**
  `CalendarConnectionService.getAllConnections()` includes Prisma access/refresh tokens.
  The client strips them before exposing connection rows, but the server must stop returning
  secrets to browsers.
- [ ] **NEW (3b): Calendar event creation contracts cannot currently succeed.** `CreateEventSchema`
  requires `calendarId` to be a UUID although Prisma calendar IDs are CUIDs, and the service
  writes `category`/`color` columns absent from Prisma `Event`. Live create is disabled.
- [ ] **NEW (3b): Calendar route collisions.** Both `CalendarModule` and `CalendarAdaptersModule`
  register `GET /api/calendar/events` with different query parameter contracts; verify route
  registration and unify the endpoint before relying on date filters.
- [ ] **NEW (2f/2l): Commitment person metadata is not in the write/read DTO or Prisma model.**
  Meeting extraction includes a person, but creating a commitment currently cannot persist it.
- [ ] _(further Stage 3 mismatches get appended here)_

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

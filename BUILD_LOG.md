# CAL_ASSIST Build Log

> Loop state file. Read this first every turn. One unit per turn, stages in order.
> (Template source `CAL_ASSIST_OPUS_BUILD_LOOP.md` was not present in the repo; this log was
> created from the loop prompt's stage definitions.)

## Current position
- **Stage:** 2 — Frontend Screens (mock data)
- **Next unit:** 2c — AI Assistant panel (message thread, tool-call proposal cards, confirm/reject)
- **Frontend build:** `cd client && npm run build` → green (2026-09-27)
- **Dev preview without backend:** mock layer is on by default in Stage 2 — `cd client && npx vite --port 3001`
  (`VITE_AUTH_BYPASS=1` still forces a user with no session at all; `VITE_USE_MOCK=0` switches back to the real API.)

## Stage status
| Stage | Status |
|---|---|
| 1 — Design Foundation | ✅ DONE (2026-09-27) |
| 2 — Frontend Screens | ⏳ IN PROGRESS (2/13) |
| 3 — Backend Tie-in | ⬜ NOT STARTED |
| 4 — Backend Hardening | ⬜ NOT STARTED |

### Stage 2 screen-groups
| Unit | Status |
|---|---|
| 2a App shell + routing + nav + auth | ✅ DONE (2026-09-27) |
| 2b Calendar (day/week/month/agenda, drag/drop, detail) | ✅ DONE (2026-09-27) |
| 2c AI Assistant panel (thread, tool-call cards, confirm/reject) | ⬜ |
| 2d Goals / Projects / Tasks | ⬜ |
| 2e Time Compiler / Planning | ⬜ |
| 2f Commitments | ⬜ |
| 2g Reality Engine / Replanning | ⬜ |
| 2h Memory Center | ⬜ |
| 2i Rules UI | ⬜ |
| 2j Proactive feed + Permissions/autonomy | ⬜ |
| 2k Integrations | ⬜ |
| 2l Meeting Intelligence | ⬜ |
| 2m Command Center | ⬜ |

### Stage 3 tie-ins
_(mirrors 2a–2m; none started)_

### Stage 4 hardening items (known from PROGRESS.md)
- [ ] Persist commitment person/related-entity metadata + confidence
- [ ] Proactive intervention persistence + ack/dismiss/snooze (currently 501)
- [ ] Replace JSON/string compat fields for permissions + rule conflicts with real models
- [ ] Apply pending migration / schema push
- [ ] _(Stage 3 mismatches get appended here)_

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
- Free/busy (`GET /availability`) is not surfaced in the rail yet; it belongs with the Time Compiler (2e).

**Files touched**
- New: `client/src/lib/datetime.ts`, `client/src/lib/rrule.ts`, `client/src/lib/mock/calendar.ts`,
  `client/src/services/calendar.ts`, `client/src/components/ui/field.tsx`,
  `client/src/components/calendar/{EventCard,TimeGrid,MonthGrid,AgendaList,CalendarRail,
  EventDetailDialog,EventEditorDialog}.tsx`
- Modified: `client/src/services/types.ts`, `client/src/lib/design-tokens.ts`
  (`EVENT_CATEGORY_HUE`, `EVENT_CATEGORY_LABEL`, `EVENT_STATUS_LABEL`, `eventColor()`, `calendarSwatch()`),
  `client/src/pages/CalendarPage.tsx`
- Deleted: `client/src/components/calendar/WeekGrid.tsx`

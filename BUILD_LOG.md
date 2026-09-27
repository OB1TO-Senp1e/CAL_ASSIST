# CAL_ASSIST Build Log

> Loop state file. Read this first every turn. One unit per turn, stages in order.
> (Template source `CAL_ASSIST_OPUS_BUILD_LOOP.md` was not present in the repo; this log was
> created from the loop prompt's stage definitions.)

## Current position
- **Stage:** 2 — Frontend Screens (mock data)
- **Next unit:** 2a — App shell + routing + nav + auth screens
- **Frontend build:** `cd client && npm run build` → green (2026-09-27)
- **Dev preview without backend:** `cd client && VITE_AUTH_BYPASS=1 npx vite --port 3001`

## Stage status
| Stage | Status |
|---|---|
| 1 — Design Foundation | ✅ DONE (2026-09-27) |
| 2 — Frontend Screens | ⏳ IN PROGRESS (0/13) |
| 3 — Backend Tie-in | ⬜ NOT STARTED |
| 4 — Backend Hardening | ⬜ NOT STARTED |

### Stage 2 screen-groups
| Unit | Status |
|---|---|
| 2a App shell + routing + nav + auth | ⬜ |
| 2b Calendar (day/week/month/agenda, drag/drop, detail) | ⬜ |
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

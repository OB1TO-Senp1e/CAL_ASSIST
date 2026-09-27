# CalAssist Design System

> Source of truth for tokens: `client/src/index.css` (CSS) and `client/src/lib/design-tokens.ts` (TS).
> This document explains *why*. If code and this doc disagree, fix one of them in the same commit.

## 1. Visual tone

**Calm instrument, not a dashboard.** CalAssist is something people look at forty times a day.
It should feel like a well-made tool — quiet neutrals, crisp hairlines, one confident brand
color, and color used as *information*, never decoration.

- **Neutrals carry the UI.** A cool graphite scale (OKLCH hue 265, near-zero chroma). ~90% of
  pixels are neutral.
- **One brand color — Iris indigo** (`--primary`). Only for the primary action, the current
  selection, today's date and focus rings.
- **One AI color — Aurora violet** (`--ai`). Only for things the assistant says, proposes or does.
  No calendar, tag or status may use hue ~300. The user must always be able to tell at a glance
  whether something is *theirs* or *suggested*.
- **Hairlines over shadows.** Surfaces are separated by 1px borders and a subtle "sunken" tone.
  Shadows only mean "this floats above the page" (popovers, dialogs, the empty-state hint).
- **Geist Sans / Geist Mono**, self-hosted via `@fontsource-variable` — neutral, highly legible
  at 11–13px, with tabular numerals for times.

## 2. What each inspiration contributed (principles, not pixels)

No screens, icons, wordmarks or copy were copied. The mark, palette and layouts are CalAssist's own.

| Source | Principle extracted | Where it shows up |
|---|---|---|
| **Linear** | Information density with a strict hierarchy; keyboard-first navigation; motion that's quick and rare. | 13px body, 28–32px rows, `G`-then-letter navigation, shortcut hints on hover, 80–200ms transitions. |
| **Notion Calendar (Cron)** | The calendar *is* the primary surface, not a widget. Event color = which calendar; status shown by shape. A controlled multi-calendar palette. | Full-bleed week grid; the empty state floats *over* the grid rather than replacing it; an 8-hue palette at matched lightness/chroma; tentative/needs-action shown with dashed borders, not new colors. |
| **Superhuman** | Speed as a design value; a command palette as the universal entry point; every action advertises its key. | `⌘K` search in the sidebar (palette ships in 2m); `.kbd` chips everywhere; `⌘J` summons the assistant from any page. |
| **Sunsama / Motion** | Planning is a daily ritual; tasks become time blocks; the plan and the calendar are the same object. | `TimeBlockType` has first-class colors (Focus=iris, Meeting=sky, Routine=teal…). Off-hours are shaded so "planable" time reads instantly. |
| **Modern AI chat surfaces** | Streaming text; tool calls disclosed inline (collapsed by default, expandable); actions proposed as cards the user confirms; the AI is a layer, not a chatbot bubble. | Docked assistant column that *pushes* content instead of covering it; the `.proposal` treatment (dashed violet edge + faint hatch = "not real yet"); `.ai-shimmer` for thinking/streaming; `REQUIRES_CONFIRMATION` = MEDIUM/HIGH/CRITICAL. |

## 3. Information density

- **Body is 13px** (`text-sm`), not 16px. Meta text is 11–12px. Page titles are just 16px in a
  48px top bar — the content is the headline, not the chrome.
- **4px grid.** Tailwind's base spacing is the grid. Semantic sizes for repeated geometry:
  `h-row` 32 · `h-row-sm` 28 · `h-topbar` 48 · `w-sidebar` 240/52 · `w-assistant` 384 ·
  `--hour-height` 48 · `--gutter-width` 56.
- **Tight radius** (`--radius` 8px; 6px on controls, 4px on event cards, 3px on badges). Big
  pill radii waste space and read as "consumer toy".
- **Progressive disclosure over hiding.** Shortcut hints appear on hover; tool-call details
  collapse; secondary metadata goes in a detail pane, not a modal.
- **Responsive rule:** density holds at every size. On phones the *layout* changes (sidebar
  becomes a drawer, assistant becomes a sheet, the calendar defaults to Day) — the type scale
  does not balloon.

## 4. Color system

### Semantic tokens (light + dark, `index.css`)
`background · surface-sunken · card · popover · muted · accent · border · border-strong · input ·
foreground · muted-foreground · subtle-foreground · primary · secondary · ai · ai-soft · ai-border ·
destructive · success · warning · info · now`

Dark mode is designed, not inverted: surfaces get *lighter* as they rise
(sunken 0.145 → background 0.175 → card 0.195 → popover 0.215 L), and elevation comes from a 1px
top highlight plus deeper shadow.

### Level scale — one language for "how much should I care"
`--level-none | low | medium | high | critical`, mapped 1:1 to the backend enums
`ToolConfirmationLevelSchema` (assistant tools), `CommitmentRisk.riskLevel` and
daily-experience `RiskLevelSchema`. Every risk indicator, confirmation badge and deviation
alert uses this scale, so the user learns it once.

### Calendar palette
Eight hues (iris 268, sky 232, teal 188, lime 138, amber 78, coral 32, rose 355, slate), each
producing `solid` (rail/dot), `soft` (card fill) and `ink` (text) from shared L/C variables. That
keeps every calendar at identical visual weight, and dark mode is a single variable swap.
Provider colors (`Calendar.color`, e.g. Google's) are snapped to the nearest hue with
`snapToCalendarHue()`. **Violet is intentionally excluded** (reserved for AI).

### Status by shape, not hue
`EventStatus`: CONFIRMED = solid · TENTATIVE = dashed border · NEEDS_ACTION = dashed outline ·
CANCELLED = 50% opacity + strikethrough. Color stays free to mean "which calendar".

## 5. Motion

**Default: don't animate.** Motion is justified only when it explains *where something came
from or went* (spatial continuity) or confirms a direct manipulation.

| Token | Duration | Use |
|---|---|---|
| `--dur-instant` | 80ms | hover, press, tab switch |
| `--dur-fast` | 140ms | popovers, menus, toggles |
| `--dur-base` | 200ms | drawers, the assistant sheet, sidebar collapse |
| `--dur-slow` | 280ms | rare route-level spatial moves |

- Easing: `--ease-out-quick` (decelerate) for enter; no springs, no bounce, no overshoot.
- **Never animate:** page loads, list re-sorts, data refreshes, number changes, the calendar grid.
- **Always animate:** drag-and-drop ghosting (2b), proposal → confirmed state change (2c/2e),
  streaming text caret (`--animate-caret`), AI thinking shimmer.
- `prefers-reduced-motion` reduces all of it to near-zero globally.

## 6. AI assistant presence

The assistant is an **ambient layer across every surface**, not a destination.

1. **Always one keystroke away** — `⌘/Ctrl+J` and a violet "Assistant" affordance in every
   page's top bar. The `/assistant` route exists for full-screen history, but the docked panel
   is the primary interface.
2. **Docked, not floating.** On desktop the panel is a 384px column that *pushes* the page, so
   it never covers the calendar it is reasoning about. On mobile it's a full-screen sheet.
3. **Violet = AI, everywhere.** AI-authored text, proposals, suggested blocks on the calendar
   and proactive nudges all wear the AI hue. Anything the user owns never does.
4. **Proposals look provisional.** The `.proposal` style (dashed violet border, faint hatch) is
   used for suggested events on the grid, schedule proposals and replans. When accepted, the
   element takes on its real calendar color — the change of state is the confirmation.
5. **Tool calls are disclosed.** Each action shows the tool name (e.g. `create_event`), its
   confirmation level (level scale) and a collapsed parameter view. Nothing hides behind a spinner.
6. **Explicit confirmation for MEDIUM/HIGH/CRITICAL** (`REQUIRES_CONFIRMATION`). HIGH/CRITICAL
   additionally show the concrete diff (what moves, what's deleted) before the confirm button
   enables. NONE/LOW may auto-run but still appear in the thread, with undo where the backend
   marks the action reversible.
7. **Honest copy.** The assistant says what it will do in plain words ("Move *Design review* to
   Thu 2 PM"). No personality flourishes, no emoji.

## 7. Interaction conventions

- Global: `⌘K` command/search · `⌘J` assistant · `[` collapse sidebar · `G`+letter go-to
  (T Today, C Calendar, A Assistant, G Goals, P Projects, K Tasks, M Commitments, I Insights,
  S Settings) · `Esc` closes the topmost layer.
- Calendar: `T` today · `J/K` or `←/→` next/prev · `D/W/M/A` view.
- Single-letter keys are ignored while typing in inputs.
- Focus is always visible (2px ring in `--ring`).

## 8. Component inventory (Stage 1)

| Component | File | Notes |
|---|---|---|
| Tokens | `client/src/index.css` | Tailwind v4 `@theme inline`, light + `.dark` |
| TS tokens | `client/src/lib/design-tokens.ts` | calendar palette, level scale, backend enum mirrors |
| Theme | `client/src/contexts/ThemeContext.tsx` | light / dark / system, no-flash boot script in `index.html` |
| Hotkeys | `client/src/lib/hotkeys.ts` | `useHotkeys`, `mod+` = ⌘/Ctrl |
| Shell | `client/src/components/layout/*` | Sidebar (collapsible), PageHeader, mobile drawer, shell state |
| Assistant layer | `client/src/components/assistant/AssistantPanel.tsx` | container + empty state + composer |
| Week grid | `client/src/components/calendar/WeekGrid.tsx` | hour grid, working-hours wash, now-line, all-day lane |
| Primitives | `client/src/components/ui/{button,card,dialog,dropdown-menu,input,label,kbd,badge}.tsx` | shadcn `base-nova` style over `@base-ui/react` |
| Shared classes | `.surface .kbd .proposal .ai-shimmer .tabular` | in `index.css` `@layer components` |

**Legacy classes** (`.surface-card .page-title .page-eyebrow .field-control`) are remapped onto
tokens for the not-yet-rebuilt Today/Tasks/Login pages. Delete them once 2a/2d are done.

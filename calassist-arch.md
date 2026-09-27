# CAL_ASSIST Runtime Architecture

**Diagram Type:** Architecture
**Scope:** Personal Time Operating System — NestJS backend + React frontend + PostgreSQL + Redis

## Core Components (10)

| # | Component | Type | Responsibility |
|---|-----------|------|----------------|
| 1 | **API Gateway (NestJS)** | Service | HTTP entry point, JWT auth, request routing, OpenAPI docs |
| 2 | **Auth Module** | Service | Local/JWT strategy, registration, login, password hashing (bcrypt) |
| 3 | **Goal/Project/Milestone/Task Hierarchy** | Domain Module | CRUD + hierarchy APIs (`/goals/:id/hierarchy`, `/projects/:id/hierarchy`), progress aggregation |
| 4 | **Time Compiler** | Scheduling Service | Deterministic scheduler: topological sort, slot packing, buffers/breaks, confidence scoring, alternatives |
| 5 | **Calendar Engine** | Domain Module | Recurrence (RRULE), timezone (IANA), conflict detection, availability, 5 view types (day/week/month/agenda/timeline) |
| 6 | **Calendar Adapters** | Integration | Google/Outlook/Local sync via OAuth2, bidirectional, incremental sync tokens |
| 7 | **Notification Service** | Integration | Multi-channel (Email/SMS/Push/In-App), preferences, working hours, reminders |
| 8 | **AI Providers** | Service | OpenAI + Ollama fallback, intent parsing, planning decomposition |
| 9 | **PostgreSQL (Prisma)** | Database | 40+ models: users, goals, projects, tasks, events, time-blocks, calendars, notifications, memories |
| 10 | **Redis** | Cache/Queue | Session store, rate limiting, background job queue (future) |

## Primary Path (Happy Path)

```
User (Browser) 
  → API Gateway (JWT verify) 
    → Time Compiler (compile schedule) 
      → [reads] Tasks, Events, Availability, Preferences (PostgreSQL) 
      → [reads] Fixed calendar events (Calendar Engine) 
      → ScheduleProposal (blocks, conflicts, tradeoffs, alternatives) 
    → Time Blocks Module (persist applied blocks) 
    → Notification Service (send reminders) 
  → Frontend (React + Vite, Tailwind + @nuxt/ui)
```

## External Dependencies

| Dependency | Protocol | Purpose |
|------------|----------|---------|
| **Google Calendar API** | HTTPS/OAuth2 | Calendar sync, event push/pull |
| **Microsoft Graph API** | HTTPS/OAuth2 | Outlook calendar sync |
| **OpenAI API** | HTTPS | Intent parsing, planning (primary) |
| **Ollama (local)** | HTTP | AI fallback (privacy/offline) |
| **SMTP (Email)** | SMTP | Notification delivery |
| **Twilio** | HTTPS | SMS notifications |
| **Web Push (VAPID)** | HTTPS | Browser push notifications |

## Trust Boundaries

1. **Public Internet** → **API Gateway** (TLS, rate limiting, JWT validation)
2. **Authenticated User Context** → **All Domain Modules** (row-level security via `userId` on every model)
3. **Internal Services** → **PostgreSQL** (Prisma ORM, connection pooling, migrations)
4. **Internal Services** → **Redis** (session tokens, ephemeral cache)
5. **Calendar Adapters** → **External OAuth Providers** (encrypted token storage, refresh rotation)
6. **AI Providers** → **OpenAI/Ollama** (API keys in env, request/response logging via AuditLog)
7. **Notification Channels** → **Email/SMS/Push Providers** (credentials in env, per-user preferences)

## Supporting Detail Cards

### Card: Time Compiler Deterministic Logic
- Topological sort for dependencies (cycle detection)
- Slot packing: earliest-deadline-first within availability windows
- Buffers: configurable between tasks, travel buffers by location
- Breaks: energy-aware (peak hours), min duration enforced
- Output: `ScheduleProposal` with confidence, conflicts, tradeoffs, alternatives
- Never overwrites calendar — produces proposal for user approval

### Card: Calendar Engine Domain Model
- Value objects: `DateTime`, `Duration`, `RecurrenceRule`
- RRULE parsing/expansion (FREQ, INTERVAL, BYDAY, EXDATE)
- IANA timezone via `Intl.DateTimeFormat` (DST transitions)
- Conflict types: OVERLAP, CONTAINS, ADJACENT, RECURRENCE_OVERLAP
- Views: Day/Week/Month/Agenda/Timeline generators

### Card: Calendar Adapters Sync Flow
- OAuth2: authorization code flow + PKCE
- Token encryption at rest (AES-GCM via app secret)
- Incremental sync via `syncToken` (Google) / `deltaLink` (Outlook)
- Bidirectional: local→remote push, remote→local pull
- Conflict resolution: last-write-wins with ETag comparison

### Card: Notification Delivery
- Channels: App (DB), Email (SMTP), SMS (Twilio), Push (VAPID)
- Preferences per user: working hours, mute, channel enable/disable
- Retry/backoff for failed deliveries
- Reminder types: MINUTES_BEFORE, HOURS_BEFORE, DAYS_BEFORE, AT_TIME

### Card: AI Provider Fallback
- Primary: OpenAI (GPT-4o)
- Fallback: Ollama (local Llama/Mistral)
- Shared interface: `AIProvider` with `complete()`, `embed()`
- Intent parser → structured JSON → Planning engine → task decomposition
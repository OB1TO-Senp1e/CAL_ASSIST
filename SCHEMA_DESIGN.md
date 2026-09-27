# Database Schema - Entity Relationship Overview

## Complete Entity List (45 Models, 40 Enums)

### Core Entities (8)
- **User** - Core identity with timezone/locale settings
- **Profile** - Extended user information (avatar, bio, organization)
- **Session** - Authentication tokens with IP/UA tracking
- **Preference** - User settings across categories (working hours, focus, notifications, etc.)
- **AuditLog** - Complete audit trail with old/new data snapshots

### Goal Hierarchy (9)
- **Goal** - Top-level objectives with status/priority
- **Project** - Initiatives under goals
- **Milestone** - Key checkpoints within projects/goals
- **Task** - Actionable work items with dependencies
- **TaskDependency** - DAG relationships between tasks
- **Deadline** - Time-bound commitments tied to goals/projects

### Calendar System (8)
- **Calendar** - User's calendar instances (local, Google, Outlook, etc.)
- **CalendarConnection** - OAuth connections to external calendar providers
- **Event** - Calendar events with recurrence rules, time zones, status
- **EventParticipant** - Attendees with RSVP tracking
- **Reminder** - Notifications tied to events/tasks/commitments

### Time & Scheduling (11)
- **TimeBlock** - Scheduled time allocations (FOCUS, MEETING, TRAVEL, etc.)
- **FocusBlock** - Deep work time with focus level tracking
- **TravelBuffer** - Travel time with mode estimation
- **AvailabilityRule** - Recurring availability patterns
- **Constraint** - User preferences that constrain scheduling
- **Commitment** - External promises with deadline tracking
- **Routine** - Recurring daily/weekly patterns

### Planning Engine (5)
- **Plan** - High-level planning documents
- **PlanVersion** - Historical versions for A/B comparison
- **Schedule** - Concrete time allocations
- **ScheduleBlock** - Execution order within schedules
- **ScheduleChange** - History of all schedule modifications

### AI & Intelligence (13)
- **Intent** - Parsed natural language requests
- **Memory** - Long-term memory with vector embeddings
- **MemoryRelation** - Links between memories
- **Conversation** - Chat sessions with AI assistant
- **ConversationMessage** - Individual messages with reasoning traces
- **AssistantAction** - Executed AI actions with outcomes
- **AssistantRecommendation** - Proactive AI suggestions
- **AiSuggestion** - Structured AI recommendations

### Notifications & Permissions (5)
- **Notification** - Multi-channel (app/email/SMS/push) notifications
- **Permission** - Granular permission controls
- **AutonomyRule** - AI behavior configuration
- **Integration** - External service connections

### Planning Entities Added
- **Plan** - Versioned planning documents
- **PlanVersion** - Immutable plan snapshots
- **Schedule** - Time-bound execution windows
- **ScheduleBlock** - Block-level schedule details
- **ScheduleChange** - Audit trail for schedule modifications

## Migration Strategy

### Initial Migration (001_init)
Run `npx prisma migrate dev --name init` to create the base schema.

### Future Migrations
- Use `npx prisma migrate dev --name <description>` for each change
- Review generated SQL in `prisma/migrations/` directory
- Test in staging before production deployment

## Key Design Decisions

1. **Soft Deletes**: All business entities have `deletedAt` for soft deletion
2. **Timezone Handling**: Every temporal entity includes `timezone` field
3. **Recurring Events**: RRULE string format with exception dates array
4. **Auditability**: All entities have created/updated timestamps
5. **Provenance Tracking**: `source` field on Tasks, Events, Commitments (USER/AI_GENERATED)
6. **Historical Versions**: Plans and Schedules maintain versioned history
7. **Calendar Sync**: External IDs tracked for bidirectional sync
8. **Conflict Detection**: Exception dates on recurring events, sync tokens

## Indexes Summary
- All entities indexed by `userId` for efficient per-user queries
- Temporal indexes on date fields
- Composite indexes for common query patterns
- Unique constraints on email, external IDs, and relation combinations

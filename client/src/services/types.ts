/**
 * Shared API types.
 *
 * Every field is copied from the backend source, not invented — the cited file is
 * authoritative. Stage 3 swaps the data source, not these types.
 */

/** `AuthResponse` — src/auth/auth.service.ts */
export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

/** `UsersService.findById` select — src/users/users.service.ts (GET /api/users/me) */
export interface Profile extends AuthUser {
  createdAt: string;
  updatedAt: string;
  preferences?: unknown[];
  goals?: unknown[];
  projects?: unknown[];
}

/* ─────────────────────────── Calendar ───────────────────────────
 * Enums mirror prisma/schema.prisma verbatim. `EventCategory` is a Prisma enum
 * (`enum EventCategory`) since migration 20260927110000_add_event_category_color;
 * `normalizeEvent` still defaults it so rows predating that column read cleanly.
 */

/** prisma/schema.prisma `enum EventStatus` */
export type EventStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' | 'NEEDS_ACTION';

/** prisma/schema.prisma `enum EventSource` */
export type EventSource = 'USER' | 'AI_GENERATED' | 'SYNCED';

/** prisma/schema.prisma `enum EventVisibility` */
export type EventVisibility = 'PRIVATE' | 'PUBLIC' | 'CONFIDENTIAL';

/** prisma/schema.prisma `enum EventCategory` (mirrored by src/calendar/domain/calendar-event.ts) */
export type EventCategory =
  | 'PERSONAL'
  | 'WORK'
  | 'MEETING'
  | 'APPOINTMENT'
  | 'REMINDER'
  | 'HOLIDAY'
  | 'BIRTHDAY'
  | 'TRAVEL'
  | 'FOCUS_TIME'
  | 'CUSTOM';

/** prisma/schema.prisma `enum CalendarProvider` */
export type CalendarProvider = 'LOCAL' | 'GOOGLE' | 'OUTLOOK' | 'APPLE';

/** prisma/schema.prisma `enum ParticipantStatus` / `ParticipantRole` */
export type ParticipantStatus = 'NEEDS_ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'DELEGATED';
export type ParticipantRole = 'REQUIRED' | 'OPTIONAL' | 'ORGANIZER';

export interface EventParticipantDTO {
  id?: string;
  email: string;
  displayName?: string | null;
  status: ParticipantStatus;
  role: ParticipantRole;
  responseAt?: string | null;
}

export interface ReminderDTO {
  id: string;
  eventId: string;
  minutesBefore: number;
  method: 'EMAIL' | 'PUSH' | 'SMS' | 'POPUP';
  triggered: boolean;
}

/**
 * Event as the calendar endpoints should return it.
 *
 * NOTE ON `start` / `end`: the real service returns `DateTime` class instances
 * (`src/calendar/domain/calendar-event.ts`), which have no `toJSON()`, so over
 * the wire they currently arrive as `{_utc, _timeZone}`. `normalizeEvent()`
 * accepts either that, a Date-like, or an ISO string, so Stage 3 does not break
 * whichever way the backend ends up serialising. See BUILD_LOG: Stage 4 item.
 */
export interface CalendarEventDTO {
  id: string;
  userId: string;
  calendarId: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  /** ISO 8601. */
  start: string;
  /** ISO 8601. */
  end: string;
  allDay: boolean;
  timeZone: string;
  status: EventStatus;
  /** Persisted on Prisma Event; normalised to 'PERSONAL' for pre-migration rows. */
  category: EventCategory;
  color?: string | null;
  /** RRULE string; the service returns a parsed object under `recurrence`. */
  recurrenceRule?: string | null;
  exceptionDates?: string[];
  source: EventSource;
  visibility: EventVisibility;
  participants: EventParticipantDTO[];
  reminders: ReminderDTO[];
  createdAt: string;
  updatedAt: string;
}

/** prisma/schema.prisma `model Calendar` (calendar list endpoint). */
export interface CalendarDTO {
  id: string;
  userId: string;
  connectionId: string | null;
  name: string;
  description?: string | null;
  /** Hex, Prisma default `#3b82f6`. Snapped to a palette hue for display. */
  color: string | null;
  timezone: string;
  isVisible: boolean;
  isPrimary: boolean;
  provider: CalendarProvider;
  externalId?: string | null;
  lastSynced?: string | null;
}

/** `src/calendar/domain/calendar-event.ts` WorkingHours inside DayView. */
export interface WorkingHours {
  start: number;
  end: number;
}

/** `src/calendar/views/view-generator.ts` DayView */
export interface DayViewDTO {
  date: string;
  events: CalendarEventDTO[];
  allDayEvents: CalendarEventDTO[];
  workingHours: WorkingHours;
}

/** `src/calendar/views/view-generator.ts` WeekView */
export interface WeekViewDTO {
  weekStart: string;
  weekEnd: string;
  days: DayViewDTO[];
}

/** `src/calendar/views/view-generator.ts` MonthView (Map → plain object). */
export interface MonthViewDTO {
  year: number;
  /** 0-indexed, matching the service's `generateMonthView(year, month, …)`. */
  month: number;
  weeks: WeekViewDTO[];
  /** date `YYYY-MM-DD` → events */
  eventsByDate: Record<string, CalendarEventDTO[]>;
}

/** POST /api/calendar/events — `CreateEventSchema` */
export interface CreateEventInput {
  calendarId?: string | null;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  timeZone?: string;
  category?: EventCategory;
  color?: string;
  recurrenceRule?: string;
  participants?: Pick<EventParticipantDTO, 'email' | 'displayName' | 'status' | 'role'>[];
}

/** PATCH /api/calendar/events/:id — `UpdateEventSchema` + `status` + `source` */
export type UpdateEventInput = Partial<CreateEventInput> & { status?: EventStatus; source?: 'USER' | 'AI_GENERATED' | 'SYNCED' };

/** PATCH /api/calendar/events/:id/resize — `ResizeEventSchema` */
export interface ResizeEventInput {
  newEnd: string;
  timeZone?: string;
}

/** POST /api/calendar/events/bulk — `BulkEventSchema` */
export interface BulkEventInput {
  eventIds: string[];
  action: 'delete' | 'cancel' | 'confirm' | 'move' | 'resize';
  newStart?: string;
  newEnd?: string;
  timeZone?: string;
}

/** `GET /api/calendar/events/conflicts/check` response — ConflictDetector. */
export interface ConflictDTO {
  type: 'OVERLAP' | 'CONTAINS' | 'ADJACENT' | 'RECURRENCE_OVERLAP';
  eventA: string;
  eventB: string;
  eventBTitle?: string;
  overlapMinutes: number;
}

/* ───────────────────────── Goals / Projects / Tasks ─────────────────────────
 * Statuses and write fields mirror prisma/schema.prisma plus the Zod request
 * schemas under src/{goals,projects,tasks}/interfaces. Task duration names
 * intentionally differ: requests use `estimatedDurationMinutes`; Prisma reads
 * return `estimatedDurationMin`.
 */

export type GoalStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ON_HOLD';
export type GoalUpdateStatus = Exclude<GoalStatus, 'ON_HOLD'>;
export type ProjectStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'BLOCKED' | 'ON_HOLD';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'BLOCKED' | 'ON_HOLD';
export type TaskFlexibility = 'LOW' | 'MEDIUM' | 'HIGH';
export type EnergyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

interface WorkRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  priority: number;
  startDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalDTO extends WorkRecord {
  status: GoalStatus;
  targetDate: string | null;
}

export interface ProjectDTO extends WorkRecord {
  goalId: string | null;
  status: ProjectStatus;
  dueDate: string | null;
  milestones?: unknown[];
  tasks?: TaskDTO[];
}

export interface TaskDTO extends WorkRecord {
  projectId: string | null;
  goalId: string | null;
  milestoneId: string | null;
  status: TaskStatus;
  estimatedDurationMin: number | null;
  actualDurationMin: number | null;
  dueDate: string | null;
  source: 'USER' | 'AI_GENERATED' | 'IMPORTED';
  flexibility: TaskFlexibility;
  energyRequirement: EnergyLevel;
  context: string | null;
  preferredTime: string | null;
  location: string | null;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  priority?: number;
  startDate?: string;
  targetDate?: string;
}

export type UpdateGoalInput = Partial<CreateGoalInput> & { status?: GoalUpdateStatus };

export interface CreateProjectInput {
  title: string;
  description?: string;
  goalId?: string | null;
  priority?: number;
  startDate?: string;
  dueDate?: string;
}

export type UpdateProjectInput = Partial<CreateProjectInput> & { status?: ProjectStatus };

export interface CreateTaskInput {
  title: string;
  description?: string;
  projectId?: string | null;
  goalId?: string | null;
  milestoneId?: string | null;
  priority?: number;
  estimatedDurationMinutes?: number;
  dueDate?: string;
  startDate?: string;
  dependencies?: string[];
  flexibility?: TaskFlexibility;
  energyRequirement?: EnergyLevel;
  context?: string;
  preferredTime?: string;
  location?: string;
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  status?: TaskStatus;
  actualDurationMinutes?: number;
  completedAt?: string;
}

/* ─────────────────────────── Assistant ───────────────────────────
 * Sources (grep'd from backend source, never invented):
 *   ToolCategory / ToolConfirmationLevel / ToolResultStatus / ToolResult
 *   ProposedAction / ToolCall / AssistantMessage / AssistantResponse
 *     → src/ai/assistant/interfaces/assistant-tools.interface.ts
 *   Conversation / ConversationMessage / AssistantAction
 *   AssistantRecommendation / AiSuggestion → prisma/schema.prisma
 *   MessageRole → prisma/schema.prisma enum MessageRole
 *   RecommendationType / RecommendationStatus → prisma/schema.prisma
 *
 * ⚠ No HTTP controller exposes `AssistantOrchestratorService` yet — the only AI
 * route that exists is `POST /api/ai/intent/parse` (src/ai/intent/…). The shapes
 * below therefore mirror the SERVICE layer, not a wire contract, so that adding
 * the controller in Stage 3 changes endpoints but not these types.
 */

/** `ToolCategorySchema` — assistant-tools.interface.ts */
export type ToolCategory =
  | 'CALENDAR'
  | 'TASKS'
  | 'GOALS'
  | 'PROJECTS'
  | 'SCHEDULING'
  | 'AVAILABILITY'
  | 'CONFLICTS'
  | 'INSIGHTS';

/** `ToolConfirmationLevelSchema` — assistant-tools.interface.ts.
 *  Equals the client `Level` scale in lib/design-tokens.ts, by design. */
export type ToolConfirmationLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** `ToolResultStatusSchema` — assistant-tools.interface.ts */
export type ToolResultStatus = 'SUCCESS' | 'ERROR' | 'REQUIRES_CONFIRMATION' | 'PARTIAL';

/** `ToolResult<T>` — assistant-tools.interface.ts */
export interface ToolResult<T = unknown> {
  status: ToolResultStatus;
  data?: T;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  confirmationData?: unknown;
  metadata?: Record<string, unknown>;
}

/** `ToolCall` — assistant-tools.interface.ts */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** `ProposedAction` — assistant-tools.interface.ts. This is what the proposal
 *  card renders: what would happen, how risky, and whether it can be undone. */
export interface ProposedAction {
  id: string;
  toolName: string;
  description: string;
  input: Record<string, unknown>;
  confirmationLevel: ToolConfirmationLevel;
  estimatedImpact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reversible: boolean;
}

/** `AssistantResponse` — assistant-tools.interface.ts, plus the server-side
 *  action id used to confirm later (`AssistantOrchestratorService.confirmAction`). */
export interface AssistantResponse {
  message: string;
  toolCalls?: ToolCall[];
  proposedActions?: ProposedAction[];
  requiresConfirmation?: boolean;
  confidence?: number;
}

/** `ConfirmationRequest` — assistant-tools.interface.ts */
export interface ConfirmationRequest {
  actionId: string;
  confirmed: boolean;
  modifiedInput?: Record<string, unknown>;
}

/** prisma `enum MessageRole` */
export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

/**
 * A rendered turn in the thread. Mirrors `ConversationMessage` (prisma) and
 * carries the UI-only pieces the backend will return alongside it:
 * `proposedActions` (from AssistantResponse) and the local delivery state.
 */
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  reasoning?: string | null;
  /** `ConversationMessage.modelOutput` — kept opaque; holds proposedActions. */
  proposedActions?: ProposedAction[];
  toolCalls?: ToolCall[];
  confidence?: number;
  createdAt: string;
  /** UI-only: optimistic send / failure. Never persisted by the mock. */
  pending?: boolean;
  failed?: boolean;
}

/** prisma `model Conversation` (the fields the UI uses). */
export interface ConversationDTO {
  id: string;
  userId: string;
  title: string | null;
  model: string | null;
  provider: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

/** prisma `enum RecommendationType` */
export type RecommendationType =
  | 'SCHEDULING'
  | 'REPRIORITIZATION'
  | 'TIME_REALLOCATION'
  | 'CONFLICT_RESOLUTION'
  | 'CAPACITY_PLANNING'
  | 'RISK_ALERT'
  | 'OPPORTUNITY';

/** prisma `enum RecommendationStatus` */
export type RecommendationStatus = 'PENDING' | 'APPLIED' | 'DISMISSED' | 'EXPIRED';

/** prisma `model AssistantRecommendation` */
export interface AssistantRecommendationDTO {
  id: string;
  userId: string;
  conversationId: string | null;
  type: RecommendationType;
  title: string;
  description: string;
  reasoning: string;
  confidence: number;
  priority: number;
  entityType: string | null;
  entityId: string | null;
  status: RecommendationStatus;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A tool as the assistant can invoke it. Names/levels/descriptions are copied
 *  verbatim from each `*.tool.ts` (13 tools registered by ToolRegistry). */
export interface AssistantToolDescriptor {
  name: string;
  description: string;
  category: ToolCategory;
  confirmationLevel: ToolConfirmationLevel;
}

/** `ParsedIntent` — src/ai/intent/interfaces/intent.interface.ts */
export type IntentType =
  | 'CREATE_GOAL'
  | 'CREATE_TASK'
  | 'CREATE_EVENT'
  | 'SCHEDULE_TASK'
  | 'RESCHEDULE_EVENT'
  | 'CANCEL_EVENT'
  | 'QUERY_AVAILABILITY'
  | 'CHECK_CONFLICTS'
  | 'GET_RECOMMENDATIONS';

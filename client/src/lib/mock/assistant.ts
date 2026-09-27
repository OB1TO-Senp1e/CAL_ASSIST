/**
 * Mock assistant data (Stage 2, unit 2c).
 *
 * Shapes match the `Assistant*` DTOs in services/types.ts, which were themselves
 * copied from the backend orchestrator + prisma models. Stage 3 replaces the
 * responder with the real `POST /assistant/message` + `/assistant/confirm`
 * endpoints (which do not exist yet — see BUILD_LOG); the component tree and
 * these types stay the same.
 *
 * The responder is deliberately *deterministic*: it classifies the message with
 * the same nine `IntentType` members the backend's IntentParser emits, then
 * returns canned-but-realistic tool proposals built from real tool input
 * schemas. No LLM call is made in Stage 2.
 */
import dayjs from 'dayjs';
import type {
  AssistantToolDescriptor,
  CalendarEventDTO,
  ChatMessage,
  ConversationDTO,
  IntentType,
  ProposedAction,
  ToolCategory,
  ToolConfirmationLevel,
} from '@/services/types';
import { dailyRule } from '@/lib/rrule';

const CONVERSATIONS_KEY = 'calassist-mock-conversations';
const MESSAGES_KEY = 'calassist-mock-messages';
const VERSION = 1;

const USER_ID = 'usr_demo';

/* ───────────────────────── Tool catalog ─────────────────────────
 * Copied verbatim from src/ai/assistant/tools/*.tool.ts (name, description,
 * category, confirmationLevel). Keep in sync if the backend adds a tool.
 */
export const ASSISTANT_TOOLS: AssistantToolDescriptor[] = [
  { name: 'create_event', description: 'Create a new calendar event', category: 'CALENDAR', confirmationLevel: 'MEDIUM' },
  { name: 'update_event', description: 'Update an existing calendar event', category: 'CALENDAR', confirmationLevel: 'MEDIUM' },
  { name: 'delete_event', description: 'Delete a calendar event', category: 'CALENDAR', confirmationLevel: 'HIGH' },
  { name: 'move_event', description: 'Move an existing calendar event to a new time', category: 'CALENDAR', confirmationLevel: 'HIGH' },
  { name: 'create_task', description: 'Create a new task', category: 'TASKS', confirmationLevel: 'LOW' },
  { name: 'update_task', description: 'Update an existing task', category: 'TASKS', confirmationLevel: 'LOW' },
  { name: 'create_goal', description: 'Create a new goal', category: 'GOALS', confirmationLevel: 'MEDIUM' },
  { name: 'create_project', description: 'Create a new project', category: 'PROJECTS', confirmationLevel: 'MEDIUM' },
  { name: 'create_schedule_proposal', description: 'Generate a schedule proposal from tasks, goals, or projects', category: 'SCHEDULING', confirmationLevel: 'MEDIUM' },
  { name: 'plan_day', description: 'Generate a daily plan with time blocks for tasks and events', category: 'SCHEDULING', confirmationLevel: 'MEDIUM' },
  { name: 'find_availability', description: 'Find available time slots for scheduling', category: 'AVAILABILITY', confirmationLevel: 'NONE' },
  { name: 'detect_conflicts', description: 'Detect scheduling conflicts for a time range or specific event', category: 'CONFLICTS', confirmationLevel: 'NONE' },
  { name: 'explain_schedule', description: 'Explain the reasoning behind a schedule or daily plan', category: 'INSIGHTS', confirmationLevel: 'NONE' },
];

export const TOOL_CATEGORY_LABEL: Record<ToolCategory, string> = {
  CALENDAR: 'Calendar',
  TASKS: 'Tasks',
  GOALS: 'Goals',
  PROJECTS: 'Projects',
  SCHEDULING: 'Scheduling',
  AVAILABILITY: 'Availability',
  CONFLICTS: 'Conflicts',
  INSIGHTS: 'Insights',
};

/** Human label per tool, used on the collapsed tool-call row. */
export const TOOL_LABEL: Record<string, string> = {
  create_event: 'Create event',
  update_event: 'Update event',
  delete_event: 'Delete event',
  move_event: 'Move event',
  create_task: 'Create task',
  update_task: 'Update task',
  create_goal: 'Create goal',
  create_project: 'Create project',
  create_schedule_proposal: 'Build schedule proposal',
  plan_day: 'Plan day',
  find_availability: 'Find availability',
  detect_conflicts: 'Detect conflicts',
  explain_schedule: 'Explain schedule',
};

/** Mirror of `AssistantOrchestratorService.estimateImpact` — same tool buckets. */
function estimateImpact(toolName: string): ProposedAction['estimatedImpact'] {
  if (['delete_event', 'create_schedule_proposal'].includes(toolName)) return 'CRITICAL';
  if (
    ['create_event', 'update_event', 'move_event', 'create_task', 'create_goal', 'create_project'].includes(toolName)
  )
    return 'HIGH';
  if (toolName === 'update_task') return 'MEDIUM';
  return 'LOW';
}

/** Mirror of `AssistantOrchestratorService.isReversible` — only delete is not. */
function isReversible(toolName: string): boolean {
  return toolName !== 'delete_event';
}

function propose(
  toolName: string,
  description: string,
  input: Record<string, unknown>,
  level?: ToolConfirmationLevel,
): ProposedAction {
  const def = ASSISTANT_TOOLS.find((t) => t.name === toolName);
  return {
    // Same id shape the orchestrator mints: action_<epoch>_<rand>
    id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    toolName,
    description,
    input,
    confirmationLevel: level ?? def?.confirmationLevel ?? 'MEDIUM',
    estimatedImpact: estimateImpact(toolName),
    reversible: isReversible(toolName),
  };
}

/* ───────────────────────── Storage ───────────────────────── */

function readVersioned<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; data?: T };
    if (!parsed || parsed.version !== VERSION || parsed.data === undefined) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeVersioned<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ version: VERSION, data }));
  } catch {
    /* ignore quota errors */
  }
}

export function mockAssistantId(prefix = 'c'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/* ───────────────────────── Seed ─────────────────────────
 * One prior conversation so the thread has history the moment 2c opens, and so
 * the "proposal already applied" state is visible without doing anything.
 */

function seedConversation(): ConversationDTO {
  const now = dayjs().subtract(1, 'day').toISOString();
  return {
    id: 'conv_seed',
    userId: USER_ID,
    title: 'Protect focus time this week',
    model: 'mock-orchestrator',
    provider: 'mock',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  };
}

function seedMessages(): ChatMessage[] {
  const convId = 'conv_seed';
  const base = dayjs().subtract(1, 'day');
  const m = (min: number) => base.add(min, 'minute').toISOString();

  const applied: ProposedAction = {
    id: 'action_seed_applied',
    toolName: 'create_event',
    description: 'Block 2 hours for deep work on Tuesday morning',
    input: {
      title: 'Deep work',
      startDate: base.add(1, 'day').hour(9).minute(0).second(0).toISOString(),
      endDate: base.add(1, 'day').hour(11).minute(0).second(0).toISOString(),
      timezone: 'America/Los_Angeles',
      status: 'CONFIRMED',
    },
    confirmationLevel: 'MEDIUM',
    estimatedImpact: 'HIGH',
    reversible: true,
  };

  return [
    {
      id: 'msg_seed_1',
      conversationId: convId,
      role: 'USER',
      content: 'Find me two hours for deep work this week, mornings only.',
      createdAt: m(0),
    },
    {
      id: 'msg_seed_2',
      conversationId: convId,
      role: 'ASSISTANT',
      content:
        'Your mornings are clear from 9:00 except Thursday. Tuesday 9:00–11:00 is the best slot — it sits before your first meeting and keeps the block unbroken.',
      reasoning:
        'Working hours 09:00–17:00, Mon–Fri. Existing events Tuesday: Standup 09:15, Design review 13:00. Chose the earliest two-hour gap that avoids fragmentation.',
      proposedActions: [applied],
      confidence: 0.86,
      createdAt: m(1),
      toolCalls: [{ id: 'action_seed_applied', name: 'create_event', arguments: applied.input }],
    },
    {
      id: 'msg_seed_3',
      conversationId: convId,
      role: 'SYSTEM',
      content: 'Applied “Deep work” to your calendar.',
      createdAt: m(2),
    },
  ];
}

export function loadConversations(): ConversationDTO[] {
  const stored = readVersioned<ConversationDTO[]>(CONVERSATIONS_KEY);
  if (stored && stored.length > 0) return stored;
  const seeded = [seedConversation()];
  writeVersioned(CONVERSATIONS_KEY, seeded);
  return seeded;
}

export function saveConversations(list: ConversationDTO[]): void {
  writeVersioned(CONVERSATIONS_KEY, list);
}

export function loadMessages(): ChatMessage[] {
  const stored = readVersioned<ChatMessage[]>(MESSAGES_KEY);
  if (stored && stored.length > 0) return stored;
  const seeded = seedMessages();
  writeVersioned(MESSAGES_KEY, seeded);
  return seeded;
}

export function saveMessages(list: ChatMessage[]): void {
  writeVersioned(MESSAGES_KEY, list);
}

export function resetMockAssistant(): void {
  writeVersioned(CONVERSATIONS_KEY, [seedConversation()]);
  writeVersioned(MESSAGES_KEY, seedMessages());
}

/* ───────────────────────── Responder ─────────────────────────
 * Deterministic stand-in for `AssistantOrchestratorService.processMessage`.
 * It classifies the message with the backend's own nine `IntentType` values,
 * then emits proposals whose `input` objects satisfy the real tool input
 * schemas (`src/ai/assistant/interfaces/tool-schemas.ts`) field-for-field.
 *
 * Conflict and availability answers are computed from the *actual* mock events,
 * not hard-coded, so what you see here is what the grid shows.
 */

/**
 * ⚠ The backend `IntentType` (src/ai/intent/interfaces/intent.interface.ts) has
 * NO `CREATE_PROJECT` member even though a `create_project` TOOL exists. Rather
 * than invent an enum value, the local classifier extends the union and the
 * mismatch is logged for Stage 3/4 (see BUILD_LOG).
 */
export type ResponderIntent = IntentType | 'CREATE_PROJECT';

export interface ResponderInput {
  message: string;
  events: CalendarEventDTO[];
}

export interface ResponderOutput {
  message: string;
  reasoning: string;
  proposedActions: ProposedAction[];
  confidence: number;
  intentType: ResponderIntent;
}

const HOUR = 60;

/** Local-time "today at HH:mm" as an ISO string, for tool inputs. */
function at(dayOffset: number, hour: number, minute = 0): string {
  return dayjs().add(dayOffset, 'day').hour(hour).minute(minute).second(0).millisecond(0).toISOString();
}

function fmt(iso: string): string {
  return dayjs(iso).format('ddd D MMM, HH:mm');
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return dayjs(aStart).isBefore(dayjs(bEnd)) && dayjs(bStart).isBefore(dayjs(aEnd));
}

function activeEvents(events: CalendarEventDTO[]): CalendarEventDTO[] {
  return events.filter((e) => e.allDay !== true);
}

export function classifyIntent(message: string): ResponderIntent {
  const m = message.toLowerCase();
  if (/(conflict|double[- ]book|overlap|clash)/.test(m)) return 'CHECK_CONFLICTS';
  if (/(free|available|availability|gap|open slot)/.test(m)) return 'QUERY_AVAILABILITY';
  if (/(plan my day|plan the day|plan out|day plan|schedule my day)/.test(m)) return 'SCHEDULE_TASK';
  if (/(reschedule|move|push back|shift|postpone)/.test(m)) return 'RESCHEDULE_EVENT';
  if (/(cancel|delete|remove)/.test(m)) return 'CANCEL_EVENT';
  if (/(block|deep work|focus time|time to|make time|find \d)/.test(m)) return 'CREATE_EVENT';
  if (/(goal|objective|okr)/.test(m)) return 'CREATE_GOAL';
  if (/(project|initiative)/.test(m)) return 'CREATE_PROJECT';
  if (/(task|todo|to-do|remind me to)/.test(m)) return 'CREATE_TASK';
  if (/(recommend|suggest|what should i)/.test(m)) return 'GET_RECOMMENDATIONS';
  return 'CREATE_TASK';
}

/** First 2-hour weekday gap inside 09:00–17:00 that is actually free. */
function firstFreeSlot(events: CalendarEventDTO[]): { start: string; end: string } {
  const busy = activeEvents(events);
  for (let d = 1; d <= 7; d += 1) {
    const base = dayjs().add(d, 'day');
    if (base.day() === 0 || base.day() === 6) continue;
    for (let h = 9; h + 2 <= 17; h += 1) {
      const start = base.hour(h).minute(0).second(0).millisecond(0).toISOString();
      const end = base.hour(h + 2).minute(0).second(0).millisecond(0).toISOString();
      const clash = busy.some((e) => overlaps(start, end, String(e.start), String(e.end)));
      if (!clash) return { start, end };
    }
  }
  const start = at(1, 9);
  const end = at(1, 11);
  return { start, end };
}

export function respond({ message, events }: ResponderInput): ResponderOutput {
  const intentType = classifyIntent(message);
  const busy = activeEvents(events);

  switch (intentType) {
    case 'CHECK_CONFLICTS': {
      const pairs: Array<{ a: CalendarEventDTO; b: CalendarEventDTO }> = [];
      for (let i = 0; i < busy.length; i += 1) {
        for (let j = i + 1; j < busy.length; j += 1) {
          if (overlaps(String(busy[i].start), String(busy[i].end), String(busy[j].start), String(busy[j].end))) {
            pairs.push({ a: busy[i], b: busy[j] });
          }
        }
      }
      const lines = pairs.length
        ? pairs
            .slice(0, 5)
            .map((p) => `“${p.a.title}” overlaps “${p.b.title}” (${fmt(String(p.a.start))})`)
            .join('\n')
        : 'No overlaps in the next seven days.';
      return {
        intentType,
        confidence: 0.94,
        proposedActions: [],
        reasoning: `Scanned ${busy.length} timed events over the next week and compared every pair for overlap.`,
        message: pairs.length
          ? `I found ${pairs.length} conflict${pairs.length === 1 ? '' : 's'}:\n${lines}\n\nI can move one of each pair — say the word.`
          : 'Good news — nothing overlaps for the next seven days. Your week is clean.',
      };
    }

    case 'QUERY_AVAILABILITY': {
      const slot = firstFreeSlot(events);
      const minutes = dayjs(slot.end).diff(dayjs(slot.start), 'minute');
      return {
        intentType,
        confidence: 0.88,
        proposedActions: [
          propose(
            'find_availability',
            `Find ${minutes / HOUR}h free windows`,
            {
              startDate: at(1, 0),
              endDate: at(7, 23),
              durationMinutes: 120,
              bufferMinutes: 10,
              timezone: 'America/Los_Angeles',
            },
            'NONE',
          ),
        ],
        reasoning:
          'Checked working hours 09:00–17:00 Mon–Fri against existing timed events, then took the earliest gap of at least two hours.',
        message: `The earliest ${minutes / HOUR}-hour window is ${fmt(slot.start)} → ${dayjs(slot.end).format('HH:mm')}. Want me to hold it?`,
      };
    }

    case 'RESCHEDULE_EVENT': {
      const target =
        busy.find((e) => /standup|review|sync|meeting/i.test(e.title)) ??
        busy.find((e) => dayjs(e.start).isAfter(dayjs()));
      if (!target) {
        return {
          intentType,
          confidence: 0.4,
          proposedActions: [],
          reasoning: 'No movable events found in the loaded range.',
          message: 'I could not find an event to move. Which one did you mean?',
        };
      }
      const newStart = dayjs(String(target.start)).add(1, 'day').toISOString();
      const newEnd = dayjs(String(target.end)).add(1, 'day').toISOString();
      return {
        intentType,
        confidence: 0.82,
        proposedActions: [
          propose('move_event', `Move “${target.title}” to ${fmt(newStart)}`, {
            eventId: target.id,
            newStartDate: newStart,
            newEndDate: newEnd,
            timezone: target.timeZone ?? 'America/Los_Angeles',
          }),
        ],
        reasoning: 'Shifted by exactly one day to preserve duration and time-of-day.',
        message: `I can move “${target.title}” from ${fmt(String(target.start))} to ${fmt(newStart)}. Confirm and I will make the change.`,
      };
    }

    case 'CANCEL_EVENT': {
      const target = busy.find((e) => /cancel|optional|tentative/i.test(e.title)) ?? busy[0];
      if (!target) {
        return {
          intentType,
          confidence: 0.35,
          proposedActions: [],
          reasoning: 'Nothing matched.',
          message: 'Nothing obvious to cancel — tell me which event.',
        };
      }
      return {
        intentType,
        confidence: 0.7,
        proposedActions: [
          propose('delete_event', `Delete “${target.title}”`, { eventId: target.id }),
        ],
        reasoning:
          'Matched the event title against the request. Deletion is not reversible, so this needs an explicit confirmation.',
        message: `That will remove “${target.title}” on ${fmt(String(target.start))}. This one cannot be undone.`,
      };
    }

    case 'CREATE_GOAL': {
      const title = message.replace(/^(create|add|set up|make)\s+(a\s+)?(goal|objective)\s*(for|to|called)?\s*/i, '').trim() || 'New goal';
      return {
        intentType,
        confidence: 0.8,
        proposedActions: [
          propose('create_goal', `Create goal “${title}”`, {
            title: title.slice(0, 200),
            priority: 5,
            startDate: at(0, 9),
            targetDate: at(90, 17),
          }),
        ],
        reasoning: 'Goal needs a target date to be schedulable; defaulted to 90 days out.',
        message: `I will create the goal “${title}” with a 90-day target so the planner can break it down.`,
      };
    }

    case 'CREATE_PROJECT': {
      const title = message.replace(/^(create|add|set up|make)\s+(a\s+)?(project|initiative)\s*(for|to|called)?\s*/i, '').trim() || 'New project';
      return {
        intentType,
        confidence: 0.78,
        proposedActions: [
          propose('create_project', `Create project “${title}”`, {
            title: title.slice(0, 200),
            priority: 5,
            startDate: at(0, 9),
            dueDate: at(30, 17),
          }),
        ],
        reasoning: 'No parent goal was named, so the project is created standalone and can be linked later.',
        message: `Creating the project “${title}”. It is not attached to a goal yet — link it any time.`,
      };
    }

    case 'SCHEDULE_TASK': {
      const slot = firstFreeSlot(events);
      return {
        intentType,
        confidence: 0.85,
        proposedActions: [
          propose('plan_day', `Plan ${dayjs(slot.start).format('dddd')}`, {
            date: slot.start,
            timezone: 'America/Los_Angeles',
          }),
        ],
        reasoning:
          'Used the day with the most contiguous free time inside working hours, and kept the 09:00–17:00 window.',
        message: `I drafted a plan for ${dayjs(slot.start).format('dddd D MMM')} that fills your open hours and leaves buffers between blocks. Nothing is written until you confirm.`,
      };
    }

    case 'GET_RECOMMENDATIONS': {
      const slot = firstFreeSlot(events);
      return {
        intentType,
        confidence: 0.75,
        proposedActions: [
          propose(
            'create_schedule_proposal',
            'Build a schedule proposal from open tasks',
            {
              timeRange: { start: slot.start, end: at(7, 17) },
              timezone: 'America/Los_Angeles',
              preferences: {
                workingHoursStart: '09:00',
                workingHoursEnd: '17:00',
                preferredFocusBlockDuration: 90,
                maxFocusBlockDuration: 120,
                minBreakDuration: 15,
                maxDailyHours: 6,
                bufferBetweenTasks: 10,
                protectFocusTime: true,
                allowWeekendScheduling: false,
                taskOrderingStrategy: 'BALANCED',
              },
            },
          ),
        ],
        reasoning:
          'Balanced ordering weights priority, deadline and energy together; focus blocks are capped at 120 min with 15 min breaks.',
        message:
          'Based on your open time and pending work, I would protect two focus blocks and move the low-priority review later in the week. Here is the proposal.',
      };
    }

    case 'CREATE_EVENT':
    case 'CREATE_TASK':
    default: {
      const slot = firstFreeSlot(events);
      const isTask = intentType === 'CREATE_TASK';
      if (isTask) {
        const title = message.replace(/^(create|add|remind me to|todo:?)\s*/i, '').trim() || 'New task';
        return {
          intentType,
          confidence: 0.72,
          proposedActions: [
            propose('create_task', `Create task “${title}”`, {
              title: title.slice(0, 200),
              estimatedDurationMinutes: 60,
              priority: 5,
              dueDate: at(7, 17),
            }),
          ],
          reasoning:
            'Estimated 60 minutes because no duration was given, and set the due date one week out.',
          message: `Added “${title}” as a task with a 60-minute estimate. I will find it a slot when you plan the week.`,
        };
      }
      const title = message.replace(/^(block|find|make)\s+/i, '').replace(/\s+(this week|tomorrow|today)$/i, '').trim() || 'Deep work';
      const label = title.charAt(0).toUpperCase() + title.slice(1);
      return {
        intentType,
        confidence: 0.86,
        proposedActions: [
          propose('create_event', `Block ${dayjs(slot.start).format('ddd')} ${dayjs(slot.start).format('HH:mm')}–${dayjs(slot.end).format('HH:mm')} for ${label.toLowerCase()}`, {
            title: label,
            startDate: slot.start,
            endDate: slot.end,
            timezone: 'America/Los_Angeles',
            status: 'CONFIRMED',
          }),
        ],
        reasoning:
          'Picked the first uninterrupted two-hour gap inside working hours that does not collide with an existing event.',
        message: `${fmt(slot.start)} → ${dayjs(slot.end).format('HH:mm')} is free and unbroken. I will block it for “${label}”.`,
      };
    }
  }
}

/** Mirrors `AssistantOrchestratorService.confirmAction`'s refusal path. */
export const CANCELLED_MESSAGE = 'Action cancelled.';

/** Mirrors the "Action not found or expired." branch (getPendingAction returns null). */
export const ACTION_GONE_MESSAGE = 'Action not found or expired.';

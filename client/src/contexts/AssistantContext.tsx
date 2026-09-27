import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { assistantService, assistantStore } from '@/services/assistant';
import { calendarService } from '@/services/calendar';
import type {
  AssistantToolDescriptor,
  ChatMessage,
  ConversationDTO,
  ProposedAction,
} from '@/services/types';

/**
 * Assistant conversation state, shared by the docked panel and the full-page
 * surface so both render the same thread — switching between them never loses a
 * message or a pending proposal.
 *
 * All I/O goes through `assistantService` / `calendarService`, never the mock
 * layer directly, so Stage 3 is a flag flip.
 *
 * `confirmAction` is real: confirming a calendar tool performs the same
 * `calendarService` call the calendar screen makes, so an accepted proposal
 * actually appears on the grid. Non-calendar tools (tasks/goals/projects) are
 * acknowledged but not written — their stores arrive with unit 2d.
 */
export type ActionState = 'pending' | 'working' | 'applied' | 'rejected';

interface AssistantState {
  conversations: ConversationDTO[];
  activeId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  confirming: boolean;
  error: string | null;
  actionStates: Record<string, ActionState>;
  tools: AssistantToolDescriptor[];
  selectConversation: (id: string) => void;
  newConversation: () => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  confirmAction: (action: ProposedAction, modifiedInput?: Record<string, unknown>) => Promise<void>;
  rejectAction: (action: ProposedAction) => Promise<void>;
  reload: () => void;
}

const AssistantContext = createContext<AssistantState | undefined>(undefined);

/** Tools whose stores land in 2d; confirming them produces a receipt only. */
const DEFERRED_TOOLS = new Set(['create_task', 'update_task', 'create_goal', 'create_project']);

/** Strip UI-only flags before persisting, so a reload never restores a spinner. */
function persistable(message: ChatMessage): ChatMessage {
  const { pending: _p, failed: _f, ...rest } = message;
  return rest;
}

function persist(conversationId: string, message: ChatMessage): void {
  const all = assistantStore.loadMessages();
  assistantStore.saveMessages([...all, persistable(message)]);
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [reloadKey, setReloadKey] = useState(0);

  const tools = useMemo(() => assistantService.listTools(), []);
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;

  // Load the conversation list once, then select the most recent one.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    assistantService
      .listConversations()
      .then((list) => {
        if (cancelled) return;
        setConversations(list);
        const first = list[0]?.id ?? null;
        setActiveId((current) => current ?? first);
        if (list.length === 0) setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not reach the assistant.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Load messages whenever the selected conversation changes.
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    assistantService
      .listMessages(activeId)
      .then((thread) => {
        if (cancelled) return;
        setMessages(thread);
        // Seed action states from history: an action with a following SYSTEM
        // receipt is already settled, otherwise it is still pending.
        const states: Record<string, ActionState> = {};
        thread.forEach((m) => {
          m.proposedActions?.forEach((a) => {
            states[a.id] = states[a.id] ?? 'pending';
          });
          if (m.role === 'SYSTEM') {
            const applied = /completed successfully/i.test(m.content);
            const rejected = /cancelled/i.test(m.content);
            if (applied || rejected) {
              Object.keys(states).forEach((k) => {
                if (states[k] === 'pending') states[k] = applied ? 'applied' : 'rejected';
              });
            }
          }
        });
        setActionStates(states);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load this conversation.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, reloadKey]);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
    setError(null);
  }, []);

  const newConversation = useCallback(async () => {
    try {
      const conv = await assistantService.createConversation();
      setConversations((list) => [conv, ...list]);
      setActiveId(conv.id);
      setMessages([]);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start a new conversation.');
    }
  }, []);

  const removeConversation = useCallback(async (id: string) => {
    try {
      await assistantService.deleteConversation(id);
      const rest = assistantStore.loadConversations();
      setConversations(rest);
      if (activeRef.current === id) setActiveId(rest[0]?.id ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not delete that conversation.');
    }
  }, []);

  const send = useCallback(async (text: string) => {
    const body = text.trim();
    if (!body) return;
    let conversationId = activeRef.current;
    const tempUser: ChatMessage = {
      id: assistantStore.nextId('msg'),
      conversationId: conversationId ?? 'pending',
      role: 'USER',
      content: body,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setSending(true);
    setError(null);
    setMessages((list) => [...list, tempUser]);

    try {
      if (!conversationId) {
        const conv = await assistantService.createConversation(assistantStore.titleFrom(body));
        conversationId = conv.id;
        setConversations((list) => [conv, ...list]);
        setActiveId(conv.id);
      }
      const id = conversationId;

      const settledUser = { ...tempUser, conversationId: id, pending: false };
      persist(id, settledUser);

      // Name the thread from its first user message.
      if (assistantStore.titleFrom(body)) {
        const existing = assistantStore.loadConversations().find((c) => c.id === id);
        if (existing && !existing.title) {
          await assistantService.renameConversation(id, assistantStore.titleFrom(body));
        }
      }

      const reply = await assistantService.send(id, body);
      persist(id, reply);

      setMessages((list) => [...list.filter((m) => m.id !== tempUser.id), settledUser, reply]);
      if (reply.proposedActions?.length) {
        setActionStates((s) => {
          const next = { ...s };
          reply.proposedActions?.forEach((a) => {
            next[a.id] = 'pending';
          });
          return next;
        });
      }
      setConversations(assistantStore.loadConversations());
    } catch (e: unknown) {
      setMessages((list) =>
        list.map((m) => (m.id === tempUser.id ? { ...m, pending: false, failed: true } : m)),
      );
      setError(e instanceof Error ? e.message : 'The assistant could not answer. Try again.');
    } finally {
      setSending(false);
    }
  }, []);

  /**
   * Apply a confirmed action. Calendar tools reuse the very same service calls
   * the calendar screen uses, so the grid updates exactly as if the user had
   * made the change by hand.
   */
  const applyAction = useCallback(async (action: ProposedAction, input: Record<string, unknown>) => {
    switch (action.toolName) {
      case 'create_event': {
        await calendarService.createEvent({
          calendarId: String(input.calendarId ?? 'cal_personal'),
          title: String(input.title ?? 'Untitled'),
          description: input.description ? String(input.description) : undefined,
          location: input.location ? String(input.location) : undefined,
          start: String(input.startDate ?? input.start ?? ''),
          end: String(input.endDate ?? input.end ?? ''),
          allDay: Boolean(input.allDay ?? false),
          timeZone: input.timezone ? String(input.timezone) : undefined,
        });
        return;
      }
      case 'move_event': {
        // Calendar contract: moveEvent(id, newStart, newEnd) — no options object.
        await calendarService.moveEvent(
          String(input.eventId ?? ''),
          String(input.newStartDate ?? ''),
          String(input.newEndDate ?? ''),
        );
        return;
      }
      case 'delete_event': {
        await calendarService.deleteEvent(String(input.eventId ?? ''));
        return;
      }
      case 'update_event': {
        const patch: Record<string, unknown> = {};
        if (input.title) patch.title = String(input.title);
        if (input.startDate) patch.start = String(input.startDate);
        if (input.endDate) patch.end = String(input.endDate);
        await calendarService.updateEvent(String(input.eventId ?? ''), patch);
        return;
      }
      default:
        // Read-only tools (find_availability, detect_conflicts, explain_schedule,
        // plan_day, create_schedule_proposal) and the 2d-owned stores are
        // acknowledged with a receipt but write nothing yet.
        return;
    }
  }, []);

  const confirmAction = useCallback(
    async (action: ProposedAction, modifiedInput?: Record<string, unknown>) => {
      const id = activeRef.current;
      if (!id) return;
      setConfirming(true);
      setActionStates((s) => ({ ...s, [action.id]: 'working' }));
      try {
        const receipt = await assistantService.confirm(id, action.id, true, modifiedInput);
        if (!DEFERRED_TOOLS.has(action.toolName)) {
          await applyAction(action, modifiedInput ?? action.input);
        }
        persist(id, receipt);
        setMessages((list) => [...list, receipt]);
        setActionStates((s) => ({ ...s, [action.id]: 'applied' }));
        setError(null);
      } catch (e: unknown) {
        setActionStates((s) => ({ ...s, [action.id]: 'pending' }));
        setError(e instanceof Error ? e.message : 'Could not apply that action.');
      } finally {
        setConfirming(false);
      }
    },
    [applyAction],
  );

  const rejectAction = useCallback(async (action: ProposedAction) => {
    const id = activeRef.current;
    if (!id) return;
    setConfirming(true);
    setActionStates((s) => ({ ...s, [action.id]: 'working' }));
    try {
      const receipt = await assistantService.confirm(id, action.id, false);
      persist(id, receipt);
      setMessages((list) => [...list, receipt]);
      setActionStates((s) => ({ ...s, [action.id]: 'rejected' }));
      setError(null);
    } catch (e: unknown) {
      setActionStates((s) => ({ ...s, [action.id]: 'pending' }));
      setError(e instanceof Error ? e.message : 'Could not reject that action.');
    } finally {
      setConfirming(false);
    }
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const value = useMemo<AssistantState>(
    () => ({
      conversations,
      activeId,
      messages,
      loading,
      sending,
      confirming,
      error,
      actionStates,
      tools,
      selectConversation,
      newConversation,
      removeConversation,
      send,
      confirmAction,
      rejectAction,
      reload,
    }),
    [
      conversations,
      activeId,
      messages,
      loading,
      sending,
      confirming,
      error,
      actionStates,
      tools,
      selectConversation,
      newConversation,
      removeConversation,
      send,
      confirmAction,
      rejectAction,
      reload,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used within AssistantProvider');
  return ctx;
}

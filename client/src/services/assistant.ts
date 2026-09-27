/**
 * Assistant service facade.
 *
 * Components call `assistantService`; Stage 2 backs it with the deterministic
 * mock responder, Stage 3 flips `USE_MOCK` off and the same call sites hit the
 * real endpoints exposed by src/ai/assistant/assistant.controller.ts.
 *
 * Real endpoint map (all user-scoped through the JWT):
 *   POST   /assistant/message                    → AssistantResponse
 *   POST   /assistant/confirm                    → { message, confidence }
 *   GET    /assistant/conversations              → ConversationDTO[]
 *   GET    /assistant/conversations/:id/messages → ConversationMessage[]
 *   POST   /assistant/conversations              → ConversationDTO
 *   PATCH  /assistant/conversations/:id          → Conversation
 *   DELETE /assistant/conversations/:id          → 204
 *   GET    /assistant/tools                      → AssistantToolDescriptor[]
 *   GET    /assistant/recommendations            → AssistantRecommendationDTO[]
 */
import api from './api';
import { USE_MOCK } from './auth';
import { latency } from '@/lib/mock/db';
import { loadEvents } from '@/lib/mock/calendar';
import {
  ACTION_GONE_MESSAGE,
  CANCELLED_MESSAGE,
  ASSISTANT_TOOLS,
  loadConversations,
  loadMessages,
  mockAssistantId,
  respond,
  saveConversations,
  saveMessages,
} from '@/lib/mock/assistant';
import type {
  AssistantRecommendationDTO,
  AssistantResponse,
  AssistantToolDescriptor,
  ChatMessage,
  ConversationDTO,
} from './types';

const API_UNAVAILABLE = 'Assistant message and conversation endpoints are not exposed by the current backend.';

function nowIso(): string {
  return new Date().toISOString();
}

/** Stable display order; newest conversation first. */
function sortConversations(list: ConversationDTO[]): ConversationDTO[] {
  return [...list].sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

function titleFrom(message: string): string {
  const clean = message.trim().replace(/\s+/g, ' ');
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}
/** Map a raw `ConversationMessage` row (or the message endpoint result) to `ChatMessage`. */
function toChatMessage(raw: Record<string, unknown>): ChatMessage {
  let proposedActions: ChatMessage['proposedActions'];
  let confidence: number | undefined;
  let toolCalls: ChatMessage['toolCalls'];
  try {
    const output = raw.modelOutput ? JSON.parse(String(raw.modelOutput)) : undefined;
    proposedActions = output?.proposedActions;
    confidence = typeof output?.confidence === 'number' ? output.confidence : undefined;
    toolCalls = output?.toolCalls;
  } catch {
    // modelOutput may already be an object (message endpoint); leave the richer
    // fields unset and let callers fall back to the top-level spread.
  }
  return {
    id: String(raw.id ?? ''),
    conversationId: String(raw.conversationId ?? ''),
    role: (raw.role as ChatMessage['role']) ?? 'ASSISTANT',
    content: String(raw.content ?? ''),
    reasoning: (raw.reasoning as string | null) ?? null,
    proposedActions,
    toolCalls,
    confidence,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
  };
}

export const assistantService = {
  apiAvailable: true,
  /** The 13 tools the assistant can invoke (`ToolRegistry.onModuleInit`).
   *  Live registry: `GET /api/assistant/tools`. The static mirror is kept
   *  synchronous so the Tools tab never flashes an async edge. */
  listTools(): AssistantToolDescriptor[] {
    return ASSISTANT_TOOLS;
  },

  /** Conversations for the sidebar, newest first. */
  async listConversations(): Promise<ConversationDTO[]> {
    if (!USE_MOCK) {
      const { data } = await api.get<ConversationDTO[]>('/api/assistant/conversations');
      return sortConversations(data);
    }
    await latency(90, 200);
    return sortConversations(loadConversations());
  },

  /** Messages for one conversation, oldest first. */
  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    if (!USE_MOCK) {
      const { data } = await api.get<Record<string, unknown>[]>(
        `/api/assistant/conversations/${conversationId}/messages`,
      );
      return data.map(toChatMessage).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    }
    await latency(140, 320);
    return loadMessages()
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map(({ pending: _p, failed: _f, ...m }) => m);
  },

  /**
   * Send a message. Returns the assistant turn (which may carry proposedActions).
   * The caller is responsible for the optimistic user bubble + persistence.
   */
  async send(conversationId: string, message: string): Promise<ChatMessage> {
    if (!USE_MOCK) {
      const { data } = await api.post<Record<string, unknown>>('/api/assistant/message', {
        conversationId,
        message,
      });
      const chat = toChatMessage(data);
      return {
        ...chat,
        proposedActions:
          chat.proposedActions ?? (data.proposedActions as ChatMessage['proposedActions']),
        toolCalls: chat.toolCalls ?? (data.toolCalls as ChatMessage['toolCalls']),
        confidence: chat.confidence ?? (data.confidence as number | undefined),
      };
    }
    await latency(420, 900);
    const result = respond({ message, events: loadEvents() });
    return {
      id: mockAssistantId('msg'),
      conversationId,
      role: 'ASSISTANT',
      content: result.message,
      reasoning: result.reasoning,
      proposedActions: result.proposedActions,
      toolCalls: result.proposedActions.map((a) => ({
        id: a.id,
        name: a.toolName,
        arguments: a.input,
      })),
      confidence: result.confidence,
      createdAt: nowIso(),
    };
  },

  /**
   * Confirm or reject one proposed action.
   * Mirrors `AssistantOrchestratorService.confirmAction` — cancelling returns a
   * fixed "Action cancelled." message with full confidence, and an unknown
   * action id returns "Action not found or expired." with zero confidence.
   */
  async confirm(
    conversationId: string,
    actionId: string,
    confirmed: boolean,
    modifiedInput?: Record<string, unknown>,
  ): Promise<ChatMessage> {
    if (!USE_MOCK) {
      const { data } = await api.post<{ message: string; confidence?: number }>('/api/assistant/confirm', {
        conversationId,
        actionId,
        confirmed,
        modifiedInput,
      });
      return {
        id: mockAssistantId('msg'),
        conversationId,
        role: 'SYSTEM',
        content: data.message,
        confidence: data.confidence ?? (confirmed ? 1 : 0),
        createdAt: nowIso(),
      };
    }
    await latency(280, 650);
    if (!confirmed) {
      return {
        id: mockAssistantId('msg'),
        conversationId,
        role: 'SYSTEM',
        content: CANCELLED_MESSAGE,
        confidence: 1,
        createdAt: nowIso(),
      };
    }
    const stored = loadMessages().find((m) =>
      m.proposedActions?.some((a) => a.id === actionId),
    );
    const action = stored?.proposedActions?.find((a) => a.id === actionId);
    if (!action) {
      return {
        id: mockAssistantId('msg'),
        conversationId,
        role: 'SYSTEM',
        content: ACTION_GONE_MESSAGE,
        confidence: 0,
        createdAt: nowIso(),
      };
    }
    void modifiedInput;
    // Success copy mirrors `formatSingleResult`'s success branch.
    return {
      id: mockAssistantId('msg'),
      conversationId,
      role: 'SYSTEM',
      content: `✅ ${action.description} completed successfully.`,
      confidence: 1,
      createdAt: nowIso(),
    };
  },

  /** Create a conversation. Returns the new row so the caller can select it. */
  async createConversation(title?: string): Promise<ConversationDTO> {
    if (!USE_MOCK) {
      const { data } = await api.post<ConversationDTO>('/api/assistant/conversations', { title });
      return data;
    }
    await latency(100, 220);
    const iso = nowIso();
    const conv: ConversationDTO = {
      id: mockAssistantId('conv'),
      userId: 'usr_demo',
      title: title ?? null,
      model: 'mock-orchestrator',
      provider: 'mock',
      isActive: true,
      createdAt: iso,
      updatedAt: iso,
      lastMessageAt: iso,
    };
    saveConversations([conv, ...loadConversations()]);
    return conv;
  },

  /** Rename a conversation once its first message gives it a subject. */
  async renameConversation(conversationId: string, title: string): Promise<void> {
    if (!USE_MOCK) {
      await api.patch(`/api/assistant/conversations/${conversationId}`, { title });
      return;
    }
    const next = loadConversations().map((c) =>
      c.id === conversationId ? { ...c, title, updatedAt: nowIso() } : c,
    );
    saveConversations(next);
  },

  async deleteConversation(conversationId: string): Promise<void> {
    if (!USE_MOCK) {
      await api.delete(`/api/assistant/conversations/${conversationId}`);
      return;
    }
    await latency(120, 280);
    saveConversations(loadConversations().filter((c) => c.id !== conversationId));
    saveMessages(loadMessages().filter((m) => m.conversationId !== conversationId));
  },

  /** Pending recommendations (prisma `AssistantRecommendation`, status PENDING). */
  async listRecommendations(): Promise<AssistantRecommendationDTO[]> {
    if (!USE_MOCK) {
      const { data } = await api.get<AssistantRecommendationDTO[]>('/api/assistant/recommendations');
      return data;
    }
    await latency(120, 260);
    return [];
  },
};

/** Exported so the panel/page can persist turns without reaching into the mock. */
export const assistantStore = {
  loadConversations,
  saveConversations,
  loadMessages,
  saveMessages,
  nextId: mockAssistantId,
  titleFrom,
};

/**
 * Assistant service facade.
 *
 * Components call `assistantService`; Stage 2 backs it with the deterministic
 * mock responder, Stage 3 flips `USE_MOCK` off and the same call sites hit the
 * real endpoints.
 *
 * ⚠ Endpoint status (see BUILD_LOG "backend contract mismatches"):
 *   `AssistantOrchestratorService.processMessage` / `confirmAction` are NOT
 *   exposed by any controller today. The paths used in the real branch below are
 *   the proposed contract and are marked as such — the backend must add
 *   `POST /api/assistant/message` and `POST /api/assistant/confirm` in Stage 3.
 *   `POST /api/ai/intent/parse` DOES exist (src/ai/intent/intent-parser.controller.ts)
 *   and is used as the fallback classifier path.
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

export const assistantService = {
  /** The 13 tools the assistant can invoke (`ToolRegistry.onModuleInit`). */
  listTools(): AssistantToolDescriptor[] {
    return ASSISTANT_TOOLS;
  },

  /** Conversations for the sidebar, newest first. */
  async listConversations(): Promise<ConversationDTO[]> {
    if (USE_MOCK) {
      await latency(90, 200);
      return sortConversations(loadConversations());
    }
    const { data } = await api.get<ConversationDTO[]>('/api/assistant/conversations');
    return sortConversations(data);
  },

  /** Messages for one conversation, oldest first. */
  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    if (USE_MOCK) {
      await latency(140, 320);
      return loadMessages()
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map(({ pending: _p, failed: _f, ...m }) => m);
    }
    const { data } = await api.get<ChatMessage[]>(
      `/api/assistant/conversations/${conversationId}/messages`,
    );
    return data;
  },

  /**
   * Send a message. Returns the assistant turn (which may carry proposedActions).
   * The caller is responsible for the optimistic user bubble + persistence.
   */
  async send(conversationId: string, message: string): Promise<ChatMessage> {
    if (USE_MOCK) {
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
    }
    const { data } = await api.post<AssistantResponse>('/api/assistant/message', {
      conversationId,
      message,
    });
    return {
      id: mockAssistantId('msg'),
      conversationId,
      role: 'ASSISTANT',
      content: data.message,
      proposedActions: data.proposedActions,
      toolCalls: data.toolCalls,
      confidence: data.confidence,
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
    if (USE_MOCK) {
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
    }
    const { data } = await api.post<AssistantResponse>('/api/assistant/confirm', {
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
      confidence: data.confidence,
      createdAt: nowIso(),
    };
  },

  /** Create a conversation. Returns the new row so the caller can select it. */
  async createConversation(title?: string): Promise<ConversationDTO> {
    if (USE_MOCK) {
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
    }
    const { data } = await api.post<ConversationDTO>('/api/assistant/conversations', { title });
    return data;
  },

  /** Rename a conversation once its first message gives it a subject. */
  async renameConversation(conversationId: string, title: string): Promise<void> {
    if (USE_MOCK) {
      const next = loadConversations().map((c) =>
        c.id === conversationId ? { ...c, title, updatedAt: nowIso() } : c,
      );
      saveConversations(next);
      return;
    }
    await api.patch(`/api/assistant/conversations/${conversationId}`, { title });
  },

  async deleteConversation(conversationId: string): Promise<void> {
    if (USE_MOCK) {
      await latency(120, 280);
      saveConversations(loadConversations().filter((c) => c.id !== conversationId));
      saveMessages(loadMessages().filter((m) => m.conversationId !== conversationId));
      return;
    }
    await api.delete(`/api/assistant/conversations/${conversationId}`);
  },

  /** Pending recommendations (prisma `AssistantRecommendation`, status PENDING). */
  async listRecommendations(): Promise<AssistantRecommendationDTO[]> {
    if (USE_MOCK) {
      await latency(120, 260);
      return [];
    }
    const { data } = await api.get<AssistantRecommendationDTO[]>(
      '/api/assistant/recommendations?status=PENDING',
    );
    return data;
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

import { z } from 'zod';

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  stream?: boolean;
  /** Stage 5a: overrides the per-request transport timeout. */
  timeoutMs?: number;
  /** Stage 5a: overrides the retry budget (extra attempts after the first). */
  maxRetries?: number;
  /**
   * C6: owning user, required when includesGoogleData is set so the consent
   * gate can check their grant before anything leaves the server.
   */
  userId?: string;
  /**
   * C6: true when the prompt may contain Google-sourced (calendar) content.
   * AiProviderService then refuses the call unless that user granted AI
   * processing consent. Calls that set this are blocked fail-closed when no
   * consent gate is wired.
   */
  includesGoogleData?: boolean;
}

/** A single turn of a real conversation, as the Stage 5b agent loop needs it. */
export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Present on assistant turns that requested a tool. */
  toolCalls?: AiToolCall[];
  /** Present on `role: 'tool'` turns; ties the payload back to the request. */
  toolCallId?: string;
  /** Optional tool name for `role: 'tool'` turns (Ollama/Nemotron variants). */
  name?: string;
}

/**
 * The OpenAI-wire-format tool descriptor. Every provider we target speaks
 * `/chat/completions`, so one shape covers all three; providers that ignore
 * `tools` simply report `toolCalling: false` in their capabilities.
 */
export interface AiToolDefinition {
  name: string;
  description: string;
  /** JSON Schema. Built from zod via `zod-to-json-schema`-free manual maps. */
  parameters: Record<string, unknown>;
}

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiChatResult {
  content: string;
  toolCalls: AiToolCall[];
  usage?: AiUsage;
  model: string;
  provider: string;
  /** True when the provider reported `finish_reason: 'tool_calls'`. */
  finishReason?: string;
}

export interface ChatOptions extends GenerateOptions {
  messages: AiChatMessage[];
  tools?: AiToolDefinition[];
  /**
   * 'auto' lets the model choose, 'none' forbids tool calls, 'required' forces
   * at least one. Providers without tool support ignore this.
   */
  toolChoice?: 'auto' | 'none' | 'required';
  /**
   * Requests constrained JSON decoding (`response_format`). Opportunistic: a
   * provider that cannot honour it must degrade to a plain chat call rather than
   * fail, because Ollama Cloud does not support `json_schema` on every model.
   */
  jsonMode?: boolean;
  /** Structured-output schema name, used when `jsonMode` is requested. */
  jsonSchema?: Record<string, unknown>;
  /** Overrides the per-request timeout for long agent steps. */
  timeoutMs?: number;
  /**
   * Extra attempts after the first, matching `withRetry`. Agent loops pass 0 to
   * keep a step inside the wall-clock budget instead of silently doubling it.
   */
  maxRetries?: number;
  /**
   * Lets the caller observe token accounting for a single step. Needed because
   * `generate()`/`generateStructured()` collapse the response to a string/JSON
   * value and would otherwise discard `usage`, which both the metrics layer and
   * the Stage 5b token budget must see.
   */
  onUsage?: (usage: AiUsage) => void;
}

export interface AiProviderCapabilities {
  provider: string;
  /** Can consume a `messages[]` history rather than a single prompt string. */
  chat: boolean;
  /** Accepts `tools` and emits `tool_calls` in the reply. */
  toolCalling: boolean;
  /** Honours `response_format`/`json_schema` constrained decoding. */
  structuredOutput: boolean;
  /** Supports the `/embeddings` endpoint. */
  embeddings: boolean;
  /** Reported model identifier this capability set applies to. */
  model: string;
  /** When true the set came from a live probe rather than from static defaults. */
  probed?: boolean;
}

export interface AIProviderInterface {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  generateStructured(prompt: string, options?: GenerateOptions): Promise<any>;
  embed?(text: string): Promise<number[]>;
  get providerName(): string;
  /**
   * Stage 5a: multi-turn chat with optional native tool calling. Optional so the
   * interface stays open for the existing providers, but every provider in the
   * repo implements it. Throws `AiProviderError` on failure — never returns `''`
   * for a transport error.
   */
  chat?(options: ChatOptions): Promise<AiChatResult>;
  /** Static + env-overridden capability description of this provider. */
  getCapabilities?(): AiProviderCapabilities;
  /**
   * Optional live feature detection (Stage 5a): sends one minimal tool-forcing
   * request and reports what the endpoint actually did.
   */
  probe?(): Promise<AiProviderCapabilities>;
}

export interface StructuredResponse {
  data: any;
  confidence?: number;
  reasoning?: string;
}

/**
 * Stage 5a: token accounting sink.
 *
 * `generate()`/`generateStructured()` collapse a response into a string or a
 * JSON value, so `usage` would otherwise be discarded before it ever reached a
 * caller. Providers therefore expose an optional listener that
 * `AiProviderService` wires to the metrics layer, which keeps the providers free
 * of DI (they are still constructible with `new OpenAIProvider()` in specs).
 */
export interface AiUsageReport {
  provider: string;
  model: string;
  operation: 'generate' | 'structured' | 'chat' | 'embed';
  usage: AiUsage;
  /** HTTP attempts actually spent, so retries become observable. */
  attempts: number;
}

export type AiUsageListener = (report: AiUsageReport) => void;

/** Implemented by every provider; the property stays optional by design. */
export interface AiUsageReporting {
  usageListener?: AiUsageListener;
}

// Re-exported so callers can catch typed provider failures without reaching
// into the error module directly.
export { AiProviderError } from '../ai-provider.error';
// Keeps `z` referenced for consumers that extend these types in-place.
export type ZodSchema = z.ZodTypeAny;


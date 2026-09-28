import { AiProviderError, AiProviderErrorKind } from './ai-provider.error';
import { AiToolCall, AiUsage } from './interfaces/ai-provider.interface';

/**
 * Stage 5a: the transport plumbing shared by all three providers.
 *
 * Previously each provider issued its own bare `fetch()` with no timeout and no
 * retry, so a hung Ollama socket pinned the `/assistant/message` request open
 * until the client gave up, and a single 502 from OpenAI failed the whole turn.
 * This module owns: request headers, the `AbortSignal.timeout` budget, the
 * jittered retry policy, the status-to-error-kind map, and the response parsers
 * (usage + tool calls) the providers were previously throwing away.
 */

/** HTTP statuses worth another attempt. 408/425/5xx are transient server-side. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 509]);

/** Maps an HTTP status onto an error kind + retry decision. */
export function classifyStatus(status: number): { kind: AiProviderErrorKind; retryable: boolean } {
  if (status === 401 || status === 403) return { kind: 'auth', retryable: false };
  if (status === 429) return { kind: 'rate_limit', retryable: true };
  if (status === 400 || status === 404 || status === 422) {
    return { kind: 'http', retryable: false };
  }
  return { kind: 'http', retryable: RETRYABLE_STATUSES.has(status) };
}

/** Reads a numeric env var, falling back when unset or malformed. */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

/** Per-attempt wall-clock budget for one provider HTTP call. */
export function requestTimeoutMs(override?: number): number {
  return override ?? envInt('AI_REQUEST_TIMEOUT_MS', 15000);
}

/** Number of *extra* attempts after the first failure. */
export function retryBudget(override?: number): number {
  return override ?? envInt('AI_MAX_RETRIES', 2);
}

/** Base delay before the first retry; doubles per attempt, then jitters. */
export function backoffBaseMs(): number {
  return envInt('AI_RETRY_BASE_DELAY_MS', 250);
}

/** Caps the sleep so a huge `Retry-After` cannot stall an assistant turn. */
export function backoffCapMs(): number {
  return envInt('AI_RETRY_MAX_DELAY_MS', 4000);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff with full jitter, clamped to `AI_RETRY_MAX_DELAY_MS`.
 * Jitter matters: several providers failing at once would otherwise retry in
 * lockstep and re-create the outage they are recovering from.
 */
export function computeBackoffMs(attempt: number, retryAfterSeconds?: number): number {
  if (Number.isFinite(retryAfterSeconds) && (retryAfterSeconds as number) > 0) {
    return Math.min((retryAfterSeconds as number) * 1000, backoffCapMs());
  }
  const capped = Math.min(backoffCapMs(), backoffBaseMs() * 2 ** Math.max(0, attempt - 1));
  return Math.round(Math.random() * capped);
}

/** Standard auth/content headers for the OpenAI-compatible endpoints. */
export function jsonHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

export interface PostJsonArgs {
  provider: string;
  /** Label used in error messages, e.g. 'chat completion' or 'embeddings'. */
  operation: string;
  url: string;
  body: Record<string, unknown>;
  apiKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /**
   * Lets a provider keep established error wording (Ollama's
   * "Ollama API request failed with HTTP 401" is asserted by
   * ollama.provider.spec.ts) while still gaining the typed error + retry policy.
   */
  httpError?: (status: number, detail?: string) => string;
}

export interface PostJsonResult {
  data: any;
}

/**
 * One HTTP attempt: no retry logic here, so `withRetry` owns the policy.
 * Throws `AiProviderError` for every failure mode, including a timeout.
 */
export async function postJson(args: PostJsonArgs): Promise<PostJsonResult> {
  const { provider, operation, url, body } = args;
  const timeout = requestTimeoutMs(args.timeoutMs);
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { ...jsonHeaders(args.apiKey), ...(args.headers ?? {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error: any) {
    const aborted =
      error?.name === 'AbortError' ||
      error?.name === 'TimeoutError' ||
      error?.cause?.name === 'AbortError' ||
      error?.cause?.name === 'TimeoutError';
    throw new AiProviderError(
      `${provider} ${operation} ${aborted ? `timed out after ${timeout}ms` : 'request failed'}: ${
        error?.message ?? error
      }`,
      {
        provider,
        kind: aborted ? 'timeout' : 'network',
        retryable: true,
        cause: error,
      }
    );
  }

  if (!response.ok) {
    const { kind, retryable } = classifyStatus(response.status);
    const detail = await readErrorDetail(response);
    const message =
      args.httpError?.(response.status, detail) ??
      `${provider} ${operation} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`;
    throw new AiProviderError(message, {
      provider,
      kind,
      status: response.status,
      retryable,
      retryAfterSeconds: parseRetryAfter(response.headers?.get?.('retry-after')),
      cause: detail,
    });
  }

  try {
    return { data: await response.json() };
  } catch (error: any) {
    throw new AiProviderError(`${provider} ${operation} returned a non-JSON body`, {
      provider,
      kind: 'parse',
      retryable: false,
      cause: error,
    });
  }
}

/** `Retry-After` in seconds, or undefined when absent/unparseable. */
export function parseRetryAfter(value?: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseFloat(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** Best-effort error body, truncated so an HTML error page cannot flood logs. */
async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    if (!text) return undefined;
    try {
      const parsed = JSON.parse(text);
      const message = parsed?.error?.message ?? parsed?.message ?? parsed?.detail;
      return (typeof message === 'string' ? message : text).slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return undefined;
  }
}

/** Runs `fn`, retrying only transient failures with jittered backoff. */
export async function withRetry<T>(
  provider: string,
  operation: string,
  fn: (attempt: number) => Promise<T>,
  maxRetries?: number
): Promise<T> {
  const attempts = retryBudget(maxRetries) + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const aiError = AiProviderError.from(provider, error, { attempts: attempt });
      // Stamp the attempt count onto the surfaced error (postJson does not know
      // how many tries the policy allowed) so metrics/breakers can see it.
      aiError.attempts = attempt;
      if (!aiError.retryable || attempt === attempts) throw aiError;
      await sleep(computeBackoffMs(attempt, aiError.retryAfterSeconds));
    }
  }

  // Unreachable in practice; kept to satisfy `noImplicitReturns`.
  throw AiProviderError.from(provider, lastError, {
    kind: 'http',
    retryable: false,
    attempts,
  });
}

/** Normalises the several `usage` spellings the endpoints return. */
export function parseUsage(data: any): AiUsage | undefined {
  const usage = data?.usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const promptTokens = toTokenCount(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = toTokenCount(usage.completion_tokens ?? usage.output_tokens);
  const total = toTokenCount(usage.total_tokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens: total || promptTokens + completionTokens,
  };
}

function toTokenCount(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
}

/**
 * Extracts `tool_calls` from a chat message. Handles the OpenAI shape
 * (`function.name` / `function.arguments` as a JSON string) and the looser
 * inline shape some OpenAI-compatible endpoints emit.
 */
export function parseToolCalls(message: any): AiToolCall[] {
  const raw = message?.tool_calls ?? message?.toolCalls;
  if (!Array.isArray(raw)) return [];

  const calls: AiToolCall[] = [];
  raw.forEach((entry: any, index: number) => {
    const name: string | undefined =
      typeof entry?.function?.name === 'string'
        ? entry.function.name
        : typeof entry?.name === 'string'
          ? entry.name
          : undefined;
    if (!name) return;

    const argSource = entry?.function?.arguments ?? entry?.arguments ?? {};
    let parsedArgs: Record<string, unknown>;
    if (typeof argSource === 'string') {
      try {
        parsedArgs = JSON.parse(argSource) as Record<string, unknown>;
      } catch {
        // A truncated tool argument (cut-off completion) must not abort the
        // whole step; the agent loop treats it as `{}` and repairs via zod.
        parsedArgs = {};
      }
    } else if (argSource && typeof argSource === 'object') {
      parsedArgs = argSource as Record<string, unknown>;
    } else {
      parsedArgs = {};
    }

    calls.push({
      id: typeof entry?.id === 'string' && entry.id ? entry.id : `call_${index}_${Date.now()}`,
      name,
      arguments: parsedArgs,
    });
  });

  return calls;
}

/** Chooses the first text-ish field, so providers stay tolerant of shape drift. */
export function extractContent(message: any): string {
  const content = message?.content;
  if (typeof content === 'string') return content;
  // Some endpoints return content parts arrays: [{ type: 'text', text: '...' }].
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === 'string' ? part : part?.text ?? ''))
      .join('');
  }
  if (typeof message?.reasoning_content === 'string') return message.reasoning_content;
  return '';
}

/**
 * Extracts the JSON value embedded in a free-text completion.
 *
 * Shared now because each provider had its own (differing) copy: OpenAI and
 * Nemotron did a bare `JSON.parse` and silently returned `{ confidence: 0 }` on
 * failure, which is how a malformed model answer became an invisible routing bug
 * instead of an error. Throws `AiProviderError('parse')` so callers can repair.
 */
export function extractJson(
  text: string,
  provider: string,
  messages?: { empty?: string; parse?: string }
): unknown {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    throw new AiProviderError(messages?.empty ?? `${provider} returned an empty structured response`, {
      provider,
      kind: 'empty',
      retryable: false,
    });
  }

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  for (const candidate of [unfenced, trimmed]) {
    const starts = [candidate.indexOf('{'), candidate.indexOf('[')].filter((i) => i >= 0);
    if (!starts.length) continue;
    const start = Math.min(...starts);
    const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // Try the next candidate before giving up.
    }
  }

  throw new AiProviderError(
    messages?.parse ?? `${provider} returned no parseable JSON value`,
    {
      provider,
      kind: 'parse',
      retryable: false,
      cause: trimmed.slice(0, 200),
    }
  );
}

/**
 * Builds the OpenAI-wire `messages` array from our neutral chat shape.
 *
 * Shared because all three targets speak `/chat/completions` and each needs the
 * same assistant-`tool_calls` and `role: 'tool'` handling; an inline copy per
 * provider is how the three would drift apart the first time one endpoint needed
 * a quirk.
 */
export function toWireMessages(
  messages: import('./interfaces/ai-provider.interface').AiChatMessage[]
): Record<string, unknown>[] {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId,
        ...(message.name ? { name: message.name } : {}),
      };
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

/** Wire-format tool descriptors, or undefined so `tools` is omitted entirely. */
export function toWireTools(
  tools?: import('./interfaces/ai-provider.interface').AiToolDefinition[]
): Record<string, unknown>[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export interface ChatCompletionArgs {
  provider: string;
  url: string;
  apiKey?: string;
  model: string;
  messages: import('./interfaces/ai-provider.interface').AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: import('./interfaces/ai-provider.interface').AiToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  /** `response_format` payload, passed through verbatim by the caller. */
  responseFormat?: Record<string, unknown>;
  timeoutMs?: number;
  /** Extra attempts beyond the first, matching `withRetry`'s meaning. */
  maxRetries?: number;
  httpError?: (status: number, detail?: string) => string;
  extraBody?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
}

export interface ChatCompletionOutcome {
  content: string;
  toolCalls: AiToolCall[];
  usage?: AiUsage;
  finishReason?: string;
  model: string;
  attempts: number;
}


/**
 * One chat-completion round trip with timeout + retry + full response parsing.
 * Throws `AiProviderError('empty')` when the endpoint answered 200 with neither
 * content nor tool calls — which used to surface as `''` that every caller read
 * differently (the orchestrator treated it as "no actions", intent-parser as
 * "confidence 0"). Providers reuse this instead of re-implementing the loop.
 */
export async function chatCompletion(
  args: ChatCompletionArgs & { operation?: string }
): Promise<ChatCompletionOutcome> {
  const operation = args.operation ?? 'chat completion';
  const body: Record<string, unknown> = {
    model: args.model,
    messages: toWireMessages(args.messages),
    stream: args.stream ?? false,
    ...args.extraBody,
  };
  if (args.temperature !== undefined) body.temperature = args.temperature;
  if (args.maxTokens !== undefined) body.max_tokens = args.maxTokens;
  if (args.responseFormat) body.response_format = args.responseFormat;
  const tools = toWireTools(args.tools);
  if (tools) {
    body.tools = tools;
    if (args.toolChoice) body.tool_choice = args.toolChoice;
  }

  let usedAttempts = 1;
  const data = await withRetry(
    args.provider,
    operation,
    async (attempt) => {
      usedAttempts = attempt;
      const result = await postJson({
        provider: args.provider,
        operation,
        url: args.url,
        apiKey: args.apiKey,
        headers: args.extraHeaders,
        body,
        timeoutMs: args.timeoutMs,
        httpError: args.httpError,
      });
      return result.data;
    },
    args.maxRetries
  );

  const choice = Array.isArray(data?.choices) ? data.choices[0] : undefined;
  const message = choice?.message ?? choice?.delta;
  const toolCalls = parseToolCalls(message);
  const content = extractContent(message);

  if (!content && !toolCalls.length) {
    throw new AiProviderError(`${args.provider} returned no chat completion content`, {
      provider: args.provider,
      kind: 'empty',
      retryable: false,
      attempts: usedAttempts,
    });
  }

  return {
    content,
    toolCalls,
    usage: parseUsage(data),
    finishReason: choice?.finish_reason,
    model: typeof data?.model === 'string' ? data.model : args.model,
    attempts: usedAttempts,
  };
}

export interface EmbeddingArgs {
  provider: string;
  url: string;
  apiKey?: string;
  model: string;
  input: string;
  timeoutMs?: number;
  maxRetries?: number;
  httpError?: (status: number, detail?: string) => string;
  extraHeaders?: Record<string, string>;
}

/**
 * One embedding round trip. Unlike the old per-provider code, a failure throws
 * rather than yielding `[]`, so an empty vector from a provider now
 * unambiguously means "this provider does not do embeddings" and never
 * "the endpoint is down".
 */
export async function embedding(
  args: EmbeddingArgs
): Promise<{ vector: number[]; usage?: AiUsage; attempts: number; model: string }> {
  let usedAttempts = 1;
  const data = await withRetry(
    args.provider,
    'embeddings',
    async (attempt) => {
      usedAttempts = attempt;
      const result = await postJson({
        provider: args.provider,
        operation: 'embeddings',
        url: args.url,
        apiKey: args.apiKey,
        headers: args.extraHeaders,
        body: { model: args.model, input: args.input },
        timeoutMs: args.timeoutMs,
        httpError: args.httpError,
      });
      return result.data;
    },
    args.maxRetries
  );

  const vector = data?.data?.[0]?.embedding ?? data?.embeddings?.[0];
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new AiProviderError(`${args.provider} returned no embedding vector`, {
      provider: args.provider,
      kind: 'empty',
      retryable: false,
      attempts: usedAttempts,
    });
  }

  return {
    vector: vector.map(Number),
    usage: parseUsage(data),
    attempts: usedAttempts,
    model: typeof data?.model === 'string' ? data.model : args.model,
  };
}


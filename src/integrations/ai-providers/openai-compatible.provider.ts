import { Logger } from '@nestjs/common';
import {
  AIProviderInterface,
  AiChatResult,
  AiProviderCapabilities,
  AiUsageListener,
  AiUsageReport,
  ChatOptions,
  GenerateOptions,
} from './interfaces/ai-provider.interface';
import { AiProviderError } from './ai-provider.error';
import { chatCompletion, embedding, envBool, extractJson } from './provider-http';
import { defaultCapabilities, mergeProbeResult } from './ai-capabilities';

/**
 * Stage 5a: the behaviour all three targets actually share.
 *
 * OpenAI, NVIDIA NIM and Ollama Cloud all speak `/chat/completions`, so timeout,
 * retry, usage capture, tool-call parsing and capability reporting belong here
 * once. Each concrete provider keeps only what genuinely differs: env var names,
 * model defaults, the error wording its specs pin, and which capabilities it
 * claims.
 *
 * Providers stay free of constructor DI, so specs can still do
 * `new OllamaProvider()` and read `process.env` directly.
 */
export interface OpenAiCompatibleConfig {
  /** Canonical key used for capability + breaker lookup. */
  providerKey: string;
  /** Display name surfaced through `providerName` and used in error messages. */
  providerName: string;
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embeddingModel?: string;
  /** Merged into a chat request when the caller omits them. */
  defaultTemperature?: number;
  /**
   * Temperature used by `generateStructured()` when unset, preserving each
   * provider's established prior (Nemotron wanted colder output for JSON).
   */
  defaultStructuredTemperature?: number;
  defaultMaxTokens?: number;
  /** Overrides the "X failed with HTTP n" wording a spec may depend on. */
  httpError?: (status: number, detail?: string) => string;
  /** Overrides the empty-response wording (`Ollama returned no JSON value`). */
  emptyJsonError?: string;
  /**
   * Overrides the "returned no parseable JSON value" wording. Ollama's spec
   * asserts the exact phrase `Ollama returned no JSON value`, and wording that
   * users have already seen in alerts is worth a config field.
   */
  noJsonError?: string;
  /** Sends `max_tokens` even when the caller omitted one (Nemotron needs this). */
  alwaysSendMaxTokens?: boolean;
}

export abstract class OpenAiCompatibleProvider implements AIProviderInterface {
  protected abstract readonly logger: Logger;
  /** Wired by `AiProviderService` so token accounting reaches the metrics layer. */
  usageListener?: AiUsageListener;

  protected constructor(protected readonly config: OpenAiCompatibleConfig) {}

  get providerName(): string {
    return this.config.providerName;
  }

  protected get chatUrl(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  protected get embeddingsUrl(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/embeddings`;
  }

  getCapabilities(): AiProviderCapabilities {
    return defaultCapabilities(this.config.providerKey, this.config.chatModel);
  }

  /**
   * Live feature detection, opt-in via `AI_PROBE_ENABLED`.
   *
   * Off by default on purpose: a probe is a real billable request, and one run
   * with a bad key would otherwise 401 three times and make an unconfigured
   * install look like an outage. Every probe leg swallows its own error and
   * returns the declared value, so probing can only ever *inform*, never break.
   */
  async probe(): Promise<AiProviderCapabilities> {
    const declared = this.getCapabilities();
    if (!envBool('AI_PROBE_ENABLED', false)) return declared;

    const toolCalling = declared.toolCalling
      ? await this.tryProbe(async () => {
          const outcome = await chatCompletion({
            provider: this.config.providerName,
            url: this.chatUrl,
            apiKey: this.config.apiKey,
            model: this.config.chatModel,
            messages: [{ role: 'user', content: 'Call the ping tool exactly once.' }],
            tools: [
              {
                name: 'ping',
                description: 'Return pong.',
                parameters: { type: 'object', properties: {}, additionalProperties: false },
              },
            ],
            toolChoice: 'required',
            maxRetries: 0,
            httpError: this.config.httpError,
          });
          return outcome.toolCalls.length > 0;
        }, declared.toolCalling)
      : declared.toolCalling;

    const structuredOutput = declared.structuredOutput
      ? await this.tryProbe(async () => {
          const outcome = await chatCompletion({
            provider: this.config.providerName,
            url: this.chatUrl,
            apiKey: this.config.apiKey,
            model: this.config.chatModel,
            messages: [{ role: 'user', content: 'Return {"ok":true} and nothing else.' }],
            responseFormat: { type: 'json_object' },
            maxRetries: 0,
            httpError: this.config.httpError,
          });
          return !!outcome.content;
        }, declared.structuredOutput)
      : declared.structuredOutput;

    const embeddings =
      declared.embeddings && this.config.embeddingModel
        ? await this.tryProbe(async () => {
            const result = await embedding({
              provider: this.config.providerName,
              url: this.embeddingsUrl,
              apiKey: this.config.apiKey,
              model: this.config.embeddingModel as string,
              input: 'ping',
              maxRetries: 0,
              httpError: this.config.httpError,
            });
            return result.vector.length > 0;
          }, declared.embeddings)
        : declared.embeddings;

    return mergeProbeResult(declared, { toolCalling, structuredOutput, embeddings });
  }

  /** Probe legs are advisory: log at debug and keep the declared capability. */
  protected async tryProbe(
    test: () => Promise<boolean>,
    fallback: boolean
  ): Promise<boolean> {
    try {
      return await test();
    } catch (error) {
      const described = AiProviderError.is(error)
        ? `${error.kind} (retryable=${error.retryable})`
        : String(error);
      this.logger.debug(`Capability probe failed for ${this.config.providerName}: ${described}`);
      return fallback;
    }
  }


  /**
   * A missing key is a configuration defect, not an outage: it reports
   * `unconfigured` so neither the retry loop nor the breaker treats it as one,
   * and so no request is ever sent with an empty bearer token.
   */
  protected assertConfigured(operation: string): void {
    if (this.config.apiKey || this.config.providerKey === 'ollama') return;
    throw new AiProviderError(
      `${this.config.providerName} ${operation} unavailable: API key not configured`,
      {
        provider: this.config.providerName,
        kind: 'unconfigured',
        retryable: false,
      }
    );
  }

  /**
   * Opportunistic `response_format`: a provider that declares no structured
   * output support simply gets a plain chat call, because Ollama Cloud rejects
   * `json_schema` on several models and failing the whole turn for a decoration
   * would be worse than a prompt-constrained answer.
   */
  protected buildResponseFormat(
    options: ChatOptions,
    capabilities: AiProviderCapabilities
  ): Record<string, unknown> | undefined {
    if (!options.jsonMode || !capabilities.structuredOutput) return undefined;
    if (options.jsonSchema) {
      return {
        type: 'json_schema',
        json_schema: { name: 'assistant_output', schema: options.jsonSchema, strict: false },
      };
    }
    return { type: 'json_object' };
  }

  protected reportUsage(report: {
    operation: AiUsageReport['operation'];
    usage?: AiUsageReport['usage'];
    attempts: number;
    model?: string;
  }): void {
    if (!this.usageListener || !report.usage) return;
    this.usageListener({
      provider: this.config.providerName,
      model: report.model ?? this.config.chatModel,
      operation: report.operation,
      usage: report.usage,
      attempts: report.attempts,
    });
  }

  async chat(options: ChatOptions): Promise<AiChatResult> {
    this.assertConfigured('chat');
    const capabilities = this.getCapabilities();
    const outcome = await chatCompletion({
      provider: this.config.providerName,
      url: this.chatUrl,
      apiKey: this.config.apiKey,
      model: options.model || this.config.chatModel,
      messages: options.messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens ?? this.config.defaultMaxTokens,
      // Only advertise tools when the provider can use them: sending `tools` to
      // a model that ignores them degrades its plain-text answer.
      tools: capabilities.toolCalling ? options.tools : undefined,
      toolChoice: capabilities.toolCalling ? options.toolChoice : undefined,
      responseFormat: this.buildResponseFormat(options, capabilities),
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      httpError: this.config.httpError,
    });

    this.reportUsage({
      operation: 'chat',
      usage: outcome.usage,
      attempts: outcome.attempts,
      model: outcome.model,
    });

    return {
      content: outcome.content,
      toolCalls: outcome.toolCalls,
      usage: outcome.usage,
      model: outcome.model,
      provider: this.config.providerName,
      finishReason: outcome.finishReason,
    };
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    this.assertConfigured('generate');
    const outcome = await chatCompletion({
      provider: this.config.providerName,
      url: this.chatUrl,
      apiKey: this.config.apiKey,
      model: options?.model || this.config.chatModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature ?? this.config.defaultTemperature,
      maxTokens: this.config.alwaysSendMaxTokens
        ? (options?.maxTokens ?? this.config.defaultMaxTokens)
        : options?.maxTokens,
      stream: options?.stream,
      timeoutMs: options?.timeoutMs,
      maxRetries: options?.maxRetries,
      httpError: this.config.httpError,
    });

    this.reportUsage({
      operation: 'generate',
      usage: outcome.usage,
      attempts: outcome.attempts,
      model: outcome.model,
    });

    return outcome.content;
  }

  /**
   * Structured output as `generate()` + shared JSON extraction.
   *
   * Deliberately does not force `response_format` here: that is a Stage 5b
   * concern via `chat({ jsonMode })`, and silently switching every existing
   * structured caller to constrained decoding in the same change that makes
   * failures throw would make a regression impossible to attribute.
   *
   * The old implementations returned `{ confidence: 0, reasoning: '' }` when the
   * model produced malformed JSON. That converted "the model rambled" and "the
   * endpoint is dead" into the same indistinguishable low-confidence answer, and
   * callers such as the scheduling engine then built a plan out of `{}`. Now a
   * parse failure throws so the caller's own fallback path actually runs.
   */
  async generateStructured(prompt: string, options?: GenerateOptions): Promise<any> {
    const content = await this.generate(prompt, {
      ...options,
      temperature:
        options?.temperature ?? this.config.defaultStructuredTemperature ?? 0.3,
    });
    return extractJson(content, this.config.providerName, {
      empty: this.config.emptyJsonError,
      parse: this.config.noJsonError,
    });
  }

  /**
   * Embeddings. A provider that does not support them throws `unsupported`
   * rather than returning `[]`: an empty vector used to flow into
   * `cosineSimilarity()` and score every memory at 0, which made a search during
   * an embedding outage look like "the user has no relevant memories".
   */
  async embed(text: string): Promise<number[]> {
    this.assertConfigured('embed');
    const capabilities = this.getCapabilities();
    if (!capabilities.embeddings || !this.config.embeddingModel) {
      throw new AiProviderError(
        `${this.config.providerName} does not support embeddings`,
        {
          provider: this.config.providerName,
          kind: 'unsupported',
          retryable: false,
        }
      );
    }

    const result = await embedding({
      provider: this.config.providerName,
      url: this.embeddingsUrl,
      apiKey: this.config.apiKey,
      model: this.config.embeddingModel,
      input: text,
      httpError: this.config.httpError,
    });

    this.reportUsage({
      operation: 'embed',
      usage: result.usage,
      attempts: result.attempts,
      model: result.model,
    });

    return result.vector;
  }
}

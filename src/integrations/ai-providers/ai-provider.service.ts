import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import {
  AIProviderInterface,
  AiChatResult,
  AiProviderCapabilities,
  AiUsageReport,
  ChatOptions,
  GenerateOptions,
} from './interfaces/ai-provider.interface';
import { AiProviderError, AiProviderErrorKind } from './ai-provider.error';
import { OpenAIProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';
import { NemotronNimProvider } from './nemotron-nim.provider';
import { MetricsService } from '../../metrics/metrics.service';
import { defaultCapabilities } from './ai-capabilities';
import {
  CircuitBreakerRegistry,
  CircuitSnapshot,
  circuitBreakerEnabled,
  defaultCircuitBreakerRegistry,
} from './provider-health';

/** Which provider actually served a call, for logs, metrics and the probe script. */
export interface AiProviderOutcome<T> {
  value: T;
  provider: string;
  /** True when a later provider answered because an earlier one was skipped. */
  usedFallback: boolean;
}

export interface ProviderHealthView {
  provider: string;
  capabilities?: AiProviderCapabilities;
  circuit: CircuitSnapshot;
}

/**
 * C6: consent gate contract. Implemented by AiConsentService; kept as a local
 * interface so the providers module does not depend on the AI feature module
 * (and specs can inject a stub). Bound via the string token below because the
 * interface is erased at runtime.
 */
export interface AiConsentGate {
  hasConsent(userId: string): Promise<boolean>;
}

export const AI_CONSENT_GATE = 'AI_CONSENT_GATE';

@Injectable()
export class AiProviderService implements AIProviderInterface, OnModuleInit {
  private readonly logger = new Logger(AiProviderService.name);
  private defaultProvider: AIProviderInterface;
  private fallbackProvider: AIProviderInterface;
  private useFallback = false;
  private candidates: AIProviderInterface[] = [];
  private readonly breakers: CircuitBreakerRegistry;
  // Optional: specs and scripts construct this service with three arguments, and
  // a metrics problem must never take the AI path down with it.
  private readonly metrics: MetricsService | null;

  // C6: consent gate. Optional so specs/scripts keep constructing this with
  // three args; when absent, gated calls fail CLOSED (see assertConsent).
  private readonly consentGate: AiConsentGate | null;

  constructor(
    private readonly openAIProvider: OpenAIProvider,
    private readonly ollamaProvider: OllamaProvider,
    private readonly nemotronNimProvider: NemotronNimProvider,
    @Optional() metrics?: MetricsService,
    @Optional() breakers?: CircuitBreakerRegistry,
    @Optional() @Inject(AI_CONSENT_GATE) consentGate?: AiConsentGate
  ) {
    this.defaultProvider = openAIProvider;
    this.fallbackProvider = ollamaProvider;
    this.metrics = metrics ?? null;
    this.breakers = breakers ?? defaultCircuitBreakerRegistry;
    this.consentGate = consentGate ?? null;
  }

  /**
   * C6: refuse to send Google-sourced content to an external AI provider
   * before the user explicitly consented. Fail-closed: a gated call without a
   * userId, or with no gate wired, is blocked.
   */
  private async assertConsent(options: GenerateOptions | undefined, operation: string): Promise<void> {
    if (!options?.includesGoogleData) return;
    const userId = options.userId;
    if (!userId) {
      throw new AiProviderError(
        `AI ${operation} blocked: includesGoogleData requires a userId for the consent check`,
        { provider: 'consent-gate', kind: 'consent_required', retryable: false }
      );
    }
    if (!this.consentGate) {
      throw new AiProviderError(
        `AI ${operation} blocked: consent gate is not configured`,
        { provider: 'consent-gate', kind: 'consent_required', retryable: false }
      );
    }
    if (!(await this.consentGate.hasConsent(userId))) {
      throw new AiProviderError(
        'AI processing of your calendar data requires your explicit consent. Grant it in Settings → AI processing consent.',
        { provider: 'consent-gate', kind: 'consent_required', retryable: false }
      );
    }
  }

  async onModuleInit(): Promise<void> {
    const providerName = (process.env.AI_PROVIDER || 'openai').toLowerCase();
    this.useFallback = providerName === 'ollama' || providerName === 'nemotron';

    if (providerName === 'ollama') {
      this.defaultProvider = this.ollamaProvider;
      this.fallbackProvider = this.openAIProvider;
    } else if (providerName === 'nemotron') {
      this.defaultProvider = this.nemotronNimProvider;
      this.fallbackProvider = this.openAIProvider;
    }

    this.candidates = [this.defaultProvider, this.fallbackProvider];

    // Token accounting. Providers stay free of DI, so the service pushes its
    // listener down into whichever providers support usage reporting.
    const reportable = [
      this.openAIProvider,
      this.ollamaProvider,
      this.nemotronNimProvider,
    ] as Array<AIProviderInterface & { usageListener?: (report: AiUsageReport) => void }>;
    for (const provider of reportable) {
      provider.usageListener = (report) => this.recordUsage(report);
    }

    this.logger.log(
      `AI Provider initialized: ${this.defaultProvider.providerName}` +
        ` (fallback=${this.useFallback ? this.fallbackProvider.providerName : 'none'}` +
        `, breakers=${circuitBreakerEnabled()})`
    );
  }

  get providerName(): string {
    return this.defaultProvider.providerName;
  }

  /** Breaker + capability view for the probe script and Stage 5b runtime. */
  describeProviders(): ProviderHealthView[] {
    return this.candidates.map((provider) => ({
      provider: provider.providerName,
      capabilities: provider.getCapabilities?.(),
      circuit: this.breakers.get(provider.providerName).snapshot(),
    }));
  }

  private recordUsage(report: AiUsageReport): void {
    this.metrics?.recordAiTokens(
      report.provider,
      report.model,
      report.operation,
      report.usage
    );
  }

  /** Keeps the circuit-state gauge truthful after every recorded outcome. */
  private syncCircuitGauge(providerName: string): void {
    if (!this.metrics) return;
    this.metrics.setAiCircuitState(
      providerName,
      this.breakers.get(providerName).snapshot().state
    );
  }

  /**
   * Selection order is primary then fallback, minus any provider whose breaker is
   * open. Fallback only chains when configured to (AI_PROVIDER=ollama|nemotron),
   * preserving the pre-Stage-5a rule.
   */
  private orderedProviders(): AIProviderInterface[] {
    return this.useFallback
      ? [this.defaultProvider, this.fallbackProvider]
      : [this.defaultProvider];
  }


  /**
   * Runs one provider verb across the selection chain.
   *
   * Breaker-first: a provider whose circuit is open is skipped without touching
   * the network, and if every provider is open we fail fast with `circuit_open`
   * rather than queueing more requests against a known-dead endpoint. Every
   * outcome is recorded on that provider's breaker and on the metrics layer.
   *
   * `quietKinds` suppresses the warn log for failures that are expected rather
   * than alarming — `unsupported` is the notable one: with AI_PROVIDER=ollama the
   * primary genuinely has no /embeddings, and warning on every memory search
   * would train whoever reads the logs to ignore the warnings that matter.
   */
  private async invoke<T>(
    operation: string,
    call: (provider: AIProviderInterface) => Promise<T>,
    options: { quietKinds?: AiProviderErrorKind[] } = {}
  ): Promise<AiProviderOutcome<T>> {
    const chain = this.orderedProviders();
    const quiet = new Set<AiProviderErrorKind>(options.quietKinds ?? []);
    let lastError: AiProviderError | undefined;
    let anyAllowed = false;

    // The breaker is asked *inside* the loop, never as an upfront filter:
    // `allowRequest()` consumes the single half-open probe slot, so checking the
    // fallback before deciding not to call it would burn its probe and leave the
    // breaker permanently unable to recover.
    for (const provider of chain) {
      if (!this.breakers.allow(provider.providerName)) {
        this.logger.debug(`${provider.providerName} skipped for ${operation}: circuit open`);
        continue;
      }
      anyAllowed = true;
      const started = Date.now();
      try {
        const value = await call(provider);
        this.breakers.recordSuccess(provider.providerName);
        this.metrics?.incrementAiRequests(provider.providerName, operation, 'success');
        this.metrics?.observeAiDuration(provider.providerName, operation, (Date.now() - started) / 1000);
        this.syncCircuitGauge(provider.providerName);
        const servedByFallback = provider !== chain[0];
        if (servedByFallback) {
          this.metrics?.recordFallbackProviderSwitch(operation, chain[0].providerName, provider.providerName);
        }
        return { value, provider: provider.providerName, usedFallback: servedByFallback };
      } catch (error) {
        const aiError = AiProviderError.from(provider.providerName, error, { kind: 'http' });
        lastError = aiError;
        this.breakers.recordFailure(provider.providerName, aiError.kind);
        this.metrics?.incrementAiRequests(provider.providerName, operation, 'error');
        this.metrics?.recordAiError(provider.providerName, operation, aiError.kind);
        this.metrics?.observeAiDuration(provider.providerName, operation, (Date.now() - started) / 1000);
        this.syncCircuitGauge(provider.providerName);
        if (aiError.kind === 'timeout') {
          this.metrics?.recordAiTimeout(provider.providerName, operation);
        }
        if (aiError.attempts > 1) {
          this.metrics?.recordAiRetries(provider.providerName, operation, aiError.attempts - 1);
        }
        if (!quiet.has(aiError.kind)) {
          this.logger.warn(
            `${provider.providerName} ${operation} failed (${aiError.kind}${
              aiError.status ? ` HTTP ${aiError.status}` : ''
            }, attempts=${aiError.attempts}): ${aiError.message}`
          );
        }
      }
    }

    // Nothing was even attempted because every breaker refused: report that
    // honestly rather than rethrowing a stale error from a much earlier failure.
    if (!anyAllowed) {
      const primary = chain[0];
      const snapshot = this.breakers.get(primary.providerName).snapshot();
      this.metrics?.recordAiCircuitRejected(primary.providerName, operation);
      this.syncCircuitGauge(primary.providerName);
      throw new AiProviderError(
        `${primary.providerName} circuit is open; retry in ${Math.ceil(
          snapshot.retryAfterMs / 1000
        )}s`,
        {
          provider: primary.providerName,
          kind: 'circuit_open',
          retryable: true,
          retryAfterSeconds: Math.ceil(snapshot.retryAfterMs / 1000),
        }
      );
    }

    this.logger.error(`All AI providers failed for ${operation}`);
    if (chain.length > 1) this.metrics?.recordAiFallbackExhausted(operation);
    throw lastError!;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    await this.assertConsent(options, 'generate');
    const outcome = await this.invoke('generate', (provider) => provider.generate(prompt, options));
    return outcome.value;
  }

  async generateStructured(prompt: string, options?: GenerateOptions): Promise<any> {
    await this.assertConsent(options, 'structured');
    const outcome = await this.invoke('structured', (provider) =>
      provider.generateStructured(prompt, options)
    );
    return outcome.value;
  }

  /**
   * Multi-turn chat for the Stage 5b agent loop. A provider that does not
   * implement it reports `unsupported` instead of being silently skipped, so a
   * misconfigured runtime fails loudly at the call site that can repair it.
   */
  async chat(options: ChatOptions): Promise<AiChatResult> {
    await this.assertConsent(options, 'chat');
    const outcome = await this.invoke('chat', (provider) => {
      if (!provider.chat) {
        throw new AiProviderError(`${provider.providerName} does not implement chat`, {
          provider: provider.providerName,
          kind: 'unsupported',
          retryable: false,
        });
      }
      return provider.chat(options);
    });
    return outcome.value;
  }

  /**
   * Embeddings. This used to swallow every failure and return `[]`, and the
   * memory engine then scored an empty vector against every stored embedding,
   * got 0 for all of them, and reported "no relevant memories" during a total
   * embedding outage. The typed error now surfaces so the caller can degrade
   * deliberately (see `searchByQuery` / `searchByRecency` in MemoryEngineService).
   */
  async embed(text: string): Promise<number[]> {
    const outcome = await this.invoke(
      'embed',
      (provider) => {
        if (!provider.embed) {
          throw new AiProviderError(`${provider.providerName} does not support embeddings`, {
            provider: provider.providerName,
            kind: 'unsupported',
            retryable: false,
          });
        }
        return provider.embed(text);
      },
      { quietKinds: ['unsupported'] }
    );
    return outcome.value;
  }

  getCapabilities(): AiProviderCapabilities {
    return this.defaultProvider.getCapabilities?.() ?? defaultCapabilities(this.providerName);
  }
}

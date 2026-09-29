import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Structurally matches `AiUsage`. Declared locally so the metrics layer keeps no
 * compile-time dependency on the AI provider modules (which in turn optionally
 * depend on this service); a structural import here would be a circular edge.
 */
export interface AiTokenCounts {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;

  readonly httpRequestsTotal: Counter;
  readonly httpRequestDuration: Histogram;
  readonly activeUsers: Gauge;
  readonly scheduledTasks: Gauge;
  readonly aiRequestsTotal: Counter;
  readonly aiRequestDuration: Histogram;
  readonly aiErrorsTotal: Counter;
  readonly aiRetriesTotal: Counter;
  readonly aiTokensTotal: Counter;
  readonly aiFallbacksTotal: Counter;
  readonly aiCircuitState: Gauge;
  readonly throttlerRedisFallbacksTotal: Counter;

  constructor() {
    this.registry = new Registry();

    collectDefaultMetrics({ register: this.registry, prefix: 'calassist_' });

    this.httpRequestsTotal = new Counter({
      name: 'calassist_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'calassist_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.activeUsers = new Gauge({
      name: 'calassist_active_users',
      help: 'Number of active users',
      registers: [this.registry],
    });

    this.scheduledTasks = new Gauge({
      name: 'calassist_scheduled_tasks',
      help: 'Number of scheduled tasks in queue',
      registers: [this.registry],
    });

    this.aiRequestsTotal = new Counter({
      name: 'calassist_ai_requests_total',
      help: 'Total number of AI requests',
      labelNames: ['provider', 'operation', 'status'],
      registers: [this.registry],
    });

    this.aiRequestDuration = new Histogram({
      name: 'calassist_ai_request_duration_seconds',
      help: 'AI request duration in seconds',
      labelNames: ['provider', 'operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });

    // --- Stage 5a: provider transport health ---

    this.aiErrorsTotal = new Counter({
      name: 'calassist_ai_errors_total',
      help: 'AI provider failures by typed error kind',
      labelNames: ['provider', 'operation', 'kind'],
      registers: [this.registry],
    });

    this.aiRetriesTotal = new Counter({
      name: 'calassist_ai_retries_total',
      help: 'Extra HTTP attempts consumed by the provider retry policy',
      labelNames: ['provider', 'operation'],
      registers: [this.registry],
    });

    this.aiTokensTotal = new Counter({
      name: 'calassist_ai_tokens_total',
      help: 'LLM token usage reported by providers',
      labelNames: ['provider', 'model', 'operation', 'direction'],
      registers: [this.registry],
    });

    this.aiFallbacksTotal = new Counter({
      name: 'calassist_ai_fallbacks_total',
      help: 'Requests answered by a non-primary provider or by local fallback logic',
      labelNames: ['scope', 'operation', 'reason'],
      registers: [this.registry],
    });

    this.aiCircuitState = new Gauge({
      name: 'calassist_ai_circuit_state',
      help: 'Provider circuit breaker state (0=closed, 1=half_open, 2=open)',
      labelNames: ['provider'],
      registers: [this.registry],
    });

    this.throttlerRedisFallbacksTotal = new Counter({
      name: 'calassist_throttler_redis_fallback_total',
      help: 'Rate-limit checks served by the per-process fallback after Redis errors',
      registers: [this.registry],
    });
  }

  onModuleInit() {
    this.activeUsers.set(0);
    this.scheduledTasks.set(0);
  }

  getRegistry(): Registry {
    return this.registry;
  }

  incrementHttpRequests(method: string, route: string, statusCode: number): void {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
  }

  observeHttpDuration(method: string, route: string, durationSeconds: number): void {
    this.httpRequestDuration.observe({ method, route }, durationSeconds);
  }

  setActiveUsers(count: number): void {
    this.activeUsers.set(count);
  }

  setScheduledTasks(count: number): void {
    this.scheduledTasks.set(count);
  }

  incrementAiRequests(provider: string, operation: string, status: 'success' | 'error'): void {
    this.aiRequestsTotal.inc({ provider, operation, status });
  }

  /** Typed failure taxonomy: `AiProviderErrorKind`, kept as a plain string here. */
  recordAiError(provider: string, operation: string, kind: string): void {
    this.aiErrorsTotal.inc({ provider, operation, kind });
  }

  recordAiTimeout(provider: string, operation: string): void {
    this.aiErrorsTotal.inc({ provider, operation, kind: 'timeout' });
  }

  recordAiRetries(provider: string, operation: string, extraAttempts: number): void {
    this.aiRetriesTotal.inc({ provider, operation }, Math.max(1, extraAttempts));
  }

  recordAiCircuitRejected(provider: string, operation: string): void {
    this.aiErrorsTotal.inc({ provider, operation, kind: 'circuit_open' });
  }

  recordAiFallbackExhausted(operation: string): void {
    this.aiFallbacksTotal.inc({ scope: 'provider-chain', operation, reason: 'chain_exhausted' });
  }

  /** A request the primary could not serve and the secondary did. */
  recordFallbackProviderSwitch(operation: string, from: string, to: string): void {
    this.aiFallbacksTotal.inc({
      scope: 'provider-chain',
      operation,
      reason: `${from}->${to}`,
    });
  }

  /** When memory retrieval answers without vectors (embedding outage path). */
  recordMemoryRecencyFallback(operation: string): void {
    this.aiFallbacksTotal.inc({ scope: 'memory-engine', operation, reason: 'no_embeddings' });
  }

  /** When the orchestrator answers from the local mapper because the LLM failed. */
  recordLocalFallback(operation: string, reason: string): void {
    this.aiFallbacksTotal.inc({ scope: 'orchestrator', operation, reason });
  }

  recordAiTokens(provider: string, model: string, operation: string, usage: AiTokenCounts): void {
    const labels = { provider, model, operation };
    this.aiTokensTotal.inc({ ...labels, direction: 'prompt' }, usage.promptTokens);
    this.aiTokensTotal.inc({ ...labels, direction: 'completion' }, usage.completionTokens);
  }

  /** Gauge mirror of breaker state so an outage is visible without log access. */
  setAiCircuitState(provider: string, state: 'closed' | 'half_open' | 'open'): void {
    const value = state === 'closed' ? 0 : state === 'half_open' ? 1 : 2;
    this.aiCircuitState.set({ provider }, value);
  }

  recordThrottlerRedisFallback(): void {
    this.throttlerRedisFallbacksTotal.inc();
  }

  observeAiDuration(provider: string, operation: string, durationSeconds: number): void {
    this.aiRequestDuration.observe({ provider, operation }, durationSeconds);
  }
}

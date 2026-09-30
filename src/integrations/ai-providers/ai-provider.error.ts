/**
 * Stage 5a: every provider failure now travels through one typed error so the
 * orchestrator, the circuit breaker and the metrics layer can distinguish a
 * retryable transport blip from a hard auth failure or an unusable payload.
 *
 * Before this, providers returned `''` or `{ confidence: 0 }` on failure (and
 * `AiProviderService.embed()` returned `[]`), which meant a total LLM outage was
 * indistinguishable from a model that legitimately answered nothing. Every
 * caller that "handles" provider failure by falling back locally was therefore
 * relying on a code path that never fired.
 */
export type AiProviderErrorKind =
  /** No API key / base url configured for this provider. */
  | 'unconfigured'
  /** 401/403 — retrying cannot help; only the breaker should learn about it. */
  | 'auth'
  /** 429 — retryable, but with backoff. */
  | 'rate_limit'
  /** AbortSignal.timeout fired (or the DOMException name was TimeoutError). */
  | 'timeout'
  /** fetch() rejected before a response (DNS, connection refused, reset). */
  | 'network'
  /** Any other non-2xx HTTP status. */
  | 'http'
  /** 2xx body that is not the JSON we were promised. */
  | 'parse'
  /** 2xx, parsed, but with no usable content/tool calls. */
  | 'empty'
  /** The provider's circuit is open; the request was never attempted. */
  | 'circuit_open'
  /** The shared per-provider concurrency limit is full; the provider was not called. */
  | 'capacity'
  /** The provider does not support the requested capability. */
  | 'unsupported'
  /** C6: the call carries Google-sourced content and the user has not consented. */
  | 'consent_required';

export interface AiProviderErrorDetails {
  provider: string;
  kind: AiProviderErrorKind;
  status?: number;
  retryable: boolean;
  /** How many HTTP attempts were made before this error was surfaced. */
  attempts?: number;
  /** Server-requested wait (seconds) from a 429 `Retry-After` header. */
  retryAfterSeconds?: number;
  /** Underlying error message, kept for logs/metrics but never trusted. */
  cause?: unknown;
}

export class AiProviderError extends Error {
  readonly provider: string;
  readonly kind: AiProviderErrorKind;
  readonly status?: number;
  readonly retryable: boolean;
  /**
   * Mutable so the retry loop can stamp the final attempt count onto an error
   * that was created deeper down (where the loop index was not in scope).
   */
  attempts: number;
  readonly retryAfterSeconds?: number;
  readonly cause?: unknown;

  constructor(message: string, details: AiProviderErrorDetails) {
    super(message);
    this.name = 'AiProviderError';
    this.provider = details.provider;
    this.kind = details.kind;
    this.status = details.status;
    this.retryable = details.retryable;
    this.attempts = details.attempts ?? 1;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.cause = details.cause;
    // Required so `instanceof` survives the ES2022 class-extends-Error downlevel.
    Object.setPrototypeOf(this, AiProviderError.prototype);
  }

  /** True for the failures a retry loop can plausibly fix. */
  get isTransient(): boolean {
    return this.retryable;
  }

  static is(error: unknown): error is AiProviderError {
    return error instanceof AiProviderError;
  }

  /**
   * Wraps an arbitrary thrown value. An existing AiProviderError passes through
   * unchanged so the attempt count and kind recorded deeper down survive.
   */
  static from(
    provider: string,
    error: unknown,
    fallback: {
      kind?: AiProviderErrorKind;
      retryable?: boolean;
      attempts?: number;
      retryAfterSeconds?: number;
    } = {}
  ): AiProviderError {
    if (AiProviderError.is(error)) return error;
    const message = error instanceof Error ? error.message : String(error);
    // Node surfaces DNS/connection failures as TypeError("fetch failed"), and a
    // fired AbortSignal as TimeoutError/AbortError. Both are transient.
    const isAbort =
      error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    const kind: AiProviderErrorKind = isAbort
      ? 'timeout'
      : (fallback.kind ?? (error instanceof TypeError ? 'network' : 'http'));
    return new AiProviderError(`${provider}: ${message}`, {
      provider,
      kind,
      retryable: fallback.retryable ?? (isAbort || error instanceof TypeError),
      attempts: fallback.attempts ?? 1,
      retryAfterSeconds: fallback.retryAfterSeconds,
      cause: error,
    });
  }
}

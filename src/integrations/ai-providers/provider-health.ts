import { AiProviderErrorKind } from './ai-provider.error';
import { envInt, envBool } from './provider-http';

/**
 * Stage 5a: per-provider circuit breaker.
 *
 * The point is not to hide failures — it is to stop *amplifying* them. Before
 * this, every assistant turn that hit a dead OpenAI endpoint paid the full
 * timeout, then the full fallback timeout, and did so again for the next 50
 * requests. The breaker lets one failure stop the bleeding for a cooldown
 * window instead of each request discovering the outage on its own.
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

/** Kinds that are *our* problem, not the provider's — they must not trip. */
const NON_BREAKING_KINDS: ReadonlySet<AiProviderErrorKind> = new Set<AiProviderErrorKind>([
  // 401/403 from a wrong or revoked key is a configuration defect. Counting it
  // would open the circuit and mislabel a bad credential as a provider outage.
  'auth',
  // No key configured at all — nothing for the provider to be healthy about.
  'unconfigured',
  // The endpoint genuinely does not implement the feature; retrying or waiting
  // changes nothing, and the caller has a capability check instead.
  'unsupported',
  'capacity',
  // A 200 with junk content is a model-quality problem, not availability. The
  // agent loop repairs it; it is not a reason to stop sending traffic.
  'parse',
  'empty',
]);

export function isBreakingFailure(kind: AiProviderErrorKind): boolean {
  return !NON_BREAKING_KINDS.has(kind);
}

export interface CircuitBreakerOptions {
  /** Consecutive breaking failures that open the circuit. */
  failureThreshold: number;
  /** How long the circuit stays open before admitting a trial request. */
  cooldownMs: number;
  /** Successes in half-open required to close the circuit again. */
  successThreshold: number;
  /** Injectable clock so specs can move time without fake timers. */
  now: () => number;
}

function defaultOptions(): Omit<CircuitBreakerOptions, 'now'> {
  return {
    failureThreshold: envInt('AI_CIRCUIT_FAILURE_THRESHOLD', 3),
    cooldownMs: envInt('AI_CIRCUIT_COOLDOWN_MS', 30000),
    successThreshold: envInt('AI_CIRCUIT_SUCCESS_THRESHOLD', 1),
  };
}

export interface CircuitSnapshot {
  provider: string;
  state: CircuitState;
  consecutiveFailures: number;
  /** Milliseconds until a half-open probe is permitted; 0 when not open. */
  retryAfterMs: number;
  lastFailureKind?: AiProviderErrorKind;
  lastFailureAt?: number;
  lastSuccessAt?: number;
}

/**
 * Minimal closed → open → half-open → closed breaker.
 *
 * Deliberately tracks *consecutive* breaking failures: a provider that fails
 * twice, succeeds, then fails once is a flaky provider, not a down one, and
 * resetting the counter avoids opening on a low error rate over a long window.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private halfOpenSuccesses = 0;
  /** Guards half-open so only one trial request probes a suspected-dead provider. */
  private probeInFlight = false;
  private openedAt = 0;
  private lastFailureKind?: AiProviderErrorKind;
  private lastFailureAt?: number;
  private lastSuccessAt?: number;

  constructor(
    readonly provider: string,
    private readonly options: CircuitBreakerOptions
  ) {}

  get currentState(): CircuitState {
    this.rollHalfOpen();
    return this.state;
  }

  /**
   * Whether a request may go out right now. Calling this is also how a closed
   * breaker transitions to half-open once the cooldown has elapsed.
   */
  allowRequest(): boolean {
    this.rollHalfOpen();
    if (this.state === 'closed') return true;
    if (this.state === 'open') return false;
    // half_open: admit exactly one probe at a time.
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.lastSuccessAt = this.options.now();
    if (this.state === 'half_open') {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.options.successThreshold) this.close();
    } else {
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Records an outcome. Non-breaking kinds (auth, unconfigured, unsupported,
   * parse, empty) never open the circuit and never reset the availability
   * counter either — a 401 says nothing about whether the endpoint is up.
   *
   * In half_open they *release the probe slot* instead of re-opening. This
   * matters: leaving it claimed would wedge the breaker permanently, because
   * `rollHalfOpen()` only moves `open` → `half_open`, so an open circuit that
   * recovers into a half-open probe answered with a 401 would never let another
   * request through again — a bad key would masquerade as a permanent outage,
   * which is precisely the misdiagnosis this module exists to avoid.
   */
  recordFailure(kind: AiProviderErrorKind): void {
    this.lastFailureKind = kind;
    this.lastFailureAt = this.options.now();
    if (!isBreakingFailure(kind)) {
      if (this.state === 'half_open') this.probeInFlight = false;
      return;
    }
    this.consecutiveFailures += 1;
    if (this.state === 'half_open' || this.consecutiveFailures >= this.options.failureThreshold) {
      this.open();
    }
  }

  snapshot(): CircuitSnapshot {
    this.rollHalfOpen();
    return {
      provider: this.provider,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      retryAfterMs:
        this.state === 'open'
          ? Math.max(0, this.options.cooldownMs - (this.options.now() - this.openedAt))
          : 0,
      lastFailureKind: this.lastFailureKind,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  /** Test/ops hook: force the breaker shut (e.g. after rotating a key). */
  reset(): void {
    this.close();
  }

  private open(): void {
    this.state = 'open';
    this.openedAt = this.options.now();
    this.halfOpenSuccesses = 0;
    this.probeInFlight = false;
  }

  private close(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.halfOpenSuccesses = 0;
    this.probeInFlight = false;
  }

  /** open → half_open once the cooldown has elapsed. */
  private rollHalfOpen(): void {
    if (this.state !== 'open') return;
    if (this.options.now() - this.openedAt < this.options.cooldownMs) return;
    this.state = 'half_open';
    this.halfOpenSuccesses = 0;
    this.probeInFlight = false;
  }
}

/**
 * Whether breaker enforcement is active. Read on every check rather than cached,
 * because the registry itself is module-level and constructed before `.env`.
 */
export function circuitBreakerEnabled(): boolean {
  return envBool('AI_CIRCUIT_ENABLED', true);
}

/**
 * Breakers keyed by provider name. A process-wide registry (rather than one per
 * Nest instance) is deliberate: `AiProviderService`, the intent parser and the
 * probe script must all see the same view of "is OpenAI up", or a provider looks
 * healthy to whichever component happens to ask.
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();
  /**
   * Resolved lazily so the env thresholds are read after `ConfigModule` loads,
   * not at import time. See `defaults` below.
   */
  private resolvedDefaults?: Omit<CircuitBreakerOptions, 'now'>;

  constructor(
    private readonly overrides: Partial<Omit<CircuitBreakerOptions, 'now'>> = {},
    private readonly now: () => number = () => Date.now()
  ) {}

  private get defaults(): Omit<CircuitBreakerOptions, 'now'> {
    // Resolved on first use, not in the constructor: a module-level registry is
    // built at import time, before ConfigModule has loaded `.env`.
    this.resolvedDefaults ??= { ...defaultOptions(), ...this.overrides };
    return this.resolvedDefaults;
  }

  get(provider: string): CircuitBreaker {
    const key = provider.toLowerCase();
    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker(provider, { ...this.defaults, now: this.now });
      this.breakers.set(key, breaker);
    }
    return breaker;
  }

  /**
   * False when the breaker refuses the request, i.e. it is effectively down.
   * Always true when breakers are disabled, so `AI_CIRCUIT_ENABLED=false` yields
   * the pre-Stage-5a "try everything every time" behaviour rather than turning a
   * disabled feature into a new class of `circuit_open` failures.
   */
  allow(provider: string): boolean {
    if (!circuitBreakerEnabled()) return true;
    return this.get(provider).allowRequest();
  }

  recordSuccess(provider: string): void {
    this.get(provider).recordSuccess();
  }

  recordFailure(provider: string, kind: AiProviderErrorKind): void {
    this.get(provider).recordFailure(kind);
  }

  snapshots(): CircuitSnapshot[] {
    return [...this.breakers.values()].map((b) => b.snapshot());
  }

  clear(): void {
    this.breakers.clear();
  }
}

/**
 * Shared registry used by `AiProviderService`. Exported as an instance so the
 * probe script and any non-DI caller observe the same state as the app.
 */
/**
 * Shared registry used by `AiProviderService`. Exported as an instance so the
 * probe script and any non-DI caller observe the same state as the app.
 */
export const defaultCircuitBreakerRegistry = new CircuitBreakerRegistry();

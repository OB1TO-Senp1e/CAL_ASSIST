import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  isBreakingFailure,
} from './provider-health';

/**
 * The breaker exists to stop amplifying an outage, and just as importantly to
 * avoid mislabelling a configuration problem as one. Hence the two halves of
 * these tests: availability failures must trip, credential failures must not.
 */
function makeBreaker(
  overrides: Partial<{ failureThreshold: number; cooldownMs: number; successThreshold: number }> = {},
  clock = { time: 0 }
) {
  const breaker = new CircuitBreaker('Test', {
    failureThreshold: overrides.failureThreshold ?? 3,
    cooldownMs: overrides.cooldownMs ?? 30000,
    successThreshold: overrides.successThreshold ?? 1,
    now: () => clock.time,
  });
  return { breaker, clock };
}

describe('CircuitBreaker transitions', () => {
  it('stays closed below the failure threshold and resets on success', () => {
    const { breaker } = makeBreaker();
    breaker.recordFailure('timeout');
    breaker.recordFailure('network');
    expect(breaker.currentState).toBe('closed');
    expect(breaker.allowRequest()).toBe(true);

    breaker.recordSuccess();
    expect(breaker.snapshot().consecutiveFailures).toBe(0);

    // Two fresh failures must not be treated as the third of a reset streak.
    breaker.recordFailure('timeout');
    breaker.recordFailure('network');
    expect(breaker.currentState).toBe('closed');
  });

  it('opens at the threshold and refuses requests during the cooldown', () => {
    const clock = { time: 0 };
    const { breaker } = makeBreaker({ failureThreshold: 2, cooldownMs: 1000 }, clock);
    breaker.recordFailure('network');
    breaker.recordFailure('network');
    expect(breaker.currentState).toBe('open');
    expect(breaker.allowRequest()).toBe(false);
    expect(breaker.snapshot().retryAfterMs).toBe(1000);

    clock.time = 999;
    expect(breaker.allowRequest()).toBe(false);
  });

  it('half-opens after the cooldown and closes again on a success', () => {
    const clock = { time: 0 };
    const { breaker } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 }, clock);
    breaker.recordFailure('network');
    expect(breaker.currentState).toBe('open');

    clock.time = 1000;
    expect(breaker.currentState).toBe('half_open');
    expect(breaker.allowRequest()).toBe(true);
    // Only one probe at a time, so a recovering endpoint is not stampeded.
    expect(breaker.allowRequest()).toBe(false);

    breaker.recordSuccess();
    expect(breaker.currentState).toBe('closed');
  });

  it('re-opens when the half-open probe fails with an availability error', () => {
    const clock = { time: 0 };
    const { breaker } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 }, clock);
    breaker.recordFailure('network');
    clock.time = 1000;
    expect(breaker.allowRequest()).toBe(true);

    breaker.recordFailure('timeout');
    expect(breaker.currentState).toBe('open');
    expect(breaker.allowRequest()).toBe(false);
  });

  it('admits a second probe after a half-open probe hit a non-availability error', () => {
    const clock = { time: 0 };
    const { breaker } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 }, clock);
    breaker.recordFailure('network');
    clock.time = 1000;
    expect(breaker.allowRequest()).toBe(true);

    // A 401 during the probe says nothing about availability. If it re-opened (or
    // merely consumed the slot) a stale key would wedge this breaker forever,
    // which is precisely the "bad credentials read as outage" bug Stage 5a avoids.
    breaker.recordFailure('auth');
    expect(breaker.currentState).toBe('half_open');
    expect(breaker.allowRequest()).toBe(true);
  });
});

describe('CircuitBreaker failure taxonomy', () => {
  it.each(['auth', 'unconfigured', 'unsupported', 'parse', 'empty'] as const)(
    'never treats %s as an outage',
    (kind) => {
      expect(isBreakingFailure(kind)).toBe(false);
    }
  );

  it.each(['timeout', 'network', 'http', 'rate_limit', 'circuit_open'] as const)(
    'treats %s as breaking',
    (kind) => {
      expect(isBreakingFailure(kind)).toBe(true);
    }
  );

  it('does not let a non-breaking failure open the circuit from closed', () => {
    const { breaker } = makeBreaker({ failureThreshold: 1 });
    breaker.recordFailure('auth');
    breaker.recordFailure('auth');
    breaker.recordFailure('auth');
    expect(breaker.currentState).toBe('closed');
  });
});

describe('CircuitBreakerRegistry', () => {
  it('keys providers case-insensitively and keeps one breaker per provider', () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 1 }, () => 0);
    expect(registry.get('OpenAI')).toBe(registry.get('openai'));
    expect(registry.allow('openai')).toBe(true);
    registry.recordFailure('OpenAI', 'network');
    expect(registry.allow('OpenAI')).toBe(false);
    // A different provider is unaffected by OpenAI being down.
    expect(registry.allow('Ollama')).toBe(true);
  });

  it('exposes snapshots for health reporting', () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 1 }, () => 0);
    registry.recordFailure('openai', 'timeout');
    const [openai] = registry.snapshots();
    expect(openai.provider).toBe('openai');
    expect(openai.state).toBe('open');
    expect(openai.lastFailureKind).toBe('timeout');
  });
});

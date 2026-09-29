import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { AiProviderErrorKind } from './ai-provider.error';
import { circuitBreakerEnabled, isBreakingFailure } from './provider-health';

const ALLOW_REQUEST_SCRIPT = `
local openTtl = redis.call('PTTL', KEYS[1])
if openTtl > 0 then return 0 end
local failures = tonumber(redis.call('GET', KEYS[2]) or '0')
if failures < tonumber(ARGV[1]) then return 1 end
if redis.call('SET', KEYS[3], '1', 'PX', ARGV[2], 'NX') then return 1 end
return 0
`;

const RECORD_FAILURE_SCRIPT = `
local failures = redis.call('INCR', KEYS[1])
if failures == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
if failures >= tonumber(ARGV[1]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('DEL', KEYS[3])
end
return failures
`;

const RECORD_SUCCESS_SCRIPT = `
redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
return 1
`;

const ACQUIRE_CAPACITY_SCRIPT = `
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
local quotaLimit = tonumber(ARGV[5])
if quotaLimit > 0 then
  redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - tonumber(ARGV[6]))
  if redis.call('ZCARD', KEYS[2]) >= quotaLimit then return -1 end
end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), ARGV[4])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]) * 2)
if quotaLimit > 0 then
  redis.call('ZADD', KEYS[2], now, ARGV[4])
  redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[6]))
end
return 1
`;

const RELEASE_CAPACITY_SCRIPT = `
return redis.call('ZREM', KEYS[1], ARGV[1])
`;

export interface AiProviderCapacityLease {
  release(): Promise<void>;
}

function readInteger(config: ConfigService, name: string, fallback: number, minimum = 1): number {
  const raw = config.get<string>(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

@Injectable()
export class RedisAiProtectionService {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly probeLeaseMs: number;
  private readonly maxConcurrentRequests: number;
  private readonly capacityLeaseMs: number;
  private readonly providerQuotaLimit: number;
  private readonly providerQuotaWindowMs: number;
  private readonly circuitEnabled: boolean;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    config: ConfigService
  ) {
    this.failureThreshold = readInteger(config, 'AI_CIRCUIT_FAILURE_THRESHOLD', 3);
    this.cooldownMs = readInteger(config, 'AI_CIRCUIT_COOLDOWN_MS', 30000);
    this.probeLeaseMs = readInteger(config, 'AI_CIRCUIT_PROBE_LEASE_MS', 60000);
    this.maxConcurrentRequests = readInteger(config, 'AI_PROVIDER_MAX_CONCURRENCY', 10);
    this.capacityLeaseMs = readInteger(config, 'AI_PROVIDER_CAPACITY_LEASE_MS', 120000);
    this.providerQuotaLimit = readInteger(config, 'AI_PROVIDER_QUOTA_LIMIT', 120);
    this.providerQuotaWindowMs = readInteger(config, 'AI_PROVIDER_QUOTA_WINDOW_MS', 60000);
    this.circuitEnabled = circuitBreakerEnabled();

    const maxRequestTime =
      readInteger(config, 'AI_REQUEST_TIMEOUT_MS', 15000) *
        (readInteger(config, 'AI_MAX_RETRIES', 2, 0) + 1) +
      readInteger(config, 'AI_RETRY_MAX_DELAY_MS', 4000, 0) *
        readInteger(config, 'AI_MAX_RETRIES', 2, 0);
    if (this.probeLeaseMs <= maxRequestTime || this.capacityLeaseMs <= maxRequestTime) {
      throw new Error(
        'AI circuit probe and capacity leases must exceed the configured provider request budget'
      );
    }
  }

  async allowRequest(provider: string): Promise<boolean> {
    if (!this.circuitEnabled) return true;
    const keys = this.keys(provider);
    const result = await this.redis.eval(ALLOW_REQUEST_SCRIPT, {
      keys: [keys.open, keys.failures, keys.probe],
      arguments: [String(this.failureThreshold), String(this.probeLeaseMs)],
    });
    return Number(result) === 1;
  }

  async recordFailure(provider: string, kind: AiProviderErrorKind): Promise<void> {
    if (!this.circuitEnabled || !isBreakingFailure(kind)) return;
    const keys = this.keys(provider);
    await this.redis.eval(RECORD_FAILURE_SCRIPT, {
      keys: [keys.failures, keys.open, keys.probe],
      arguments: [
        String(this.failureThreshold),
        String(Math.max(this.cooldownMs * 10, this.capacityLeaseMs)),
        String(this.cooldownMs),
      ],
    });
  }

  async recordSuccess(provider: string): Promise<void> {
    if (!this.circuitEnabled) return;
    const keys = this.keys(provider);
    await this.redis.eval(RECORD_SUCCESS_SCRIPT, {
      keys: [keys.failures, keys.open, keys.probe],
      arguments: [],
    });
  }

  async acquireCapacity(provider: string): Promise<AiProviderCapacityLease | null> {
    const key = `calassist:ai:capacity:${provider.toLowerCase()}`;
    const quotaKey = `calassist:ai:quota:${provider.toLowerCase()}`;
    const token = randomUUID();
    const acquired = await this.redis.eval(ACQUIRE_CAPACITY_SCRIPT, {
      keys: [key, quotaKey],
      arguments: [
        String(Date.now()),
        String(this.maxConcurrentRequests),
        String(this.capacityLeaseMs),
        token,
        String(this.providerQuotaLimit),
        String(this.providerQuotaWindowMs),
      ],
    });
    if (Number(acquired) !== 1) return null;

    let released = false;
    return {
      release: async () => {
        if (released) return;
        await this.redis.eval(RELEASE_CAPACITY_SCRIPT, {
          keys: [key],
          arguments: [token],
        });
        released = true;
      },
    };
  }

  private keys(provider: string): { failures: string; open: string; probe: string } {
    const prefix = `calassist:ai:circuit:${provider.toLowerCase()}`;
    return {
      failures: `${prefix}:failures`,
      open: `${prefix}:open`,
      probe: `${prefix}:probe`,
    };
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisClientType } from 'redis';
import { REDIS_CLIENT } from './redis.module';
import { MetricsService } from '../../metrics/metrics.service';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

interface LocalThrottleWindow {
  totalHits: number;
  expiresAt: number;
  blockedUntil: number;
}

const MAX_LOCAL_KEYS = 10_000;
const LOCAL_KEY_CLEANUP_INTERVAL_MS = 60_000;

const INCREMENT_SCRIPT = `
local blocked = redis.call('PTTL', KEYS[2])
if blocked > 0 then
  return {tonumber(redis.call('GET', KEYS[2]) or '0'), redis.call('PTTL', KEYS[1]), 1, blocked}
end

local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local ttl = redis.call('PTTL', KEYS[1])
if tonumber(ARGV[3]) > 0 and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], hits, 'PX', ARGV[3])
  return {hits, ttl, 1, tonumber(ARGV[3])}
end

return {hits, ttl, 0, 0}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly localWindows = new Map<string, LocalThrottleWindow>();
  private lastLocalCleanupAt = 0;
  private lastRedisWarningAt = 0;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    private readonly metrics: MetricsService
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `calassist:throttle:${throttlerName}:${key}`;
    try {
      const result = (await this.redis.eval(INCREMENT_SCRIPT, {
        keys: [redisKey, `${redisKey}:blocked`],
        arguments: [String(ttl), String(limit), String(blockDuration)],
      })) as number[];

      return {
        totalHits: result[0],
        timeToExpire: Math.max(0, Math.ceil(result[1] / 1000)),
        isBlocked: result[2] === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(result[3] / 1000)),
      };
    } catch (error) {
      this.metrics.recordThrottlerRedisFallback();
      this.logRedisFallback(error);
      return this.incrementLocally(redisKey, ttl, limit, blockDuration);
    }
  }

  private incrementLocally(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number
  ): ThrottlerStorageRecord {
    const now = Date.now();
    this.cleanLocalWindows(now);

    let window = this.localWindows.get(key);
    if (!window || window.expiresAt <= now) {
      if (window) this.localWindows.delete(key);
      if (this.localWindows.size >= MAX_LOCAL_KEYS) {
        const oldestKey = this.localWindows.keys().next().value;
        if (oldestKey !== undefined) this.localWindows.delete(oldestKey);
      }
      window = { totalHits: 0, expiresAt: now + ttl, blockedUntil: 0 };
    } else {
      this.localWindows.delete(key);
    }
    this.localWindows.set(key, window);

    if (window.blockedUntil > now) {
      return {
        totalHits: window.totalHits,
        timeToExpire: Math.max(0, Math.ceil((window.expiresAt - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.max(0, Math.ceil((window.blockedUntil - now) / 1000)),
      };
    }

    window.totalHits += 1;
    const isBlocked = blockDuration > 0 && window.totalHits > limit;
    if (isBlocked) window.blockedUntil = now + blockDuration;

    return {
      totalHits: window.totalHits,
      timeToExpire: Math.max(0, Math.ceil((window.expiresAt - now) / 1000)),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockDuration / 1000) : 0,
    };
  }

  private cleanLocalWindows(now: number): void {
    if (now - this.lastLocalCleanupAt < LOCAL_KEY_CLEANUP_INTERVAL_MS) return;
    this.lastLocalCleanupAt = now;
    for (const [key, window] of this.localWindows) {
      if (window.expiresAt <= now && window.blockedUntil <= now) {
        this.localWindows.delete(key);
      }
    }
  }

  private logRedisFallback(error: unknown): void {
    const now = Date.now();
    if (now - this.lastRedisWarningAt < LOCAL_KEY_CLEANUP_INTERVAL_MS) return;
    this.lastRedisWarningAt = now;
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    this.logger.warn(`Redis throttler unavailable; using process-local limits (${errorName})`);
  }
}

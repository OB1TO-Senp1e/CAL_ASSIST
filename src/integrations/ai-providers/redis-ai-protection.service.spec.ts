import { ConfigService } from '@nestjs/config';
import { RedisClientType } from 'redis';
import { RedisAiProtectionService } from './redis-ai-protection.service';

describe('RedisAiProtectionService', () => {
  const config = new ConfigService({
    AI_CIRCUIT_FAILURE_THRESHOLD: '3',
    AI_CIRCUIT_COOLDOWN_MS: '30000',
    AI_CIRCUIT_PROBE_LEASE_MS: '60000',
    AI_PROVIDER_MAX_CONCURRENCY: '10',
    AI_PROVIDER_CAPACITY_LEASE_MS: '120000',
    AI_PROVIDER_QUOTA_LIMIT: '120',
    AI_PROVIDER_QUOTA_WINDOW_MS: '60000',
    AI_REQUEST_TIMEOUT_MS: '15000',
    AI_MAX_RETRIES: '2',
    AI_RETRY_MAX_DELAY_MS: '4000',
  });

  it('uses the shared circuit key and refuses a provider while it is open', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue(0),
    } as unknown as RedisClientType;
    const protection = new RedisAiProtectionService(redis, config);

    await expect(protection.allowRequest('OpenAI')).resolves.toBe(false);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('PTTL'),
      expect.objectContaining({
        keys: [
          'calassist:ai:circuit:openai:open',
          'calassist:ai:circuit:openai:failures',
          'calassist:ai:circuit:openai:probe',
        ],
      })
    );
  });

  it('does not count local capacity rejections as provider availability failures', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue(1),
    } as unknown as RedisClientType;
    const protection = new RedisAiProtectionService(redis, config);

    await protection.recordFailure('openai', 'capacity');

    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('validates that leases exceed the configured provider request budget', () => {
    const invalidConfig = new ConfigService({
      AI_CIRCUIT_PROBE_LEASE_MS: '1000',
      AI_PROVIDER_CAPACITY_LEASE_MS: '1000',
      AI_REQUEST_TIMEOUT_MS: '15000',
      AI_MAX_RETRIES: '2',
      AI_RETRY_MAX_DELAY_MS: '4000',
    });
    const redis = { eval: jest.fn() } as unknown as RedisClientType;

    expect(() => new RedisAiProtectionService(redis, invalidConfig)).toThrow(/leases must exceed/);
  });
});

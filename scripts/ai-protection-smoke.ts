import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { RedisAiProtectionService } from '../src/integrations/ai-providers/redis-ai-protection.service';

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('REDIS_URL is required for the AI protection smoke test.');

  process.env.AI_CIRCUIT_ENABLED = 'true';
  const redis = createClient({ url: redisUrl });
  await redis.connect();
  const config = new ConfigService({
    AI_CIRCUIT_FAILURE_THRESHOLD: '2',
    AI_CIRCUIT_COOLDOWN_MS: '1000',
    AI_CIRCUIT_PROBE_LEASE_MS: '60000',
    AI_PROVIDER_MAX_CONCURRENCY: '1',
    AI_PROVIDER_CAPACITY_LEASE_MS: '120000',
    AI_PROVIDER_QUOTA_LIMIT: '2',
    AI_PROVIDER_QUOTA_WINDOW_MS: '60000',
    AI_REQUEST_TIMEOUT_MS: '1000',
    AI_MAX_RETRIES: '0',
    AI_RETRY_MAX_DELAY_MS: '0',
  });
  const firstReplica = new RedisAiProtectionService(redis, config);
  const secondReplica = new RedisAiProtectionService(redis, config);
  const suffix = randomUUID();
  const capacityProvider = `capacity-smoke-${suffix}`;
  const breakerProvider = `breaker-smoke-${suffix}`;

  try {
    const firstLease = await firstReplica.acquireCapacity(capacityProvider);
    assert.ok(firstLease, 'first replica should acquire the shared concurrency slot');
    assert.equal(
      await secondReplica.acquireCapacity(capacityProvider),
      null,
      'second replica must observe the shared concurrency limit'
    );
    await firstLease.release();

    const secondLease = await secondReplica.acquireCapacity(capacityProvider);
    assert.ok(secondLease, 'capacity should be released for another replica');
    await secondLease.release();
    assert.equal(
      await firstReplica.acquireCapacity(capacityProvider),
      null,
      'both replicas must share one provider quota window'
    );

    await firstReplica.recordFailure(breakerProvider, 'network');
    assert.equal(await secondReplica.allowRequest(breakerProvider), true);
    await secondReplica.recordFailure(breakerProvider, 'timeout');
    assert.equal(await firstReplica.allowRequest(breakerProvider), false);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(await firstReplica.allowRequest(breakerProvider), true);
    assert.equal(await secondReplica.allowRequest(breakerProvider), false);
    await firstReplica.recordSuccess(breakerProvider);
    assert.equal(await secondReplica.allowRequest(breakerProvider), true);

    console.log('PASS: shared AI quota, concurrency, circuit-open, and single-probe behavior.');
  } finally {
    await redis.del([
      `calassist:ai:capacity:${capacityProvider}`,
      `calassist:ai:quota:${capacityProvider}`,
      `calassist:ai:circuit:${breakerProvider}:failures`,
      `calassist:ai:circuit:${breakerProvider}:open`,
      `calassist:ai:circuit:${breakerProvider}:probe`,
    ]);
    await redis.quit();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'AI protection smoke test failed.');
  process.exitCode = 1;
});

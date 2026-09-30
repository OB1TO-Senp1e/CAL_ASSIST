import { RedisClientType } from 'redis';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { MetricsService } from '../../metrics/metrics.service';

describe('RedisThrottlerStorage', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  it('shares the atomic counter key across independent API instances', async () => {
    const hitsByKey = new Map<string, number>();
    const evalMock = jest.fn(async (_script: string, options: { keys: string[] }) => {
      const [counterKey] = options.keys;
      const hits = (hitsByKey.get(counterKey) ?? 0) + 1;
      hitsByKey.set(counterKey, hits);
      return [hits, 60_000, hits > 2 ? 1 : 0, hits > 2 ? 60_000 : 0];
    });
    const redis = {
      eval: evalMock,
    } as unknown as RedisClientType;

    const instanceA = new RedisThrottlerStorage(redis, metrics);
    const instanceB = new RedisThrottlerStorage(redis, metrics);

    await expect(
      instanceA.increment('client', 60_000, 2, 60_000, 'default')
    ).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
    await expect(
      instanceB.increment('client', 60_000, 2, 60_000, 'default')
    ).resolves.toMatchObject({
      totalHits: 2,
      isBlocked: false,
    });
    await expect(
      instanceA.increment('client', 60_000, 2, 60_000, 'default')
    ).resolves.toMatchObject({
      totalHits: 3,
      isBlocked: true,
    });
    expect(evalMock).toHaveBeenCalledTimes(3);
    expect(evalMock.mock.calls[0][1].keys).toEqual(evalMock.mock.calls[1][1].keys);
  });

  it('fails open to a per-process limiter and records Redis failures', async () => {
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    } as unknown as RedisClientType;
    const storageA = new RedisThrottlerStorage(redis, metrics);
    const storageB = new RedisThrottlerStorage(redis, metrics);

    await expect(storageA.increment('client', 60_000, 2, 60_000, 'default')).resolves.toMatchObject(
      { totalHits: 1, isBlocked: false }
    );
    await expect(storageA.increment('client', 60_000, 2, 60_000, 'default')).resolves.toMatchObject(
      { totalHits: 2, isBlocked: false }
    );
    await expect(storageA.increment('client', 60_000, 2, 60_000, 'default')).resolves.toMatchObject(
      { totalHits: 3, isBlocked: true }
    );
    await expect(storageB.increment('client', 60_000, 2, 60_000, 'default')).resolves.toMatchObject(
      { totalHits: 1, isBlocked: false }
    );
    const fallbackMetric = await metrics.throttlerRedisFallbacksTotal.get();
    expect(fallbackMetric.values[0].value).toBe(4);
  });
});

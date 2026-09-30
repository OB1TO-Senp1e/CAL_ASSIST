import { ConfigService } from '@nestjs/config';
import { redisClientOptions } from './redis.module';

describe('redisClientOptions', () => {
  it('supports managed TLS Redis URLs and bounded exponential reconnect backoff', () => {
    const config = new ConfigService({
      REDIS_URL: 'rediss://redis.example.test:6380',
      REDIS_CONNECT_TIMEOUT_MS: '2500',
    });
    const options = redisClientOptions(config);

    expect(options.url).toBe('rediss://redis.example.test:6380');
    expect(options.disableOfflineQueue).toBe(true);
    expect(options.socket?.connectTimeout).toBe(2500);
    const reconnectStrategy = options.socket?.reconnectStrategy;
    expect(typeof reconnectStrategy).toBe('function');
    if (typeof reconnectStrategy !== 'function') throw new Error('Reconnect strategy missing');
    expect(reconnectStrategy(0, new Error('test retry'))).toBeGreaterThanOrEqual(250);
    expect(reconnectStrategy(8, new Error('test retry'))).toBeLessThanOrEqual(30000);
  });

  it('falls back to REDIS_HOST and REDIS_PORT for local development', () => {
    const config = new ConfigService({ REDIS_HOST: 'redis.local', REDIS_PORT: '6381' });

    expect(redisClientOptions(config).url).toBe('redis://redis.local:6381');
  });

  it('rejects invalid connect timeouts', () => {
    expect(() => redisClientOptions(new ConfigService({ REDIS_CONNECT_TIMEOUT_MS: '0' }))).toThrow(
      /REDIS_CONNECT_TIMEOUT_MS/
    );
  });
});

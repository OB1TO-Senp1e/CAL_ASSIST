import { Global, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
type RedisClient = ReturnType<typeof createClient>;

export function redisClientOptions(
  config: ConfigService
): NonNullable<Parameters<typeof createClient>[0]> {
  const url =
    config.get<string>('REDIS_URL') ||
    `redis://${config.get<string>('REDIS_HOST', 'localhost')}:${config.get<number>('REDIS_PORT', 6379)}`;
  const connectTimeout = Number(config.get<string>('REDIS_CONNECT_TIMEOUT_MS', '5000'));
  if (!Number.isSafeInteger(connectTimeout) || connectTimeout < 100) {
    throw new Error('REDIS_CONNECT_TIMEOUT_MS must be an integer of at least 100');
  }

  return {
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout,
      reconnectStrategy: (retries) =>
        Math.min(250 * 2 ** Math.min(retries, 7) + Math.floor(Math.random() * 250), 30000),
    },
  };
}

@Injectable()
export class RedisClientService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisClientService.name);
  readonly client: RedisClient;

  constructor(config: ConfigService) {
    this.client = createClient(redisClientOptions(config));
    this.client.on('error', (error) => this.logger.error(`Redis client error (${error.name})`));
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}

@Global()
@Module({
  providers: [
    RedisClientService,
    {
      provide: REDIS_CLIENT,
      inject: [RedisClientService],
      useFactory: async (service: RedisClientService): Promise<RedisClient> => {
        await service.client.connect();
        return service.client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { PrismaService } from '../common/services/prisma.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return { database: { status: 'up', message: 'connected' } };
        } catch {
          throw new HealthCheckError('Database health check failed', {
            database: { status: 'down', message: 'disconnected' },
          });
        }
      },
    ]);
  }

  @Get('live')
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([this.checkDatabase.bind(this)]);
  }

  @Get('deps')
  async dependencies(): Promise<{
    status: 'ok' | 'degraded';
    database: { status: 'up' | 'down' };
    redis: { status: 'up' | 'down' };
  }> {
    const [databaseUp, redisUp] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis
        .ping()
        .then(() => true)
        .catch(() => false),
    ]);

    return {
      status: databaseUp && redisUp ? 'ok' : 'degraded',
      database: { status: databaseUp ? 'up' : 'down' },
      redis: { status: redisUp ? 'up' : 'down' },
    };
  }

  private async checkDatabase(): Promise<{ database: { status: 'up'; message: string } }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up', message: 'connected' } };
    } catch {
      throw new HealthCheckError('Database health check failed', {
        database: { status: 'down', message: 'disconnected' },
      });
    }
  }
}

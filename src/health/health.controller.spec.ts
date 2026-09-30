import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { PrismaService } from '../common/services/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let queryRaw: jest.Mock;
  let ping: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    ping = jest.fn().mockResolvedValue('PONG');
    const module = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
        { provide: REDIS_CLIENT, useValue: { ping } },
      ],
    }).compile();
    controller = module.get(HealthController);
  });

  it('keeps liveness independent of database and Redis', async () => {
    await expect(controller.liveness()).resolves.toMatchObject({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(ping).not.toHaveBeenCalled();
  });

  it('reports ready when Postgres responds without checking Redis', async () => {
    await expect(controller.readiness()).resolves.toMatchObject({ status: 'ok' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(ping).not.toHaveBeenCalled();
  });

  it('reports degraded dependencies when Redis is unavailable without failing readiness', async () => {
    ping.mockRejectedValue(new Error('redis unavailable'));
    await expect(controller.readiness()).resolves.toMatchObject({ status: 'ok' });
    await expect(controller.dependencies()).resolves.toEqual({
      status: 'degraded',
      database: { status: 'up' },
      redis: { status: 'down' },
    });
  });

  it('reports non-ready when Postgres is unavailable', async () => {
    const failingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockRejectedValue(new Error('database unavailable')) },
        },
        { provide: REDIS_CLIENT, useValue: { ping } },
      ],
    }).compile();

    await expect(failingModule.get(HealthController).readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });
});

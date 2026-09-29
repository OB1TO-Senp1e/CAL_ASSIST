import { JobHandlerRegistry } from './job-handlers';
import { JobWorkerService } from './job-worker.service';
import { ClaimedOutboxJob } from '../outbox/outbox.types';

const NOW = new Date('2026-09-29T10:00:00Z');

function makeJob(overrides: Partial<ClaimedOutboxJob> = {}): ClaimedOutboxJob {
  return {
    id: 'job-1',
    userId: 'user-1',
    jobType: 'REMINDER',
    payload: { meetingId: 'm-1' },
    attempts: 1,
    maxAttempts: 3,
    ...overrides,
  };
}

function makeConfig(values: Record<string, string>) {
  return { get: (key: string, fallback?: string) => values[key] ?? fallback } as never;
}

function makeOutbox() {
  return {
    claimReady: jest.fn(),
    ack: jest.fn().mockResolvedValue(undefined),
    nack: jest.fn().mockResolvedValue('PENDING'),
  };
}

describe('JobWorkerService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('enablement (default OFF: the outbox table needs the C-01 migration first)', () => {
    it('does not poll when COORDINATION_WORKER_ENABLED is unset', async () => {
      const outbox = makeOutbox();
      const worker = new JobWorkerService(
        outbox as never,
        new JobHandlerRegistry(),
        makeConfig({})
      );

      worker.onModuleInit();
      await jest.advanceTimersByTimeAsync(60_000);

      expect(outbox.claimReady).not.toHaveBeenCalled();
      await worker.onModuleDestroy();
    });

    it('polls on the configured interval once enabled', async () => {
      const outbox = makeOutbox();
      outbox.claimReady.mockResolvedValue(null);
      const worker = new JobWorkerService(
        outbox as never,
        new JobHandlerRegistry(),
        makeConfig({ COORDINATION_WORKER_ENABLED: 'true', COORDINATION_WORKER_POLL_MS: '250' })
      );

      worker.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(250);

      expect(outbox.claimReady.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Lease length is the configured leaseSeconds as ms.
      expect(outbox.claimReady).toHaveBeenCalledWith(expect.any(Date), 60_000);
      await worker.onModuleDestroy();
    });
  });

  describe('cycle', () => {
    it('acks a claimed job whose handler resolves', async () => {
      const outbox = makeOutbox();
      const handlers = new JobHandlerRegistry();
      const handled = jest.fn().mockResolvedValue(undefined);
      handlers.register('REMINDER', handled);
      outbox.claimReady.mockResolvedValueOnce(makeJob()).mockResolvedValue(null);
      const worker = new JobWorkerService(outbox as never, handlers, makeConfig({}));

      const processed = await worker.cycle();

      expect(processed).toBe(1);
      expect(handled).toHaveBeenCalledWith(makeJob());
      expect(outbox.ack).toHaveBeenCalledWith('job-1');
      expect(outbox.nack).not.toHaveBeenCalled();
    });

    it('nacks with a stable reason when the handler type is not registered', async () => {
      const outbox = makeOutbox();
      outbox.claimReady
        .mockResolvedValueOnce(makeJob({ jobType: 'FOLLOWUP' }))
        .mockResolvedValue(null);
      const worker = new JobWorkerService(
        outbox as never,
        new JobHandlerRegistry(),
        makeConfig({})
      );

      await worker.cycle();

      expect(outbox.ack).not.toHaveBeenCalled();
      expect(outbox.nack).toHaveBeenCalledWith(
        'job-1',
        'NO_HANDLER_FOR_FOLLOWUP',
        expect.any(Date)
      );
      // Linear back-off: retrySeconds * attempts (30s * 1).
      const retryAt = outbox.nack.mock.calls[0][2] as Date;
      expect(retryAt.getTime() - NOW.getTime()).toBe(30_000);
    });

    it('nacks with the handler error when it throws', async () => {
      const outbox = makeOutbox();
      const handlers = new JobHandlerRegistry();
      handlers.register('REMINDER', jest.fn().mockRejectedValue(new Error('provider 503')));
      outbox.claimReady.mockResolvedValueOnce(makeJob({ attempts: 2 })).mockResolvedValue(null);
      const worker = new JobWorkerService(outbox as never, handlers, makeConfig({}));

      await worker.cycle();

      expect(outbox.nack).toHaveBeenCalledWith('job-1', 'provider 503', expect.any(Date));
      const retryAt = outbox.nack.mock.calls[0][2] as Date;
      expect(retryAt.getTime() - NOW.getTime()).toBe(60_000); // 30s * 2 attempts
    });

    it('stops claiming at batchSize', async () => {
      const outbox = makeOutbox();
      outbox.claimReady.mockResolvedValue(makeJob());
      const worker = new JobWorkerService(
        outbox as never,
        new JobHandlerRegistry(),
        makeConfig({ COORDINATION_WORKER_BATCH_SIZE: '3' })
      );

      const processed = await worker.cycle();

      expect(processed).toBe(3);
      expect(outbox.claimReady).toHaveBeenCalledTimes(3);
    });

    it('a nack failure does not escape the cycle', async () => {
      const outbox = makeOutbox();
      outbox.nack.mockRejectedValue(new Error('db gone'));
      outbox.claimReady.mockResolvedValueOnce(makeJob()).mockResolvedValue(null);
      const worker = new JobWorkerService(
        outbox as never,
        new JobHandlerRegistry(),
        makeConfig({})
      );

      await expect(worker.cycle()).resolves.toBe(1);
    });

    it('onModuleDestroy stops the loop', async () => {
      const outbox = makeOutbox();
      let claims = 0;
      outbox.claimReady.mockImplementation(async () => {
        claims += 1;
        return null;
      });
      const worker = new JobWorkerService(
        outbox as never,
        new JobHandlerRegistry(),
        makeConfig({ COORDINATION_WORKER_ENABLED: 'true', COORDINATION_WORKER_POLL_MS: '250' })
      );

      worker.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      await worker.onModuleDestroy();
      const afterStop = claims;
      await jest.advanceTimersByTimeAsync(5_000);

      expect(claims).toBe(afterStop);
      expect(claims).toBeGreaterThan(0);
    });
  });

  describe('settings coercion (D2)', () => {
    it('rejects an out-of-range poll interval at construction', () => {
      expect(
        () =>
          new JobWorkerService(
            makeOutbox() as never,
            new JobHandlerRegistry(),
            makeConfig({ COORDINATION_WORKER_POLL_MS: '1' })
          )
      ).toThrow();
    });

    it('accepts the documented defaults when no env is set', () => {
      expect(
        () => new JobWorkerService(makeOutbox() as never, new JobHandlerRegistry(), makeConfig({}))
      ).not.toThrow();
    });
  });
});

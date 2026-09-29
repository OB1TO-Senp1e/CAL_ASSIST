import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OutboxJobRow } from './outbox.types';
import { OutboxService } from './outbox.service';

function makeRow(overrides: Partial<OutboxJobRow> = {}): OutboxJobRow {
  const now = new Date('2026-09-29T10:00:00Z');
  return {
    id: 'job-1',
    userId: 'user-1',
    jobType: 'REMINDER',
    dedupeKey: null,
    payload: '{"a":1}',
    status: 'PENDING',
    availableAt: now,
    lockedUntil: null,
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeStore() {
  return {
    enqueue: jest.fn().mockResolvedValue({ row: makeRow(), deduped: false }),
    claimOne: jest.fn(),
    ack: jest.fn(),
    nack: jest.fn().mockResolvedValue('PENDING'),
    findOwned: jest.fn(),
    listOwned: jest.fn().mockResolvedValue([]),
    statusCounts: jest.fn().mockResolvedValue({ PENDING: 0, CLAIMED: 0, COMPLETED: 0, FAILED: 0 }),
  };
}

describe('OutboxService', () => {
  describe('enqueue', () => {
    it('serializes the payload and defaults availableAt to now', async () => {
      const store = makeStore();
      const service = new OutboxService(store as never);

      const result = await service.enqueue('user-1', {
        jobType: 'REMINDER',
        payload: { meetingId: 'm-1' },
        maxAttempts: 3,
      });

      expect(store.enqueue).toHaveBeenCalledWith({
        userId: 'user-1',
        jobType: 'REMINDER',
        dedupeKey: null,
        payload: JSON.stringify({ meetingId: 'm-1' }),
        availableAt: expect.any(Date),
        maxAttempts: 3,
      });
      expect(result).toEqual({ id: 'job-1', status: 'PENDING', deduped: false });
    });

    it('maps the zod nullish dedupe key to a SQL null', async () => {
      const store = makeStore();
      const service = new OutboxService(store as never);

      await service.enqueue('user-1', {
        jobType: 'REMINDER',
        dedupeKey: 'meeting-9:24h',
        payload: {},
        maxAttempts: 3,
      });

      expect(store.enqueue.mock.calls[0][0].dedupeKey).toBe('meeting-9:24h');
    });

    it('rejects a job type outside the enum (defense-in-depth above Zod)', async () => {
      const service = new OutboxService(makeStore() as never);

      await expect(
        service.enqueue('user-1', {
          jobType: 'NOT_A_JOB' as never,
          payload: {},
          maxAttempts: 3,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('worker passthroughs', () => {
    it('claimReady/ack/nack reach the store unchanged', async () => {
      const store = makeStore();
      const now = new Date();
      const service = new OutboxService(store as never);

      await service.claimReady(now, 60_000);
      await service.ack('job-1');
      await service.nack('job-1', 'boom', now);

      expect(store.claimOne).toHaveBeenCalledWith(now, 60_000);
      expect(store.ack).toHaveBeenCalledWith('job-1');
      expect(store.nack).toHaveBeenCalledWith('job-1', 'boom', now);
    });
  });

  describe('reads', () => {
    it("404s a job id that is not the caller's (and hides that it exists)", async () => {
      const store = makeStore();
      store.findOwned.mockResolvedValue(null);
      const service = new OutboxService(store as never);

      await expect(service.getOwnedJob('user-1', 'other-users-job')).rejects.toThrow(
        NotFoundException
      );
    });

    it('strips userId and raw payload from the view', async () => {
      const store = makeStore();
      store.findOwned.mockResolvedValue(makeRow());
      const service = new OutboxService(store as never);

      const view = await service.getOwnedJob('user-1', 'job-1');

      expect(view).not.toHaveProperty('userId');
      expect(view).not.toHaveProperty('payload');
      expect(view.id).toBe('job-1');
    });

    it('clamps the list limit into [1, 100]', async () => {
      const store = makeStore();
      const service = new OutboxService(store as never);

      await service.listJobs('user-1', 5000);
      await service.listJobs('user-1', -3);

      expect(store.listOwned.mock.calls[0][1]).toBe(100);
      expect(store.listOwned.mock.calls[1][1]).toBe(1);
    });
  });
});

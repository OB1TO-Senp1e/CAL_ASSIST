import { CoordinationController } from './coordination.controller';
import { OutboxService } from './outbox/outbox.service';

function makeService() {
  return {
    enqueue: jest.fn().mockResolvedValue({ id: 'job-1', status: 'PENDING', deduped: false }),
    listJobs: jest.fn().mockResolvedValue([]),
    counts: jest.fn().mockResolvedValue({ PENDING: 0, CLAIMED: 0, COMPLETED: 0, FAILED: 0 }),
    getOwnedJob: jest.fn(),
  };
}

const req = { user: { id: 'user-1' } };

describe('CoordinationController', () => {
  it('takes the owner from the authenticated request, never from the body', async () => {
    const service = makeService();
    const controller = new CoordinationController(service as never);

    await controller.enqueueJob(req, { jobType: 'REMINDER', payload: {}, maxAttempts: 3 });

    expect(service.enqueue).toHaveBeenCalledWith('user-1', {
      jobType: 'REMINDER',
      payload: {},
      maxAttempts: 3,
    });
  });

  it('parses the limit query, falling back to 20 for garbage', async () => {
    const service = makeService();
    const controller = new CoordinationController(service as never);

    await controller.listJobs(req, '5');
    await controller.listJobs(req, 'abc');
    await controller.listJobs(req, undefined);

    expect(service.listJobs).toHaveBeenNthCalledWith(1, 'user-1', 5);
    expect(service.listJobs).toHaveBeenNthCalledWith(2, 'user-1', 20);
    expect(service.listJobs).toHaveBeenNthCalledWith(3, 'user-1', 20);
  });

  it('passes id + owner to the single-job read', async () => {
    const service = makeService();
    const controller = new CoordinationController(service as never);
    service.getOwnedJob.mockResolvedValue({ id: 'job-9' });

    await expect(controller.getJob(req, 'job-9')).resolves.toEqual({ id: 'job-9' });
    expect(service.getOwnedJob).toHaveBeenCalledWith('user-1', 'job-9');
  });
});

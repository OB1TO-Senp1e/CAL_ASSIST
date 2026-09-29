import { Injectable, Logger } from '@nestjs/common';
import { OutboxJobType } from '../coordination.types';
import { ClaimedOutboxJob } from '../outbox/outbox.types';

/** A job handler. Resolve = ack; throw = nack (the worker records the message). */
export type JobHandler = (job: ClaimedOutboxJob) => Promise<void>;

/**
 * Dispatch table: job type → handler, registered by later control points
 * (reminder delivery, follow-up creation, channel renewal). C-01 intentionally
 * registers **no** handlers: the substrate is shipped first, and claiming a
 * type with no handler is a nack with a stable reason, never a crash. That
 * makes handler rollout order-independent — a half-registered phase cannot
 * lose jobs, it can only delay them through retries.
 */
@Injectable()
export class JobHandlerRegistry {
  private readonly logger = new Logger(JobHandlerRegistry.name);
  private readonly handlers = new Map<OutboxJobType, JobHandler>();

  register(jobType: OutboxJobType, handler: JobHandler): void {
    if (this.handlers.has(jobType)) {
      this.logger.warn(`Overriding handler for job type ${jobType}`);
    }
    this.handlers.set(jobType, handler);
  }

  get(jobType: string): JobHandler | undefined {
    return this.handlers.get(jobType as OutboxJobType);
  }

  has(jobType: string): boolean {
    return this.handlers.has(jobType as OutboxJobType);
  }
}

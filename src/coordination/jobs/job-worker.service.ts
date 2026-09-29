import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CoordinationWorkerSettings,
  CoordinationWorkerSettingsSchema,
} from '../coordination.types';
import { OutboxService } from '../outbox/outbox.service';
import { ClaimedOutboxJob } from '../outbox/outbox.types';
import { JobHandlerRegistry } from './job-handlers';

/**
 * The outbox poll loop. **Deliberately not** `@nestjs/schedule`/`@Cron` (D1
 * rejected both) — it is a single self-scheduled `setTimeout`, which keeps the
 * module dependency-free and the scheduling visible.
 *
 * Multi-replica safety comes from the store's claim transaction, not from
 * this file: `API_REPLICA_COUNT` replicas may each run a worker and each job
 * is still claimed by exactly one of them (`FOR UPDATE SKIP LOCKED`, R10).
 *
 * **Disabled by default.** `COORDINATION_WORKER_ENABLED` must be `true` before
 * the loop starts, because polling queries `"OutboxJob"`, a table that only
 * exists once the C-01 migration has been deployed. This also honours D6: the
 * worker adds no second pool — it shares `PrismaService`'s budgeted pool, so
 * `WORKER_POOL_CONNECTIONS` stays `0` for this design.
 */
@Injectable()
export class JobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobWorkerService.name);
  private readonly settings: CoordinationWorkerSettings;
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;
  private running: Promise<unknown> | null = null;

  constructor(
    private readonly outbox: OutboxService,
    private readonly handlers: JobHandlerRegistry,
    config: ConfigService
  ) {
    this.settings = CoordinationWorkerSettingsSchema.parse({
      enabled: config.get<string>('COORDINATION_WORKER_ENABLED', 'false'),
      pollMs: config.get<string>('COORDINATION_WORKER_POLL_MS', '5000'),
      batchSize: config.get<string>('COORDINATION_WORKER_BATCH_SIZE', '5'),
      leaseSeconds: config.get<string>('COORDINATION_WORKER_LEASE_SECONDS', '60'),
      retrySeconds: config.get<string>('COORDINATION_WORKER_RETRY_SECONDS', '30'),
    });
  }

  onModuleInit(): void {
    if (this.settings.enabled !== 'true') {
      this.logger.log('Coordination worker disabled (COORDINATION_WORKER_ENABLED != true)');
      return;
    }
    this.stopping = false;
    this.scheduleNext(0);
    this.logger.log(
      `Coordination worker started (poll ${this.settings.pollMs}ms, ` +
        `batch ${this.settings.batchSize}, lease ${this.settings.leaseSeconds}s)`
    );
  }

  /**
   * Stop taking new work and wait for the in-flight cycle. A handler killed
   * mid-flight is not lost: its row's lease lapses and another replica
   * re-claims it (`claimOne`'s CLAIMED arm).
   */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.running?.catch(() => undefined);
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.running = this.cycle()
        .catch((error: unknown) => {
          this.logger.error(`Outbox cycle failed: ${String(error)}`);
        })
        .finally(() => {
          this.running = null;
          this.scheduleNext(this.settings.pollMs);
        });
    }, delayMs);
    this.timer.unref();
  }

  /**
   * One poll cycle: claim up to `batchSize` jobs back to back and dispatch
   * each. Returns the number of jobs processed. Extracted from the timer so
   * specs can drive a cycle without fake timers.
   */
  async cycle(): Promise<number> {
    const leaseMs = this.settings.leaseSeconds * 1000;
    let processed = 0;
    for (let i = 0; i < this.settings.batchSize; i += 1) {
      if (this.stopping) break;
      const job = await this.outbox.claimReady(new Date(), leaseMs);
      if (!job) break;
      processed += 1;
      await this.dispatch(job.id, job.jobType, job.attempts, () => this.runHandler(job));
    }
    return processed;
  }

  private async runHandler(job: ClaimedOutboxJob): Promise<void> {
    const handler = this.handlers.get(job.jobType);
    if (!handler) {
      throw new Error(`NO_HANDLER_FOR_${job.jobType}`);
    }
    await handler(job);
  }

  /**
   * ack on success; nack with a linear retry back-off on failure. The nack
   * itself must never throw out of the cycle — a queue that cannot be
   * written to is logged and the loop continues (the lease lapses anyway, so
   * the job is recoverable).
   */
  private async dispatch(
    id: string,
    jobType: string,
    attempts: number,
    run: () => Promise<void>
  ): Promise<void> {
    try {
      await run();
      await this.outbox.ack(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const backOffMs = this.settings.retrySeconds * 1000 * Math.max(attempts, 1);
      try {
        const status = await this.outbox.nack(id, message, new Date(Date.now() + backOffMs));
        this.logger.warn(
          `Job ${id} (${jobType}) failed -> ${status}: ${message}${
            status === 'FAILED' ? ' (attempts exhausted)' : ''
          }`
        );
      } catch (nackError) {
        this.logger.error(`Job ${id} failed AND nack failed: ${String(nackError)}`);
      }
    }
  }
}

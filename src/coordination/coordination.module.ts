import { Module } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { CoordinationController } from './coordination.controller';
import { JobHandlerRegistry } from './jobs/job-handlers';
import { JobWorkerService } from './jobs/job-worker.service';
import { OutboxService } from './outbox/outbox.service';
import { OutboxStore } from './outbox/outbox.store';

/**
 * The coordination substrate (C-01): outbox + worker only. `PrismaService` is
 * `@Global()`, but listing it mirrors `permission.module.ts` so the module
 * reads consistently with the house pattern. The worker is registered
 * unconditionally; it self-disables unless `COORDINATION_WORKER_ENABLED=true`
 * (the outbox table only exists once the C-01 migration is deployed).
 */
@Module({
  imports: [],
  controllers: [CoordinationController],
  providers: [OutboxStore, OutboxService, JobHandlerRegistry, JobWorkerService, PrismaService],
  exports: [OutboxService, JobHandlerRegistry],
})
export class CoordinationModule {}

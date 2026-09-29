import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { EnqueueCoordinationJobSchema, EnqueueCoordinationJob } from './coordination.types';
import { OutboxService } from './outbox/outbox.service';
import { CoordinationJobView, OutboxStatusCounts } from './outbox/outbox.types';

/**
 * Thin read/submit surface over the outbox (D2: every body passes through
 * `ZodValidationPipe`; ownership is re-checked in the service/store, never
 * trusted from the route). Deliberately NO delete/patch endpoints: cancelling
 * or force-retrying a job is a policy decision owned by a later control point
 * (`§9` autonomy checks + audit record must gate it), not a substrate verb.
 */
@Controller('coordination')
@UseGuards(JwtAuthGuard)
export class CoordinationController {
  constructor(private readonly outbox: OutboxService) {}

  @Post('jobs')
  async enqueueJob(
    @Request() req,
    @Body(new ZodValidationPipe(EnqueueCoordinationJobSchema)) body: EnqueueCoordinationJob
  ) {
    return this.outbox.enqueue(req.user.id, body);
  }

  @Get('jobs')
  async listJobs(@Request() req, @Query('limit') limit?: string): Promise<CoordinationJobView[]> {
    const parsed = limit === undefined ? 20 : Number(limit);
    return this.outbox.listJobs(req.user.id, Number.isSafeInteger(parsed) ? parsed : 20);
  }

  @Get('jobs/counts')
  async counts(@Request() req): Promise<OutboxStatusCounts> {
    return this.outbox.counts(req.user.id);
  }

  @Get('jobs/:id')
  async getJob(@Request() req, @Param('id') id: string): Promise<CoordinationJobView> {
    return this.outbox.getOwnedJob(req.user.id, id);
  }
}

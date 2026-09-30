import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Param,
  Patch,
  Delete,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TimeCompilerService } from './time-compiler.service';
import { SchedulingInputLoader } from './scheduling-input-loader';
import { ScheduleProposalStore } from './schedule-proposal.store';
import {
  CompileScheduleRequest,
  CompileScheduleSchema,
  CompileScheduleResponse,
} from './interfaces/time-compiler.interface';
import { ScheduleProposal } from './domain/time-compiler.types';

/**
 * Time Compiler HTTP surface.
 *
 *   POST   /api/time-compiler/compile           build a proposal, do not write
 *   POST   /api/time-compiler/compile-and-apply build a proposal and create blocks
 *   GET    /api/time-compiler/proposals         persisted proposal history
 *   GET    /api/time-compiler/proposals/:id     one proposal
 *   PATCH  /api/time-compiler/proposals/:id/apply
 *   DELETE /api/time-compiler/proposals/:id
 *
 * Input assembly lives in SchedulingInputLoader and persistence in
 * ScheduleProposalStore; both replaced inline stubs that returned empty arrays
 * and `{} as ScheduleProposal`.
 */
@Controller('time-compiler')
@UseGuards(JwtAuthGuard)
export class TimeCompilerController {
  constructor(
    private readonly timeCompilerService: TimeCompilerService,
    private readonly inputLoader: SchedulingInputLoader,
    private readonly proposalStore: ScheduleProposalStore
  ) {}

  @Post('compile')
  async compileSchedule(
    @Request() req,
    @Body() body: CompileScheduleRequest
  ): Promise<CompileScheduleResponse> {
    const request = CompileScheduleSchema.parse(body);
    const input = await this.inputLoader.load(req.user.id, request);
    const proposal = await this.timeCompilerService.compileSchedule(input);

    // Persist so the proposal is addressable by the apply route.
    await this.proposalStore.save(req.user.id, proposal, input.timezone);

    return { proposal, applied: false };
  }

  @Post('compile-and-apply')
  async compileAndApply(
    @Request() req,
    @Body() body: CompileScheduleRequest
  ): Promise<CompileScheduleResponse> {
    const request = CompileScheduleSchema.parse(body);
    const input = await this.inputLoader.load(req.user.id, request);
    const proposal = await this.timeCompilerService.compileSchedule(input);
    await this.proposalStore.save(req.user.id, proposal, input.timezone);

    // Real apply: this is what creates the TimeBlocks.
    const applied = await this.proposalStore.apply(req.user.id, proposal.id);

    return { proposal: applied, applied: true };
  }

  @Get('proposals')
  async getProposals(@Request() req, @Query('limit') limit?: string): Promise<ScheduleProposal[]> {
    const parsed = Number(limit);
    return this.proposalStore.list(req.user.id, Number.isFinite(parsed) ? parsed : 20);
  }

  @Get('proposals/:id')
  async getProposal(@Request() req, @Param('id') id: string): Promise<ScheduleProposal> {
    return this.proposalStore.get(req.user.id, id);
  }

  @Patch('proposals/:id/apply')
  async applyProposal(@Request() req, @Param('id') id: string): Promise<ScheduleProposal> {
    return this.proposalStore.apply(req.user.id, id);
  }

  /** Discard or mark a proposal without writing TimeBlocks. */
  @Patch('proposals/:id/status')
  async setProposalStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: 'APPLIED' | 'REJECTED' }
  ): Promise<ScheduleProposal> {
    const status = body?.status;
    if (status !== 'APPLIED' && status !== 'REJECTED') {
      throw new BadRequestException("status must be 'APPLIED' or 'REJECTED'");
    }
    return this.proposalStore.setStatus(req.user.id, id, status);
  }

  @Delete('proposals/:id')
  async deleteProposal(@Request() req, @Param('id') id: string): Promise<{ success: true }> {
    await this.proposalStore.remove(req.user.id, id);
    return { success: true };
  }
}

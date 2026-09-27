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
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TimeCompilerService } from './time-compiler.service';
import {
  CompileScheduleRequest,
  CompileScheduleResponse,
} from './interfaces/time-compiler.interface';
import { ScheduleProposal } from './domain/time-compiler.types';

@Controller('time-compiler')
@UseGuards(JwtAuthGuard)
export class TimeCompilerController {
  constructor(private readonly timeCompilerService: TimeCompilerService) {}

  @Post('compile')
  async compileSchedule(
    @Request() req,
    @Body() body: CompileScheduleRequest
  ): Promise<CompileScheduleResponse> {
    // Build scheduling input from user's data
    const input = await this.buildSchedulingInput(req.user.id, body);
    const proposal = await this.timeCompilerService.compileSchedule(input);

    return {
      proposal,
      applied: false,
    };
  }

  @Post('compile-and-apply')
  async compileAndApply(
    @Request() req,
    @Body() body: CompileScheduleRequest
  ): Promise<CompileScheduleResponse> {
    const input = await this.buildSchedulingInput(req.user.id, body);
    const proposal = await this.timeCompilerService.compileSchedule(input);

    // Apply the proposal (create time blocks)
    // This would call TimeBlocksService to create actual blocks
    // For now, just return the proposal

    return {
      proposal: { ...proposal, status: 'APPLIED' },
      applied: true,
    };
  }

  @Get('proposals')
  async getProposals(@Request() req): Promise<ScheduleProposal[]> {
    // Would fetch from database
    return [];
  }

  @Get('proposals/:id')
  async getProposal(@Request() req, @Param('id') id: string): Promise<ScheduleProposal | null> {
    // Would fetch from database
    return null;
  }

  @Patch('proposals/:id/apply')
  async applyProposal(@Request() req, @Param('id') id: string): Promise<ScheduleProposal> {
    // Would apply the proposal
    return {} as ScheduleProposal;
  }

  @Delete('proposals/:id')
  async deleteProposal(@Request() req, @Param('id') id: string): Promise<void> {
    // Would delete from database
  }

  private async buildSchedulingInput(
    userId: string,
    request: CompileScheduleRequest
  ): Promise<any> {
    // This would fetch tasks, events, availability, preferences from database
    // For now, return a mock structure
    return {
      userId,
      timeRange: {
        start: new Date(request.timeRange.start),
        end: new Date(request.timeRange.end),
      },
      timezone: request.timezone,
      tasks: [],
      fixedEvents: [],
      availability: [],
      constraints: [],
      preferences: {
        workingHoursStart: '09:00',
        workingHoursEnd: '17:00',
        preferredFocusBlockDuration: 90,
        maxFocusBlockDuration: 180,
        minBreakDuration: 15,
        maxDailyHours: 8,
        preferredBreakInterval: 90,
        energyPeakHours: [
          { start: '09:00', end: '11:00' },
          { start: '14:00', end: '16:00' },
        ],
        bufferBetweenTasks: 10,
        travelBufferDefault: 15,
        protectFocusTime: true,
        allowWeekendScheduling: false,
        taskOrderingStrategy: 'BALANCED',
        ...request.preferences,
      },
      existingBlocks: [],
    };
  }
}

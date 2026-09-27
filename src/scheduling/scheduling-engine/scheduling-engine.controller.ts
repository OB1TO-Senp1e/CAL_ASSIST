import { Controller, Post, Body, UseGuards, Request, Get } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import {
  SchedulingEngineService,
  ScheduleRequest,
  ScheduleResult,
} from './scheduling-engine.service';

@Controller('scheduling')
@UseGuards(JwtAuthGuard)
export class SchedulingEngineController {
  constructor(private readonly schedulingEngineService: SchedulingEngineService) {}

  @Post('generate')
  async generateSchedule(@Request() req, @Body() body: ScheduleRequest) {
    return this.schedulingEngineService.generateSchedule(req.user.id, body);
  }

  @Post('available-slots')
  async findAvailableSlots(
    @Request() req,
    @Body()
    body: {
      durationMinutes: number;
      preferredTimes?: Array<{ start: Date; end: Date }>;
    }
  ) {
    return this.schedulingEngineService.findAvailableSlots(
      req.user.id,
      body.durationMinutes,
      body.preferredTimes
    );
  }

  @Post('compile/:planId')
  async compileSchedule(@Request() req, @Body() body: { timeBlocks: any[] }) {
    return this.schedulingEngineService.compileSchedule(
      req.user.id,
      req.params.planId,
      body.timeBlocks
    );
  }
}

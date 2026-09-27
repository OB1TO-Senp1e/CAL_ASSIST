import { Controller, Get, Post, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RealityEngineService } from './reality-engine.service';
import { RealityCheckInput } from './reality.types';

@Controller('reality')
@UseGuards(JwtAuthGuard)
export class RealityEngineController {
  constructor(private readonly realityEngineService: RealityEngineService) {}

  @Post('check')
  async realityCheck(@Request() req, @Body() body: Partial<RealityCheckInput>) {
    return this.realityEngineService.runRealityCheck({
      userId: req.user.id,
      includeResolved: false,
      ...body,
    });
  }

  @Get('check')
  async quickRealityCheck(@Request() req) {
    return this.realityEngineService.runRealityCheck({
      userId: req.user.id,
      includeResolved: false,
    });
  }

  @Get('task/:taskId/analysis')
  async taskAnalysis(@Request() req, @Param('taskId') taskId: string) {
    return this.realityEngineService.getTaskExecutionAnalysis(req.user.id, taskId);
  }

  @Get('project/:projectId/health')
  async projectHealth(@Request() req, @Param('projectId') projectId: string) {
    return this.realityEngineService.getProjectHealth(req.user.id, projectId);
  }

  @Get('drift')
  async scheduleDrift(@Request() req, @Query('date') date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    return this.realityEngineService.getScheduleDrift(req.user.id, targetDate);
  }
}

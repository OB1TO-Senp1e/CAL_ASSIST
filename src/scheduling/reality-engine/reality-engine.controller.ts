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

  /**
   * `includeResolved` arrives as a query string, so it has to be coerced: the
   * literal "false" is truthy in JS, and hard-coding `false` here made the flag
   * unreachable, so acknowledged/resolved deviations could never be reviewed.
   */
  @Get('check')
  async quickRealityCheck(
    @Request() req,
    @Query('includeResolved') includeResolved?: string,
    @Query('entityTypes') entityTypes?: string,
  ) {
    return this.realityEngineService.runRealityCheck({
      userId: req.user.id,
      includeResolved: String(includeResolved).toLowerCase() === 'true',
      ...(entityTypes
        ? {
            entityTypes: entityTypes
              .split(',')
              .map((t) => t.trim().toUpperCase())
              .filter((t) =>
                ['TASK', 'EVENT', 'GOAL', 'PROJECT', 'COMMITMENT', 'TIME_BLOCK'].includes(t),
              ) as RealityCheckInput['entityTypes'],
          }
        : {}),
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

  /**
   * Acknowledge / resolve / reopen a deviation.
   *
   * These routes did not exist before, and the service hard-coded
   * `acknowledgedAt: null`. Deviation ids are now deterministic
   * (`dev_<ENTITY>_<entityId>_<type>`), so an id shown in the panel stays
   * addressable on the next request.
   */
  @Post('deviations/:id/acknowledge')
  async acknowledgeDeviation(@Request() req, @Param('id') id: string) {
    const state = await this.realityEngineService.acknowledgeDeviation(req.user.id, id);
    return { success: true, deviationId: id, acknowledgedAt: state.acknowledgedAt };
  }

  @Post('deviations/:id/resolve')
  async resolveDeviation(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { resolution?: string },
  ) {
    const state = await this.realityEngineService.resolveDeviation(
      req.user.id,
      id,
      body?.resolution,
    );
    return { success: true, deviationId: id, resolvedAt: state.resolvedAt };
  }

  @Post('deviations/:id/reopen')
  async reopenDeviation(@Request() req, @Param('id') id: string) {
    await this.realityEngineService.reopenDeviation(req.user.id, id);
    return { success: true };
  }

  /** Accept or reject a recommendation produced by a reality check. */
  @Post('recommendations/:id/status')
  async setRecommendationStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: 'ACCEPTED' | 'REJECTED' },
  ) {
    const state = await this.realityEngineService.setRecommendationStatus(
      req.user.id,
      id,
      body?.status,
    );
    return { success: true, recommendationId: id, status: state.status };
  }
}

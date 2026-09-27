import { Controller, Post, Body, UseGuards, Request, Get, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PlanningEngineService } from './planning-engine.service';
import { ParsedIntent } from '../intent/interfaces/intent.interface';

@Controller('ai/planning')
@UseGuards(JwtAuthGuard)
export class PlanningEngineController {
  constructor(private readonly planningEngineService: PlanningEngineService) {}

  @Post('from-intent')
  async planFromIntent(@Request() req, @Body() body: { intent: ParsedIntent }) {
    return this.planningEngineService.createPlanFromIntent(req.user.id, body.intent);
  }

  @Post('decompose/:goalId')
  async decomposeGoal(@Request() req, @Param('goalId') goalId: string) {
    return this.planningEngineService.decomposeGoal(req.user.id, goalId);
  }
}

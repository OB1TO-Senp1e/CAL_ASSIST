import { Controller, Get, Post, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ProactiveAssistantService } from './proactive-assistant.service';
import { ProactiveCheckInput } from './proactive.types';

@Controller('proactive')
@UseGuards(JwtAuthGuard)
export class ProactiveAssistantController {
  constructor(private readonly proactiveAssistantService: ProactiveAssistantService) {}

  @Post('check')
  async runProactiveCheck(@Request() req, @Body() body: ProactiveCheckInput) {
    return this.proactiveAssistantService.runProactiveCheck({ ...body, userId: req.user.id });
  }

  @Get('check')
  async quickCheck(@Request() req) {
    return this.proactiveAssistantService.runProactiveCheck({ userId: req.user.id, limit: 10 });
  }

  @Get('interventions')
  async getActiveInterventions(@Request() req) {
    return this.proactiveAssistantService.getActiveInterventions(req.user.id);
  }

  @Post('interventions/:id/acknowledge')
  async acknowledgeIntervention(@Request() req, @Param('id') id: string) {
    await this.proactiveAssistantService.acknowledgeIntervention(req.user.id, id);
    return { success: true };
  }

  @Post('interventions/:id/dismiss')
  async dismissIntervention(@Request() req, @Param('id') id: string) {
    await this.proactiveAssistantService.dismissIntervention(req.user.id, id);
    return { success: true };
  }

  @Post('interventions/:id/snooze')
  async snoozeIntervention(@Request() req, @Param('id') id: string, @Body() body: { minutes: number }) {
    await this.proactiveAssistantService.snoozeIntervention(req.user.id, id, body.minutes);
    return { success: true };
  }
}
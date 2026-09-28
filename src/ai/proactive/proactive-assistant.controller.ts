import { Controller, Get, Post, Body, UseGuards, Request, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ProactiveAssistantService } from './proactive-assistant.service';
import { ProactiveCheckInput, UserProactivePreferences } from './proactive.types';

/**
 * Proactive assistant HTTP surface.
 *
 *   POST /check                        run a full proactive check
 *   GET  /check                        quick check with defaults
 *   GET  /interventions                active intervention feed
 *   POST /interventions/:id/acknowledge|dismiss|snooze
 *   GET  /preferences                  proactive preferences
 *   POST /preferences                  update proactive preferences
 *
 * The three intervention actions now return the updated intervention, and the
 * preference routes were missing entirely.
 */
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
    const intervention = await this.proactiveAssistantService.acknowledgeIntervention(
      req.user.id,
      id,
    );
    return { success: true, intervention };
  }

  @Post('interventions/:id/dismiss')
  async dismissIntervention(@Request() req, @Param('id') id: string) {
    const intervention = await this.proactiveAssistantService.dismissIntervention(
      req.user.id,
      id,
    );
    return { success: true, intervention };
  }

  @Post('interventions/:id/snooze')
  async snoozeIntervention(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { minutes?: number },
  ) {
    const intervention = await this.proactiveAssistantService.snoozeIntervention(
      req.user.id,
      id,
      body?.minutes ?? 30,
    );
    return { success: true, intervention };
  }

  @Get('preferences')
  async getPreferences(@Request() req): Promise<UserProactivePreferences> {
    return this.proactiveAssistantService.getProactivePreferences(req.user.id);
  }

  @Post('preferences')
  async updatePreferences(
    @Request() req,
    @Body() body: Partial<UserProactivePreferences>,
  ): Promise<UserProactivePreferences> {
    return this.proactiveAssistantService.updateProactivePreferences(req.user.id, body ?? {});
  }
}

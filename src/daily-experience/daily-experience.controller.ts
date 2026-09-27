import { Controller, Get, Post, Body, UseGuards, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DailyExperienceService } from './daily-experience.service';

@Controller('daily')
@UseGuards(JwtAuthGuard)
export class DailyExperienceController {
  constructor(private readonly dailyExperienceService: DailyExperienceService) {}

  @Get('morning')
  async getMorningBriefing(
    @Request() req,
    @Query('date') date?: string,
  ) {
    const dateObj = date ? new Date(date) : new Date();
    return this.dailyExperienceService.generateMorningBriefing(req.user.id, dateObj, {
      timezone: req.user.timezone || 'UTC',
      briefingLength: 'STANDARD',
    });
  }

  @Get('current')
  async getCurrentActivity(@Request() req) {
    return this.dailyExperienceService.getCurrentActivity(req.user.id);
  }

  @Get('evening')
  async getEveningWrapup(
    @Request() req,
    @Query('date') date?: string,
  ) {
    const dateObj = date ? new Date(date) : new Date();
    return this.dailyExperienceService.generateEveningWrapup(req.user.id, dateObj, {
      timezone: req.user.timezone || 'UTC',
    });
  }

  @Get('briefing')
  async getFullBriefing(
    @Request() req,
    @Query('date') date?: string,
  ) {
    const dateObj = date ? new Date(date) : new Date();
    const [morning, current, evening] = await Promise.all([
      this.dailyExperienceService.generateMorningBriefing(req.user.id, dateObj, {
        timezone: req.user.timezone || 'UTC',
      }),
      this.dailyExperienceService.getCurrentActivity(req.user.id),
      this.dailyExperienceService.generateEveningWrapup(req.user.id, dateObj, {
        timezone: req.user.timezone || 'UTC',
      }),
    ]);

    return { morning, current, evening };
  }
}
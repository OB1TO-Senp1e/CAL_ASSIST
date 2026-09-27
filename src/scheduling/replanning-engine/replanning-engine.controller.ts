import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Param,
  Put,
  Delete,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ReplanningEngineService } from './replanning-engine.service';
import { ReplanTrigger, ReplanUrgency, CreateAutonomyPolicyInput } from './replanning.types';

@Controller('replanning')
@UseGuards(JwtAuthGuard)
export class ReplanningEngineController {
  constructor(private readonly replanningEngineService: ReplanningEngineService) {}

  @Post('options')
  async generateReplanOptions(
    @Request() req,
    @Body()
    body: {
      trigger: ReplanTrigger;
      reason: string;
      affectedEntities: Array<{
        type: 'TASK' | 'EVENT' | 'COMMITMENT' | 'GOAL';
        id: string;
        title: string;
      }>;
      urgency: ReplanUrgency;
      timeRange?: { start: string; end: string };
    }
  ) {
    return this.replanningEngineService.generateReplanOptions(req.user.id, {
      ...body,
      timeRange: body.timeRange
        ? {
            start: new Date(body.timeRange.start),
            end: new Date(body.timeRange.end),
          }
        : undefined,
    });
  }

  @Post('execute')
  async executeReplan(
    @Request() req,
    @Body()
    body: {
      replanOptions: any;
      selectedOptionId: string;
    }
  ) {
    return this.replanningEngineService.executeReplan(
      req.user.id,
      body.replanOptions,
      body.selectedOptionId
    );
  }

  @Get('suggestions')
  async getSuggestions(@Request() req, @Query('reason') reason: string) {
    return this.replanningEngineService.getReplanSuggestions(
      req.user.id,
      reason || 'General review'
    );
  }

  @Post('apply/:planId')
  async applyReplan(@Request() req, @Param('planId') planId: string) {
    return this.replanningEngineService.applyReplan(req.user.id, planId);
  }

  // Autonomy Policy endpoints
  @Get('autonomy-policies')
  async getAutonomyPolicies(@Request() req) {
    return this.replanningEngineService.getAutonomyPolicies(req.user.id);
  }

  @Post('autonomy-policies')
  async createAutonomyPolicy(@Request() req, @Body() body: CreateAutonomyPolicyInput) {
    return this.replanningEngineService.createAutonomyPolicy(req.user.id, body);
  }

  @Put('autonomy-policies/:id')
  async updateAutonomyPolicy(
    @Request() req,
    @Param('id') id: string,
    @Body() body: Partial<CreateAutonomyPolicyInput>
  ) {
    return this.replanningEngineService.updateAutonomyPolicy(req.user.id, id, body);
  }

  @Delete('autonomy-policies/:id')
  async deleteAutonomyPolicy(@Request() req, @Param('id') id: string) {
    await this.replanningEngineService.deleteAutonomyPolicy(req.user.id, id);
    return { success: true };
  }
}

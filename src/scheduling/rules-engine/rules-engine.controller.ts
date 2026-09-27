import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  UseGuards,
  Request,
  Param,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RulesEngineService } from './rules-engine.service';
import { CreateRuleInput, UpdateRuleInput, RuleType, RuleScope } from './rules.types';

@Controller('rules')
@UseGuards(JwtAuthGuard)
export class RulesEngineController {
  constructor(private readonly rulesEngineService: RulesEngineService) {}

  @Post()
  async createRule(@Request() req, @Body() body: CreateRuleInput) {
    return this.rulesEngineService.createRule(req.user.id, body);
  }

  @Get()
  async listRules(
    @Request() req,
    @Query('type') type?: RuleType,
    @Query('scope') scope?: RuleScope,
    @Query('enabled') enabled?: string
  ) {
    return this.rulesEngineService.listRules(req.user.id, {
      type,
      scope,
      enabled: enabled ? enabled === 'true' : undefined,
    });
  }

  @Get('conflicts')
  async getConflicts(@Request() req) {
    return this.rulesEngineService.getConflicts(req.user.id);
  }

  @Put('conflicts/:id/resolve')
  async resolveConflict(
    @Request() req,
    @Param('id') conflictId: string,
    @Body()
    body: {
      resolution:
        'DISABLE_FIRST' | 'DISABLE_SECOND' | 'ADJUST_PRIORITY' | 'MERGE' | 'MANUAL' | 'KEEP_BOTH';
    }
  ) {
    await this.rulesEngineService.resolveConflict(req.user.id, conflictId, body.resolution);
    return { success: true };
  }

  @Get(':id')
  async getRule(@Request() req, @Param('id') id: string) {
    return this.rulesEngineService.getRule(req.user.id, id);
  }

  @Get(':id/explain')
  async explainRule(@Request() req, @Param('id') id: string) {
    return { explanation: await this.rulesEngineService.explainRule(req.user.id, id) };
  }

  @Put(':id')
  async updateRule(
    @Request() req,
    @Param('id') id: string,
    @Body() body: Omit<UpdateRuleInput, 'id'>
  ) {
    return this.rulesEngineService.updateRule(req.user.id, { ...body, id });
  }

  @Delete(':id')
  async deleteRule(@Request() req, @Param('id') id: string) {
    await this.rulesEngineService.deleteRule(req.user.id, id);
    return { success: true };
  }

  @Post('enforce')
  async enforceRules(
    @Request() req,
    @Body() body: { input: Record<string, any>; trigger: string }
  ) {
    return this.rulesEngineService.enforceRules(req.user.id, body.input, body.trigger as any);
  }

  @Post('parse')
  async parseNaturalLanguage(
    @Request() req,
    @Body() body: { text: string; context?: Record<string, any> }
  ) {
    return this.rulesEngineService.parseNaturalLanguage(body);
  }

  @Post('from-natural-language')
  async createRuleFromNaturalLanguage(@Request() req, @Body() body: { text: string }) {
    return this.rulesEngineService.createRuleFromNaturalLanguage(req.user.id, body.text);
  }
}

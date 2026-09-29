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
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RulesEngineService } from './rules-engine.service';
import {
  CreateRuleInputSchema,
  UpdateRuleBodySchema,
  UpdateRuleBody,
  ResolveConflictInputSchema,
  ResolveConflictInput,
  EnforceRulesInputSchema,
  EnforceRulesInput,
  NaturalLanguageTextSchema,
  ParseNaturalLanguageInputSchema,
  ParseNaturalLanguageInput,
  CreateRuleInput,
  RuleType,
  RuleScope,
} from './rules.types';

@Controller('rules')
@UseGuards(JwtAuthGuard)
export class RulesEngineController {
  constructor(private readonly rulesEngineService: RulesEngineService) {}

  @Post()
  async createRule(
    @Request() req,
    @Body(new ZodValidationPipe(CreateRuleInputSchema)) body: CreateRuleInput
  ) {
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
    @Body(new ZodValidationPipe(ResolveConflictInputSchema)) body: ResolveConflictInput
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
    @Body(new ZodValidationPipe(UpdateRuleBodySchema)) body: UpdateRuleBody
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
    @Body(new ZodValidationPipe(EnforceRulesInputSchema)) body: EnforceRulesInput
  ) {
    return this.rulesEngineService.enforceRules(req.user.id, body.input, body.trigger);
  }

  @Post('parse')
  async parseNaturalLanguage(
    @Request() req,
    @Body(new ZodValidationPipe(ParseNaturalLanguageInputSchema)) body: ParseNaturalLanguageInput
  ) {
    return this.rulesEngineService.parseNaturalLanguage(body);
  }

  @Post('from-natural-language')
  async createRuleFromNaturalLanguage(
    @Request() req,
    @Body(new ZodValidationPipe(NaturalLanguageTextSchema)) body: { text: string }
  ) {
    return this.rulesEngineService.createRuleFromNaturalLanguage(req.user.id, body.text);
  }
}

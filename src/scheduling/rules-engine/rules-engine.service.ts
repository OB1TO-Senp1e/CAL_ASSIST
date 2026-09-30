import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import {
  Rule,
  RuleType,
  RuleScope,
  RuleTrigger,
  RuleAction,
  RuleCondition,
  CreateRuleInput,
  CreateRuleInputSchema,
  UpdateRuleInput,
  RuleConflict,
  RuleValidationResult,
  RuleEnforcementResult,
  RulesEnforcementSummary,
  ParsedRule,
  NaturalLanguageParseResult,
} from './rules.types';

@Injectable()
export class RulesEngineService {
  private readonly logger = new Logger(RulesEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService
  ) {}

  async createRule(userId: string, input: CreateRuleInput): Promise<Rule> {
    // Parse first so malformed payloads become a 400 with field names rather
    // than a TypeError inside validateRule (which assumes a shaped input).
    const validated = CreateRuleInputSchema.parse(input);
    const validation = await this.validateRule(validated);
    if (!validation.valid) {
      throw new BadRequestException(
        `Invalid rule: ${validation.errors.map((e) => e.message).join(', ')}`
      );
    }

    const rule = await this.prisma.autonomyRule.create({
      data: {
        userId,
        name: validated.name,
        description: validated.description,
        scope: validated.scope,
        triggerType: 'MANUAL',
        actionType: 'ADJUST_PREFERENCE',
        conditions: {
          ruleType: validated.type,
          scope: validated.scope,
          triggers: validated.triggers,
          conditions: validated.conditions,
          action: validated.action,
          actionConfig: validated.actionConfig,
          priority: validated.priority,
        },
        actionConfig: validated.actionConfig,
        isActive: true,
        priority: validated.priority,
      },
    });

    await this.checkRuleConflicts(userId, rule.id);

    return this.mapToRule(rule);
  }

  async getRule(userId: string, ruleId: string): Promise<Rule> {
    const rule = await this.prisma.autonomyRule.findFirst({
      where: { id: ruleId, userId },
    });

    if (!rule || !this.isRuleRow(rule)) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    return this.mapToRule(rule);
  }

  async updateRule(userId: string, input: UpdateRuleInput): Promise<Rule> {
    const { id, ...updates } = input;

    const existing = await this.prisma.autonomyRule.findFirst({
      where: { id, userId },
    });

    if (!existing || !this.isRuleRow(existing)) {
      throw new NotFoundException(`Rule ${id} not found`);
    }

    const conditions = existing.conditions as any;
    const actionConfig = existing.actionConfig as any;

    const updated = await this.prisma.autonomyRule.update({
      where: { id },
      data: {
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        scope: updates.scope ?? existing.scope,
        triggerType: 'MANUAL',
        actionType: 'ADJUST_PREFERENCE',
        conditions: {
          ...conditions,
          ruleType: updates.type ?? conditions?.ruleType,
          scope: updates.scope ?? conditions?.scope,
          triggers: updates.triggers ?? conditions?.triggers,
          conditions: updates.conditions ?? conditions?.conditions,
          action: updates.action ?? conditions?.action,
          actionConfig: updates.actionConfig ?? conditions?.actionConfig,
          priority: updates.priority ?? conditions?.priority,
        },
        actionConfig: updates.actionConfig ?? actionConfig,
        isActive: updates.enabled ?? existing.isActive,
        priority: updates.priority ?? existing.priority,
      },
    });

    if (updates.conditions || updates.action || updates.triggers || updates.type) {
      await this.checkRuleConflicts(userId, id);
    }

    return this.mapToRule(updated);
  }

  async deleteRule(userId: string, ruleId: string): Promise<void> {
    const rule = await this.prisma.autonomyRule.findFirst({
      where: { id: ruleId, userId },
    });

    if (!rule || !this.isRuleRow(rule)) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    await this.prisma.autonomyRule.delete({ where: { id: ruleId } });
    await this.removeConflictsForRule(userId, ruleId);
  }

  async listRules(
    userId: string,
    filters?: {
      type?: RuleType;
      scope?: RuleScope;
      enabled?: boolean;
    }
  ): Promise<Rule[]> {
    const where: any = { userId };
    if (filters?.enabled !== undefined) where.isActive = filters.enabled;

    const rules = await this.prisma.autonomyRule.findMany({
      where,
      orderBy: { priority: 'desc' },
    });

    let mapped = rules.filter((rule) => !!this.isRuleRow(rule)).map((r) => this.mapToRule(r));

    if (filters?.type) {
      mapped = mapped.filter((r) => r.type === filters.type);
    }
    if (filters?.scope) {
      mapped = mapped.filter((r) => r.scope === filters.scope);
    }

    return mapped;
  }

  async validateRule(input: CreateRuleInput): Promise<RuleValidationResult> {
    const errors: RuleValidationResult['errors'] = [];
    const warnings: RuleValidationResult['warnings'] = [];

    if (!input.name || input.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Rule name is required', code: 'REQUIRED' });
    }

    if (!input.conditions || input.conditions.length === 0) {
      warnings.push({
        field: 'conditions',
        message: 'Rule has no conditions - will always trigger',
      });
    }

    if (input.type === 'CONSECUTIVE_LIMIT' && !input.actionConfig?.maxCount) {
      errors.push({
        field: 'actionConfig.maxCount',
        message: 'CONSECUTIVE_LIMIT rules require maxCount in actionConfig',
        code: 'MISSING_CONFIG',
      });
    }

    if (input.type === 'BUFFER_RULE' && !input.actionConfig?.bufferMinutes) {
      errors.push({
        field: 'actionConfig.bufferMinutes',
        message: 'BUFFER_RULE rules require bufferMinutes in actionConfig',
        code: 'MISSING_CONFIG',
      });
    }

    if (input.type === 'TIME_RESTRICTION') {
      const hasTimeCondition = input.conditions.some((c) =>
        ['BEFORE_TIME', 'AFTER_TIME', 'BETWEEN_TIMES', 'ON_DAY', 'NOT_ON_DAY'].includes(c.operator)
      );
      if (!hasTimeCondition) {
        warnings.push({
          field: 'conditions',
          message: 'TIME_RESTRICTION rules should have time-based conditions',
        });
      }
    }

    for (const condition of input.conditions ?? []) {
      if (condition.operator === 'IN_RANGE' || condition.operator === 'OUT_OF_RANGE') {
        if (condition.value2 === undefined) {
          errors.push({
            field: 'conditions',
            message: `${condition.operator} requires value2`,
            code: 'MISSING_VALUE2',
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async checkRuleConflicts(userId: string, ruleId: string): Promise<RuleConflict[]> {
    await this.reconcileConflicts(userId);
    const rules = await this.prisma.autonomyRule.findMany({
      where: { userId },
    });
    const conflictRows = await this.prisma.ruleConflict.findMany({
      where: { userId },
    });
    const ruleNames = new Map(rules.map((rule) => [rule.id, rule.name]));
    return conflictRows
      .filter((row) => row.ruleId1 === ruleId || row.ruleId2 === ruleId)
      .map((row) => this.mapConflict(row, ruleNames));
  }

  private detectConflict(
    rule1: any,
    cond1: any,
    rule2: any,
    cond2: any
  ): { type: string; description: string; severity: string } | null {
    if (cond1.ruleType === cond2.ruleType && cond1.scope === cond2.scope) {
      if (cond1.action !== cond2.action) {
        return {
          type: 'MUTUALLY_EXCLUSIVE_ACTIONS',
          description: `"${rule1.name}" (${cond1.action}) conflicts with "${rule2.name}" (${cond2.action}) on same scope`,
          severity: 'HIGH',
        };
      }
    }

    if (cond1.scope === 'GLOBAL' && cond2.scope === 'GLOBAL') {
      const c1Triggers = cond1.triggers || [];
      const c2Triggers = cond2.triggers || [];
      const overlap = c1Triggers.filter((t: string) => c2Triggers.includes(t));
      if (overlap.length > 0 && cond1.action !== cond2.action) {
        return {
          type: 'DIRECT_CONTRADICTION',
          description: `Both rules trigger on ${overlap.join(', ')} with different actions`,
          severity: 'HIGH',
        };
      }
    }

    if (cond1.priority === cond2.priority && cond1.scope === cond2.scope) {
      return {
        type: 'PRIORITY_AMBIGUITY',
        description: `Rules "${rule1.name}" and "${rule2.name}" have same priority and scope`,
        severity: 'MEDIUM',
      };
    }

    return null;
  }

  /**
   * Builds the pairwise conflict record for two DB rows, or null when they are
   * compatible. Rule rows are the AutonomyRule rows whose `conditions` JSON
   * carries a `ruleType` (the same shape mapToRule reads).
   */
  private buildConflict(firstRule: any, secondRule: any): any | null {
    const conditions1 = firstRule.conditions as Record<string, unknown>;
    const conditions2 = secondRule.conditions as Record<string, unknown>;
    const conflict = this.detectConflict(firstRule, conditions1, secondRule, conditions2);
    if (!conflict) return null;

    return {
      conflictKey: this.createConflictId(firstRule.id, secondRule.id),
      ruleId1: firstRule.id,
      ruleId2: secondRule.id,
      rule1Name: firstRule.name,
      rule2Name: secondRule.name,
      conflictType: conflict.type,
      description: conflict.description,
      severity: conflict.severity,
    };
  }

  private createConflictId(ruleId1: string, ruleId2: string): string {
    return [ruleId1, ruleId2].sort().join(':');
  }

  private parseConflictId(conflictId: string): [string, string] {
    const parts = conflictId.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new NotFoundException(`Conflict ${conflictId} not found`);
    }
    return [parts[0], parts[1]];
  }

  private isRuleRow(rule: { conditions: unknown }): boolean {
    const conditions = rule.conditions;
    return Boolean(conditions && typeof conditions === 'object' && 'ruleType' in conditions);
  }

  /**
   * Delete every persisted conflict record involving a rule (called on rule
   * delete so stale pairs disappear immediately rather than at next detect).
   */
  private async removeConflictsForRule(userId: string, ruleId: string): Promise<void> {
    await this.prisma.ruleConflict.deleteMany({
      where: {
        userId,
        OR: [{ ruleId1: ruleId }, { ruleId2: ruleId }],
      },
    });
  }

  private mapConflict(
    row: {
      conflictKey: string;
      ruleId1: string;
      ruleId2: string;
      rule1Name: string;
      rule2Name: string;
      conflictType: string;
      description: string;
      severity: string;
      suggestedResolution: string | null;
      detectedAt: Date;
      resolvedAt: Date | null;
      resolution: string | null;
    },
    ruleNames?: Map<string, string>
  ): RuleConflict {
    return {
      id: row.conflictKey,
      ruleId1: row.ruleId1,
      ruleId2: row.ruleId2,
      rule1Name: ruleNames?.get(row.ruleId1) ?? row.rule1Name,
      rule2Name: ruleNames?.get(row.ruleId2) ?? row.rule2Name,
      conflictType: row.conflictType as RuleConflict['conflictType'],
      description: row.description,
      severity: row.severity as RuleConflict['severity'],
      suggestedResolution: row.suggestedResolution as RuleConflict['suggestedResolution'],
      detectedAt: row.detectedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolution: row.resolution as RuleConflict['resolution'],
    };
  }

  async getConflicts(userId: string): Promise<RuleConflict[]> {
    await this.reconcileConflicts(userId);
    const [rows, rules] = await Promise.all([
      this.prisma.ruleConflict.findMany({
        where: { userId },
        orderBy: { detectedAt: 'asc' },
      }),
      this.prisma.autonomyRule.findMany({ where: { userId } }),
    ]);
    const ruleNames = new Map(rules.map((rule) => [rule.id, rule.name]));
    return rows.map((row) => this.mapConflict(row, ruleNames));
  }

  /**
   * Stage 4k: re-detect every pairwise conflict for the user and upsert the
   * open ones into the RuleConflict table. Resolved rows are kept: a
   * resolution is an instruction ("stop warning me"), not amnesia, and the
   * next detect pass must not resurrect a conflict the user already answered.
   * Before this, conflicts were recomputed on read with resolutions smuggled
   * back as stringified JSON entries inside conditions.resolvedConflicts.
   */
  async reconcileConflicts(userId: string): Promise<void> {
    const rules = (
      await this.prisma.autonomyRule.findMany({
        where: { userId },
      })
    ).filter((rule) => this.isRuleRow(rule));

    const detected: Array<{
      conflictKey: string;
      ruleId1: string;
      ruleId2: string;
      rule1Name: string;
      rule2Name: string;
      conflictType: string;
      description: string;
      severity: string;
    }> = [];
    for (let firstIndex = 0; firstIndex < rules.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < rules.length; secondIndex += 1) {
        const conflict = this.buildConflict(rules[firstIndex], rules[secondIndex]);
        if (conflict) detected.push(conflict);
      }
    }

    for (const conflict of detected) {
      await this.prisma.ruleConflict.upsert({
        where: {
          userId_conflictKey: { userId, conflictKey: conflict.conflictKey },
        },
        update: {
          rule1Name: conflict.rule1Name,
          rule2Name: conflict.rule2Name,
          conflictType: conflict.conflictType as any,
          description: conflict.description,
          severity: conflict.severity as any,
          detectedAt: new Date(),
        },
        create: {
          userId,
          conflictKey: conflict.conflictKey,
          ruleId1: conflict.ruleId1,
          ruleId2: conflict.ruleId2,
          rule1Name: conflict.rule1Name,
          rule2Name: conflict.rule2Name,
          conflictType: conflict.conflictType as any,
          description: conflict.description,
          severity: conflict.severity as any,
        },
      });
    }

    // A conflict whose rule pair no longer conflicts (or was deleted) is gone.
    const detectedKeys = new Set(detected.map((conflict) => conflict.conflictKey));
    const persisted = await this.prisma.ruleConflict.findMany({
      where: { userId },
    });
    const staleKeys = persisted
      .filter((row) => !detectedKeys.has(row.conflictKey))
      .map((row) => row.conflictKey);
    if (staleKeys.length > 0) {
      await this.prisma.ruleConflict.deleteMany({
        where: { userId, conflictKey: { in: staleKeys } },
      });
    }
  }

  async resolveConflict(
    userId: string,
    conflictId: string,
    resolution: RuleConflict['resolution']
  ): Promise<void> {
    const [ruleId1, ruleId2] = this.parseConflictId(conflictId);
    const [row, rule1, rule2] = await Promise.all([
      this.prisma.ruleConflict.findFirst({ where: { userId, conflictKey: conflictId } }),
      this.prisma.autonomyRule.findFirst({ where: { id: ruleId1, userId } }),
      this.prisma.autonomyRule.findFirst({ where: { id: ruleId2, userId } }),
    ]);
    if (!row || !rule1 || !rule2) {
      throw new NotFoundException(`Conflict ${conflictId} not found`);
    }

    switch (resolution) {
      case 'DISABLE_FIRST':
        await this.prisma.autonomyRule.update({
          where: { id: rule1.id },
          data: { isActive: false },
        });
        break;
      case 'DISABLE_SECOND':
        await this.prisma.autonomyRule.update({
          where: { id: rule2.id },
          data: { isActive: false },
        });
        break;
      case 'ADJUST_PRIORITY':
        await this.prisma.autonomyRule.update({
          where: { id: rule1.id },
          data: { priority: rule2.priority - 1 },
        });
        break;
      case 'KEEP_BOTH':
      case 'MERGE':
      case 'MANUAL':
        // Acknowledgement-only resolutions: record the answer, change nothing.
        break;
      default:
        throw new BadRequestException(`Unsupported conflict resolution: ${resolution}`);
    }

    await this.prisma.ruleConflict.update({
      where: { id: row.id },
      data: {
        resolution,
        resolvedAt: new Date(),
      },
    });
  }

  async enforceRules(
    userId: string,
    input: Record<string, any>,
    trigger: RuleTrigger
  ): Promise<RulesEnforcementSummary> {
    const rules = (
      await this.prisma.autonomyRule.findMany({
        where: { userId, isActive: true },
        orderBy: { priority: 'desc' },
      })
    ).filter((rule) => !!this.isRuleRow(rule));

    const results: RuleEnforcementResult[] = [];
    const appliedAdjustments: RulesEnforcementSummary['appliedAdjustments'] = [];
    let blocked = false;
    let requiresConfirmation = false;
    const conflicts = await this.getConflicts(userId);
    const activeConflicts = conflicts.filter((c) => !c.resolvedAt);

    for (const rule of rules) {
      const ruleConditions = rule.conditions as any;
      const triggers = ruleConditions.triggers || ['GENERATE_SCHEDULE'];

      if (!triggers.includes(trigger)) continue;

      const shouldTrigger = this.evaluateConditions(input, ruleConditions.conditions || []);
      if (!shouldTrigger) continue;

      const enforcement = await this.enforceRule(rule, input, ruleConditions);
      results.push(enforcement);

      if (enforcement.blocked) blocked = true;
      if (enforcement.requiresConfirmation) requiresConfirmation = true;

      if (enforcement.adjustedInput) {
        for (const [key, value] of Object.entries(enforcement.adjustedInput)) {
          if (input[key] !== value) {
            appliedAdjustments.push({
              ruleId: rule.id,
              field: key,
              originalValue: input[key],
              newValue: value,
            });
            input[key] = value;
          }
        }
      }

      const storedConditions = rule.conditions as Record<string, unknown>;
      const triggerCount =
        typeof storedConditions.triggerCount === 'number' ? storedConditions.triggerCount + 1 : 1;
      await this.prisma.autonomyRule.update({
        where: { id: rule.id },
        data: {
          conditions: {
            ...storedConditions,
            lastTriggeredAt: new Date().toISOString(),
            triggerCount,
          },
        },
      });
    }

    return {
      input,
      results,
      blocked,
      requiresConfirmation,
      conflicts: activeConflicts,
      appliedAdjustments,
    };
  }

  private evaluateConditions(input: Record<string, any>, conditions: RuleCondition[]): boolean {
    if (!conditions || conditions.length === 0) return true;

    return conditions.every((condition) => {
      const fieldValue = this.getNestedValue(input, condition.field);
      if (fieldValue === undefined) return false;

      switch (condition.operator) {
        case 'EQUALS':
          return fieldValue === condition.value;
        case 'NOT_EQUALS':
          return fieldValue !== condition.value;
        case 'CONTAINS':
          return String(fieldValue).includes(String(condition.value));
        case 'NOT_CONTAINS':
          return !String(fieldValue).includes(String(condition.value));
        case 'STARTS_WITH':
          return String(fieldValue).startsWith(String(condition.value));
        case 'ENDS_WITH':
          return String(fieldValue).endsWith(String(condition.value));
        case 'GREATER_THAN':
          return Number(fieldValue) > Number(condition.value);
        case 'LESS_THAN':
          return Number(fieldValue) < Number(condition.value);
        case 'GREATER_EQUAL':
          return Number(fieldValue) >= Number(condition.value);
        case 'LESS_EQUAL':
          return Number(fieldValue) <= Number(condition.value);
        case 'IN_RANGE':
          return (
            Number(fieldValue) >= Number(condition.value) &&
            Number(fieldValue) <= Number(condition.value2)
          );
        case 'OUT_OF_RANGE':
          return (
            Number(fieldValue) < Number(condition.value) ||
            Number(fieldValue) > Number(condition.value2)
          );
        case 'BEFORE_TIME':
          return this.compareTime(fieldValue, condition.value) < 0;
        case 'AFTER_TIME':
          return this.compareTime(fieldValue, condition.value) > 0;
        case 'BETWEEN_TIMES':
          const timeVal = this.timeToMinutes(fieldValue);
          const start = this.timeToMinutes(condition.value);
          const end = this.timeToMinutes(condition.value2);
          return timeVal >= start && timeVal <= end;
        case 'ON_DAY':
          return this.getDayOfWeek(fieldValue) === condition.value;
        case 'NOT_ON_DAY':
          return this.getDayOfWeek(fieldValue) !== condition.value;
        case 'WITHIN_DAYS':
          return this.daysUntil(fieldValue) <= condition.value;
        case 'HAS_TAG':
          return Array.isArray(fieldValue) && fieldValue.includes(condition.value);
        case 'NOT_HAS_TAG':
          return !Array.isArray(fieldValue) || !fieldValue.includes(condition.value);
        default:
          return true;
      }
    });
  }

  private compareTime(timeStr: string, refTime: string): number {
    const [h1, m1] = timeStr.split(':').map(Number);
    const [h2, m2] = refTime.split(':').map(Number);
    return h1 * 60 + m1 - (h2 * 60 + m2);
  }

  private timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  private getDayOfWeek(dateStr: string): number {
    return new Date(dateStr).getDay();
  }

  private daysUntil(dateStr: string): number {
    const target = new Date(dateStr);
    const now = new Date();
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((o, k) => (o || {})[k], obj);
  }

  private async enforceRule(
    rule: any,
    input: Record<string, any>,
    conditions: any
  ): Promise<RuleEnforcementResult> {
    const action = conditions.action;
    const actionConfig = conditions.actionConfig || {};
    let adjustedInput: Record<string, any> | undefined;
    let blocked = false;
    let requiresConfirmation = false;
    let message = '';
    let confirmationPrompt: string | undefined;
    let alternativeSuggestions: RuleEnforcementResult['alternativeSuggestions'] = [];

    switch (action) {
      case 'BLOCK':
        blocked = true;
        message = `Blocked by rule: ${rule.name}`;
        break;

      case 'WARN':
        message = `Warning: ${rule.description || rule.name}`;
        break;

      case 'ADJUST':
        adjustedInput = { ...input };
        if (actionConfig.field && actionConfig.value !== undefined) {
          adjustedInput[actionConfig.field] = actionConfig.value;
        }
        if (actionConfig.addMinutes) {
          adjustedInput.endTime = this.addMinutes(adjustedInput.endTime, actionConfig.addMinutes);
        }
        message = `Adjusted by rule: ${rule.name}`;
        break;

      case 'REQUIRE_CONFIRMATION':
        requiresConfirmation = true;
        confirmationPrompt = `Rule "${rule.name}" requires confirmation: ${rule.description}`;
        message = `Confirmation required for: ${rule.name}`;
        break;

      case 'SUGGEST_ALTERNATIVE':
        alternativeSuggestions = [
          {
            description: `Alternative from rule: ${rule.name}`,
            adjustedInput: actionConfig.alternative || {},
          },
        ];
        message = `Alternative suggested by rule: ${rule.name}`;
        break;

      case 'SPLIT':
        adjustedInput = { ...input };
        if (actionConfig.maxDuration) {
          const duration = this.calculateDuration(input.startTime, input.endTime);
          if (duration > actionConfig.maxDuration) {
            adjustedInput.endTime = this.addMinutes(input.startTime, actionConfig.maxDuration);
          }
        }
        message = `Split by rule: ${rule.name}`;
        break;

      case 'RESCHEDULE':
        adjustedInput = { ...input };
        if (actionConfig.preferredTime) {
          adjustedInput.startTime = actionConfig.preferredTime;
          const duration = this.calculateDuration(input.startTime, input.endTime);
          adjustedInput.endTime = this.addMinutes(actionConfig.preferredTime, duration);
        }
        message = `Rescheduled by rule: ${rule.name}`;
        break;
    }

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: true,
      action,
      message,
      originalInput: input,
      adjustedInput,
      blocked,
      requiresConfirmation,
      confirmationPrompt,
      alternativeSuggestions,
    };
  }

  private calculateDuration(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  }

  private addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const nh = Math.floor(total / 60) % 24;
    const nm = total % 60;
    return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`;
  }

  async parseNaturalLanguage(input: {
    text: string;
    context?: Record<string, any>;
  }): Promise<NaturalLanguageParseResult> {
    const prompt = `
Parse this natural language scheduling rule into structured format:

User text: "${input.text}"

Context: ${JSON.stringify(input.context || {})}

Extract rules with this JSON structure:
{
  "rules": [{
    "name": "string",
    "description": "string",
    "type": "TIME_RESTRICTION|BUFFER_RULE|CONSECUTIVE_LIMIT|PROTECTION_RULE|PREFERENCE_RULE|ENERGY_RULE|TRAVEL_RULE",
    "scope": "GLOBAL|MEETINGS|TASKS|FOCUS_TIME|BREAKS|WORK_HOURS|PERSONAL|SPECIFIC_ENTITY",
    "triggers": ["SCHEDULE_EVENT", "SCHEDULE_TASK", "SCHEDULE_MEETING", "CREATE_TIME_BLOCK", "MOVE_BLOCK", "RESIZE_BLOCK", "GENERATE_SCHEDULE"],
    "conditions": [{
      "field": "string",
      "operator": "BEFORE_TIME|AFTER_TIME|BETWEEN_TIMES|ON_DAY|NOT_ON_DAY|CONTAINS|GREATER_THAN|LESS_THAN|EQUALS",
      "value": "any",
      "value2": "any"
    }],
    "action": "BLOCK|WARN|ADJUST|REQUIRE_CONFIRMATION|SUGGEST_ALTERNATIVE|SPLIT|RESCHEDULE",
    "actionConfig": {},
    "priority": number,
    "confidence": 0-1,
    "originalText": "string"
  }],
  "ambiguous": [{"text": "string", "possibleInterpretations": ["string"]}],
  "errors": ["string"]
}

Examples:
- "Never schedule meetings before 10 AM" → TIME_RESTRICTION, BEFORE_TIME 10:00, BLOCK
- "Keep Friday afternoon free" → PROTECTION_RULE, ON_DAY 5, BLOCK
- "Don't schedule more than 3 meetings consecutively" → CONSECUTIVE_LIMIT, maxCount: 3, BLOCK
- "Always leave 30 minutes before an investor meeting" → BUFFER_RULE, bufferMinutes: 30, ADJUST
- "Protect my gym time" → PROTECTION_RULE, CONTAINS "gym", BLOCK
`;

    try {
      const response = await this.aiProvider.generateStructured(prompt, {
        temperature: 0.2,
        maxTokens: 3000,
      });

      const parsed = response as NaturalLanguageParseResult;
      // A provider that answers with an empty rule set and no explanation is
      // indistinguishable from a failure for the caller, so treat it as one.
      if (!parsed.rules?.length && !parsed.ambiguous?.length && !parsed.errors?.length) {
        return this.parseLocally(input.text, 'LLM returned no rules');
      }
      if (parsed.errors?.length && !parsed.rules?.length) {
        return this.parseLocally(input.text, parsed.errors.join('; '));
      }
      return parsed;
    } catch (error) {
      // No usable LLM (OPENAI_API_KEY is a placeholder in this environment), so
      // fall back to deterministic parsing instead of failing the request. This
      // mirrors what IntentParserService.classifyLocally() already does for chat.
      this.logger.warn(`Natural language parsing failed, using local parser: ${error}`);
      return this.parseLocally(input.text, String(error));
    }
  }

  /**
   * Deterministic rule parser used when no LLM is reachable. Mirrors the
   * heuristics the client previously applied locally in
   * `knowledgeService.createRuleFromNaturalLanguage`, so live mode and mock mode
   * now agree on the interpretation of the same sentence.
   */
  private parseLocally(text: string, reason: string): NaturalLanguageParseResult {
    const normalized = text.trim();
    if (!normalized) {
      return { rules: [], ambiguous: [], errors: ['Enter a scheduling rule first'] };
    }

    const lower = normalized.toLowerCase();
    const time = normalized.match(/\b(?:before|after)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    const minute = time?.[2] ?? '00';
    let hour = time ? Number(time[1]) : 0;
    if (time?.[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12;
    if (time?.[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;

    const type: RuleType = /travel|commute/i.test(lower)
      ? 'TRAVEL_RULE'
      : /buffer|between/i.test(lower)
        ? 'BUFFER_RULE'
        : /consecutiv|more than \d+ meetings/i.test(lower)
          ? 'CONSECUTIVE_LIMIT'
          : /friday|keep .* free|protect|never/i.test(lower)
            ? 'PROTECTION_RULE'
            : time
              ? 'TIME_RESTRICTION'
              : 'PREFERENCE_RULE';

    const scope: RuleScope = /meeting/i.test(lower)
      ? 'MEETINGS'
      : /task/i.test(lower)
        ? 'TASKS'
        : /focus/i.test(lower)
          ? 'FOCUS_TIME'
          : 'GLOBAL';

    const action: RuleAction = /never|don'?t|do not|keep .* free|avoid|block/i.test(lower)
      ? 'BLOCK'
      : 'WARN';

    const conditions: RuleCondition[] = time
      ? [
          {
            field: 'startTime',
            operator: lower.includes('after') ? 'AFTER_TIME' : 'BEFORE_TIME',
            value: `${String(hour).padStart(2, '0')}:${minute}`,
          },
        ]
      : [{ field: 'title', operator: 'CONTAINS', value: normalized }];

    const buffer = normalized.match(/(\d+)\s*(?:min|minute)/i);
    const actionConfig: Record<string, any> =
      type === 'BUFFER_RULE' ? { bufferMinutes: Number(buffer?.[1] ?? 15) } : {};

    return {
      rules: [
        {
          name: normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized,
          description: `Interpreted from: "${normalized}"`,
          type,
          scope,
          triggers: ['SCHEDULE_EVENT', 'SCHEDULE_TASK', 'GENERATE_SCHEDULE'],
          conditions,
          action,
          actionConfig,
          priority: 50,
          confidence: /before|after|friday|buffer|never|protect/i.test(lower) ? 0.88 : 0.6,
          originalText: normalized,
        },
      ],
      ambiguous: [],
      // The caller aborts on a non-empty errors array. Since the local parser
      // produced a usable rule above, keep errors empty and just record why the
      // LLM path was not used.
      errors: [],
    };
  }

  async createRuleFromNaturalLanguage(userId: string, text: string): Promise<Rule> {
    const parseResult = await this.parseNaturalLanguage({ text });

    if (parseResult.errors.length > 0) {
      throw new BadRequestException(`Failed to parse: ${parseResult.errors.join(', ')}`);
    }

    if (parseResult.rules.length === 0) {
      throw new BadRequestException('No valid rules extracted from text');
    }

    const ruleInput = parseResult.rules[0];
    return this.createRule(userId, {
      name: ruleInput.name,
      description: ruleInput.description,
      type: ruleInput.type,
      scope: ruleInput.scope,
      triggers: ruleInput.triggers,
      conditions: ruleInput.conditions,
      action: ruleInput.action,
      actionConfig: ruleInput.actionConfig,
      priority: ruleInput.priority,
      naturalLanguageText: ruleInput.originalText,
    });
  }

  async explainRule(userId: string, ruleId: string): Promise<string> {
    const rule = await this.getRule(userId, ruleId);

    const prompt = `
Explain this scheduling rule in plain language:

Rule: ${rule.name}
Description: ${rule.description || 'No description'}
Type: ${rule.type}
Scope: ${rule.scope}
Triggers: ${rule.triggers.join(', ')}
Conditions: ${JSON.stringify(rule.conditions, null, 2)}
Action: ${rule.action}
Action Config: ${JSON.stringify(rule.actionConfig)}
Priority: ${rule.priority}

Explain:
1. What this rule does in simple terms
2. When it triggers
3. What happens when triggered
4. Examples of situations where it applies
5. Any conflicts or interactions with other rules
`;

    try {
      const response = await this.aiProvider.generate(prompt, {
        temperature: 0.3,
        maxTokens: 1000,
      });
      return response;
    } catch {
      return `Rule "${rule.name}": ${rule.description || 'No description provided.'}`;
    }
  }

  private mapToRule(rule: any): Rule {
    const conditions = rule.conditions as any;
    return {
      id: rule.id,
      userId: rule.userId,
      name: rule.name,
      description: rule.description,
      type: conditions?.ruleType || 'PREFERENCE_RULE',
      scope: conditions?.scope || 'GLOBAL',
      triggers: conditions?.triggers || ['GENERATE_SCHEDULE'],
      conditions: conditions?.conditions || [],
      action: conditions?.action || 'WARN',
      actionConfig: conditions?.actionConfig || {},
      priority: rule.priority,
      enabled: rule.isActive,
      isNaturalLanguage: conditions?.isNaturalLanguage || false,
      naturalLanguageText: conditions?.naturalLanguageText,
      source: conditions?.source || 'USER_CREATED',
      confidence: conditions?.confidence || 1.0,
      conflictsWith: [],
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      lastTriggeredAt: conditions?.lastTriggeredAt || null,
      triggerCount: conditions?.triggerCount || 0,
    };
  }
}

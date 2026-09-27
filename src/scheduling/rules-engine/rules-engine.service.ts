import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
  private readonly policyMarker = 'calassistPolicy';

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService
  ) {}

  async createRule(userId: string, input: CreateRuleInput): Promise<Rule> {
    const validation = await this.validateRule(input);
    if (!validation.valid) {
      throw new BadRequestException(
        `Invalid rule: ${validation.errors.map((e) => e.message).join(', ')}`
      );
    }

    const rule = await this.prisma.autonomyRule.create({
      data: {
        userId,
        name: input.name,
        description: input.description,
        scope: input.scope,
        triggerType: 'MANUAL',
        actionType: 'ADJUST_PREFERENCE',
        conditions: {
          ruleType: input.type,
          scope: input.scope,
          triggers: input.triggers,
          conditions: input.conditions,
          action: input.action,
          actionConfig: input.actionConfig,
          priority: input.priority,
        },
        actionConfig: input.actionConfig,
        isActive: true,
        priority: input.priority,
      },
    });

    await this.checkRuleConflicts(userId, rule.id);

    return this.mapToRule(rule);
  }

  async getRule(userId: string, ruleId: string): Promise<Rule> {
    const rule = await this.prisma.autonomyRule.findFirst({
      where: { id: ruleId, userId },
    });

    if (!rule || this.isPolicyRow(rule)) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    return this.mapToRule(rule);
  }

  async updateRule(userId: string, input: UpdateRuleInput): Promise<Rule> {
    const { id, ...updates } = input;

    const existing = await this.prisma.autonomyRule.findFirst({
      where: { id, userId },
    });

    if (!existing || this.isPolicyRow(existing)) {
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

    if (!rule || this.isPolicyRow(rule)) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    await this.prisma.autonomyRule.delete({ where: { id: ruleId } });
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

    let mapped = rules
      .filter((rule) => !this.isPolicyRow(rule))
      .map((r) => this.mapToRule(r));

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

    for (const condition of input.conditions) {
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
    const rules = await this.prisma.autonomyRule.findMany({
      where: { userId, isActive: true },
    });
    const newRule = rules.find((rule) => rule.id === ruleId && !this.isPolicyRow(rule));
    if (!newRule) return [];
    return rules
      .filter((rule) => rule.id !== ruleId && !this.isPolicyRow(rule))
      .flatMap((existing) => {
        const result = this.createRuleConflict(newRule, existing);
        return result ? [result] : [];
      });
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

  private createRuleConflict(rule1: any, rule2: any): RuleConflict | null {
    const [firstRule, secondRule] = [rule1, rule2].sort((left, right) =>
      left.id.localeCompare(right.id)
    );
    const conditions1 = firstRule.conditions as Record<string, unknown>;
    const conditions2 = secondRule.conditions as Record<string, unknown>;
    const conflict = this.detectConflict(firstRule, conditions1, secondRule, conditions2);
    if (!conflict) return null;

    const id = this.createConflictId(firstRule.id, secondRule.id);
    const resolvedConflicts = Array.isArray(conditions1.resolvedConflicts)
      ? conditions1.resolvedConflicts
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => JSON.parse(entry) as Record<string, unknown>)
      : [];
    const secondRuleResolutions = Array.isArray(conditions2.resolvedConflicts)
      ? conditions2.resolvedConflicts
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => JSON.parse(entry) as Record<string, unknown>)
      : [];
    const resolved = [...resolvedConflicts, ...secondRuleResolutions]
      .find((entry) => entry.id === id);
    return {
      id,
      ruleId1: firstRule.id,
      ruleId2: secondRule.id,
      rule1Name: firstRule.name,
      rule2Name: secondRule.name,
      conflictType: conflict.type as RuleConflict['conflictType'],
      description: conflict.description,
      severity: conflict.severity as RuleConflict['severity'],
      detectedAt: firstRule.createdAt.toISOString(),
      resolvedAt: typeof resolved?.resolvedAt === 'string' ? resolved.resolvedAt : null,
      resolution: resolved?.resolution as RuleConflict['resolution'],
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

  private isPolicyRow(rule: { actionConfig: unknown; conditions: unknown }): boolean {
    const config = rule.actionConfig;
    const conditions = rule.conditions;
    return Boolean(
      !conditions ||
      typeof conditions !== 'object' ||
      !('ruleType' in conditions) ||
      (config && typeof config === 'object' && this.policyMarker in config)
    );
  }

  async getConflicts(userId: string): Promise<RuleConflict[]> {
    const rules = await this.prisma.autonomyRule.findMany({
      where: { userId },
    });
    const ruleRows = rules.filter((rule) => !this.isPolicyRow(rule));
    const conflicts: RuleConflict[] = [];
    for (let firstIndex = 0; firstIndex < ruleRows.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < ruleRows.length; secondIndex += 1) {
        const conflict = this.createRuleConflict(ruleRows[firstIndex], ruleRows[secondIndex]);
        if (conflict) conflicts.push(conflict);
      }
    }
    return conflicts;
  }

  async resolveConflict(
    userId: string,
    conflictId: string,
    resolution: RuleConflict['resolution']
  ): Promise<void> {
    const [ruleId1, ruleId2] = this.parseConflictId(conflictId);
    const [rule1, rule2] = await Promise.all([
      this.prisma.autonomyRule.findFirst({ where: { id: ruleId1, userId } }),
      this.prisma.autonomyRule.findFirst({ where: { id: ruleId2, userId } }),
    ]);
    if (!rule1 || !rule2 || this.isPolicyRow(rule1) || this.isPolicyRow(rule2)) {
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
        break;
      default:
        throw new BadRequestException(`Unsupported conflict resolution: ${resolution}`);
    }

    const conditions = rule1.conditions as Record<string, unknown>;
    const resolvedConflicts = Array.isArray(conditions.resolvedConflicts)
      ? conditions.resolvedConflicts.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const resolvedAt = new Date().toISOString();
    await this.prisma.autonomyRule.update({
      where: { id: rule1.id },
      data: {
        conditions: {
          ...conditions,
          resolvedConflicts: [
            ...resolvedConflicts.filter((item) => {
              const decoded = JSON.parse(item) as Record<string, unknown>;
              return decoded.id !== conflictId;
            }),
            JSON.stringify({ id: conflictId, resolution, resolvedAt }),
          ],
        } as any,
      },
    });
  }

  async enforceRules(
    userId: string,
    input: Record<string, any>,
    trigger: RuleTrigger
  ): Promise<RulesEnforcementSummary> {
    const rules = (await this.prisma.autonomyRule.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: 'desc' },
    })).filter((rule) => !this.isPolicyRow(rule));

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
      const triggerCount = typeof storedConditions.triggerCount === 'number'
        ? storedConditions.triggerCount + 1
        : 1;
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

      return response as NaturalLanguageParseResult;
    } catch (error) {
      this.logger.error(`Natural language parsing failed: ${error}`);
      return {
        rules: [],
        ambiguous: [],
        errors: [String(error)],
      };
    }
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

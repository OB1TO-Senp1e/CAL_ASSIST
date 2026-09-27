import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { RealityEngineService } from '../reality-engine/reality-engine.service';
import { SchedulingEngineService } from '../scheduling-engine/scheduling-engine.service';
import { ContextEngineService } from '../../core/context-engine/context-engine.service';
import { TimeCompilerService } from '../time-compiler/time-compiler.service';
import {
  ReplanTrigger,
  ReplanUrgency,
  ReplanOptions,
  ScheduleOption,
  AutonomyPolicy,
  CreateAutonomyPolicyInput,
  ReplanExecutionResult,
} from './replanning.types';

interface AutonomyRuleConditions {
  triggers?: ReplanTrigger[];
  constraints?: any[];
  protectedTimeRanges?: any[];
  requireConfirmationFor?: string[];
}

interface AutonomyRuleActionConfig {
  allowedActions?: string[];
  maxChangesPerOperation?: number;
  maxTimeShiftMinutes?: number;
}

interface AutonomyRuleRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  scope: string | null;
  isActive: boolean;
  conditions: AutonomyRuleConditions | null;
  actionConfig: AutonomyRuleActionConfig | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ReplanningEngineService {
  private readonly logger = new Logger(ReplanningEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realityEngine: RealityEngineService,
    private readonly schedulingEngine: SchedulingEngineService,
    private readonly contextEngine: ContextEngineService,
    private readonly timeCompiler: TimeCompilerService
  ) {}

  async generateReplanOptions(
    userId: string,
    input: {
      trigger: ReplanTrigger;
      reason: string;
      affectedEntities: Array<{
        type: 'TASK' | 'EVENT' | 'COMMITMENT' | 'GOAL';
        id: string;
        title: string;
      }>;
      urgency: ReplanUrgency;
      timeRange?: { start: Date; end: Date };
    }
  ): Promise<ReplanOptions> {
    const userContext = await this.contextEngine.getUserContext(userId);
    const autonomyPolicies = await this.getActiveAutonomyPolicies(userId);

    const originalSchedule = await this.getCurrentSchedule(userId, input.timeRange);

    const options = await this.generateScheduleOptions(
      userId,
      input,
      userContext,
      autonomyPolicies
    );

    const recommendedOptionId = this.selectRecommendedOption(options, autonomyPolicies);

    const requiresUserApproval = this.requiresUserApproval(
      options,
      input.urgency,
      autonomyPolicies
    );
    const autonomyPolicyApplied = autonomyPolicies.length > 0;

    return {
      trigger: input.trigger,
      reason: input.reason,
      affectedEntities: input.affectedEntities,
      urgency: input.urgency,
      options,
      originalSchedule,
      recommendedOptionId,
      requiresUserApproval,
      autonomyPolicyApplied,
      createdAt: new Date().toISOString(),
    };
  }

  async executeReplan(
    userId: string,
    replanOptions: ReplanOptions,
    selectedOptionId: string
  ): Promise<ReplanExecutionResult> {
    const selectedOption = replanOptions.options.find((o) => o.id === selectedOptionId);
    if (!selectedOption) {
      throw new Error(`Option ${selectedOptionId} not found`);
    }

    const autonomyPolicies = await this.getActiveAutonomyPolicies(userId);
    const appliedChanges: ReplanExecutionResult['appliedChanges'] = [];
    const skippedChanges: ReplanExecutionResult['skippedChanges'] = [];
    const warnings: string[] = [];

    for (const move of selectedOption.moves) {
      const allowed = this.isChangeAllowed(move, autonomyPolicies, replanOptions.urgency);

      if (!allowed) {
        skippedChanges.push({
          entityType: move.entityType,
          entityId: move.entityId,
          reason: 'Change not allowed by autonomy policy',
        });
        warnings.push(
          `Skipped ${move.entityType} ${move.entityTitle}: autonomy policy prevents this change`
        );
        continue;
      }

      try {
        await this.applyMove(userId, move);
        appliedChanges.push({
          entityType: move.entityType,
          entityId: move.entityId,
          action: 'MOVE',
          from: move.from,
          to: move.to,
        });
      } catch (error: any) {
        skippedChanges.push({
          entityType: move.entityType,
          entityId: move.entityId,
          reason: error.message,
        });
        warnings.push(`Failed to move ${move.entityTitle}: ${error.message}`);
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'REPLAN_EXECUTED',
        entityType: 'Replan',
        entityId: replanOptions.trigger + '_' + Date.now(),
        details: `Executed option ${selectedOptionId} (${selectedOption.label}). Applied: ${appliedChanges.length}, Skipped: ${skippedChanges.length}`,
      },
    });

    return {
      replanId: `replan_${Date.now()}`,
      selectedOptionId,
      appliedChanges,
      skippedChanges,
      autonomyPolicyUsed: autonomyPolicies.length > 0 ? autonomyPolicies[0].id : undefined,
      executedAt: new Date().toISOString(),
      success: appliedChanges.length > 0,
      warnings,
    };
  }

  async getAutonomyPolicies(userId: string): Promise<AutonomyPolicy[]> {
    const policies = await this.prisma.autonomyRule.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: 'desc' },
    });

    return policies.filter((policy) => !this.isPermissionPolicy(policy)).map((p: any) => {
      const conditions = p.conditions as AutonomyRuleConditions | null;
      const actionConfig = p.actionConfig as AutonomyRuleActionConfig | null;
      return {
        id: p.id,
        userId: p.userId,
        name: p.name,
        description: p.description || '',
        enabled: p.isActive,
        scope: (p.scope as AutonomyPolicy['scope']) || 'GLOBAL',
        triggers: (conditions?.triggers || []) as AutonomyPolicy['triggers'],
        allowedActions: (actionConfig?.allowedActions || []) as AutonomyPolicy['allowedActions'],
        constraints: conditions?.constraints || [],
        maxChangesPerOperation: actionConfig?.maxChangesPerOperation || 3,
        maxTimeShiftMinutes: actionConfig?.maxTimeShiftMinutes || 120,
        protectedTimeRanges: conditions?.protectedTimeRanges || [],
        requireConfirmationFor: (conditions?.requireConfirmationFor ||
          []) as AutonomyPolicy['requireConfirmationFor'],
        priority: p.priority,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    });
  }

  async createAutonomyPolicy(
    userId: string,
    input: CreateAutonomyPolicyInput
  ): Promise<AutonomyPolicy> {
    const policy = await this.prisma.autonomyRule.create({
      data: {
        userId,
        name: input.name,
        description: input.description,
        scope: input.scope,
        triggerType: 'MANUAL',
        actionType: 'CREATE_EVENT',
        conditions: {
          triggers: input.triggers,
          constraints: input.constraints,
          protectedTimeRanges: input.protectedTimeRanges,
          requireConfirmationFor: input.requireConfirmationFor,
        },
        actionConfig: {
          allowedActions: input.allowedActions,
          maxChangesPerOperation: input.maxChangesPerOperation,
          maxTimeShiftMinutes: input.maxTimeShiftMinutes,
        },
        isActive: true,
        priority: 0,
      },
    });

    return this.mapToAutonomyPolicy(policy);
  }

  async updateAutonomyPolicy(
    userId: string,
    policyId: string,
    updates: Partial<CreateAutonomyPolicyInput>
  ): Promise<AutonomyPolicy> {
    const policy = await this.prisma.autonomyRule.findFirst({
      where: { id: policyId, userId },
    });

    if (!policy || this.isPermissionPolicy(policy)) {
      throw new Error('Autonomy policy not found');
    }

    const currentConditions = policy.conditions as AutonomyRuleConditions | null;
    const currentActionConfig = policy.actionConfig as AutonomyRuleActionConfig | null;

    const updated = await this.prisma.autonomyRule.update({
      where: { id: policyId },
      data: {
        name: updates.name ?? policy.name,
        description: updates.description ?? policy.description,
        scope: updates.scope ?? policy.scope,
        conditions: {
          triggers: (updates.triggers ?? currentConditions?.triggers) || [],
          constraints: (updates.constraints ?? currentConditions?.constraints) || [],
          protectedTimeRanges:
            (updates.protectedTimeRanges ?? currentConditions?.protectedTimeRanges) || [],
          requireConfirmationFor:
            (updates.requireConfirmationFor ?? currentConditions?.requireConfirmationFor) || [],
        },
        actionConfig: {
          allowedActions: (updates.allowedActions ?? currentActionConfig?.allowedActions) || [],
          maxChangesPerOperation:
            (updates.maxChangesPerOperation ?? currentActionConfig?.maxChangesPerOperation) || 3,
          maxTimeShiftMinutes:
            (updates.maxTimeShiftMinutes ?? currentActionConfig?.maxTimeShiftMinutes) || 120,
        },
      },
    });

    return this.mapToAutonomyPolicy(updated);
  }

  async deleteAutonomyPolicy(userId: string, policyId: string): Promise<void> {
    const policy = await this.prisma.autonomyRule.findFirst({
      where: { id: policyId, userId },
    });
    if (!policy || this.isPermissionPolicy(policy)) {
      throw new Error('Autonomy policy not found');
    }
    await this.prisma.autonomyRule.delete({ where: { id: policyId } });
  }

  async getReplanSuggestions(userId: string, reason: string) {
    const realityCheck = await this.realityEngine.runRealityCheck({
      userId,
      includeResolved: false,
    });

    const suggestions: any[] = [];

    const missedBlockDeviations = realityCheck.deviations.filter(
      (d) => d.type === 'SCHEDULE_DRIFT'
    );
    if (missedBlockDeviations.length > 0) {
      const totalMissed = missedBlockDeviations.reduce((sum, d) => sum + d.actualValue, 0);
      suggestions.push({
        type: 'RESCHEDULE_MISSED',
        title: 'Reschedule missed time blocks',
        description: `${totalMissed} time blocks were missed`,
        action: 'reschedule',
        priority: 'HIGH' as const,
      });
    }

    const conflictDeviations = realityCheck.deviations.filter(
      (d) => d.type === 'MEETING_LATE' || d.type === 'TASK_OVERRUN'
    );
    if (conflictDeviations.length > 0) {
      suggestions.push({
        type: 'RESOLVE_CONFLICTS',
        title: 'Resolve scheduling conflicts',
        description: `${conflictDeviations.length} conflicts/overruns detected`,
        action: 'resolve_conflicts',
        priority: 'HIGH' as const,
      });
    }

    const deadlineDeviations = realityCheck.deviations.filter(
      (d) => d.type === 'DEADLINE_APPROACHING'
    );
    if (deadlineDeviations.length > 0) {
      suggestions.push({
        type: 'REPRIORITIZE_COMMITMENTS',
        title: 'Reprioritize overdue commitments',
        description: `${deadlineDeviations.length} deadlines at risk`,
        action: 'reprioritize',
        priority: 'MEDIUM' as const,
      });
    }

    return suggestions;
  }

  async applyReplan(userId: string, planId: string) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'REPLAN_APPLIED',
        entityType: 'Replan',
        entityId: planId,
        details: 'Replan applied by user',
      },
    });

    return { success: true, message: 'Replan applied successfully' };
  }

  private async getCurrentSchedule(
    userId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<any[]> {
    const now = new Date();
    const start = timeRange?.start || new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const end = timeRange?.end || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [timeBlocks, events] = await Promise.all([
      this.prisma.timeBlock.findMany({
        where: { userId, startDate: { gte: start, lte: end } },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.event.findMany({
        where: { userId, startDate: { gte: start, lte: end } },
        orderBy: { startDate: 'asc' },
      }),
    ]);

    return [
      ...timeBlocks.map((b) => ({
        id: b.id,
        title: b.title,
        type: 'TIME_BLOCK' as const,
        start: b.startDate.toISOString(),
        end: b.endDate.toISOString(),
        status: b.status,
      })),
      ...events.map((e) => ({
        id: e.id,
        title: e.title,
        type: 'EVENT' as const,
        start: e.startDate.toISOString(),
        end: e.endDate.toISOString(),
        status: e.status,
      })),
    ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  private async generateScheduleOptions(
    userId: string,
    input: any,
    userContext: any,
    autonomyPolicies: AutonomyPolicy[]
  ): Promise<ScheduleOption[]> {
    const options: ScheduleOption[] = [];

    // Option A: Extend current task (minimal disruption)
    options.push(await this.generateExtendCurrentOption(userId, input, userContext));

    // Option B: Shift later tasks (cascade)
    options.push(await this.generateShiftCascadeOption(userId, input, userContext));

    // Option C: Re-prioritize & reschedule (major restructuring)
    options.push(await this.generateReprioritizeOption(userId, input, userContext));

    return options.slice(0, 3);
  }

  private async generateExtendCurrentOption(
    userId: string,
    input: any,
    userContext: any
  ): Promise<ScheduleOption> {
    const affectedEntity = input.affectedEntities[0];
    const extraMinutes = this.estimateExtraTime(input);

    return {
      id: `opt_${Date.now()}_A`,
      label: 'Option A: Extend current task',
      description: `Add ${extraMinutes} minutes to "${affectedEntity.title}" by extending its block`,
      moves: [
        {
          entityType: affectedEntity.type,
          entityId: affectedEntity.id,
          entityTitle: affectedEntity.title,
          from: { start: '', end: '' },
          to: { start: '', end: '' },
          reason: 'Extend duration to complete overrun work',
        },
      ],
      unchanged: [],
      deadlineImpact: await this.assessDeadlineImpact(userId, input, extraMinutes),
      constraintViolations: [],
      tradeoffs: [
        {
          description: 'Completes overrun task without moving other work',
          impact: 'POSITIVE',
          affectedArea: 'DEADLINES',
        },
        {
          description: 'May encroach on break time or next scheduled item',
          impact: 'NEGATIVE',
          affectedArea: 'BREAKS',
        },
      ],
      confidence: 0.85,
      estimatedEffortMinutes: extraMinutes,
    };
  }

  private async generateShiftCascadeOption(
    userId: string,
    input: any,
    userContext: any
  ): Promise<ScheduleOption> {
    const affectedEntity = input.affectedEntities[0];
    const extraMinutes = this.estimateExtraTime(input);

    return {
      id: `opt_${Date.now()}_B`,
      label: 'Option B: Cascade shift later items',
      description: `Push subsequent items ${extraMinutes} minutes later to make room`,
      moves: [
        {
          entityType: affectedEntity.type,
          entityId: affectedEntity.id,
          entityTitle: affectedEntity.title,
          from: { start: '', end: '' },
          to: { start: '', end: '' },
          reason: 'Shift later items to accommodate overrun',
        },
      ],
      unchanged: [
        {
          entityType: affectedEntity.type,
          entityId: affectedEntity.id,
          entityTitle: affectedEntity.title,
          start: '',
          end: '',
        },
      ],
      deadlineImpact: await this.assessDeadlineImpact(userId, input, extraMinutes),
      constraintViolations: [],
      tradeoffs: [
        {
          description: 'Preserves current task structure',
          impact: 'POSITIVE',
          affectedArea: 'PRIORITIES',
        },
        {
          description: 'Multiple items shifted, may cause cascade delays',
          impact: 'NEGATIVE',
          affectedArea: 'DEADLINES',
        },
        {
          description: 'Later meetings/tasks affected',
          impact: 'NEGATIVE',
          affectedArea: 'MEETINGS',
        },
      ],
      confidence: 0.75,
      estimatedEffortMinutes: extraMinutes * 2,
    };
  }

  private async generateReprioritizeOption(
    userId: string,
    input: any,
    userContext: any
  ): Promise<ScheduleOption> {
    const affectedEntity = input.affectedEntities[0];
    const extraMinutes = this.estimateExtraTime(input);

    return {
      id: `opt_${Date.now()}_C`,
      label: 'Option C: Reprioritize & restructure',
      description: `Regenerate schedule with updated priorities and constraints`,
      moves: [
        {
          entityType: affectedEntity.type,
          entityId: affectedEntity.id,
          entityTitle: affectedEntity.title,
          from: { start: '', end: '' },
          to: { start: '', end: '' },
          reason: 'Full schedule regeneration with updated estimates',
        },
      ],
      unchanged: [],
      deadlineImpact: await this.assessDeadlineImpact(userId, input, extraMinutes),
      constraintViolations: [],
      tradeoffs: [
        {
          description: 'Optimal global schedule for new reality',
          impact: 'POSITIVE',
          affectedArea: 'PRIORITIES',
        },
        {
          description: 'Significant changes to multiple time blocks',
          impact: 'NEGATIVE',
          affectedArea: 'WORK_LIFE_BALANCE',
        },
        {
          description: 'May move focus time, meetings, breaks',
          impact: 'NEGATIVE',
          affectedArea: 'FOCUS_TIME',
        },
      ],
      confidence: 0.7,
      estimatedEffortMinutes: extraMinutes * 3,
    };
  }

  private estimateExtraTime(input: any): number {
    const taskOverrun = input.affectedEntities.find((e) => e.type === 'TASK');
    if (taskOverrun) return 90; // Default estimate
    return 60;
  }

  private async assessDeadlineImpact(
    userId: string,
    input: any,
    extraMinutes: number
  ): Promise<ScheduleOption['deadlineImpact']> {
    const impacts: ScheduleOption['deadlineImpact'] = [];

    for (const entity of input.affectedEntities) {
      if (entity.type === 'TASK') {
        const task = await this.prisma.task.findUnique({ where: { id: entity.id } });
        if (task?.dueDate) {
          impacts.push({
            entityId: task.id,
            entityType: 'TASK',
            entityTitle: task.title,
            originalDeadline: task.dueDate.toISOString(),
            newProjectedCompletion: new Date(Date.now() + extraMinutes * 60000).toISOString(),
            impact: extraMinutes > 60 ? 'MAJOR' : 'MINOR',
            daysShift: 0,
          });
        }
      }
    }

    return impacts;
  }

  private selectRecommendedOption(
    options: ScheduleOption[],
    autonomyPolicies: AutonomyPolicy[]
  ): string {
    // Prefer option with highest confidence that doesn't violate hard constraints
    const validOptions = options.filter(
      (o) => o.constraintViolations.filter((v) => v.severity === 'VIOLATION').length === 0
    );
    const best = validOptions.length > 0 ? validOptions[0] : options[0];
    return best.id;
  }

  private requiresUserApproval(
    options: ScheduleOption[],
    urgency: ReplanUrgency,
    autonomyPolicies: AutonomyPolicy[]
  ): boolean {
    if (urgency === 'HIGH') return false;

    // Check if any option requires confirmation per autonomy policies
    for (const policy of autonomyPolicies) {
      if (
        policy.requireConfirmationFor.includes('DEADLINE_CHANGES') ||
        policy.requireConfirmationFor.includes('MEETING_MOVES') ||
        policy.requireConfirmationFor.includes('FOCUS_TIME_CHANGES')
      ) {
        return true;
      }
    }

    // If significant changes (>3 moves or >2 hours shift)
    const maxMoves = Math.max(...options.map((o) => o.moves.length));
    const maxShift = Math.max(...options.map((o) => o.estimatedEffortMinutes));
    if (maxMoves > 3 || maxShift > 120) return true;

    return false;
  }

  private isChangeAllowed(
    move: any,
    autonomyPolicies: AutonomyPolicy[],
    urgency: ReplanUrgency
  ): boolean {
    if (urgency === 'HIGH') return true;

    for (const policy of autonomyPolicies) {
      if (!policy.enabled) continue;

      // Check if action is allowed
      const action = this.mapMoveToAction(
        move.entityType
      ) as AutonomyPolicy['allowedActions'][number];
      if (!policy.allowedActions.includes(action)) {
        return false;
      }

      // Check max changes
      // (simplified - in reality would track per operation)

      // Check protected time ranges
      if (this.violatesProtectedTime(move, policy.protectedTimeRanges)) {
        return false;
      }

      // Check confirmation requirements
      if (
        policy.requireConfirmationFor.includes('DEADLINE_CHANGES') &&
        move.entityType === 'COMMITMENT'
      ) {
        return false;
      }
      if (policy.requireConfirmationFor.includes('MEETING_MOVES') && move.entityType === 'EVENT') {
        return false;
      }
      if (
        policy.requireConfirmationFor.includes('FOCUS_TIME_CHANGES') &&
        move.entityType === 'TIME_BLOCK'
      ) {
        return false;
      }
    }

    return true;
  }

  private mapMoveToAction(entityType: string): string {
    switch (entityType) {
      case 'TASK':
        return 'MOVE_TASK';
      case 'EVENT':
        return 'RESCHEDULE_EVENT';
      case 'TIME_BLOCK':
        return 'MOVE_TASK';
      default:
        return 'MOVE_TASK';
    }
  }

  private violatesProtectedTime(move: any, protectedRanges: any[]): boolean {
    // Simplified check - would need actual time comparison
    return false;
  }

  private async applyMove(userId: string, move: any): Promise<void> {
    switch (move.entityType) {
      case 'TASK':
        const taskBlock = await this.prisma.timeBlock.findFirst({
          where: { taskId: move.entityId, userId },
        });
        if (taskBlock) {
          await this.prisma.timeBlock.update({
            where: { id: taskBlock.id },
            data: {
              startDate: new Date(move.to.start),
              endDate: new Date(move.to.end),
            },
          });
        }
        break;
      case 'EVENT':
        await this.prisma.event.update({
          where: { id: move.entityId, userId },
          data: {
            startDate: new Date(move.to.start),
            endDate: new Date(move.to.end),
          },
        });
        break;
      case 'COMMITMENT':
        // Commitments don't have direct time blocks, update deadline
        await this.prisma.commitment.update({
          where: { id: move.entityId, userId },
          data: { deadline: new Date(move.to.end) },
        });
        break;
    }
  }

  private async getActiveAutonomyPolicies(userId: string): Promise<AutonomyPolicy[]> {
    const policies = await this.prisma.autonomyRule.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: 'desc' },
    });

    return policies.filter((policy) => !this.isPermissionPolicy(policy)).map(this.mapToAutonomyPolicy);
  }

  private isPermissionPolicy(policy: { actionConfig: unknown; scope: string | null }): boolean {
    const config = policy.actionConfig;
    return policy.scope === 'POLICY' || Boolean(
      config &&
      typeof config === 'object' &&
      'calassistPolicy' in config
    );
  }

  private mapToAutonomyPolicy(p: any): AutonomyPolicy {
    const conditions = p.conditions as AutonomyRuleConditions | null;
    const actionConfig = p.actionConfig as AutonomyRuleActionConfig | null;
    return {
      id: p.id,
      userId: p.userId,
      name: p.name,
      description: p.description || '',
      enabled: p.isActive,
      scope: (p.scope as AutonomyPolicy['scope']) || 'GLOBAL',
      triggers: (conditions?.triggers || []) as AutonomyPolicy['triggers'],
      allowedActions: (actionConfig?.allowedActions || []) as AutonomyPolicy['allowedActions'],
      constraints: conditions?.constraints || [],
      maxChangesPerOperation: actionConfig?.maxChangesPerOperation || 3,
      maxTimeShiftMinutes: actionConfig?.maxTimeShiftMinutes || 120,
      protectedTimeRanges: conditions?.protectedTimeRanges || [],
      requireConfirmationFor: (conditions?.requireConfirmationFor ||
        []) as AutonomyPolicy['requireConfirmationFor'],
      priority: p.priority,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}

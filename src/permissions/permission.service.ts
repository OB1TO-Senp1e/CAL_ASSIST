import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import {
  AutonomyLevel,
  PermissionAction,
  PermissionScope,
  PermissionDecision,
  UserPermission,
  AutonomyPolicy,
  AuditAction,
  PermissionCheckInput,
  PermissionCheckResult,
  UndoRequest,
  UndoResult,
  PermissionTemplate,
} from './permission.types';

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  private readonly templates: PermissionTemplate[] = [
    {
      id: 'template_observe',
      name: 'Observer',
      description: 'Read-only access, AI can only observe and report',
      autonomyLevel: 'OBSERVE',
      permissions: [
        { action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'DENY', conditions: {} },
        { action: 'MOVE_EVENT', scope: 'CALENDAR', decision: 'DENY', conditions: {} },
        { action: 'CANCEL_EVENT', scope: 'CALENDAR', decision: 'DENY', conditions: {} },
        { action: 'MODIFY_TASKS', scope: 'TASKS', decision: 'DENY', conditions: {} },
        { action: 'REPLAN_SCHEDULES', scope: 'SCHEDULING', decision: 'DENY', conditions: {} },
        { action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'DENY', conditions: {} },
      ],
      applicability: ['WORK', 'PERSONAL'],
    },
    {
      id: 'template_suggest',
      name: 'Advisor',
      description: 'AI suggests actions but requires confirmation for all changes',
      autonomyLevel: 'SUGGEST',
      permissions: [
        { action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'ASK', conditions: {} },
        { action: 'MOVE_EVENT', scope: 'CALENDAR', decision: 'ASK', conditions: {} },
        { action: 'CANCEL_EVENT', scope: 'CALENDAR', decision: 'ASK', conditions: {} },
        { action: 'MODIFY_TASKS', scope: 'TASKS', decision: 'ASK', conditions: {} },
        { action: 'REPLAN_SCHEDULES', scope: 'SCHEDULING', decision: 'ASK', conditions: {} },
        { action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'ASK', conditions: {} },
      ],
      applicability: ['WORK', 'PERSONAL'],
    },
    {
      id: 'template_ask',
      name: 'Collaborator',
      description: 'AI executes low-risk actions automatically, asks for medium/high risk',
      autonomyLevel: 'ASK_BEFORE_ACTION',
      permissions: [
        { action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'ASK', conditions: {} },
        { action: 'MOVE_EVENT', scope: 'CALENDAR', decision: 'ASK', conditions: {} },
        { action: 'CANCEL_EVENT', scope: 'CALENDAR', decision: 'ASK', conditions: {} },
        { action: 'MODIFY_TASKS', scope: 'TASKS', decision: 'ALLOW', conditions: {} },
        { action: 'REPLAN_SCHEDULES', scope: 'SCHEDULING', decision: 'ASK', conditions: {} },
        { action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'ALLOW', conditions: {} },
      ],
      applicability: ['WORK', 'PERSONAL'],
    },
    {
      id: 'template_auto_low',
      name: 'Assistant',
      description: 'AI handles routine scheduling automatically, asks for significant changes',
      autonomyLevel: 'AUTO_EXECUTE_LOW_RISK',
      permissions: [
        { action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'ALLOW', conditions: { maxDurationMinutes: 60 } },
        { action: 'MOVE_EVENT', scope: 'CALENDAR', decision: 'ALLOW', conditions: { maxShiftMinutes: 30 } },
        { action: 'CANCEL_EVENT', scope: 'CALENDAR', decision: 'ASK', conditions: {} },
        { action: 'MODIFY_TASKS', scope: 'TASKS', decision: 'ALLOW', conditions: {} },
        { action: 'REPLAN_SCHEDULES', scope: 'SCHEDULING', decision: 'ASK', conditions: {} },
        { action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'ALLOW', conditions: {} },
        { action: 'CONTACT_PEOPLE', scope: 'INTEGRATIONS', decision: 'ASK', conditions: {} },
        { action: 'NEGOTIATE_MEETING_TIMES', scope: 'CALENDAR', decision: 'ASK', conditions: {} },
      ],
      applicability: ['WORK', 'PERSONAL'],
    },
    {
      id: 'template_delegated',
      name: 'Delegate',
      description: 'Full autonomy within defined boundaries',
      autonomyLevel: 'DELEGATED_AUTHORITY',
      permissions: [
        { action: 'CREATE_EVENT', scope: 'CALENDAR', decision: 'ALLOW', conditions: {} },
        { action: 'MOVE_EVENT', scope: 'CALENDAR', decision: 'ALLOW', conditions: {} },
        { action: 'CANCEL_EVENT', scope: 'CALENDAR', decision: 'ALLOW', conditions: {} },
        { action: 'MODIFY_TASKS', scope: 'TASKS', decision: 'ALLOW', conditions: {} },
        { action: 'REPLAN_SCHEDULES', scope: 'SCHEDULING', decision: 'ALLOW', conditions: {} },
        { action: 'SEND_NOTIFICATIONS', scope: 'NOTIFICATIONS', decision: 'ALLOW', conditions: {} },
        { action: 'CONTACT_PEOPLE', scope: 'INTEGRATIONS', decision: 'ALLOW', conditions: {} },
        { action: 'NEGOTIATE_MEETING_TIMES', scope: 'CALENDAR', decision: 'ALLOW', conditions: {} },
        { action: 'MODIFY_COMMITMENT', scope: 'COMMITMENTS', decision: 'ALLOW', conditions: {} },
        { action: 'MODIFY_AUTONOMY_POLICIES', scope: 'RULES', decision: 'ASK', conditions: {} },
      ],
      applicability: ['EXECUTIVE'],
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async checkPermission(input: PermissionCheckInput): Promise<PermissionCheckResult> {
    const { userId, action, scope, entityType, entityId, context, initiatedBy, riskLevel } = input;

    const policy = await this.getActiveAutonomyPolicy(userId);
    const explicitPermissions = await this.getUserPermissions(userId, action, scope);
    
    if (explicitPermissions.length > 0) {
      const permission = explicitPermissions[0];
      if (permission.decision === 'ALLOW') {
        return this.createAllowedResult(input, 'Explicit user permission');
      }
      if (permission.decision === 'DENY') {
        return this.createDeniedResult(input, 'Explicit user denial');
      }
      if (permission.decision === 'ASK' || permission.decision === 'CONDITIONAL') {
        return this.createAskResult(input, 'Explicit user permission requires confirmation');
      }
    }

    if (policy) {
      const policyResult = this.evaluateAutonomyPolicy(policy, input);
      if (policyResult) {
        const auditId = await this.createAuditRecord(input, policyResult.decision, policy.id);
        return { ...policyResult, auditRecord: auditId };
      }
    }

    if (initiatedBy === 'USER') {
      return this.createAllowedResult(input, 'User-initiated action');
    }

    if (riskLevel === 'NONE' || riskLevel === 'LOW') {
      return this.createAllowedResult(input, 'Low-risk autonomous action');
    }

    return this.createAskResult(input, 'Risk level requires confirmation');
  }

  private evaluateAutonomyPolicy(policy: AutonomyPolicy, input: PermissionCheckInput): PermissionCheckResult | null {
    const { action, scope, riskLevel, entityId } = input;

    if (!policy.allowedActions.includes(action)) {
      return this.createDeniedResult(input, `Action not allowed by autonomy policy: ${policy.name}`);
    }

    if (policy.enabledScopes.length > 0 && !policy.enabledScopes.includes(scope)) {
      return this.createDeniedResult(input, `Scope not enabled in autonomy policy: ${policy.name}`);
    }

    const riskLevels = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const riskIndex = riskLevels.indexOf(riskLevel);
    const thresholdIndex = riskLevels.indexOf(policy.riskThreshold);
    if (riskIndex > thresholdIndex) {
      return this.createAskResult(input, `Risk level ${riskLevel} exceeds policy threshold ${policy.riskThreshold}`);
    }

    if (policy.requireConfirmationFor.includes(action)) {
      return this.createAskResult(input, `Policy requires confirmation for ${action}`);
    }

    if (entityId && policy.protectedEntities.some(e => e.id === entityId)) {
      return this.createDeniedResult(input, `Entity protected by policy: ${policy.name}`);
    }

    if (this.isTimeRestricted(policy, new Date())) {
      return this.createDeniedResult(input, 'Action restricted by time policy');
    }

    return this.createAllowedResult(input, `Allowed by autonomy policy: ${policy.name}`, policy.id);
  }

  private isTimeRestricted(policy: AutonomyPolicy, now: Date): boolean {
    if (!policy.timeRestrictions?.length) return false;
    
    const currentTime = now.toTimeString().slice(0, 5);
    const currentDay = now.getDay();
    
    for (const restriction of policy.timeRestrictions) {
      if (restriction.days.includes(currentDay)) {
        if (currentTime >= restriction.startTime && currentTime <= restriction.endTime) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Explicit grants read straight from the structured Permission columns.
   * Stage 4k: the whole grant used to be URL-encoded JSON smuggled through the
   * `scope` string behind a `calassist.permission:` prefix; the prefix filter
   * and the decode step are both gone.
   */
  async getUserPermissions(userId: string, action?: PermissionAction, scope?: PermissionScope): Promise<UserPermission[]> {
    const stored = await this.prisma.permission.findMany({
      where: { userId, isActive: true },
    });
    return stored
      .map((permission) => this.mapToUserPermission(permission))
      .filter((permission) =>
        (!action || permission.action === action) &&
        (!scope || permission.scope === scope) &&
        (!permission.expiresAt || new Date(permission.expiresAt) > new Date())
      );
  }

  async grantPermission(userId: string, permission: Omit<UserPermission, 'id' | 'grantedAt' | 'isActive' | 'userId'>): Promise<UserPermission> {
    const saved = await this.prisma.permission.upsert({
      where: {
        userId_action_scope: { userId, action: permission.action, scope: permission.scope },
      },
      update: {
        decision: permission.decision,
        conditions: (permission.conditions ?? {}) as object,
        grantedBy: permission.grantedBy || 'USER',
        expiresAt: permission.expiresAt ? new Date(permission.expiresAt) : null,
        isActive: true,
      },
      create: {
        userId,
        action: permission.action,
        scope: permission.scope,
        decision: permission.decision,
        conditions: (permission.conditions ?? {}) as object,
        grantedBy: permission.grantedBy || 'USER',
        expiresAt: permission.expiresAt ? new Date(permission.expiresAt) : null,
        isActive: true,
      },
    });
    return this.mapToUserPermission(saved);
  }

  async revokePermission(userId: string, permissionId: string): Promise<void> {
    const revoked = await this.prisma.permission.updateMany({
      where: { id: permissionId, userId },
      data: { isActive: false },
    });
    if (revoked.count === 0) {
      throw new NotFoundException('Permission not found');
    }
  }

  /**
   * Stage 4k: policies are rows in the dedicated AutonomyPolicy table. They
   * used to be JSON.stringify-ed into AutonomyRule.actionConfig under a
   * `calassistPolicy` marker, which forced the rules/replanning engines to
   * distinguish row types by sniffing that marker.
   */
  async getAutonomyPolicies(userId: string): Promise<AutonomyPolicy[]> {
    const rows = await this.prisma.autonomyPolicy.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: 'desc' },
    });
    return rows.map((row) => this.mapToAutonomyPolicy(row));
  }

  async getActiveAutonomyPolicy(userId: string): Promise<AutonomyPolicy | null> {
    const row = await this.prisma.autonomyPolicy.findFirst({
      where: { userId, isActive: true },
      orderBy: { priority: 'desc' },
    });
    return row ? this.mapToAutonomyPolicy(row) : null;
  }

  async createAutonomyPolicy(userId: string, input: Omit<AutonomyPolicy, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<AutonomyPolicy> {
    const stored = await this.prisma.autonomyPolicy.create({
      data: {
        userId,
        name: input.name,
        description: input.description,
        autonomyLevel: input.autonomyLevel,
        enabledScopes: input.enabledScopes ?? [],
        allowedActions: input.allowedActions ?? [],
        riskThreshold: input.riskThreshold ?? 'LOW',
        requireConfirmationFor: input.requireConfirmationFor ?? [],
        protectedEntities: (input.protectedEntities ?? []) as object,
        timeRestrictions: (input.timeRestrictions ?? []) as object,
        maxActionsPerPeriod: input.maxActionsPerPeriod as object | undefined,
        isActive: input.isActive ?? true,
        priority: input.priority ?? 0,
      },
    });
    return this.mapToAutonomyPolicy(stored);
  }

  async updateAutonomyPolicy(userId: string, policyId: string, updates: Partial<AutonomyPolicy>): Promise<AutonomyPolicy> {
    const existing = await this.prisma.autonomyPolicy.findFirst({
      where: { id: policyId, userId },
    });
    if (!existing) {
      throw new NotFoundException('Autonomy policy not found');
    }

    const updated = await this.prisma.autonomyPolicy.update({
      where: { id: policyId },
      data: {
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        autonomyLevel: updates.autonomyLevel ?? existing.autonomyLevel,
        enabledScopes: updates.enabledScopes ?? existing.enabledScopes,
        allowedActions: updates.allowedActions ?? existing.allowedActions,
        riskThreshold: updates.riskThreshold ?? existing.riskThreshold,
        requireConfirmationFor: updates.requireConfirmationFor ?? existing.requireConfirmationFor,
        protectedEntities: (updates.protectedEntities ?? existing.protectedEntities) as object,
        timeRestrictions: (updates.timeRestrictions ?? existing.timeRestrictions) as object,
        maxActionsPerPeriod:
          updates.maxActionsPerPeriod === undefined
            ? (existing.maxActionsPerPeriod as object | undefined)
            : (updates.maxActionsPerPeriod as object | undefined),
        isActive: updates.isActive ?? existing.isActive,
        priority: updates.priority ?? existing.priority,
      },
    });
    return this.mapToAutonomyPolicy(updated);
  }

  async deleteAutonomyPolicy(userId: string, policyId: string): Promise<void> {
    const existing = await this.prisma.autonomyPolicy.findFirst({
      where: { id: policyId, userId },
    });
    if (!existing) {
      throw new NotFoundException('Autonomy policy not found');
    }
    await this.prisma.autonomyPolicy.delete({ where: { id: policyId } });
  }

  async applyTemplate(userId: string, templateId: string): Promise<void> {
    const template = this.templates.find(t => t.id === templateId);
    if (!template) throw new BadRequestException('Template not found');

    await this.createAutonomyPolicy(userId, {
      name: template.name,
      description: template.description,
      autonomyLevel: template.autonomyLevel,
      enabledScopes: template.permissions.map(p => p.scope),
      allowedActions: template.permissions.map(p => p.action),
      riskThreshold: this.autonomyLevelToRiskThreshold(template.autonomyLevel),
      requireConfirmationFor: template.permissions
        .filter(p => p.decision === 'ASK')
        .map(p => p.action),
      protectedEntities: [],
      timeRestrictions: [],
      isActive: true,
      priority: 0,
    });

    for (const perm of template.permissions) {
      if (perm.decision !== 'ASK') {
        await this.grantPermission(userId, {
          action: perm.action,
          scope: perm.scope,
          decision: perm.decision,
          conditions: perm.conditions || {},
          grantedBy: 'TEMPLATE',
        });
      }
    }
  }

  getTemplates(): PermissionTemplate[] {
    return this.templates;
  }

  private autonomyLevelToRiskThreshold(level: AutonomyLevel): 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    switch (level) {
      case 'OBSERVE': return 'NONE';
      case 'SUGGEST': return 'LOW';
      case 'ASK_BEFORE_ACTION': return 'LOW';
      case 'AUTO_EXECUTE_LOW_RISK': return 'LOW';
      case 'DELEGATED_AUTHORITY': return 'MEDIUM';
      default: return 'LOW';
    }
  }

  private async createAuditRecord(input: PermissionCheckInput, decision: PermissionDecision, policyId?: string): Promise<string> {
    const audit = await this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType || 'UNKNOWN',
        entityId: input.entityId,
        details: JSON.stringify({
          scope: input.scope,
          decision,
          initiatedBy: input.initiatedBy,
          riskLevel: input.riskLevel,
          context: input.context,
          policyId,
        }),
        newData: { decision },
      },
    });
    return audit.id;
  }

  async undoAction(userId: string, request: UndoRequest): Promise<UndoResult> {
    const auditRecord = await this.prisma.auditLog.findFirst({
      where: { id: request.auditRecordId, userId },
    });

    if (!auditRecord) throw new NotFoundException('Audit record not found');
    if ((auditRecord.details ? JSON.parse(auditRecord.details).wasUndone : false)) throw new BadRequestException('Action already undone');

    const hoursSince = (Date.now() - auditRecord.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 24) {
      return { success: false, message: 'Undo window expired (24 hours)' };
    }

    const restoredState = await this.performUndo(auditRecord);

    await this.prisma.auditLog.update({
      where: { id: request.auditRecordId },
      data: {
        details: JSON.stringify({
          ...JSON.parse(auditRecord.details || '{}'),
          wasUndone: true,
          undoneReason: request.reason,
          restoredState,
        }),
      },
    });

    return { success: true, message: 'Action undone successfully', restoredState };
  }

  private async performUndo(auditRecord: any): Promise<any> {
    const details = JSON.parse(auditRecord.details || '{}');
    const action = auditRecord.action;
    const entityId = auditRecord.entityId;
    const oldData = details.oldData || {};
    
    this.logger.log(`Undoing action ${action} on ${entityId}`);
    return { action, entityId, restoredData: oldData };
  }

  async getAuditHistory(userId: string, filters?: {
    action?: PermissionAction;
    scope?: PermissionScope;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditAction[]> {
    const where: any = { userId };
    if (filters?.action) where.action = filters.action;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const records = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 100,
    });

    return records.map(r => {
      const details = JSON.parse(r.details || '{}');
      return {
        id: r.id,
        userId: r.userId,
        action: r.action as PermissionAction,
        scope: details.scope,
        autonomyLevel: details.autonomyLevel || 'OBSERVE',
        decision: details.decision || 'ALLOW',
        entityType: r.entityType,
        entityId: r.entityId ?? undefined,
        entityTitle: r.entityId ? details.entityTitle : undefined,
        previousState: details.previousState,
        newState: details.newState,
        reason: details.reason,
        initiatedBy: details.initiatedBy || 'USER',
        policyId: details.policyId,
        riskLevel: details.riskLevel || 'NONE',
        wasUndone: details.wasUndone || false,
        createdAt: r.createdAt.toISOString(),
        metadata: details.metadata || {},
      };
    });
  }

  private createAllowedResult(input: PermissionCheckInput, reason: string, policyId?: string): PermissionCheckResult {
    return { allowed: true, decision: 'ALLOW', reason, requiredConfirmation: false, applicablePolicy: policyId };
  }

  private createDeniedResult(input: PermissionCheckInput, reason: string, policyId?: string): PermissionCheckResult {
    return { allowed: false, decision: 'DENY', reason, requiredConfirmation: false, applicablePolicy: policyId };
  }

  private createAskResult(input: PermissionCheckInput, reason: string, policyId?: string): PermissionCheckResult {
    return { allowed: false, decision: 'ASK', reason, requiredConfirmation: true, applicablePolicy: policyId };
  }

  private mapToAutonomyPolicy(p: {
    id: string;
    userId: string;
    name: string;
    description: string | null;
    autonomyLevel: string;
    enabledScopes: string[];
    allowedActions: string[];
    riskThreshold: string;
    requireConfirmationFor: string[];
    protectedEntities: unknown;
    timeRestrictions: unknown;
    maxActionsPerPeriod: unknown;
    isActive: boolean;
    priority: number;
    createdAt: Date;
    updatedAt: Date;
  }): AutonomyPolicy {
    return {
      id: p.id,
      userId: p.userId,
      name: p.name,
      description: p.description ?? undefined,
      autonomyLevel: p.autonomyLevel as AutonomyPolicy['autonomyLevel'],
      enabledScopes: p.enabledScopes as AutonomyPolicy['enabledScopes'],
      allowedActions: p.allowedActions as AutonomyPolicy['allowedActions'],
      riskThreshold: p.riskThreshold as AutonomyPolicy['riskThreshold'],
      requireConfirmationFor:
        p.requireConfirmationFor as AutonomyPolicy['requireConfirmationFor'],
      protectedEntities: Array.isArray(p.protectedEntities)
        ? (p.protectedEntities as AutonomyPolicy['protectedEntities'])
        : [],
      timeRestrictions: Array.isArray(p.timeRestrictions)
        ? (p.timeRestrictions as AutonomyPolicy['timeRestrictions'])
        : [],
      maxActionsPerPeriod: p.maxActionsPerPeriod as AutonomyPolicy['maxActionsPerPeriod'],
      isActive: p.isActive,
      priority: p.priority,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private mapToUserPermission(permission: {
    id: string;
    userId: string;
    action: string;
    scope: string;
    decision: string;
    conditions: unknown;
    grantedBy: string;
    grantedAt: Date;
    expiresAt: Date | null;
    isActive: boolean;
  }): UserPermission {
    return {
      id: permission.id,
      userId: permission.userId,
      action: permission.action as UserPermission['action'],
      scope: permission.scope as UserPermission['scope'],
      decision: permission.decision as UserPermission['decision'],
      conditions:
        permission.conditions && typeof permission.conditions === 'object'
          ? (permission.conditions as Record<string, unknown>)
          : {},
      grantedAt: permission.grantedAt.toISOString(),
      grantedBy: permission.grantedBy,
      expiresAt: permission.expiresAt?.toISOString() ?? null,
      isActive: permission.isActive,
    };
  }
}
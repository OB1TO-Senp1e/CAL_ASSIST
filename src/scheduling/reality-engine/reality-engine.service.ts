import { Injectable, Logger } from '@nestjs/common';
import { DeviationState, RecommendationState } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import { TimeCompilerService } from '../time-compiler/time-compiler.service';
import {
  Deviation,
  DeviationType,
  DeviationSeverity,
  ImpactLevel,
  RecommendationType,
  RealityCheckResult,
  ImpactAnalysis,
  Recommendation,
  RealityCheckInput,
  TaskExecutionAnalysis,
  ProjectHealth,
  ScheduleDrift,
} from './reality.types';

@Injectable()
export class RealityEngineService {
  private readonly logger = new Logger(RealityEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly timeCompiler: TimeCompilerService
  ) {}

  async runRealityCheck(input: RealityCheckInput): Promise<RealityCheckResult> {
    const userId = input.userId;
    const now = new Date();
    const timeRange = input.timeRange
      ? { start: new Date(input.timeRange.start), end: new Date(input.timeRange.end) }
      : { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };

    const entityTypes = input.entityTypes || [
      'TASK',
      'EVENT',
      'GOAL',
      'PROJECT',
      'COMMITMENT',
      'TIME_BLOCK',
    ];

    const deviations: Deviation[] = [];

    if (entityTypes.includes('TASK')) {
      deviations.push(
        ...(await this.detectTaskDeviations(userId, timeRange, now, input.minSeverity))
      );
    }

    if (entityTypes.includes('EVENT')) {
      deviations.push(
        ...(await this.detectEventDeviations(userId, timeRange, now, input.minSeverity))
      );
    }

    if (entityTypes.includes('COMMITMENT')) {
      deviations.push(
        ...(await this.detectCommitmentDeviations(userId, timeRange, now, input.minSeverity))
      );
    }

    if (entityTypes.includes('GOAL')) {
      deviations.push(
        ...(await this.detectGoalDeviations(userId, timeRange, now, input.minSeverity))
      );
    }

    if (entityTypes.includes('PROJECT')) {
      deviations.push(
        ...(await this.detectProjectDeviations(userId, timeRange, now, input.minSeverity))
      );
    }

    if (entityTypes.includes('TIME_BLOCK')) {
      deviations.push(
        ...(await this.detectTimeBlockDeviations(userId, timeRange, now, input.minSeverity))
      );
    }

    const impactAnalyses = await this.analyzeImpacts(userId, deviations);
    const recommendations = await this.generateRecommendations(userId, deviations, impactAnalyses);

    // Overlay persisted acknowledgement/resolution so ack/resolve actually stick.
    const states = await this.prisma.deviationState.findMany({ where: { userId } });
    const stateById = new Map(states.map((s) => [s.deviationId, s]));

    let visible = deviations.map((d) => this.applyState(d, stateById.get(d.id)));

    // includeResolved defaults to false: acknowledged/resolved rows stay hidden
    // so the panel does not keep showing problems the user already handled.
    if (!input.includeResolved) {
      visible = visible.filter((d) => !d.acknowledgedAt && !d.resolvedAt);
    }

    const summary = this.generateSummary(visible, recommendations);

    return {
      timestamp: now.toISOString(),
      deviations: visible,
      impactAnalyses,
      recommendations,
      summary,
    };
  }

  private applyState(deviation: Deviation, state?: { acknowledgedAt: Date | null; resolvedAt: Date | null }): Deviation {
    if (!state) return deviation;
    return {
      ...deviation,
      acknowledgedAt: state.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: state.resolvedAt?.toISOString() ?? null,
    };
  }

  /** Records that the user has seen a deviation, without dismissing it. */
  async acknowledgeDeviation(userId: string, deviationId: string): Promise<DeviationState> {
    const parts = deviationId.split('_');
    const state = await this.prisma.deviationState.upsert({
      where: { userId_deviationId: { userId, deviationId } },
      update: { acknowledgedAt: new Date(), status: 'ACKNOWLEDGED' },
      create: {
        userId,
        deviationId,
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        entityType: parts.length >= 3 ? parts[1] : null,
        entityId: parts.length >= 3 ? parts[2] : null,
      },
    });
    this.logger.log(`Deviation ${deviationId} acknowledged for user ${userId}`);
    return state;
  }

  /** Marks a deviation handled, with an optional free-text resolution. */
  async resolveDeviation(
    userId: string,
    deviationId: string,
    resolution?: string,
  ): Promise<DeviationState> {
    const parts = deviationId.split('_');
    const now = new Date();
    return this.prisma.deviationState.upsert({
      where: { userId_deviationId: { userId, deviationId } },
      update: { resolvedAt: now, status: 'RESOLVED', resolution: resolution ?? null },
      create: {
        userId,
        deviationId,
        status: 'RESOLVED',
        resolvedAt: now,
        resolution: resolution ?? null,
        entityType: parts.length >= 3 ? parts[1] : null,
        entityId: parts.length >= 3 ? parts[2] : null,
      },
    });
  }

  /** Clears ack/resolve state so a deviation reappears in the panel. */
  async reopenDeviation(userId: string, deviationId: string): Promise<void> {
    await this.prisma.deviationState.deleteMany({ where: { userId, deviationId } });
  }

  private async detectTaskDeviations(
    userId: string,
    timeRange: { start: Date; end: Date },
    now: Date,
    minSeverity?: string
  ): Promise<Deviation[]> {
    const deviations: Deviation[] = [];

    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        status: { in: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
        updatedAt: { gte: timeRange.start, lte: timeRange.end },
      },
      include: {
        timeBlocks: true,
        dependencies: { include: { dependsOn: true } },
      },
    });

    for (const task of tasks) {
      if (task.estimatedDurationMin && task.actualDurationMin) {
        const variance = task.actualDurationMin - task.estimatedDurationMin;
        const variancePercent = (variance / task.estimatedDurationMin) * 100;

        if (variancePercent > 25) {
          deviations.push(
            this.createDeviation({
              userId,
              type: 'TASK_OVERRUN',
              severity: this.calculateSeverity(variancePercent, 25, 50, 100),
              title: `Task "${task.title}" overran estimate`,
              description: `Task took ${task.actualDurationMin} minutes vs ${task.estimatedDurationMin} estimated (${variancePercent.toFixed(0)}% over)`,
              entityType: 'TASK',
              entityId: task.id,
              plannedValue: task.estimatedDurationMin,
              actualValue: task.actualDurationMin,
              unit: 'MINUTES',
              metadata: { variance, variancePercent, status: task.status },
            })
          );
        } else if (variancePercent < -25) {
          deviations.push(
            this.createDeviation({
              userId,
              type: 'TASK_UNDERRUN',
              severity: 'LOW',
              title: `Task "${task.title}" completed faster than estimated`,
              description: `Task took ${task.actualDurationMin} minutes vs ${task.estimatedDurationMin} estimated (${Math.abs(variancePercent).toFixed(0)}% under)`,
              entityType: 'TASK',
              entityId: task.id,
              plannedValue: task.estimatedDurationMin,
              actualValue: task.actualDurationMin,
              unit: 'MINUTES',
              metadata: { variance, variancePercent, status: task.status },
            })
          );
        }
      }

      if (task.dueDate && task.dueDate < now && task.status !== 'COMPLETED') {
        const daysUntilDeadline = Math.ceil(
          (task.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        deviations.push(
          this.createDeviation({
            userId,
            type: 'DEADLINE_APPROACHING',
            severity:
              daysUntilDeadline <= 0 ? 'CRITICAL' : daysUntilDeadline <= 1 ? 'HIGH' : 'MEDIUM',
            title: `Task "${task.title}" deadline missed/approaching`,
            description: `Task due ${task.dueDate.toISOString()} is ${daysUntilDeadline <= 0 ? 'overdue' : `${daysUntilDeadline} days away`}`,
            entityType: 'TASK',
            entityId: task.id,
            plannedValue: 0,
            actualValue: daysUntilDeadline,
            unit: 'DAYS',
            metadata: { deadline: task.dueDate.toISOString(), daysUntilDeadline },
          })
        );
      }

      const postponedCount = await this.prisma.scheduleChange.count({
        where: { entityType: 'TASK', entityId: task.id, changeType: 'RESCHEDULE' },
      });

      if (postponedCount >= 3) {
        deviations.push(
          this.createDeviation({
            userId,
            type: 'TASK_POSTPONED',
            severity: postponedCount >= 5 ? 'HIGH' : 'MEDIUM',
            title: `Task "${task.title}" repeatedly postponed`,
            description: `Task has been rescheduled ${postponedCount} times`,
            entityType: 'TASK',
            entityId: task.id,
            plannedValue: 0,
            actualValue: postponedCount,
            unit: 'COUNT',
            metadata: { postponeCount: postponedCount },
          })
        );
      }

      const blockingDeps = task.dependencies.filter(
        (d) => d.dependsOn.status === 'BLOCKED' || d.dependsOn.status === 'CANCELLED'
      );

      if (blockingDeps.length > 0) {
        deviations.push(
          this.createDeviation({
            userId,
            type: 'DEPENDENCY_INCOMPLETE',
            severity: 'HIGH',
            title: `Task "${task.title}" blocked by incomplete dependencies`,
            description: `${blockingDeps.length} dependency(ies) are blocked or cancelled`,
            entityType: 'TASK',
            entityId: task.id,
            plannedValue: 0,
            actualValue: blockingDeps.length,
            unit: 'COUNT',
            metadata: { blockedDependencies: blockingDeps.map((d) => d.dependsOnId) },
          })
        );
      }
    }

    return deviations;
  }

  private async detectEventDeviations(
    userId: string,
    timeRange: { start: Date; end: Date },
    now: Date,
    minSeverity?: string
  ): Promise<Deviation[]> {
    const deviations: Deviation[] = [];

    const events = await this.prisma.event.findMany({
      where: {
        userId,
        startDate: { gte: timeRange.start, lte: timeRange.end },
        status: { in: ['CONFIRMED', 'TENTATIVE'] },
      },
      include: { timeBlocks: true },
    });

    for (const event of events) {
      const scheduledBlocks = event.timeBlocks.filter(
        (b) => b.startDate >= event.startDate && b.endDate <= event.endDate
      );
      if (scheduledBlocks.length > 0) {
        const scheduledDuration =
          scheduledBlocks.reduce(
            (sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()),
            0
          ) / 60000;
        const eventDuration = (event.endDate.getTime() - event.startDate.getTime()) / 60000;

        if (scheduledDuration > eventDuration * 1.1) {
          deviations.push(
            this.createDeviation({
              userId,
              type: 'MEETING_LATE',
              severity: 'MEDIUM',
              title: `Meeting "${event.title}" ran late`,
              description: `Meeting ran ${scheduledDuration.toFixed(0)} minutes vs ${eventDuration} scheduled`,
              entityType: 'EVENT',
              entityId: event.id,
              plannedValue: eventDuration,
              actualValue: scheduledDuration,
              unit: 'MINUTES',
              metadata: { variance: scheduledDuration - eventDuration },
            })
          );
        }
      }
    }

    return deviations;
  }

  private async detectCommitmentDeviations(
    userId: string,
    timeRange: { start: Date; end: Date },
    now: Date,
    minSeverity?: string
  ): Promise<Deviation[]> {
    const deviations: Deviation[] = [];

    const commitments = await this.prisma.commitment.findMany({
      where: { userId, deadline: { gte: timeRange.start, lte: timeRange.end } },
    });

    for (const commitment of commitments) {
      if (commitment.deadline < now && commitment.status !== 'COMPLETED') {
        deviations.push(
          this.createDeviation({
            userId,
            type: 'DEADLINE_APPROACHING',
            severity: 'CRITICAL',
            title: `Commitment "${commitment.title}" deadline missed`,
            description: `Commitment was due ${commitment.deadline.toISOString()}`,
            entityType: 'COMMITMENT',
            entityId: commitment.id,
            plannedValue: 0,
            actualValue: 1,
            unit: 'COUNT',
            metadata: { deadline: commitment.deadline.toISOString() },
          })
        );
      }
    }

    return deviations;
  }

  private async detectGoalDeviations(
    userId: string,
    timeRange: { start: Date; end: Date },
    now: Date,
    minSeverity?: string
  ): Promise<Deviation[]> {
    const deviations: Deviation[] = [];

    const goals = await this.prisma.goal.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        targetDate: { gte: timeRange.start, lte: timeRange.end },
      },
      include: { tasks: true },
    });

    for (const goal of goals) {
      const totalTasks = goal.tasks.length;
      const completedTasks = goal.tasks.filter((t) => t.status === 'COMPLETED').length;
      const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

      if (goal.targetDate && goal.targetDate < now && completionRate < 1) {
        deviations.push(
          this.createDeviation({
            userId,
            type: 'DEADLINE_APPROACHING',
            severity: 'HIGH',
            title: `Goal "${goal.title}" deadline missed with incomplete work`,
            description: `Goal target date passed with only ${(completionRate * 100).toFixed(0)}% completion`,
            entityType: 'GOAL',
            entityId: goal.id,
            plannedValue: 1,
            actualValue: completionRate,
            unit: 'PERCENTAGE',
            metadata: {
              targetDate: goal.targetDate.toISOString(),
              completionRate,
              totalTasks,
              completedTasks,
            },
          })
        );
      }
    }

    return deviations;
  }

  private async detectProjectDeviations(
    userId: string,
    timeRange: { start: Date; end: Date },
    now: Date,
    minSeverity?: string
  ): Promise<Deviation[]> {
    const deviations: Deviation[] = [];

    const projects = await this.prisma.project.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { gte: timeRange.start, lte: timeRange.end },
      },
      include: { tasks: true, milestones: true },
    });

    for (const project of projects) {
      const totalTasks = project.tasks.length;
      const completedTasks = project.tasks.filter((t) => t.status === 'COMPLETED').length;
      const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

      if (project.dueDate && project.dueDate < now && completionRate < 1) {
        deviations.push(
          this.createDeviation({
            userId,
            type: 'DEADLINE_APPROACHING',
            severity: 'HIGH',
            title: `Project "${project.title}" deadline missed`,
            description: `Project due ${project.dueDate.toISOString()} is ${(completionRate * 100).toFixed(0)}% complete`,
            entityType: 'PROJECT',
            entityId: project.id,
            plannedValue: 1,
            actualValue: completionRate,
            unit: 'PERCENTAGE',
            metadata: { dueDate: project.dueDate.toISOString(), completionRate },
          })
        );
      }
    }

    return deviations;
  }

  private async detectTimeBlockDeviations(
    userId: string,
    timeRange: { start: Date; end: Date },
    now: Date,
    minSeverity?: string
  ): Promise<Deviation[]> {
    const deviations: Deviation[] = [];

    const timeBlocks = await this.prisma.timeBlock.findMany({
      where: { userId, startDate: { gte: timeRange.start, lte: timeRange.end } },
    });

    const missedBlocks = timeBlocks.filter(
      (b) => b.status === 'MISSED' || (b.status === 'SCHEDULED' && b.endDate < now)
    );
    if (missedBlocks.length > 3) {
      deviations.push(
        this.createDeviation({
          userId,
          type: 'SCHEDULE_DRIFT',
          severity: missedBlocks.length > 10 ? 'HIGH' : 'MEDIUM',
          title: 'Multiple time blocks missed',
          description: `${missedBlocks.length} time blocks were missed or not completed`,
          entityType: 'TIME_BLOCK',
          entityId: 'batch',
          plannedValue: 0,
          actualValue: missedBlocks.length,
          unit: 'COUNT',
          metadata: { missedBlockIds: missedBlocks.map((b) => b.id) },
        })
      );
    }

    return deviations;
  }

  /**
   * Deviation ids must be reproducible. They were previously
   * `dev_${Date.now()}_${random}`, so a client could never acknowledge or
   * resolve a deviation it had been shown: every /reality/check minted fresh ids
   * for the same underlying problem, and any persisted state was unreachable.
   */
  private createDeviation(params: {
    userId: string;
    type: DeviationType;
    severity: DeviationSeverity;
    title: string;
    description: string;
    entityType: 'TASK' | 'EVENT' | 'GOAL' | 'PROJECT' | 'COMMITMENT' | 'TIME_BLOCK';
    entityId: string;
    plannedValue: number;
    actualValue: number;
    unit: 'MINUTES' | 'HOURS' | 'DAYS' | 'COUNT' | 'PERCENTAGE';
    metadata: Record<string, any>;
  }): Deviation {
    const id = `dev_${params.entityType}_${params.entityId}_${params.type}`;
    return {
      id,
      userId: params.userId,
      type: params.type,
      severity: params.severity,
      title: params.title,
      description: params.description,
      entityType: params.entityType,
      entityId: params.entityId,
      plannedValue: params.plannedValue,
      actualValue: params.actualValue,
      unit: params.unit,
      detectedAt: new Date().toISOString(),
      acknowledgedAt: null,
      resolvedAt: null,
      metadata: params.metadata,
    };
  }

  private calculateSeverity(
    variancePercent: number,
    low: number,
    medium: number,
    high: number
  ): DeviationSeverity {
    if (variancePercent >= high) return 'CRITICAL';
    if (variancePercent >= medium) return 'HIGH';
    if (variancePercent >= low) return 'MEDIUM';
    return 'LOW';
  }

  private async analyzeImpacts(userId: string, deviations: Deviation[]): Promise<ImpactAnalysis[]> {
    const analyses: ImpactAnalysis[] = [];

    for (const deviation of deviations) {
      const analysis = await this.analyzeDeviationImpact(userId, deviation);
      analyses.push(analysis);
    }

    return analyses;
  }

  private async analyzeDeviationImpact(
    userId: string,
    deviation: Deviation
  ): Promise<ImpactAnalysis> {
    const affectedEntities: ImpactAnalysis['directImpact']['affectedEntities'] = [];
    const scheduleConsequences: ImpactAnalysis['directImpact']['scheduleConsequences'] = [];
    const affectedDeadlines: ImpactAnalysis['directImpact']['deadlineRisk']['affectedDeadlines'] =
      [];

    if (deviation.entityType === 'TASK') {
      const task = await this.prisma.task.findUnique({
        where: { id: deviation.entityId },
        include: { goal: true, project: true },
      });
      if (task) {
        affectedEntities.push({
          type: 'TASK',
          id: task.id,
          title: task.title,
          impactLevel: this.severityToImpact(deviation.severity),
          description: `Task ${deviation.type === 'TASK_OVERRUN' ? 'overrun' : deviation.type === 'TASK_POSTPONED' ? 'postponed' : 'behind'}`,
        });

        if (task.dueDate) {
          affectedDeadlines.push({
            entityId: task.id,
            entityType: 'TASK',
            originalDeadline: task.dueDate.toISOString(),
            riskLevel: this.severityToRisk(deviation.severity),
          });
        }

        if (task.goalId) {
          affectedEntities.push({
            type: 'GOAL',
            id: task.goalId,
            title: task.goal?.title || 'Unknown Goal',
            impactLevel: 'MINOR',
            description: 'Parent goal progress affected',
          });
        }

        if (task.projectId) {
          affectedEntities.push({
            type: 'PROJECT',
            id: task.projectId,
            title: task.project?.title || 'Unknown Project',
            impactLevel: 'MINOR',
            description: 'Parent project progress affected',
          });
        }
      }
    }

    if (deviation.entityType === 'EVENT') {
      const event = await this.prisma.event.findUnique({ where: { id: deviation.entityId } });
      if (event) {
        affectedEntities.push({
          type: 'EVENT',
          id: event.id,
          title: event.title,
          impactLevel: this.severityToImpact(deviation.severity),
          description:
            deviation.type === 'MEETING_LATE'
              ? 'Meeting ran over scheduled time'
              : 'Event deviation',
        });
      }
    }

    if (deviation.entityType === 'COMMITMENT') {
      const commitment = await this.prisma.commitment.findUnique({
        where: { id: deviation.entityId },
      });
      if (commitment) {
        affectedEntities.push({
          type: 'COMMITMENT',
          id: commitment.id,
          title: commitment.title,
          impactLevel: this.severityToImpact(deviation.severity),
          description: 'Commitment deadline missed',
        });

        affectedDeadlines.push({
          entityId: commitment.id,
          entityType: 'COMMITMENT',
          originalDeadline: commitment.deadline.toISOString(),
          riskLevel: 'CRITICAL',
        });
      }
    }

    if (deviation.entityType === 'GOAL') {
      const goal = await this.prisma.goal.findUnique({ where: { id: deviation.entityId } });
      if (goal) {
        affectedEntities.push({
          type: 'GOAL',
          id: goal.id,
          title: goal.title,
          impactLevel: this.severityToImpact(deviation.severity),
          description: 'Goal deadline missed with incomplete work',
        });

        affectedDeadlines.push({
          entityId: goal.id,
          entityType: 'GOAL',
          originalDeadline: goal.targetDate?.toISOString() || '',
          riskLevel: this.severityToRisk(deviation.severity),
        });
      }
    }

    if (deviation.entityType === 'PROJECT') {
      const project = await this.prisma.project.findUnique({ where: { id: deviation.entityId } });
      if (project) {
        affectedEntities.push({
          type: 'PROJECT',
          id: project.id,
          title: project.title,
          impactLevel: this.severityToImpact(deviation.severity),
          description: 'Project deadline missed',
        });

        affectedDeadlines.push({
          entityId: project.id,
          entityType: 'PROJECT',
          originalDeadline: project.dueDate?.toISOString() || '',
          riskLevel: this.severityToRisk(deviation.severity),
        });
      }
    }

    if (deviation.entityType === 'TIME_BLOCK') {
      affectedEntities.push({
        type: 'TIME_BLOCK',
        id: 'daily_schedule',
        title: 'Daily Schedule',
        impactLevel: 'MODERATE',
        description: 'Multiple time blocks missed causing schedule drift',
      });
    }

    const cascadingEffects = this.predictCascadingEffects(deviation, affectedEntities);

    return {
      deviationId: deviation.id,
      directImpact: {
        affectedEntities,
        scheduleConsequences,
        deadlineRisk: {
          hasRisk: affectedDeadlines.length > 0,
          affectedDeadlines,
          summary:
            affectedDeadlines.length > 0
              ? `${affectedDeadlines.length} deadline(s) at risk due to this deviation`
              : 'No direct deadline risk',
        },
        resourceImpact: {
          overallocatedResources: [],
          underutilizedResources: [],
        },
        cascadingEffects,
      },
      overallImpactLevel: this.calculateOverallImpact(deviation.severity, affectedEntities.length),
      confidence: 0.8,
    };
  }

  private predictCascadingEffects(
    deviation: Deviation,
    affectedEntities: any[]
  ): ImpactAnalysis['directImpact']['cascadingEffects'] {
    const effects: ImpactAnalysis['directImpact']['cascadingEffects'] = [];

    if (deviation.type === 'TASK_OVERRUN' && deviation.actualValue > deviation.plannedValue * 1.5) {
      effects.push({
        description: 'Significant task overrun may delay dependent tasks',
        probability: 0.7,
        estimatedDelay: deviation.actualValue - deviation.plannedValue,
        unit: 'MINUTES',
      });
    }

    if (deviation.type === 'DEPENDENCY_INCOMPLETE') {
      effects.push({
        description: 'Blocked dependencies prevent task progress',
        probability: 0.9,
        estimatedDelay: 60,
        unit: 'MINUTES',
      });
    }

    if (deviation.type === 'DEADLINE_APPROACHING' && deviation.severity === 'CRITICAL') {
      effects.push({
        description: 'Missed deadline may affect stakeholder commitments',
        probability: 0.8,
        estimatedDelay: 24,
        unit: 'HOURS',
      });
    }

    if (deviation.type === 'TASK_POSTPONED' && deviation.actualValue >= 3) {
      effects.push({
        description: 'Repeated postponement indicates scheduling or priority issues',
        probability: 0.6,
        estimatedDelay: deviation.actualValue * 30,
        unit: 'MINUTES',
      });
    }

    return effects;
  }

  private severityToImpact(severity: DeviationSeverity): ImpactLevel {
    switch (severity) {
      case 'CRITICAL':
        return 'SEVERE';
      case 'HIGH':
        return 'MAJOR';
      case 'MEDIUM':
        return 'MODERATE';
      case 'LOW':
        return 'MINOR';
      default:
        return 'NEGLIGIBLE';
    }
  }

  private severityToRisk(severity: DeviationSeverity): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    switch (severity) {
      case 'CRITICAL':
        return 'CRITICAL';
      case 'HIGH':
        return 'HIGH';
      case 'MEDIUM':
        return 'MEDIUM';
      case 'LOW':
        return 'LOW';
      default:
        return 'LOW';
    }
  }

  private calculateOverallImpact(severity: DeviationSeverity, affectedCount: number): ImpactLevel {
    const baseImpact = this.severityToImpact(severity);
    const levels: ImpactLevel[] = ['NEGLIGIBLE', 'MINOR', 'MODERATE', 'MAJOR', 'SEVERE'];
    const baseIndex = levels.indexOf(baseImpact);
    const adjustedIndex = Math.min(baseIndex + Math.floor(affectedCount / 3), levels.length - 1);
    return levels[adjustedIndex];
  }

  private async generateRecommendations(
    userId: string,
    deviations: Deviation[],
    impactAnalyses: ImpactAnalysis[],
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    for (const deviation of deviations) {
      const analysis = impactAnalyses.find((a) => a.deviationId === deviation.id);
      const recs = await this.generateRecommendationsForDeviation(userId, deviation, analysis);
      recommendations.push(...recs);
    }

    // Replace the random per-call ids with deterministic ones so a recommendation
    // shown in the panel can be accepted or rejected on a later request.
    // Colon-delimited because deviation ids themselves contain underscores.
    const seen = new Map<string, number>();
    const stable = recommendations.map((rec) => {
      const base = `rec:${rec.deviationId}:${rec.type}`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return { ...rec, id: count === 0 ? base : `${base}#${count}` };
    });

    return this.applyRecommendationStates(userId, stable);
  }

  /** Overlays persisted accept/reject status onto freshly generated recommendations. */
  private async applyRecommendationStates(
    userId: string,
    recommendations: Recommendation[],
  ): Promise<Recommendation[]> {
    if (!recommendations.length) return recommendations;

    const states = await this.prisma.recommendationState.findMany({ where: { userId } });
    if (!states.length) return recommendations;

    const byId = new Map(states.map((s) => [s.recommendationId, s]));
    return recommendations.map((rec) => {
      const state = byId.get(rec.id);
      if (!state) return rec;
      return {
        ...rec,
        status: state.status as Recommendation['status'],
        acceptedAt: state.acceptedAt?.toISOString() ?? rec.acceptedAt ?? null,
      };
    });
  }

  /** Records the user's decision on a recommendation. */
  async setRecommendationStatus(
    userId: string,
    recommendationId: string,
    status: 'ACCEPTED' | 'REJECTED',
  ): Promise<RecommendationState> {
    // Ids are `rec:<deviationId>:<TYPE>[#n]`; recover the deviation for lookup.
    const parts = recommendationId.split(':');
    const deviationId = parts.length >= 3 ? parts[1] : recommendationId;
    const now = new Date();

    return this.prisma.recommendationState.upsert({
      where: {
        userId_recommendationId: { userId, recommendationId },
      },
      update: {
        status,
        acceptedAt: status === 'ACCEPTED' ? now : null,
        rejectedAt: status === 'REJECTED' ? now : null,
      },
      create: {
        userId,
        recommendationId,
        deviationId,
        status,
        acceptedAt: status === 'ACCEPTED' ? now : null,
        rejectedAt: status === 'REJECTED' ? now : null,
      },
    });
  }

  private async generateRecommendationsForDeviation(
    userId: string,
    deviation: Deviation,
    analysis?: ImpactAnalysis
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    switch (deviation.type) {
      case 'TASK_OVERRUN': {
        const extraTime = deviation.actualValue - deviation.plannedValue;
        recommendations.push({
          id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          deviationId: deviation.id,
          type: 'ALLOCATE_TIME',
          title: `Allocate ${extraTime} minutes to complete "${deviation.title.replace('Task "', '').replace('" overran estimate', '')}"`,
          description: `Task overran by ${extraTime} minutes. Additional time needed to complete.`,
          whatChanged: `Task took ${deviation.actualValue} min vs ${deviation.plannedValue} min estimated`,
          whyItMatters:
            'Without additional allocation, task remains incomplete affecting downstream work',
          options: [
            {
              id: 'opt1',
              label: 'Extend task in current day',
              description: 'Find available slot today to finish',
              estimatedEffort: extraTime,
              unit: 'MINUTES',
              pros: ['Completes task quickly', 'No deadline changes'],
              cons: ['May displace other work'],
              feasibility: 0.7,
            },
            {
              id: 'opt2',
              label: 'Schedule completion tomorrow',
              description: 'Allocate time first thing tomorrow',
              estimatedEffort: extraTime,
              unit: 'MINUTES',
              pros: ['Fresh start', 'Full focus block'],
              cons: ['Delays completion by 1 day'],
              feasibility: 0.9,
            },
          ],
          priority: extraTime > 60 ? 'HIGH' : 'MEDIUM',
          estimatedResolutionTime: extraTime,
          unit: 'MINUTES',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          acceptedAt: null,
          completedAt: null,
        });
        break;
      }

      case 'TASK_POSTPONED': {
        recommendations.push({
          id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          deviationId: deviation.id,
          type: 'RESCHEDULE_TASK',
          title: `Review scheduling for repeatedly postponed task`,
          description: `Task postponed ${deviation.actualValue} times. May need priority reassessment.`,
          whatChanged: `Task rescheduled ${deviation.actualValue} times`,
          whyItMatters:
            'Repeated postponement suggests unrealistic scheduling or misaligned priorities',
          options: [
            {
              id: 'opt1',
              label: 'Reduce scope and complete',
              description: 'Define minimum viable completion',
              estimatedEffort: 30,
              unit: 'MINUTES',
              pros: ['Unblocks progress', 'Provides momentum'],
              cons: ['May not achieve full goal'],
              feasibility: 0.8,
            },
            {
              id: 'opt2',
              label: 'Reprioritize or cancel',
              description: 'Move to lower priority or remove',
              estimatedEffort: 15,
              unit: 'MINUTES',
              pros: ['Frees up schedule', 'Reduces cognitive load'],
              cons: ['Goal not achieved'],
              feasibility: 0.6,
            },
            {
              id: 'opt3',
              label: 'Block dedicated focus time',
              description: 'Protect time to force completion',
              estimatedEffort: 120,
              unit: 'MINUTES',
              pros: ['Ensures progress', 'Builds habit'],
              cons: ['Requires discipline'],
              feasibility: 0.5,
            },
          ],
          priority: 'HIGH',
          estimatedResolutionTime: 30,
          unit: 'MINUTES',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          acceptedAt: null,
          completedAt: null,
        });
        break;
      }

      case 'MEETING_LATE': {
        recommendations.push({
          id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          deviationId: deviation.id,
          type: 'ADD_BUFFER',
          title: `Add buffer after meetings that tend to run late`,
          description: `Meeting ran ${deviation.actualValue - deviation.plannedValue} minutes over`,
          whatChanged: `Meeting exceeded scheduled duration by ${deviation.actualValue - deviation.plannedValue} minutes`,
          whyItMatters: 'Late meetings cascade into subsequent schedule disruptions',
          options: [
            {
              id: 'opt1',
              label: 'Add 15-min buffer after this meeting type',
              description: 'Automatically add buffer to future similar meetings',
              estimatedEffort: 15,
              unit: 'MINUTES',
              pros: ['Prevents future cascading delays'],
              cons: ['Reduces available scheduling time'],
              feasibility: 0.9,
            },
          ],
          priority: 'MEDIUM',
          estimatedResolutionTime: 15,
          unit: 'MINUTES',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          acceptedAt: null,
          completedAt: null,
        });
        break;
      }

      case 'DEADLINE_APPROACHING': {
        if (deviation.severity === 'CRITICAL' || deviation.severity === 'HIGH') {
          recommendations.push({
            id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            deviationId: deviation.id,
            type: 'ALLOCATE_TIME',
            title: `Urgent: Allocate time to meet deadline for "${deviation.title}"`,
            description: `Deadline ${deviation.metadata?.deadline || 'passed'} with work incomplete`,
            whatChanged: `Deadline missed or imminent with ${deviation.entityType.toLowerCase()} incomplete`,
            whyItMatters: 'Missed deadlines affect commitments, trust, and downstream dependencies',
            options: [
              {
                id: 'opt1',
                label: 'Emergency time block today',
                description: 'Schedule 90-120 min focus session immediately',
                estimatedEffort: 120,
                unit: 'MINUTES',
                pros: ['Addresses urgency immediately'],
                cons: ['Displaces other work'],
                feasibility: 0.6,
              },
              {
                id: 'opt2',
                label: 'Request deadline extension',
                description: 'Communicate with stakeholders for extension',
                estimatedEffort: 30,
                unit: 'MINUTES',
                pros: ['Realistic timeline', 'Manages expectations'],
                cons: ['May affect reputation'],
                feasibility: 0.8,
              },
            ],
            priority: 'URGENT',
            estimatedResolutionTime: 120,
            unit: 'MINUTES',
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            acceptedAt: null,
            completedAt: null,
          });
        }
        break;
      }

      case 'DEPENDENCY_INCOMPLETE': {
        recommendations.push({
          id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          deviationId: deviation.id,
          type: 'RESOLVE_CONFLICT',
          title: `Resolve blocked dependencies for task`,
          description: `${deviation.actualValue} dependencies are blocked or cancelled`,
          whatChanged: `Blocking dependencies prevent task progress`,
          whyItMatters: 'Task cannot proceed until dependencies are resolved',
          options: [
            {
              id: 'opt1',
              label: 'Unblock or complete dependencies',
              description: 'Focus on clearing blocking tasks first',
              estimatedEffort: 60,
              unit: 'MINUTES',
              pros: ['Unblocks main task'],
              cons: ['May require context switching'],
              feasibility: 0.8,
            },
            {
              id: 'opt2',
              label: 'Redesign task to remove dependency',
              description: 'Modify approach to work independently',
              estimatedEffort: 45,
              unit: 'MINUTES',
              pros: ['Removes blocker permanently'],
              cons: ['May require rework'],
              feasibility: 0.5,
            },
          ],
          priority: 'HIGH',
          estimatedResolutionTime: 60,
          unit: 'MINUTES',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          acceptedAt: null,
          completedAt: null,
        });
        break;
      }

      case 'SCHEDULE_DRIFT': {
        recommendations.push({
          id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          deviationId: deviation.id,
          type: 'RESCHEDULE_TASK',
          title: 'Review and rebuild daily schedule',
          description: `${deviation.actualValue} time blocks missed - schedule drift detected`,
          whatChanged: 'Multiple scheduled blocks not executed',
          whyItMatters: 'Schedule drift compounds and erodes planning reliability',
          options: [
            {
              id: 'opt1',
              label: 'Re-plan remaining day with Time Compiler',
              description: 'Regenerate schedule for remaining hours',
              estimatedEffort: 30,
              unit: 'MINUTES',
              pros: ['Realistic updated plan'],
              cons: ['May defer some work'],
              feasibility: 0.9,
            },
            {
              id: 'opt2',
              label: 'Identify root cause (overcommitment, interruptions, estimation)',
              description: 'Analyze pattern and adjust preferences',
              estimatedEffort: 15,
              unit: 'MINUTES',
              pros: ['Prevents recurrence'],
              cons: ['Takes time to analyze'],
              feasibility: 0.7,
            },
          ],
          priority: 'HIGH',
          estimatedResolutionTime: 30,
          unit: 'MINUTES',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          acceptedAt: null,
          completedAt: null,
        });
        break;
      }
    }

    return recommendations;
  }

  private generateSummary(
    deviations: Deviation[],
    recommendations: Recommendation[]
  ): RealityCheckResult['summary'] {
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const d of deviations) {
      bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
      byType[d.type] = (byType[d.type] || 0) + 1;
    }

    return {
      totalDeviations: deviations.length,
      bySeverity,
      byType,
      criticalCount: bySeverity.CRITICAL || 0,
      highCount: bySeverity.HIGH || 0,
      actionableRecommendations: recommendations.filter((r) => r.status === 'PENDING').length,
    };
  }

  async getTaskExecutionAnalysis(userId: string, taskId: string): Promise<TaskExecutionAnalysis> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      include: {
        timeBlocks: { orderBy: { startDate: 'asc' } },
        dependencies: { include: { dependsOn: true } },
      },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    const plannedDuration = task.estimatedDurationMin || 0;
    const actualDuration =
      task.actualDurationMin ||
      task.timeBlocks.reduce(
        (sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 60000,
        0
      );

    const variance = actualDuration - plannedDuration;
    const variancePercent = plannedDuration > 0 ? (variance / plannedDuration) * 100 : 0;

    let status: 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'CRITICAL';
    if (variancePercent <= 10) status = 'ON_TRACK';
    else if (variancePercent <= 25) status = 'AT_RISK';
    else if (variancePercent <= 50) status = 'BEHIND';
    else status = 'CRITICAL';

    const recommendations = await this.generateRecommendationsForDeviation(userId, {
      id: '',
      userId,
      type: variancePercent > 0 ? 'TASK_OVERRUN' : 'TASK_UNDERRUN',
      severity: status === 'CRITICAL' ? 'CRITICAL' : status === 'BEHIND' ? 'HIGH' : 'MEDIUM',
      title: '',
      description: '',
      entityType: 'TASK',
      entityId: taskId,
      plannedValue: plannedDuration,
      actualValue: actualDuration,
      unit: 'MINUTES',
      detectedAt: new Date().toISOString(),
      acknowledgedAt: null,
      resolvedAt: null,
      metadata: {},
    });

    return {
      taskId,
      plannedDuration,
      actualDuration,
      variance,
      variancePercent,
      status,
      milestones: [],
      dependencies: task.dependencies.map((d) => ({
        taskId: d.dependsOnId,
        title: d.dependsOn.title,
        status: d.dependsOn.status,
        blocksCompletion: d.dependsOn.status !== 'COMPLETED',
      })),
      recommendations,
    };
  }

  async getProjectHealth(userId: string, projectId: string): Promise<ProjectHealth> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: { tasks: true, milestones: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const totalTasks = project.tasks.length;
    const completedTasks = project.tasks.filter((t) => t.status === 'COMPLETED').length;
    const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

    const milestonesOnTrack = project.milestones.filter(
      (m) => m.status === 'COMPLETED' || (m.dueDate > new Date() && m.status !== 'BLOCKED')
    ).length;
    const milestonesAtRisk = project.milestones.filter(
      (m) => m.dueDate <= new Date() && m.status !== 'COMPLETED'
    ).length;

    const deviations = await this.detectProjectDeviations(
      userId,
      {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
      new Date()
    );

    const recommendations = await this.generateRecommendations(userId, deviations, []);

    let overallHealth: 'HEALTHY' | 'AT_RISK' | 'CRITICAL' | 'OFF_TRACK';
    if (completionRate >= 0.8 && milestonesAtRisk === 0) overallHealth = 'HEALTHY';
    else if (completionRate >= 0.5 && milestonesAtRisk <= 1) overallHealth = 'AT_RISK';
    else if (completionRate >= 0.3) overallHealth = 'CRITICAL';
    else overallHealth = 'OFF_TRACK';

    const upcomingDeadlines = [
      ...(project.dueDate
        ? [
            {
              id: project.id,
              title: project.title,
              deadline: project.dueDate.toISOString(),
              daysRemaining: Math.ceil(
                (project.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              ),
              riskLevel:
                overallHealth === 'OFF_TRACK' ? 'HIGH' : ('MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH'),
            },
          ]
        : []),
      ...project.milestones
        .filter((m) => m.dueDate > new Date())
        .map((m) => ({
          id: m.id,
          title: m.title,
          deadline: m.dueDate.toISOString(),
          daysRemaining: Math.ceil((m.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          riskLevel:
            m.dueDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              ? 'HIGH'
              : ('MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH'),
        })),
    ].sort((a, b) => a.daysRemaining - b.daysRemaining);

    return {
      projectId,
      overallHealth,
      scheduleVariance: 0,
      completionRate,
      milestonesOnTrack,
      milestonesAtRisk,
      upcomingDeadlines,
      deviations,
      recommendations,
    };
  }

  async getScheduleDrift(userId: string, date: Date): Promise<ScheduleDrift> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const timeBlocks = await this.prisma.timeBlock.findMany({
      where: { userId, startDate: { gte: dayStart, lte: dayEnd } },
    });

    const plannedHours = timeBlocks.reduce(
      (sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 3600000,
      0
    );
    const completedBlocks = timeBlocks.filter(
      (b) => b.status === 'COMPLETED' || b.status === 'IN_PROGRESS'
    );
    const actualHours = completedBlocks.reduce(
      (sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 3600000,
      0
    );

    const variance = actualHours - plannedHours;
    const variancePercent = plannedHours > 0 ? (variance / plannedHours) * 100 : 0;

    const categories: Record<string, number> = {};
    for (const block of timeBlocks) {
      categories[block.blockType] =
        (categories[block.blockType] || 0) +
        (block.endDate.getTime() - block.startDate.getTime()) / 3600000;
    }

    const deviations = await this.detectTimeBlockDeviations(
      userId,
      { start: dayStart, end: dayEnd },
      new Date()
    );

    return {
      date: date.toISOString(),
      plannedHours,
      actualHours,
      variance,
      variancePercent,
      categories,
      topDeviations: deviations.slice(0, 5),
    };
  }
}

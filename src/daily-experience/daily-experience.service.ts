import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { AiProviderService } from '../integrations/ai-providers/ai-provider.service';
import { RealityEngineService } from '../scheduling/reality-engine/reality-engine.service';
import { ReplanningEngineService } from '../scheduling/replanning-engine/replanning-engine.service';
import { CommitmentEngineService } from '../commitments/commitment-engine.service';
import { ProactiveAssistantService } from '../ai/proactive/proactive-assistant.service';
import { MeetingIntelligenceService } from '../meetings/meeting-intelligence.service';
import { TimeCompilerService } from '../scheduling/time-compiler/time-compiler.service';
import {
  MorningBriefing,
  CurrentActivity,
  EveningWrapup,
  BriefingItem,
  MorningBriefingSchema,
  CurrentActivitySchema,
  EveningWrapupSchema,
  DailyExperienceConfig,
} from './daily-experience.types';

@Injectable()
export class DailyExperienceService {
  private readonly logger = new Logger(DailyExperienceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly realityEngine: RealityEngineService,
    private readonly replanningEngine: ReplanningEngineService,
    private readonly commitmentEngine: CommitmentEngineService,
    private readonly proactiveAssistant: ProactiveAssistantService,
    private readonly meetingIntelligence: MeetingIntelligenceService,
    private readonly timeCompiler: TimeCompilerService,
  ) {}

  async generateMorningBriefing(userId: string, date: Date, config: any): Promise<MorningBriefing> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [
      events,
      tasks,
      commitments,
      realityCheck,
      proactiveCheck,
      userPreferences,
    ] = await Promise.all([
      this.prisma.event.findMany({
        where: { userId, startDate: { gte: dayStart, lte: dayEnd }, status: { in: ['CONFIRMED', 'TENTATIVE'] } },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.task.findMany({
        where: { userId, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { gte: dayStart, lte: dayEnd } },
        orderBy: { priority: 'desc' },
      }),
      this.prisma.commitment.findMany({
        where: { userId, status: { in: ['PENDING', 'IN_PROGRESS'] }, deadline: { gte: dayStart, lte: dayEnd } },
        orderBy: { deadline: 'asc' },
      }),
      this.realityEngine.runRealityCheck({ userId, timeRange: { start: dayStart.toISOString(), end: dayEnd.toISOString() }, includeResolved: false }),
      this.proactiveAssistant.runProactiveCheck({ userId, timeRange: { start: dayStart.toISOString(), end: dayEnd.toISOString() }, limit: 10 }),
      this.prisma.preference.findMany({ where: { userId } }),
    ]);

    const items = await this.generateBriefingItems(userId, events, tasks, commitments, realityCheck, proactiveCheck);
    const schedule = this.buildSchedule(events, tasks);
    const risks = this.assessRisks(realityCheck, proactiveCheck, commitments);
    const preparation = this.generatePreparationRequirements(events, tasks, commitments);
    const focusBlocks = this.recommendFocusBlocks(events, tasks, config);
    const metrics = this.calculateMetrics(events, tasks);

    const summary = this.generateMorningSummary(items, risks, schedule, metrics);

    return {
      date: date.toISOString(),
      generatedAt: new Date().toISOString(),
      timezone: config.timezone || 'UTC',
      summary,
      items: items.filter(i => this.matchesBriefingLength(i, config.briefingLength)),
      schedule,
      risks,
      preparationRequirements: preparation,
      recommendedFocusBlocks: focusBlocks,
      metrics,
    };
  }

  private async generateBriefingItems(
    userId: string,
    events: any[],
    tasks: any[],
    commitments: any[],
    realityCheck: any,
    proactiveCheck: any,
  ): Promise<any[]> {
    const items: any[] = [];

    // Priority tasks due today
    const highPriorityTasks = tasks.filter(t => t.priority >= 8).slice(0, 3);
    for (const task of highPriorityTasks) {
      items.push({
        id: `task_${task.id}`,
        title: `Complete: ${task.title}`,
        description: `Priority ${task.priority}${task.dueDate ? `, due ${new Date(task.dueDate).toLocaleTimeString()}` : ''}`,
        priority: 'HIGH',
        category: 'PRIORITY_TASK',
        timeEstimateMinutes: task.estimatedDurationMin || 60,
        dueBy: task.dueDate?.toISOString(),
        relatedEntity: { type: 'TASK', id: task.id, title: task.title },
        actionable: true,
        estimatedImpact: 'HIGH',
      });
    }

    // Meeting preparation
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayMeetings = events.filter(e => e.startDate >= todayStart && e.startDate <= todayEnd);
    for (const meeting of todayMeetings.slice(0, 3)) {
      const prepTime = 15;
      items.push({
        id: `prep_${meeting.id}`,
        title: `Prepare for: ${meeting.title}`,
        description: `Meeting at ${new Date(meeting.startDate).toLocaleTimeString()}${meeting.location ? ` in ${meeting.location}` : ''}`,
        priority: 'HIGH',
        category: 'MEETING_PREP',
        timeEstimateMinutes: prepTime,
        dueBy: meeting.startDate.toISOString(),
        relatedEntity: { type: 'EVENT', id: meeting.id, title: meeting.title },
        actionable: true,
        estimatedImpact: 'HIGH',
      });
    }

    // Commitments due today
    const commitmentEnd = new Date();
    commitmentEnd.setHours(23, 59, 59, 999);
    const todayCommitments = commitments.filter(c => new Date(c.deadline) <= commitmentEnd);
    for (const commitment of todayCommitments.slice(0, 2)) {
      items.push({
        id: `commit_${commitment.id}`,
        title: `Commitment: ${commitment.object}`,
        description: `Due by ${new Date(commitment.deadline).toLocaleTimeString()}`,
        priority: 'URGENT',
        category: 'COMMITMENT',
        dueBy: commitment.deadline.toISOString(),
        relatedEntity: { type: 'COMMITMENT', id: commitment.id, title: commitment.object },
        actionable: true,
        estimatedImpact: 'CRITICAL',
      });
    }

    // Risks from reality check
    for (const deviation of realityCheck.deviations?.slice(0, 2) || []) {
      items.push({
        id: `risk_${deviation.id}`,
        title: `Risk: ${deviation.title}`,
        description: deviation.description,
        priority: deviation.severity === 'CRITICAL' ? 'URGENT' : 'HIGH',
        category: 'RISK',
        relatedEntity: { type: deviation.entityType, id: deviation.entityId, title: deviation.title },
        actionable: true,
        estimatedImpact: deviation.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
      });
    }

    // Proactive interventions
    for (const intervention of proactiveCheck.interventions?.slice(0, 2) || []) {
      items.push({
        id: `proactive_${intervention.id}`,
        title: intervention.title,
        description: intervention.description,
        priority: intervention.priority,
        category: intervention.type === 'CALENDAR_OVERLOAD' ? 'SCHEDULE_CONFLICT' : 'RISK',
        relatedEntity: intervention.affectedEntities?.[0] ? { type: intervention.affectedEntities[0].type, id: intervention.affectedEntities[0].id, title: intervention.affectedEntities[0].title } : undefined,
        actionable: intervention.action !== 'NO_ACTION',
        estimatedImpact: intervention.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
      });
    }

    // Focus block suggestions
    items.push({
      id: 'focus_morning',
      title: 'Deep work block (9:00-11:00)',
      description: 'High-energy morning window for deep work',
      priority: 'MEDIUM',
      category: 'FOCUS_BLOCK',
      timeEstimateMinutes: 120,
      actionable: true,
      estimatedImpact: 'HIGH',
    });

    return items;
  }

  private buildSchedule(events: any[], tasks: any[]) {
    type ScheduleItem = {
      id: string;
      title: string;
      type: 'FOCUS' | 'MEETING' | 'TRAVEL' | 'BREAK' | 'PERSONAL' | 'BUFFER' | 'ADMIN' | 'DEEP_WORK' | 'SHALLOW_WORK';
      startTime: string;
      endTime: string;
      location?: string;
      confidence: number;
      isFixed: boolean;
    };

    const schedule: ScheduleItem[] = [...events].map(e => ({
      id: e.id,
      title: e.title,
      type: 'MEETING' as const,
      startTime: e.startDate.toISOString(),
      endTime: e.endDate.toISOString(),
      location: e.location || undefined,
      confidence: 1.0,
      isFixed: true,
    }));

    // Add time-blocked tasks
    const timeBlockedTasks = tasks.filter(t => t.timeBlocks?.length > 0);
    for (const task of timeBlockedTasks) {
      for (const block of task.timeBlocks || []) {
        schedule.push({
          id: block.id,
          title: task.title,
          type: 'DEEP_WORK' as const,
          startTime: block.startDate.toISOString(),
          endTime: block.endDate.toISOString(),
          location: undefined,
          confidence: 0.9,
          isFixed: false,
        });
      }
    }

    return schedule.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  private assessRisks(realityCheck: any, proactiveCheck: any, commitments: any[]) {
    const risks: any[] = [];

    for (const deviation of realityCheck.deviations || []) {
      risks.push({
        id: deviation.id,
        title: deviation.title,
        description: deviation.description,
        level: deviation.severity,
        affectedEntities: deviation.affectedEntities || [],
        mitigation: deviation.recommendation?.options?.[0]?.description,
      });
    }

    for (const intervention of proactiveCheck.interventions || []) {
      if (intervention.priority === 'URGENT' || intervention.priority === 'HIGH') {
        risks.push({
          id: intervention.id,
          title: intervention.title,
          description: intervention.description,
          level: intervention.priority === 'URGENT' ? 'CRITICAL' : 'HIGH',
          affectedEntities: intervention.affectedEntities || [],
          mitigation: intervention.options?.[0]?.description,
        });
      }
    }

    // Overdue commitments
    const overdue = commitments.filter(c => new Date(c.deadline) < new Date());
    for (const c of overdue.slice(0, 2)) {
      risks.push({
        id: `overdue_${c.id}`,
        title: `Overdue: ${c.title}`,
        description: `Commitment due ${new Date(c.deadline).toLocaleDateString()} not completed`,
        level: 'CRITICAL',
        affectedEntities: [{ type: 'COMMITMENT', id: c.id, title: c.title }],
        mitigation: 'Complete immediately or communicate delay',
      });
    }

    return risks;
  }

  private generatePreparationRequirements(events: any[], tasks: any[], commitments: any[]) {
    const requirements: any[] = [];

    for (const event of events) {
      if (event.startDate > new Date() && event.startDate < new Date(Date.now() + 24 * 60 * 60 * 1000)) {
        requirements.push({
          entityType: 'EVENT',
          entityId: event.id,
          title: event.title,
          requirement: 'Prepare materials and review agenda',
          timeEstimateMinutes: 15,
          dueBy: event.startDate.toISOString(),
        });
      }
    }

    const urgentTasks = tasks.filter(t => t.priority >= 8 && t.dueDate && new Date(t.dueDate) < new Date(Date.now() + 24 * 60 * 60 * 1000));
    for (const task of urgentTasks.slice(0, 3)) {
      requirements.push({
        entityType: 'TASK',
        entityId: task.id,
        title: task.title,
        requirement: 'Complete or make significant progress',
        timeEstimateMinutes: task.estimatedDurationMin || 60,
        dueBy: task.dueDate?.toISOString(),
      });
    }

    return requirements;
  }

  private recommendFocusBlocks(events: any[], tasks: any[], config: any) {
    const blocks: any[] = [];
    const now = new Date();
    const morningStart = new Date(now);
    morningStart.setHours(9, 0, 0, 0);

    // Find first available 2-hour window in morning
    const morningMeetings = events.filter(e => 
      e.startDate >= morningStart && e.startDate < new Date(morningStart.getTime() + 4 * 60 * 60 * 1000)
    );

    if (morningMeetings.length === 0) {
      blocks.push({
        startTime: morningStart.toISOString(),
        endTime: new Date(morningStart.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 120,
        suggestedType: 'DEEP_WORK',
        reason: 'Uninterrupted morning window for highest-priority work',
        energyLevel: 'HIGH',
      });
    }

    // Afternoon focus block
    const afternoonStart = new Date(now);
    afternoonStart.setHours(14, 0, 0, 0);
    const afternoonMeetings = events.filter(e => 
      e.startDate >= afternoonStart && e.startDate < new Date(afternoonStart.getTime() + 3 * 60 * 60 * 1000)
    );

    if (afternoonMeetings.length <= 1) {
      blocks.push({
        startTime: afternoonStart.toISOString(),
        endTime: new Date(afternoonStart.getTime() + 90 * 60 * 1000).toISOString(),
        durationMinutes: 90,
        suggestedType: 'DEEP_WORK',
        reason: 'Post-lunch focus window before afternoon meetings',
        energyLevel: 'MEDIUM',
      });
    }

    return blocks;
  }

  private calculateMetrics(events: any[], tasks: any[]) {
    const meetingMinutes = events.reduce((sum, e) => sum + (e.endDate.getTime() - e.startDate.getTime()) / 60000, 0);
    const focusMinutes = tasks.reduce((sum, t) => sum + (t.estimatedDurationMin || 60), 0);
    const totalMinutes = meetingMinutes + focusMinutes;
    const workHours = 8 * 60;

    return {
      totalScheduledHours: Math.round(totalMinutes / 60 * 10) / 10,
      focusHours: Math.round(focusMinutes / 60 * 10) / 10,
      meetingHours: Math.round(meetingMinutes / 60 * 10) / 10,
      breakHours: Math.round((workHours - totalMinutes) / 60 * 10) / 10,
      utilizationRate: Math.round((totalMinutes / workHours) * 100) / 100,
    };
  }

  private generateMorningSummary(items: any[], risks: any[], schedule: any[], metrics: any): string {
    const urgentCount = items.filter(i => i.priority === 'URGENT').length;
    const highCount = items.filter(i => i.priority === 'HIGH').length;
    const criticalRisks = risks.filter(r => r.level === 'CRITICAL').length;

    return `Good morning! You have ${schedule.length} scheduled items (${metrics.meetingHours}h meetings, ${metrics.focusHours}h focus). ${urgentCount} urgent items, ${highCount} high-priority items. ${criticalRisks > 0 ? `${criticalRisks} critical risk(s) detected.` : 'No critical risks.'} ${metrics.utilizationRate > 0.85 ? 'Schedule is heavily utilized.' : metrics.utilizationRate < 0.5 ? 'Light schedule with room for deep work.' : 'Balanced schedule.'}`;
  }

  private matchesBriefingLength(item: any, length: string): boolean {
    if (length === 'CONCISE') return item.priority === 'URGENT' || item.priority === 'HIGH';
    if (length === 'DETAILED') return true;
    return item.priority !== 'LOW';
  }

  async getCurrentActivity(userId: string): Promise<any> {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const [timeBlocks, events] = await Promise.all([
      this.prisma.timeBlock.findMany({
        where: { userId, startDate: { gte: dayStart, lte: dayEnd } },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.event.findMany({
        where: { userId, startDate: { gte: dayStart, lte: dayEnd }, status: { in: ['CONFIRMED', 'TENTATIVE'] } },
        orderBy: { startDate: 'asc' },
      }),
    ]);

    const allBlocks = [...timeBlocks, ...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const current = allBlocks.find(b => b.startDate <= now && b.endDate >= now);
    const next = allBlocks.find(b => b.startDate > now);

    const scheduleChanges = await this.getRecentScheduleChanges(userId);

    return {
      current: current ? {
        id: current.id,
        title: current.title,
        type: 'blockType' in current ? (current.blockType || 'MEETING') : 'MEETING',
        startTime: current.startDate.toISOString(),
        endTime: current.endDate.toISOString(),
        progressPercent: Math.round(((now.getTime() - current.startDate.getTime()) / (current.endDate.getTime() - current.startDate.getTime())) * 100),
        timeRemainingMinutes: Math.round((current.endDate.getTime() - now.getTime()) / 60000),
      } : undefined,
      next: next ? {
        id: next.id,
        title: next.title,
        type: 'blockType' in next ? (next.blockType || 'MEETING') : 'MEETING',
        startTime: next.startDate.toISOString(),
        endTime: next.endDate.toISOString(),
        location: 'location' in next ? next.location : undefined,
        prepTimeMinutes: 10,
      } : undefined,
      upcomingToday: allBlocks.filter(b => b.startDate > now).slice(0, 5).map(b => ({
        id: b.id,
        title: b.title,
        type: 'blockType' in b ? (b.blockType || 'MEETING') : 'MEETING',
        startTime: b.startDate.toISOString(),
        endTime: b.endDate.toISOString(),
      })),
      contextualReminders: [],
      scheduleChanges: [],
      replanningSuggestions: [],
      focusMode: undefined,
    };
  }

  private async getRecentScheduleChanges(userId: string) {
    const changes = await this.prisma.scheduleChange.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return changes.map(c => ({
      id: c.id,
      changeType: c.changeType,
      entityType: c.entityType,
      entityId: c.entityId,
      title: c.entityType + (c.entityId ? ` ${c.entityId}` : ''),
      oldTime: c.oldData && typeof c.oldData === 'object' && 'start' in c.oldData ? { start: c.oldData.start as string, end: c.oldData.end as string } : undefined,
      newTime: c.newData && typeof c.newData === 'object' && 'start' in c.newData ? { start: c.newData.start as string, end: c.newData.end as string } : undefined,
      reason: c.reason,
      requiresAction: false,
    }));
  }

  async generateEveningWrapup(userId: string, date: Date, config: any): Promise<any> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [events, tasks, commitments, timeBlocks, scheduleChanges] = await Promise.all([
      this.prisma.event.findMany({ where: { userId, startDate: { gte: dayStart, lte: dayEnd } } }),
      this.prisma.task.findMany({ where: { userId, dueDate: { gte: dayStart, lte: dayEnd } } }),
      this.prisma.commitment.findMany({ where: { userId, deadline: { gte: dayStart, lte: dayEnd } } }),
      this.prisma.timeBlock.findMany({ where: { userId, startDate: { gte: dayStart, lte: dayEnd } } }),
      this.prisma.scheduleChange.findMany({ where: { userId, createdAt: { gte: dayStart, lte: dayEnd } } }),
    ]);

    const completedTasks = tasks.filter(t => t.status === 'COMPLETED');
    const completedBlocks = timeBlocks.filter(b => b.status === 'COMPLETED');
    const totalScheduled = timeBlocks.reduce((sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 60000, 0);
    const completedMinutes = completedBlocks.reduce((sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 60000, 0);

    const unfinishedTasks = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
    const unfinishedWork = unfinishedTasks.map(t => ({
      id: t.id,
      title: t.title,
      type: 'TASK' as const,
      originalPlan: `${t.estimatedDurationMin || 60} minutes planned`,
      actualProgress: t.actualDurationMin ? `${t.actualDurationMin} minutes completed` : 'Not started',
      remainingMinutes: Math.max(0, (t.estimatedDurationMin || 60) - (t.actualDurationMin || 0)),
      recommendedAction: this.getRecommendedActionForUnfinished(t),
      reason: t.status === 'BLOCKED' ? 'Blocked by dependency' : t.status === 'IN_PROGRESS' ? 'In progress but not completed' : 'Not started',
    }));

    const commitments_due = commitments.filter(c => c.deadline <= new Date(dayEnd));
    const commitments_today = commitments_due.map(c => ({
      id: c.id,
      object: c.title,
      deadline: c.deadline.toISOString(),
      status: c.status,
      riskLevel: c.deadline < new Date() ? 'CRITICAL' : 'HIGH',
      actionTakenToday: undefined,
    }));

    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = new Date(tomorrow);
    tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const [tomorrowEvents, tomorrowTasks] = await Promise.all([
      this.prisma.event.findMany({ where: { startDate: { gte: tomorrowStart, lte: tomorrowEnd }, status: { in: ['CONFIRMED', 'TENTATIVE'] } }, orderBy: { startDate: 'asc' } }),
      this.prisma.task.findMany({ where: { dueDate: { gte: tomorrowStart, lte: tomorrowEnd }, status: { in: ['PENDING', 'IN_PROGRESS'] } }, orderBy: { priority: 'desc' }, take: 5 }),
    ]);

    const scheduleAdjustments = await this.generateScheduleAdjustments(userId, date);

    return {
      date: date.toISOString(),
      generatedAt: new Date().toISOString(),
      timezone: 'UTC',
      summary: `Day complete: ${completedTasks.length}/${tasks.length} tasks done, ${Math.round(completedMinutes / 60 * 10) / 10}h of ${Math.round(timeBlocks.reduce((sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 60000, 0) / 60 * 10) / 10}h completed.`,
      completion: {
        totalScheduledMinutes: Math.round(totalScheduled),
        completedMinutes: Math.round(completedMinutes),
        completionRate: totalScheduled > 0 ? Math.round((completedMinutes / totalScheduled) * 100) / 100 : 0,
        focusMinutesCompleted: completedBlocks.filter(b => b.blockType === 'FOCUS').reduce((sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 60000, 0),
        meetingMinutesCompleted: completedBlocks.filter(b => b.blockType === 'MEETING').reduce((sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 60000, 0),
        tasksCompleted: completedTasks.length,
        tasksTotal: tasks.length,
      },
      unfinishedWork,
      commitments: commitments_today,
      tomorrowPreview: {
        date: tomorrow.toISOString(),
        totalScheduledHours: Math.round((tomorrowEvents.reduce((sum, e) => sum + (e.endDate.getTime() - e.startDate.getTime()) / 60000, 0) + tomorrowTasks.reduce((sum, t) => sum + (t.estimatedDurationMin || 60), 0)) / 60 * 10) / 10,
        focusHours: Math.round(tomorrowTasks.reduce((sum, t) => sum + (t.estimatedDurationMin || 60), 0) / 60 * 10) / 10,
        meetingHours: Math.round(tomorrowEvents.reduce((sum, e) => sum + (e.endDate.getTime() - e.startDate.getTime()) / 60000, 0) / 60 * 10) / 10,
        keyMeetings: tomorrowEvents.slice(0, 3).map(e => ({
          id: e.id,
          title: e.title,
          startTime: e.startDate.toISOString(),
          endTime: e.endDate.toISOString(),
          prepRequired: true,
        })),
        topPriorities: [
          ...tomorrowTasks.slice(0, 2).map(t => ({ title: t.title, type: 'TASK' as const, estimatedMinutes: t.estimatedDurationMin || 60, reason: `Priority ${t.priority}` })),
          ...tomorrowEvents.slice(0, 1).map(e => ({ title: e.title, type: 'MEETING_PREP' as const, estimatedMinutes: 15, reason: 'Meeting preparation' })),
        ],
        recommendedFirstBlock: {
          startTime: new Date(tomorrow.setHours(9, 0, 0, 0)).toISOString(),
          endTime: new Date(tomorrow.setHours(11, 0, 0, 0)).toISOString(),
          type: 'DEEP_WORK',
          reason: 'Morning energy peak for deep work',
        },
        risks: [],
      },
      scheduleAdjustments: [],
      reflection: undefined,
    };
  }

  private getRecommendedActionForUnfinished(task: any) {
    if (task.status === 'BLOCKED') return 'RESOLVE_DEPENDENCY';
    if (task.status === 'IN_PROGRESS') return 'RESCHEDULE_TOMORROW';
    if (task.priority <= 3) return 'CANCEL';
    return 'RESCHEDULE_TOMORROW';
  }

  private async generateScheduleAdjustments(userId: string, date: Date) {
    // Placeholder for schedule adjustments
    return [];
  }
}
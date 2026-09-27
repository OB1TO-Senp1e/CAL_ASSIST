import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { CommitmentEngineService } from '../../commitments/commitment-engine.service';
import { RealityEngineService } from '../../scheduling/reality-engine/reality-engine.service';
import { SchedulingEngineService } from '../../scheduling/scheduling-engine/scheduling-engine.service';
import { TimeCompilerService } from '../../scheduling/time-compiler/time-compiler.service';
import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import {
  Intervention,
  InterventionType,
  InterventionPriority,
  InterventionAction,
  ProactiveCheckInput,
  ProactiveCheckResult,
  UserProactivePreferences,
} from './proactive.types';

@Injectable()
export class ProactiveAssistantService {
  private readonly logger = new Logger(ProactiveAssistantService.name);

  private readonly interventionTemplates: Map<InterventionType, any> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly commitmentEngine: CommitmentEngineService,
    private readonly realityEngine: RealityEngineService,
    private readonly schedulingEngine: SchedulingEngineService,
    private readonly timeCompiler: TimeCompilerService,
    private readonly aiProvider: AiProviderService,
  ) {
    this.initializeTemplates();
  }

  private initializeTemplates() {
    this.interventionTemplates.set('DEADLINE_AT_RISK', {
      titleTemplate: 'Deadline at risk: {entity}',
      descriptionTemplate: '{entity} is due {deadline} but only {allocatedMinutes} minutes allocated.',
      reasonTemplate: 'Current allocation insufficient for deadline.',
      defaultAction: 'ALLOCATE_TIME',
      defaultPriority: 'HIGH',
    });

    this.interventionTemplates.set('CALENDAR_OVERLOAD', {
      titleTemplate: 'Calendar overloaded on {date}',
      descriptionTemplate: '{meetingCount} meetings scheduled with no focus blocks.',
      reasonTemplate: 'Too many meetings, insufficient focus time.',
      defaultAction: 'RESCHEDULE',
      defaultPriority: 'HIGH',
    });

    this.interventionTemplates.set('UNSCHEDULED_PRIORITY', {
      titleTemplate: 'High-priority work not scheduled',
      descriptionTemplate: '{taskCount} high-priority tasks have no time allocated.',
      reasonTemplate: 'Important work missing from schedule.',
      defaultAction: 'ALLOCATE_TIME',
      defaultPriority: 'HIGH',
    });

    this.interventionTemplates.set('CONFLICT_DETECTED', {
      titleTemplate: 'Scheduling conflict detected',
      descriptionTemplate: '{conflictCount} conflicts found in your schedule.',
      reasonTemplate: 'Overlapping events or commitments.',
      defaultAction: 'RESCHEDULE',
      defaultPriority: 'HIGH',
    });

    this.interventionTemplates.set('MISSING_PREPARATION', {
      titleTemplate: 'Preparation time missing for {event}',
      descriptionTemplate: 'Meeting requires prep but no buffer time scheduled.',
      reasonTemplate: 'No preparation time before important event.',
      defaultAction: 'ADD_BUFFER',
      defaultPriority: 'MEDIUM',
    });

    this.interventionTemplates.set('TRAVEL_CONSTRAINT', {
      titleTemplate: 'Travel time needed between events',
      descriptionTemplate: 'Events at different locations with insufficient travel buffer.',
      reasonTemplate: 'Physical location change requires travel time.',
      defaultAction: 'PLAN_TRAVEL',
      defaultPriority: 'MEDIUM',
    });

    this.interventionTemplates.set('UNFINISHED_COMMITMENT', {
      titleTemplate: 'Commitment at risk: {commitment}',
      descriptionTemplate: 'You committed to {commitment} but no time allocated.',
      reasonTemplate: 'Personal commitment without scheduled time.',
      defaultAction: 'ALLOCATE_TIME',
      defaultPriority: 'HIGH',
    });

    this.interventionTemplates.set('GOAL_OFF_TRACK', {
      titleTemplate: 'Goal progress behind schedule',
      descriptionTemplate: 'Goal "{goal}" is {completionRate}% complete but deadline approaching.',
      reasonTemplate: 'Insufficient progress toward goal deadline.',
      defaultAction: 'REVIEW_PRIORITIES',
      defaultPriority: 'HIGH',
    });

    this.interventionTemplates.set('REPEATED_POSTPONEMENT', {
      titleTemplate: 'Task repeatedly postponed: {task}',
      descriptionTemplate: 'Task postponed {count} times. Consider cancellation or delegation.',
      reasonTemplate: 'Repeated rescheduling indicates priority or feasibility issue.',
      defaultAction: 'REVIEW_PRIORITIES',
      defaultPriority: 'MEDIUM',
    });

    this.interventionTemplates.set('NO_TIME_ALLOCATED', {
      titleTemplate: 'No time allocated for {entity}',
      descriptionTemplate: '{entity} has deadline but zero scheduled time.',
      reasonTemplate: 'Work committed but not scheduled.',
      defaultAction: 'ALLOCATE_TIME',
      defaultPriority: 'HIGH',
    });
  }

  async runProactiveCheck(input: ProactiveCheckInput): Promise<ProactiveCheckResult> {
    const userId = input.userId;
    const now = new Date();
    const timeRange = input.timeRange
      ? { start: new Date(input.timeRange.start), end: new Date(input.timeRange.end) }
      : { start: now, end: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) };

    const preferences = await this.getUserPreferences(userId);
    if (!preferences.enabled) {
      return { timestamp: now.toISOString(), interventions: [], summary: { total: 0, byPriority: {}, byType: {}, urgentCount: 0, highCount: 0 } };
    }

    const interventions: Intervention[] = [];

    if (!preferences.enabledTypes?.length || preferences.enabledTypes.includes('DEADLINE_AT_RISK')) {
      interventions.push(...await this.checkDeadlineRisks(userId, timeRange, preferences));
    }

    if (!preferences.enabledTypes?.length || preferences.enabledTypes.includes('CALENDAR_OVERLOAD')) {
      interventions.push(...await this.checkCalendarOverload(userId, timeRange, preferences));
    }

    if (!preferences.enabledTypes?.length || preferences.enabledTypes.includes('UNSCHEDULED_PRIORITY')) {
      interventions.push(...await this.checkUnscheduledPriorities(userId, timeRange, preferences));
    }

    if (!preferences.enabledTypes?.length || preferences.enabledTypes.includes('CONFLICT_DETECTED')) {
      interventions.push(...await this.checkConflicts(userId, timeRange, preferences));
    }

    if (!preferences.enabledTypes?.length || preferences.enabledTypes.includes('MISSING_PREPARATION')) {
      interventions.push(...await this.checkMissingPreparation(userId, timeRange, preferences));
    }

    if (!preferences.enabledTypes?.length || preferences.enabledTypes.includes('TRAVEL_CONSTRAINT')) {
      interventions.push(...await this.checkTravelConstraints(userId, timeRange, preferences));
    }

    if (!preferences.enabledTypes?.length || preferences.enabledTypes.includes('UNFINISHED_COMMITMENT')) {
      interventions.push(...await this.checkUnfinishedCommitments(userId, timeRange, preferences));
    }

    if (!preferences.enabledTypes?.length || preferences.enabledTypes.includes('GOAL_OFF_TRACK')) {
      interventions.push(...await this.checkGoalProgress(userId, timeRange, preferences));
    }

    if (!preferences.enabledTypes?.length || preferences.enabledTypes.includes('REPEATED_POSTPONEMENT')) {
      interventions.push(...await this.checkRepeatedPostponements(userId, timeRange, preferences));
    }

    if (!preferences.enabledTypes?.length || preferences.enabledTypes.includes('NO_TIME_ALLOCATED')) {
      interventions.push(...await this.checkNoTimeAllocated(userId, timeRange, preferences));
    }

    const filtered = this.filterAndRankInterventions(interventions, preferences);

    const summary = this.generateSummary(filtered);

    return {
      timestamp: now.toISOString(),
      interventions: filtered,
      summary,
      nextCheckRecommendedAt: new Date(now.getTime() + (preferences.checkIntervalMinutes || 60) * 60000).toISOString(),
    };
  }

  private async checkDeadlineRisks(userId: string, timeRange: { start: Date; end: Date }, prefs: UserProactivePreferences): Promise<Intervention[]> {
    const interventions: Intervention[] = [];

    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { gte: timeRange.start, lte: timeRange.end },
      },
      include: { timeBlocks: true },
    });

    for (const task of tasks) {
      const allocated = task.timeBlocks.reduce((sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 60000, 0);
      const needed = task.estimatedDurationMin || 60;
      const hoursUntilDeadline = (new Date(task.dueDate!).getTime() - Date.now()) / (1000 * 60 * 60);

      if (allocated < needed && hoursUntilDeadline <= 72) {
        const priority = hoursUntilDeadline <= 24 ? 'URGENT' : hoursUntilDeadline <= 48 ? 'HIGH' : 'MEDIUM';
        
        if (this.meetsPriorityThreshold(priority, prefs.minPriority)) {
          interventions.push(this.createIntervention(userId, {
            type: 'DEADLINE_AT_RISK',
            priority,
            title: `Deadline at risk: ${task.title}`,
            description: `"${task.title}" is due ${new Date(task.dueDate!).toLocaleDateString()} but only ${allocated} of ${needed} minutes allocated.`,
            reason: `Only ${allocated}/${needed} minutes scheduled. ${hoursUntilDeadline.toFixed(1)} hours until deadline.`,
            affectedEntities: [{ type: 'TASK', id: task.id, title: task.title }],
            action: 'ALLOCATE_TIME',
            actionDetails: { taskId: task.id, neededMinutes: needed - allocated },
            estimatedEffortMinutes: needed - allocated,
            confidence: 0.9,
          }));
        }
      }
    }

    return interventions;
  }

  private async checkCalendarOverload(userId: string, timeRange: { start: Date; end: Date }, prefs: UserProactivePreferences): Promise<Intervention[]> {
    const interventions: Intervention[] = [];

    const events = await this.prisma.event.findMany({
      where: {
        userId,
        startDate: { gte: timeRange.start, lte: timeRange.end },
        status: { in: ['CONFIRMED', 'TENTATIVE'] },
      },
      orderBy: { startDate: 'asc' },
    });

    const byDay = new Map<string, typeof events>();
    for (const event of events) {
      const day = new Date(event.startDate).toISOString().split('T')[0];
      const arr = byDay.get(day) || [];
      arr.push(event);
      byDay.set(day, arr);
    }

    for (const [day, dayEvents] of byDay) {
      const meetingCount = dayEvents.length;
      const totalHours = dayEvents.reduce((sum, e) => sum + (e.endDate.getTime() - e.startDate.getTime()) / 3600000, 0);

      if (meetingCount >= 5 || totalHours >= 6) {
        const timeBlocks = await this.prisma.timeBlock.findMany({
          where: { userId, startDate: { gte: new Date(day), lt: new Date(new Date(day).getTime() + 24 * 60 * 60 * 1000) }, blockType: 'FOCUS' },
        });
        const focusHours = timeBlocks.reduce((sum, b) => sum + (b.endDate.getTime() - b.startDate.getTime()) / 3600000, 0);

        if (focusHours < 2) {
          const priority = meetingCount >= 7 ? 'HIGH' : 'MEDIUM';
          if (this.meetsPriorityThreshold(priority, prefs.minPriority)) {
            interventions.push(this.createIntervention(userId, {
              type: 'CALENDAR_OVERLOAD',
              priority,
              title: `Calendar overloaded on ${new Date(day).toLocaleDateString()}`,
              description: `${meetingCount} meetings (${totalHours.toFixed(1)}h) with only ${focusHours.toFixed(1)}h focus time.`,
              reason: 'High meeting density with insufficient focus blocks.',
              affectedEntities: dayEvents.map(e => ({ type: 'EVENT', id: e.id, title: e.title })),
              action: 'RESCHEDULE',
              actionDetails: { date: day, meetingCount, focusHours },
              estimatedEffortMinutes: 30,
              confidence: 0.85,
            }));
          }
        }
      }
    }

    return interventions;
  }

  private async checkUnscheduledPriorities(userId: string, timeRange: { start: Date; end: Date }, prefs: UserProactivePreferences): Promise<Intervention[]> {
    const interventions: Intervention[] = [];

    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        priority: { gte: 7 },
        dueDate: { gte: timeRange.start, lte: timeRange.end },
      },
      include: { timeBlocks: true },
    });

    const unscheduled = tasks.filter(t => t.timeBlocks.length === 0);

    if (unscheduled.length > 0) {
      const priority = unscheduled.length > 3 ? 'HIGH' : 'MEDIUM';
      if (this.meetsPriorityThreshold(priority, prefs.minPriority)) {
        interventions.push(this.createIntervention(userId, {
          type: 'UNSCHEDULED_PRIORITY',
          priority,
          title: `${unscheduled.length} high-priority tasks not scheduled`,
          description: `${unscheduled.length} priority tasks have no time allocated.`,
          reason: 'Important work missing from calendar.',
          affectedEntities: unscheduled.map(t => ({ type: 'TASK', id: t.id, title: t.title })),
          action: 'ALLOCATE_TIME',
          actionDetails: { taskIds: unscheduled.map(t => t.id) },
          estimatedEffortMinutes: unscheduled.reduce((sum, t) => sum + (t.estimatedDurationMin || 60), 0),
          confidence: 0.9,
        }));
      }
    }

    return interventions;
  }

  private async checkConflicts(userId: string, timeRange: { start: Date; end: Date }, prefs: UserProactivePreferences): Promise<Intervention[]> {
    const realityCheck = await this.realityEngine.runRealityCheck({ userId, timeRange: { start: timeRange.start.toISOString(), end: timeRange.end.toISOString() }, includeResolved: false });
    
    const conflicts = realityCheck.deviations.filter(d => 
      ['MEETING_LATE', 'TASK_OVERRUN', 'CONFLICT'].includes(d.type)
    );

    if (conflicts.length > 0) {
      const priority = conflicts.length > 2 ? 'HIGH' : 'MEDIUM';
      if (this.meetsPriorityThreshold(priority, prefs.minPriority)) {
        return [this.createIntervention(userId, {
          type: 'CONFLICT_DETECTED',
          priority,
          title: `${conflicts.length} scheduling conflict(s) detected`,
          description: `${conflicts.length} overlap(s) or overrun(s) found in your schedule.`,
          reason: 'Events or tasks overlapping in time.',
          affectedEntities: conflicts.map(d => ({ type: d.entityType, id: d.entityId, title: d.title })),
          action: 'RESCHEDULE',
          actionDetails: { conflictIds: conflicts.map(c => c.id) },
          estimatedEffortMinutes: 30,
          confidence: 0.9,
        })];
      }
    }
    return [];
  }

  private async checkMissingPreparation(userId: string, timeRange: { start: Date; end: Date }, prefs: UserProactivePreferences): Promise<Intervention[]> {
    const interventions: Intervention[] = [];

    const events = await this.prisma.event.findMany({
      where: {
        userId,
        startDate: { gte: timeRange.start, lte: timeRange.end },
        status: { in: ['CONFIRMED', 'TENTATIVE'] },
      },
    });

    for (const event of events) {
      const durationMinutes = (new Date(event.endDate).getTime() - new Date(event.startDate).getTime()) / 60000;
      const prepNeeded = durationMinutes > 30;
      
      if (prepNeeded) {
        const prepBlocks = await this.prisma.timeBlock.findMany({
          where: {
            userId,
            startDate: { lt: event.startDate },
            endDate: { gt: new Date(event.startDate.getTime() - 60 * 60000) },
            blockType: 'BUFFER',
          },
        });

        if (prepBlocks.length === 0) {
          if (this.meetsPriorityThreshold('MEDIUM', prefs.minPriority)) {
            interventions.push(this.createIntervention(userId, {
              type: 'MISSING_PREPARATION',
              priority: 'MEDIUM',
              title: `Preparation time missing for ${event.title}`,
              description: `Meeting "${event.title}" requires preparation but no buffer scheduled.`,
              reason: 'No preparation time before important meeting.',
              affectedEntities: [{ type: 'EVENT', id: event.id, title: event.title }],
              action: 'ADD_BUFFER',
              actionDetails: { eventId: event.id, prepMinutes: 30 },
              estimatedEffortMinutes: 30,
              confidence: 0.8,
            }));
          }
        }
      }
    }

    return interventions;
  }

  private async checkTravelConstraints(userId: string, timeRange: { start: Date; end: Date }, prefs: UserProactivePreferences): Promise<Intervention[]> {
    const interventions: Intervention[] = [];

    const events = await this.prisma.event.findMany({
      where: {
        userId,
        startDate: { gte: timeRange.start, lte: timeRange.end },
        status: { in: ['CONFIRMED', 'TENTATIVE'] },
        location: { not: null },
      },
      orderBy: { startDate: 'asc' },
    });

    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      const next = events[i + 1];
      
      if (current.location && next.location && current.location !== next.location) {
        const gapMinutes = (new Date(next.startDate).getTime() - new Date(current.endDate).getTime()) / 60000;
        
        if (gapMinutes < 30) {
          if (this.meetsPriorityThreshold('MEDIUM', prefs.minPriority)) {
            interventions.push(this.createIntervention(userId, {
              type: 'TRAVEL_CONSTRAINT',
              priority: 'MEDIUM',
              title: `Travel time needed between "${current.title}" and "${next.title}"`,
              description: `Only ${gapMinutes.toFixed(0)} minutes between events at different locations.`,
              reason: 'Insufficient travel buffer between locations.',
              affectedEntities: [
                { type: 'EVENT', id: current.id, title: current.title },
                { type: 'EVENT', id: next.id, title: next.title },
              ],
              action: 'PLAN_TRAVEL',
              actionDetails: { eventId1: current.id, eventId2: next.id, gapMinutes },
              estimatedEffortMinutes: 15,
              confidence: 0.85,
            }));
          }
        }
      }
    }

    return interventions;
  }

  private async checkUnfinishedCommitments(userId: string, timeRange: { start: Date; end: Date }, prefs: UserProactivePreferences): Promise<Intervention[]> {
    const interventions: Intervention[] = [];

    const commitments = await this.prisma.commitment.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        deadline: { gte: timeRange.start, lte: timeRange.end },
      },
    });

    for (const commitment of commitments) {
      const timeBlocks = await this.prisma.timeBlock.findMany({
        where: { userId, OR: [{ commitmentId: commitment.id }, { relatedCommitmentId: commitment.id }] },
      });

      if (timeBlocks.length === 0) {
        const hoursUntil = (new Date(commitment.deadline).getTime() - Date.now()) / (1000 * 60 * 60);
        const priority = hoursUntil <= 24 ? 'URGENT' : hoursUntil <= 72 ? 'HIGH' : 'MEDIUM';
        
        if (this.meetsPriorityThreshold(priority, prefs.minPriority)) {
          interventions.push(this.createIntervention(userId, {
            type: 'UNFINISHED_COMMITMENT',
            priority,
            title: `Commitment at risk: ${commitment.title}`,
            description: `You committed to "${commitment.title}" by ${new Date(commitment.deadline).toLocaleDateString()} but no time allocated.`,
            reason: 'Personal commitment without scheduled time.',
            affectedEntities: [{ type: 'COMMITMENT', id: commitment.id, title: commitment.title }],
            action: 'ALLOCATE_TIME',
            actionDetails: { commitmentId: commitment.id },
            estimatedEffortMinutes: 60,
            confidence: 0.5,
          }));
        }
      }
    }

    return interventions;
  }

  private async checkGoalProgress(userId: string, timeRange: { start: Date; end: Date }, prefs: UserProactivePreferences): Promise<Intervention[]> {
    const interventions: Intervention[] = [];

    const goals = await this.prisma.goal.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        targetDate: { gte: timeRange.start, lte: timeRange.end },
      },
      include: { tasks: true },
    });

    for (const goal of goals) {
      const total = goal.tasks.length;
      const completed = goal.tasks.filter(t => t.status === 'COMPLETED').length;
      const rate = total > 0 ? completed / total : 0;
      const daysLeft = (new Date(goal.targetDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

      if (rate < 0.5 && daysLeft <= 7) {
        const priority = daysLeft <= 2 ? 'URGENT' : 'HIGH';
        if (this.meetsPriorityThreshold(priority, prefs.minPriority)) {
          interventions.push(this.createIntervention(userId, {
            type: 'GOAL_OFF_TRACK',
            priority,
            title: `Goal off track: ${goal.title}`,
            description: `Goal "${goal.title}" is ${(rate * 100).toFixed(0)}% complete with ${daysLeft.toFixed(1)} days remaining.`,
            reason: `Insufficient progress (${completed}/${total} tasks) toward deadline.`,
            affectedEntities: [{ type: 'GOAL', id: goal.id, title: goal.title }],
            action: 'REVIEW_PRIORITIES',
            actionDetails: { goalId: goal.id, completionRate: rate, daysLeft },
            estimatedEffortMinutes: 60,
            confidence: 0.9,
          }));
        }
      }
    }

    return interventions;
  }

  private async checkRepeatedPostponements(userId: string, timeRange: { start: Date; end: Date }, prefs: UserProactivePreferences): Promise<Intervention[]> {
    const interventions: Intervention[] = [];

    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { gte: timeRange.start, lte: timeRange.end },
      },
    });

    for (const task of tasks) {
      const postpones = await this.prisma.scheduleChange.count({
        where: { entityType: 'TASK', entityId: task.id, changeType: 'RESCHEDULE' },
      });

      if (postpones >= 3) {
        const priority = postpones >= 5 ? 'HIGH' : 'MEDIUM';
        if (this.meetsPriorityThreshold(priority, prefs.minPriority)) {
          interventions.push(this.createIntervention(userId, {
            type: 'REPEATED_POSTPONEMENT',
            priority,
            title: `Task repeatedly postponed: ${task.title}`,
            description: `Task postponed ${postpones} times. Consider cancellation or delegation.`,
            reason: 'Repeated rescheduling indicates priority or feasibility issue.',
            affectedEntities: [{ type: 'TASK', id: task.id, title: task.title }],
            action: 'REVIEW_PRIORITIES',
            actionDetails: { taskId: task.id, postponeCount: postpones },
            estimatedEffortMinutes: 30,
            confidence: 0.85,
          }));
        }
      }
    }

    return interventions;
  }

  private async checkNoTimeAllocated(userId: string, timeRange: { start: Date; end: Date }, prefs: UserProactivePreferences): Promise<Intervention[]> {
    const interventions: Intervention[] = [];

    const commitments = await this.prisma.commitment.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        deadline: { gte: timeRange.start, lte: timeRange.end },
      },
    });

    for (const commitment of commitments) {
      const timeBlocks = await this.prisma.timeBlock.findMany({
        where: { userId, OR: [{ commitmentId: commitment.id }, { relatedCommitmentId: commitment.id }] },
      });

      if (timeBlocks.length === 0) {
        const hoursUntil = (new Date(commitment.deadline).getTime() - Date.now()) / (1000 * 60 * 60);
        const priority = hoursUntil <= 24 ? 'URGENT' : hoursUntil <= 72 ? 'HIGH' : 'MEDIUM';
        
        if (this.meetsPriorityThreshold(priority, prefs.minPriority)) {
          interventions.push(this.createIntervention(userId, {
            type: 'NO_TIME_ALLOCATED',
            priority,
            title: `No time allocated for ${commitment.title}`,
            description: `Commitment "${commitment.title}" has deadline ${new Date(commitment.deadline).toLocaleDateString()} but zero scheduled time.`,
            reason: 'Work committed but not scheduled.',
            affectedEntities: [{ type: 'COMMITMENT', id: commitment.id, title: commitment.title }],
            action: 'ALLOCATE_TIME',
            actionDetails: { commitmentId: commitment.id },
            estimatedEffortMinutes: 60,
            confidence: 0.5,
          }));
        }
      }
    }

    return interventions;
  }

  private meetsPriorityThreshold(priority: InterventionPriority, minPriority: InterventionPriority): boolean {
    const levels = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    return levels.indexOf(priority) >= levels.indexOf(minPriority);
  }

  private filterAndRankInterventions(interventions: Intervention[], prefs: UserProactivePreferences): Intervention[] {
    let filtered = interventions
      .filter(i => this.meetsPriorityThreshold(i.priority, prefs.minPriority))
      .sort((a, b) => {
        const priorityOrder = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority] || b.confidence - a.confidence;
      });

    if (prefs.groupSimilar) {
      filtered = this.groupSimilarInterventions(filtered);
    }

    return filtered.slice(0, prefs.maxInterventionsPerCheck);
  }

  private groupSimilarInterventions(interventions: Intervention[]): Intervention[] {
    const groups = new Map<string, Intervention[]>();
    
    for (const i of interventions) {
      const key = i.type;
      const arr = groups.get(key) || [];
      arr.push(i);
      groups.set(key, arr);
    }

    const result: Intervention[] = [];
    for (const [, arr] of groups) {
      if (arr.length === 1) {
        result.push(arr[0]);
      } else {
        const best = arr.reduce((a, b) => 
          (b.priority === 'URGENT' || (b.priority === 'HIGH' && a.priority !== 'URGENT') || 
           (b.confidence > a.confidence && a.priority === b.priority)) ? b : a
        );
        result.push(best);
      }
    }

    return result.sort((a, b) => {
      const priorityOrder = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private createIntervention(userId: string, partial: Partial<Intervention> & { type: InterventionType; priority: InterventionPriority; title: string; description: string; reason: string; affectedEntities: Intervention['affectedEntities']; action: InterventionAction; actionDetails: Record<string, any>; estimatedEffortMinutes: number; confidence: number }): Intervention {
    return {
      id: `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type: partial.type,
      priority: partial.priority,
      title: partial.title,
      description: partial.description,
      reason: partial.reason,
      affectedEntities: partial.affectedEntities,
      action: partial.action,
      actionDetails: partial.actionDetails,
      estimatedEffortMinutes: partial.estimatedEffortMinutes,
      confidence: partial.confidence,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      metadata: {},
    };
  }

  private generateSummary(interventions: Intervention[]): ProactiveCheckResult['summary'] {
    const byPriority: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const i of interventions) {
      byPriority[i.priority] = (byPriority[i.priority] || 0) + 1;
      byType[i.type] = (byType[i.type] || 0) + 1;
    }

    return {
      total: interventions.length,
      byPriority,
      byType,
      urgentCount: byPriority.URGENT || 0,
      highCount: byPriority.HIGH || 0,
    };
  }

  private async getUserPreferences(userId: string): Promise<UserProactivePreferences> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });

    const proactivePref = user?.preferences.find(p => p.key === 'proactive_assistant');
    if (proactivePref) {
      const val = proactivePref.valueJson as any;
      return {
        userId,
        enabled: val.enabled ?? true,
        checkIntervalMinutes: val.checkIntervalMinutes ?? 60,
        quietHours: val.quietHours,
        enabledTypes: val.enabledTypes ?? [],
        minPriority: val.minPriority ?? 'MEDIUM',
        maxInterventionsPerCheck: val.maxInterventionsPerCheck ?? 5,
        deliveryChannels: val.deliveryChannels ?? ['IN_APP'],
        groupSimilar: val.groupSimilar ?? true,
        snoozeDurationMinutes: val.snoozeDurationMinutes ?? 30,
      };
    }

    return {
      userId,
      enabled: true,
      checkIntervalMinutes: 60,
      minPriority: 'MEDIUM',
      maxInterventionsPerCheck: 5,
      deliveryChannels: ['IN_APP'],
      groupSimilar: true,
      snoozeDurationMinutes: 30,
      enabledTypes: [],
    };
  }

  async acknowledgeIntervention(userId: string, interventionId: string): Promise<void> {
    void userId;
    void interventionId;
    throw new NotImplementedException(
      'Intervention acknowledgement is unavailable because interventions are not persisted in the current schema'
    );
  }

  async dismissIntervention(userId: string, interventionId: string): Promise<void> {
    void userId;
    void interventionId;
    throw new NotImplementedException(
      'Intervention dismissal is unavailable because interventions are not persisted in the current schema'
    );
  }

  async snoozeIntervention(userId: string, interventionId: string, minutes: number): Promise<void> {
    void userId;
    void interventionId;
    void minutes;
    throw new NotImplementedException(
      'Intervention snoozing is unavailable because interventions are not persisted in the current schema'
    );
  }

  async getActiveInterventions(userId: string): Promise<Intervention[]> {
    return (await this.runProactiveCheck({ userId, limit: 10 })).interventions;
  }
}
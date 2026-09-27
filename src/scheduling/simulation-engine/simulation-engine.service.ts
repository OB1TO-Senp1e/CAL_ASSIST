import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { TimeCompilerService } from '../time-compiler/time-compiler.service';
import { TimeBlockType as TimeCompilerTimeBlockType } from '../time-compiler/domain/time-compiler.types';
import {
  SimulationInput,
  SimulationResult,
  ComparisonResult,
  SimulationType,
  SimulationChange,
  SchedulingInput,
  ScheduledBlock,
  TimeRange,
} from './simulation.types';
import { TimeCompilerModule } from '../time-compiler/time-compiler.module';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Injectable()
export class SimulationEngineService {
  private readonly logger = new Logger(SimulationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeCompiler: TimeCompilerService,
  ) {}

  async runSimulation(input: SimulationInput): Promise<SimulationResult> {
    const simulationId = generateId();
    const now = new Date();

    // Convert simulation input to scheduling input for base schedule
    const baseSchedulingInput = this.toSchedulingInput(input);

    // Compile base schedule (current state)
    const baseProposal = await this.timeCompiler.compileSchedule(baseSchedulingInput);

    // Apply changes to create modified scheduling input
    const modifiedInput = this.applyChanges(input, baseSchedulingInput);

    // Compile simulated schedule
    const simulatedProposal = await this.timeCompiler.compileSchedule(modifiedInput);

    // Calculate differences
    const scheduleDiff = this.calculateScheduleDiff(baseProposal.proposedBlocks, simulatedProposal.proposedBlocks);
    const deadlineEffects = this.calculateDeadlineEffects(baseProposal, simulatedProposal, input);
    const constraintViolations = this.calculateConstraintViolations(baseProposal, simulatedProposal, input);
    const workloadChanges = this.calculateWorkloadChanges(baseProposal, simulatedProposal);
    const dependencyEffects = this.calculateDependencyEffects(baseProposal, simulatedProposal, input);
    const tradeoffs = this.identifyTradeoffs(baseProposal, simulatedProposal, input);
    const conflicts = this.mergeConflicts(baseProposal, simulatedProposal);
    const metrics = this.calculateMetrics(baseProposal, simulatedProposal, input);

    const summary = this.generateSummary(scheduleDiff, deadlineEffects, constraintViolations, workloadChanges, tradeoffs);

    return {
      simulationId,
      userId: input.userId,
      type: 'SINGLE',
      baseSchedule: this.serializeBlocks(baseProposal.proposedBlocks),
      simulatedSchedule: this.serializeBlocks(simulatedProposal.proposedBlocks),
      changes: input.changes,
      scheduleDiff,
      deadlineEffects,
      constraintViolations,
      workloadChanges,
      dependencyEffects,
      tradeoffs,
      conflicts,
      metrics,
      summary,
      createdAt: now.toISOString(),
    };
  }

  async runComparison(input: SimulationInput[]): Promise<ComparisonResult> {
    const comparisonId = generateId();
    const now = new Date();

    // Use first input as base
    const baseInput = input[0];
    const baseSchedulingInput = this.toSchedulingInput(baseInput);
    const baseProposal = await this.timeCompiler.compileSchedule(baseSchedulingInput);

    const scenarios: Array<{
      scenarioId: string;
      name: string;
      description: string;
      changes: SimulationChange[];
      simulatedSchedule: SimulationResult['simulatedSchedule'];
      metrics: any;
      deadlineEffects: any[];
      constraintViolations: any[];
      tradeoffs: any[];
      summary: string;
    }> = [];

    for (let i = 1; i < input.length; i++) {
      const scenarioInput = input[i];
      const modifiedInput = this.applyChanges(scenarioInput, baseSchedulingInput);
      const simulatedProposal = await this.timeCompiler.compileSchedule(modifiedInput);

      const deadlineEffects = this.calculateDeadlineEffects(baseProposal, simulatedProposal, scenarioInput);
      const constraintViolations = this.calculateConstraintViolations(baseProposal, simulatedProposal, scenarioInput);
      const tradeoffs = this.identifyTradeoffs(baseProposal, simulatedProposal, scenarioInput);

      scenarios.push({
        scenarioId: generateId(),
        name: scenarioInput.changes[0]?.description || `Scenario ${i}`,
        description: `Apply ${scenarioInput.changes.length} change(s)`,
        changes: scenarioInput.changes,
        simulatedSchedule: this.serializeBlocks(simulatedProposal.proposedBlocks),
        metrics: this.calculateMetrics(baseProposal, simulatedProposal, scenarioInput),
        deadlineEffects,
        constraintViolations,
        tradeoffs,
        summary: this.generateSummary(
          this.calculateScheduleDiff(baseProposal.proposedBlocks, simulatedProposal.proposedBlocks),
          deadlineEffects,
          constraintViolations,
          this.calculateWorkloadChanges(baseProposal, simulatedProposal),
          tradeoffs
        ),
      });
    }

    // Recommend best scenario
    const recommendedScenarioId = this.selectBestScenario(scenarios)?.scenarioId;

    return {
      comparisonId,
      userId: baseInput.userId,
      baseSchedule: this.serializeBlocks(baseProposal.proposedBlocks),
      scenarios,
      recommendedScenarioId,
      createdAt: now.toISOString(),
    };
  }

  async runQuickSimulation(input: { userId: string; question: string; context?: any }): Promise<SimulationResult> {
    // Parse natural language question into simulation changes
    const changes = this.parseQuestion(input.question);
    
    // Get current schedule data
    const scheduleData = await this.getCurrentScheduleData(input.userId, input.context);
    
    const simulationInput: SimulationInput = {
      ...scheduleData,
      changes,
    };

    return this.runSimulation(simulationInput);
  }

  private parseQuestion(question: string): SimulationChange[] {
    const changes: SimulationChange[] = [];
    const lower = question.toLowerCase();

    // "What if I move this meeting to Thursday?"
    if (lower.includes('move') && lower.includes('meeting')) {
      const dayMatch = lower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      if (dayMatch) {
        changes.push({
          id: generateId(),
          type: 'MOVE_EVENT',
          description: `Move meeting to ${dayMatch[1]}`,
          targetEntityType: 'EVENT',
          targetEntityId: '', // Would be filled from context
          parameters: { targetDay: dayMatch[1].toUpperCase() },
        });
      }
    }

    // "What if I take Friday afternoon off?"
    if (lower.includes('take') && (lower.includes('off') || lower.includes('time off'))) {
      const dayMatch = lower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      const timeMatch = lower.match(/(morning|afternoon|evening|all day)/i);
      if (dayMatch) {
        changes.push({
          id: generateId(),
          type: 'CHANGE_AVAILABILITY',
          description: `Take ${dayMatch[1]} ${timeMatch?.[1] || 'all day'} off`,
          targetEntityType: 'AVAILABILITY',
          targetEntityId: '',
          parameters: { 
            day: dayMatch[1].toUpperCase(),
            period: timeMatch?.[1]?.toUpperCase() || 'ALL_DAY',
            isAvailable: false,
          },
        });
      }
    }

    // "What if I launch three days earlier?"
    if (lower.includes('launch') && (lower.includes('earlier') || lower.includes('sooner'))) {
      const daysMatch = lower.match(/(\d+)\s*(day|week)/i);
      if (daysMatch) {
        changes.push({
          id: generateId(),
          type: 'LAUNCH_EARLIER',
          description: `Launch ${daysMatch[1]} ${daysMatch[2]}(s) earlier`,
          targetEntityType: 'PREFERENCE',
          targetEntityId: '',
          parameters: { shiftDays: -parseInt(daysMatch[1]) },
        });
      }
    }

    // "What if I add two hours of work per day?"
    if (lower.includes('add') && lower.includes('hour')) {
      const hoursMatch = lower.match(/(\d+)\s*hour/i);
      if (hoursMatch) {
        changes.push({
          id: generateId(),
          type: 'ADD_WORK_HOURS',
          description: `Add ${hoursMatch[1]} hours of work per day`,
          targetEntityType: 'PREFERENCE',
          targetEntityId: '',
          parameters: { additionalHoursPerDay: parseInt(hoursMatch[1]) },
        });
      }
    }

    // If no patterns matched, create a generic custom change
    if (changes.length === 0) {
      changes.push({
        id: generateId(),
        type: 'CUSTOM',
        description: question,
        targetEntityType: 'PREFERENCE',
        targetEntityId: '',
        parameters: { rawQuestion: question },
      });
    }

    return changes;
  }

  private async getCurrentScheduleData(userId: string, context?: any): Promise<SimulationInput> {
    // Fetch current schedule from database
    const timeRange = context?.timeRange || {
      start: new Date(),
      end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
    };
    const timezone = context?.timezone || 'UTC';

    const [tasks, events, timeBlocks, preferences, availabilities] = await Promise.all([
      this.prisma.task.findMany({
        where: { userId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        take: 50,
      }),
      this.prisma.event.findMany({
        where: { 
          userId, 
          startDate: { gte: timeRange.start, lte: timeRange.end },
          status: { in: ['CONFIRMED', 'TENTATIVE'] }
        },
      }),
      this.prisma.timeBlock.findMany({
        where: { userId, startDate: { gte: timeRange.start, lte: timeRange.end } },
      }),
      this.prisma.preference.findMany({ where: { userId } }),
      this.prisma.availabilityRule.findMany({ where: { userId, isAvailable: true } }),
    ]);

    return {
      userId,
      baseSchedule: timeBlocks.map(b => {
// Map Prisma TimeBlockType to our TimeBlockType (filter out unsupported values)
        const blockType = ['TASK', 'FOCUS', 'MEETING', 'BREAK', 'BUFFER', 'TRAVEL', 'ROUTINE'].includes(b.blockType)
          ? b.blockType as TimeCompilerTimeBlockType
          : 'TASK';
        return {
          id: b.id,
          title: b.title,
          type: blockType,
          startTime: b.startDate.toISOString(),
          endTime: b.endDate.toISOString(),
          durationMinutes: (b.endDate.getTime() - b.startDate.getTime()) / 60000,
          timezone: b.timezone,
          taskId: b.taskId ?? undefined,
          eventId: b.eventId ?? undefined,
          goalId: undefined,
          projectId: undefined,
          milestoneId: undefined,
          priority: undefined,
          flexibility: undefined,
          energyRequirement: undefined,
          context: undefined,
          location: undefined,
          confidence: 1.0,
          reason: 'Existing time block',
          constraints: [],
          isFixed: b.blockType === 'MEETING',
          isProposed: false,
        };
      }),
      timeRange: { start: timeRange.start.toISOString(), end: timeRange.end.toISOString() },
      timezone,
      changes: [], // Will be filled by caller
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description ?? undefined,
        estimatedDurationMinutes: t.estimatedDurationMin || 60,
        priority: t.priority,
        deadline: t.dueDate?.toISOString(),
        startDate: t.startDate?.toISOString(),
        status: t.status,
        dependencies: [], // Would need separate query
        flexibility: t.flexibility,
        energyRequirement: t.energyRequirement,
        context: t.context ?? undefined,
        preferredTime: t.preferredTime?.toISOString(),
        location: t.location ?? undefined,
        goalId: t.goalId ?? undefined,
        projectId: t.projectId ?? undefined,
        milestoneId: t.milestoneId ?? undefined,
      })),
      fixedEvents: events.map(e => ({
        id: e.id,
        title: e.title,
        startTime: e.startDate.toISOString(),
        endTime: e.endDate.toISOString(),
        timezone: e.timezone,
        isAllDay: e.allDay,
        status: e.status,
        location: e.location ?? undefined,
        isFixed: true,
      })),
      availability: availabilities.map(a => ({
        id: a.id,
        dayOfWeek: a.dayOfWeek ?? undefined,
        startDate: a.startDate?.toISOString(),
        endDate: a.endDate?.toISOString(),
        startTime: a.startTime,
        endTime: a.endTime,
        timezone: a.timezone,
        isAvailable: a.isAvailable,
        priority: a.priority,
        recurrence: a.recurrence ?? 'WEEKLY',
      })),
      constraints: [], // Would need to fetch from constraints table
      preferences: {
        workingHoursStart: '09:00',
        workingHoursEnd: '17:00',
        preferredFocusBlockDuration: 90,
        maxFocusBlockDuration: 180,
        minBreakDuration: 15,
        maxDailyHours: 8,
        preferredBreakInterval: 120,
        energyPeakHours: [{ start: '09:00', end: '11:00' }, { start: '14:00', end: '16:00' }],
        bufferBetweenTasks: 15,
        travelBufferDefault: 30,
        protectFocusTime: true,
        allowWeekendScheduling: false,
        taskOrderingStrategy: 'BALANCED',
      },
    };
  }

  private toSchedulingInput(input: SimulationInput): SchedulingInput {
    return {
      userId: input.userId,
      timeRange: {
        start: new Date(input.timeRange.start),
        end: new Date(input.timeRange.end),
      },
      timezone: input.timezone,
      tasks: input.tasks.map(t => ({
        ...t,
        deadline: t.deadline ? new Date(t.deadline) : undefined,
        startDate: t.startDate ? new Date(t.startDate) : undefined,
        preferredTime: t.preferredTime ? new Date(t.preferredTime) : undefined,
      })),
      fixedEvents: input.fixedEvents.map(e => ({
        ...e,
        startTime: new Date(e.startTime),
        endTime: new Date(e.endTime),
      })),
      availability: input.availability.map(a => ({
        ...a,
        startDate: a.startDate ? new Date(a.startDate) : undefined,
        endDate: a.endDate ? new Date(a.endDate) : undefined,
      })),
      constraints: input.constraints,
      preferences: input.preferences,
      existingBlocks: input.baseSchedule.map(b => ({
        ...b,
        startTime: new Date(b.startTime),
        endTime: new Date(b.endTime),
        constraints: b.constraints || [],
        reason: b.reason || 'Existing block',
        isFixed: b.isFixed ?? false,
        isProposed: b.isProposed ?? false,
        confidence: b.confidence ?? 1.0,
      })),
    };
  }

  private applyChanges(input: SimulationInput, schedulingInput: SchedulingInput): SchedulingInput {
    const modified = { ...schedulingInput };
    modified.tasks = [...schedulingInput.tasks];
    modified.fixedEvents = [...schedulingInput.fixedEvents];
    modified.availability = [...schedulingInput.availability];
    modified.preferences = { ...schedulingInput.preferences };

    for (const change of input.changes) {
      switch (change.type) {
        case 'MOVE_EVENT':
          this.applyMoveEvent(modified, change);
          break;
        case 'MOVE_TASK':
          this.applyMoveTask(modified, change);
          break;
        case 'ADD_TIME_BLOCK':
          this.applyAddTimeBlock(modified, change);
          break;
        case 'REMOVE_TIME_BLOCK':
          this.applyRemoveTimeBlock(modified, change);
          break;
        case 'CHANGE_AVAILABILITY':
          this.applyChangeAvailability(modified, change);
          break;
        case 'ADD_TASK':
          this.applyAddTask(modified, change);
          break;
        case 'REMOVE_TASK':
          this.applyRemoveTask(modified, change);
          break;
        case 'CHANGE_DEADLINE':
          this.applyChangeDeadline(modified, change);
          break;
        case 'ADD_WORK_HOURS':
          this.applyAddWorkHours(modified, change);
          break;
        case 'REMOVE_WORK_HOURS':
          this.applyRemoveWorkHours(modified, change);
          break;
        case 'TAKE_TIME_OFF':
          this.applyTakeTimeOff(modified, change);
          break;
        case 'SHIFT_SCHEDULE':
          this.applyShiftSchedule(modified, change);
          break;
        case 'LAUNCH_EARLIER':
          this.applyLaunchEarlier(modified, change);
          break;
        case 'LAUNCH_LATER':
          this.applyLaunchLater(modified, change);
          break;
        case 'CUSTOM':
          // Custom changes require manual handling
          break;
      }
    }

    return modified;
  }

  private applyMoveEvent(input: SchedulingInput, change: SimulationChange): void {
    const event = input.fixedEvents.find(e => e.id === change.targetEntityId);
    if (event && change.parameters.targetTime) {
      const duration = event.endTime.getTime() - event.startTime.getTime();
      event.startTime = new Date(change.parameters.targetTime);
      event.endTime = new Date(event.startTime.getTime() + duration);
    }
  }

  private applyMoveTask(input: SchedulingInput, change: SimulationChange): void {
    const task = input.tasks.find(t => t.id === change.targetEntityId);
    if (task && change.parameters.preferredTime) {
      task.preferredTime = new Date(change.parameters.preferredTime);
    }
  }

  private applyAddTimeBlock(input: SchedulingInput, change: SimulationChange): void {
    if (change.parameters.block) {
      input.existingBlocks.push({
        ...change.parameters.block,
        startTime: new Date(change.parameters.block.startTime),
        endTime: new Date(change.parameters.block.endTime),
      });
    }
  }

  private applyRemoveTimeBlock(input: SchedulingInput, change: SimulationChange): void {
    const index = input.existingBlocks.findIndex(b => b.id === change.targetEntityId);
    if (index !== -1) {
      input.existingBlocks.splice(index, 1);
    }
  }

  private applyChangeAvailability(input: SchedulingInput, change: SimulationChange): void {
    const { day, period, isAvailable } = change.parameters;
    // Find or create availability rule for the day
    let rule = input.availability.find(a => a.dayOfWeek === this.dayToNumber(day));
    if (!rule) {
      rule = {
        id: generateId(),
        dayOfWeek: this.dayToNumber(day),
        startTime: period === 'MORNING' ? '09:00' : period === 'AFTERNOON' ? '13:00' : '09:00',
        endTime: period === 'MORNING' ? '12:00' : period === 'AFTERNOON' ? '17:00' : '17:00',
        timezone: input.timezone,
        isAvailable,
        priority: 0,
        recurrence: 'WEEKLY',
      };
      input.availability.push(rule);
    } else {
      rule.isAvailable = isAvailable;
      if (period === 'MORNING') rule.endTime = '12:00';
      else if (period === 'AFTERNOON') { rule.startTime = '13:00'; rule.endTime = '17:00'; }
    }
  }

  private applyAddTask(input: SchedulingInput, change: SimulationChange): void {
    if (change.parameters.task) {
      input.tasks.push({
        ...change.parameters.task,
        deadline: change.parameters.task.deadline ? new Date(change.parameters.task.deadline) : undefined,
        startDate: change.parameters.task.startDate ? new Date(change.parameters.task.startDate) : undefined,
        preferredTime: change.parameters.task.preferredTime ? new Date(change.parameters.task.preferredTime) : undefined,
      });
    }
  }

  private applyRemoveTask(input: SchedulingInput, change: SimulationChange): void {
    const index = input.tasks.findIndex(t => t.id === change.targetEntityId);
    if (index !== -1) {
      input.tasks.splice(index, 1);
    }
  }

  private applyChangeDeadline(input: SchedulingInput, change: SimulationChange): void {
    const task = input.tasks.find(t => t.id === change.targetEntityId);
    if (task && change.parameters.newDeadline) {
      task.deadline = new Date(change.parameters.newDeadline);
    }
  }

  private applyAddWorkHours(input: SchedulingInput, change: SimulationChange): void {
    const hours = change.parameters.additionalHoursPerDay || 2;
    const [endH, endM] = input.preferences.workingHoursEnd.split(':').map(Number);
    const totalMinutes = endH * 60 + endM + hours * 60;
    const newEndH = Math.floor(totalMinutes / 60);
    const newEndM = totalMinutes % 60;
    input.preferences.workingHoursEnd = `${newEndH.toString().padStart(2, '0')}:${newEndM.toString().padStart(2, '0')}`;
    input.preferences.maxDailyHours += hours;
  }

  private applyRemoveWorkHours(input: SchedulingInput, change: SimulationChange): void {
    const hours = change.parameters.reducedHoursPerDay || 2;
    const [endH, endM] = input.preferences.workingHoursEnd.split(':').map(Number);
    const totalMinutes = endH * 60 + endM - hours * 60;
    const newEndH = Math.floor(totalMinutes / 60);
    const newEndM = totalMinutes % 60;
    input.preferences.workingHoursEnd = `${newEndH.toString().padStart(2, '0')}:${newEndM.toString().padStart(2, '0')}`;
    input.preferences.maxDailyHours = Math.max(0, input.preferences.maxDailyHours - hours);
  }

  private applyTakeTimeOff(input: SchedulingInput, change: SimulationChange): void {
    this.applyChangeAvailability(input, change);
  }

  private applyShiftSchedule(input: SchedulingInput, change: SimulationChange): void {
    const days = change.parameters.shiftDays || 0;
    const ms = days * 24 * 60 * 60 * 1000;
    
    for (const task of input.tasks) {
      if (task.preferredTime) task.preferredTime = new Date(task.preferredTime.getTime() + ms);
      if (task.deadline) task.deadline = new Date(task.deadline.getTime() + ms);
      if (task.startDate) task.startDate = new Date(task.startDate.getTime() + ms);
    }
    
    for (const event of input.fixedEvents) {
      event.startTime = new Date(event.startTime.getTime() + ms);
      event.endTime = new Date(event.endTime.getTime() + ms);
    }
    
    input.timeRange.start = new Date(input.timeRange.start.getTime() + ms);
    input.timeRange.end = new Date(input.timeRange.end.getTime() + ms);
  }

  private applyLaunchEarlier(input: SchedulingInput, change: SimulationChange): void {
    this.applyShiftSchedule(input, { ...change, parameters: { shiftDays: change.parameters.shiftDays || -3 } });
  }

  private applyLaunchLater(input: SchedulingInput, change: SimulationChange): void {
    this.applyShiftSchedule(input, { ...change, parameters: { shiftDays: change.parameters.shiftDays || 3 } });
  }

  private dayToNumber(day: string): number {
    const days: Record<string, number> = {
      SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3,
      THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
    };
    return days[day.toUpperCase()] ?? 1;
  }

  private serializeBlocks(blocks: ScheduledBlock[]): SimulationResult['baseSchedule'] {
    return blocks.map(b => ({
      id: b.id,
      title: b.title,
      type: b.type,
      startTime: b.startTime.toISOString(),
      endTime: b.endTime.toISOString(),
      durationMinutes: b.durationMinutes,
      timezone: b.timezone,
      taskId: b.taskId,
      eventId: b.eventId,
      goalId: b.goalId,
      projectId: b.projectId,
      isFixed: b.isFixed,
      isProposed: b.isProposed,
      confidence: b.confidence,
      reason: b.reason,
      constraints: b.constraints || [],
    }));
  }

  private calculateScheduleDiff(baseBlocks: ScheduledBlock[], simulatedBlocks: ScheduledBlock[]) {
    const baseMap = new Map(baseBlocks.map(b => [b.id, b]));
    const simMap = new Map(simulatedBlocks.map(b => [b.id, b]));

    const moved: SimulationResult['scheduleDiff']['moved'] = [];
    const added: SimulationResult['scheduleDiff']['added'] = [];
    const removed: SimulationResult['scheduleDiff']['removed'] = [];
    const rescheduled: SimulationResult['scheduleDiff']['rescheduled'] = [];

    // Find moved/rescheduled
    for (const [id, baseBlock] of baseMap) {
      const simBlock = simMap.get(id);
      if (simBlock) {
        if (baseBlock.startTime.getTime() !== simBlock.startTime.getTime() ||
            baseBlock.endTime.getTime() !== simBlock.endTime.getTime()) {
          if (baseBlock.taskId && simBlock.taskId) {
            rescheduled.push({
              blockId: id,
              title: baseBlock.title,
              originalStart: baseBlock.startTime.toISOString(),
              originalEnd: baseBlock.endTime.toISOString(),
              newStart: simBlock.startTime.toISOString(),
              newEnd: simBlock.endTime.toISOString(),
              reason: 'Rescheduled due to simulation',
            });
          } else {
            moved.push({
              blockId: id,
              title: baseBlock.title,
              from: { start: baseBlock.startTime.toISOString(), end: baseBlock.endTime.toISOString() },
              to: { start: simBlock.startTime.toISOString(), end: simBlock.endTime.toISOString() },
              reason: 'Moved due to simulation',
            });
          }
        }
      } else {
        removed.push({
          blockId: id,
          title: baseBlock.title,
          type: baseBlock.type,
          reason: 'Removed in simulation',
        });
      }
    }

    // Find added
    for (const [id, simBlock] of simMap) {
      if (!baseMap.has(id)) {
        added.push({
          blockId: id,
          title: simBlock.title,
          type: simBlock.type,
          start: simBlock.startTime.toISOString(),
          end: simBlock.endTime.toISOString(),
          reason: 'Added in simulation',
        });
      }
    }

    return { moved, added, removed, rescheduled };
  }

  private calculateDeadlineEffects(baseProposal: any, simulatedProposal: any, input: SimulationInput) {
    const effects: SimulationResult['deadlineEffects'] = [];
    const baseBlocks = baseProposal.proposedBlocks;
    const simBlocks = simulatedProposal.proposedBlocks;

    const baseMap = new Map<string, ScheduledBlock>(baseBlocks.filter(b => b.taskId).map(b => [b.taskId!, b]));
    const simMap = new Map<string, ScheduledBlock>(simBlocks.filter(b => b.taskId).map(b => [b.taskId!, b]));

    for (const task of input.tasks) {
      if (!task.deadline) continue;
      
      const baseBlock = baseMap.get(task.id);
      const simBlock = simMap.get(task.id);
      const deadline = new Date(task.deadline);

      const originalCompletion = baseBlock?.endTime;
      const newCompletion = simBlock?.endTime;

      let impact: SimulationResult['deadlineEffects'][0]['impact'] = 'NONE';
      let daysShift = 0;
      let riskLevel: SimulationResult['deadlineEffects'][0]['riskLevel'] = 'NONE';

      if (originalCompletion && newCompletion) {
        const origDiff = deadline.getTime() - originalCompletion.getTime();
        const newDiff = deadline.getTime() - newCompletion.getTime();
        daysShift = Math.round((newCompletion.getTime() - originalCompletion.getTime()) / (24 * 60 * 60 * 1000));

        if (newDiff < 0) {
          impact = 'MISSED';
          riskLevel = 'CRITICAL';
        } else if (origDiff >= 0 && newDiff < 0) {
          impact = 'MAJOR';
          riskLevel = 'HIGH';
        } else if (newDiff < origDiff * 0.5) {
          impact = 'MAJOR';
          riskLevel = 'HIGH';
        } else if (newDiff < origDiff * 0.8) {
          impact = 'MINOR';
          riskLevel = 'MEDIUM';
        }
      } else if (!simBlock && baseBlock) {
        impact = 'MISSED';
        riskLevel = 'CRITICAL';
      } else if (simBlock && !baseBlock) {
        impact = 'NONE';
        riskLevel = 'NONE';
      }

      effects.push({
        taskId: task.id,
        taskTitle: task.title,
        originalDeadline: task.deadline,
        originalProjectedCompletion: originalCompletion?.toISOString(),
        newProjectedCompletion: newCompletion?.toISOString(),
        impact,
        daysShift,
        riskLevel,
      });
    }

    return effects;
  }

  private calculateConstraintViolations(baseProposal: any, simulatedProposal: any, input: SimulationInput) {
    const violations: SimulationResult['constraintViolations'] = [];

    const baseConstraints = baseProposal.constraints;
    const simConstraints = simulatedProposal.constraints;
    const baseUnsatisfied = baseProposal.unsatisfiedConstraints;
    const simUnsatisfied = simulatedProposal.unsatisfiedConstraints;

    // Check newly violated constraints
    for (const simUnsat of simUnsatisfied) {
      const wasSatisfiedBefore = !baseUnsatisfied.some(b => b.type === simUnsat.type && 
        b.affectedBlocks.some(ab => simUnsat.affectedBlocks.includes(ab)));
      
      violations.push({
        constraintId: simUnsat.type,
        constraintType: simUnsat.type,
        description: simUnsat.description,
        severity: simUnsat.severity === 'HARD' ? 'VIOLATION' : 'WARNING',
        affectedEntities: simUnsat.affectedBlocks,
        wasSatisfiedBefore,
      });
    }

    // Check resolved constraints
    for (const baseUnsat of baseUnsatisfied) {
      const isStillViolated = simUnsatisfied.some(s => s.type === baseUnsat.type && 
        s.affectedBlocks.some(ab => baseUnsat.affectedBlocks.includes(ab)));
      
      if (!isStillViolated) {
        violations.push({
          constraintId: baseUnsat.type,
          constraintType: baseUnsat.type,
          description: `Previously violated: ${baseUnsat.description} - NOW RESOLVED`,
          severity: 'WARNING',
          affectedEntities: baseUnsat.affectedBlocks,
          wasSatisfiedBefore: false,
        });
      }
    }

    return violations;
  }

  private calculateWorkloadChanges(baseProposal: any, simulatedProposal: any) {
    const baseMetrics = baseProposal.metrics;
    const simMetrics = simulatedProposal.metrics;

    const dailyBreakdown: SimulationResult['workloadChanges']['dailyBreakdown'] = [];
    
    // Group blocks by day
    const baseByDay = this.groupByDay(baseProposal.proposedBlocks);
    const simByDay = this.groupByDay(simulatedProposal.proposedBlocks);
    const allDates = new Set([...baseByDay.keys(), ...simByDay.keys()]);

    for (const date of allDates) {
      const baseMinutes = (baseByDay.get(date) || []).reduce((sum, b) => sum + b.durationMinutes, 0);
      const simMinutes = (simByDay.get(date) || []).reduce((sum, b) => sum + b.durationMinutes, 0);
      dailyBreakdown.push({
        date: new Date(date).toISOString(),
        baseMinutes,
        simulatedMinutes: simMinutes,
        changeMinutes: simMinutes - baseMinutes,
      });
    }

    return {
      totalScheduledMinutes: simMetrics.totalScheduledMinutes,
      baseTotalMinutes: baseMetrics.totalScheduledMinutes,
      changeMinutes: simMetrics.totalScheduledMinutes - baseMetrics.totalScheduledMinutes,
      focusMinutesChange: simMetrics.focusMinutes - baseMetrics.focusMinutes,
      meetingMinutesChange: simMetrics.meetingHours * 60 - baseMetrics.meetingHours * 60,
      breakMinutesChange: simMetrics.breakMinutes - baseMetrics.breakMinutes,
      utilizationRateChange: simMetrics.utilizationRate - baseMetrics.utilizationRate,
      dailyBreakdown,
    };
  }

  private groupByDay(blocks: ScheduledBlock[]): Map<string, ScheduledBlock[]> {
    const map = new Map<string, ScheduledBlock[]>();
    for (const block of blocks) {
      const date = block.startTime.toISOString().split('T')[0];
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(block);
    }
    return map;
  }

  private calculateDependencyEffects(baseProposal: any, simulatedProposal: any, input: SimulationInput) {
    const effects: SimulationResult['dependencyEffects'] = [];

    const baseBlocks = baseProposal.proposedBlocks;
    const simBlocks = simulatedProposal.proposedBlocks;

    const baseMap = new Map<string, ScheduledBlock>(baseBlocks.filter(b => b.taskId).map(b => [b.taskId!, b]));
    const simMap = new Map<string, ScheduledBlock>(simBlocks.filter(b => b.taskId).map(b => [b.taskId!, b]));

    for (const task of input.tasks) {
      for (const depId of task.dependencies) {
        const baseTaskBlock = baseMap.get(task.id);
        const baseDepBlock = baseMap.get(depId);
        const simTaskBlock = simMap.get(task.id);
        const simDepBlock = simMap.get(depId);

        const wasSatisfied = baseTaskBlock && baseDepBlock && baseDepBlock.endTime <= baseTaskBlock.startTime;
        const isSatisfied = simTaskBlock && simDepBlock && simDepBlock.endTime <= simTaskBlock.startTime;

        if (wasSatisfied !== isSatisfied) {
          effects.push({
            taskId: task.id,
            taskTitle: task.title,
            dependencyId: depId,
            dependencyTitle: input.tasks.find(t => t.id === depId)?.title || depId,
            wasSatisfied: !!wasSatisfied,
            isSatisfied: !!isSatisfied,
            violationDescription: isSatisfied 
              ? 'Dependency now satisfied' 
              : `Dependency violated: ${simDepBlock?.title || 'dependency'} ends after ${simTaskBlock?.title || 'task'} starts`,
          });
        }
      }
    }

    return effects;
  }

  private identifyTradeoffs(baseProposal: any, simulatedProposal: any, input: SimulationInput) {
    const tradeoffs: SimulationResult['tradeoffs'] = [];

    const baseMetrics = baseProposal.metrics;
    const simMetrics = simulatedProposal.metrics;

    // Deadline compliance tradeoff
    if (simMetrics.deadlineComplianceRate < baseMetrics.deadlineComplianceRate) {
      tradeoffs.push({
        id: generateId(),
        description: `Deadline compliance decreased from ${Math.round(baseMetrics.deadlineComplianceRate * 100)}% to ${Math.round(simMetrics.deadlineComplianceRate * 100)}%`,
        impact: 'HIGH',
        affectedArea: 'DEADLINES',
        affectedBlocks: [],
      });
    }

    // Focus time tradeoff
    if (simMetrics.focusMinutes < baseMetrics.focusMinutes) {
      tradeoffs.push({
        id: generateId(),
        description: `Focus time reduced by ${baseMetrics.focusMinutes - simMetrics.focusMinutes} minutes`,
        impact: 'MEDIUM',
        affectedArea: 'FOCUS_TIME',
        affectedBlocks: [],
      });
    }

    // Meeting time tradeoff
    if (simMetrics.meetingHours > baseMetrics.meetingHours) {
      tradeoffs.push({
        id: generateId(),
        description: `Meeting time increased by ${simMetrics.meetingHours - baseMetrics.meetingHours} hours`,
        impact: 'MEDIUM',
        affectedArea: 'MEETINGS',
        affectedBlocks: [],
      });
    }

    // Break time tradeoff
    if (simMetrics.breakMinutes < baseMetrics.breakMinutes) {
      tradeoffs.push({
        id: generateId(),
        description: `Break time reduced by ${baseMetrics.breakMinutes - simMetrics.breakMinutes} minutes`,
        impact: 'LOW',
        affectedArea: 'BREAKS',
        affectedBlocks: [],
      });
    }

    // Work-life balance
    if (simMetrics.utilizationRate > 0.9) {
      tradeoffs.push({
        id: generateId(),
        description: 'Schedule utilization exceeds 90% - risk of burnout',
        impact: 'HIGH',
        affectedArea: 'WORK_LIFE_BALANCE',
        affectedBlocks: [],
      });
    }

    return tradeoffs;
  }

  private mergeConflicts(baseProposal: any, simulatedProposal: any) {
    const allConflicts = [
      ...baseProposal.conflicts.map((c: any) => ({ ...c, origin: 'BASE' })),
      ...simulatedProposal.conflicts.map((c: any) => ({ ...c, origin: 'SIMULATED' })),
    ];

    // Deduplicate by involved blocks and type
    const seen = new Set<string>();
    return allConflicts
      .filter(c => {
        const key = `${c.type}-${c.involvedBlocks.sort().join(',')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ origin, ...c }) => c);
  }

  private calculateMetrics(baseProposal: any, simulatedProposal: any, input: SimulationInput) {
    const simMetrics = simulatedProposal.metrics;
    const baseMetrics = baseProposal.metrics;

    // Schedule stability: how much the schedule changed
    const baseBlocks = baseProposal.proposedBlocks;
    const simBlocks = simulatedProposal.proposedBlocks;
    const baseMap = new Map<string, ScheduledBlock>(baseBlocks.map(b => [b.id, b]));
    
    let stableBlocks = 0;
    let totalBlocks = 0;
    
    for (const simBlock of simBlocks) {
      if (simBlock.taskId) totalBlocks++;
      const baseBlock = baseMap.get(simBlock.id);
      if (baseBlock && baseBlock.startTime.getTime() === simBlock.startTime.getTime()) {
        stableBlocks++;
      }
    }
    
    const scheduleStabilityScore = totalBlocks > 0 ? stableBlocks / totalBlocks : 1;

    // Feasibility: based on conflicts and unsatisfied constraints
    const totalConflicts = simulatedProposal.conflicts.length;
    const criticalConflicts = simulatedProposal.conflicts.filter((c: any) => c.severity === 'CRITICAL').length;
    const feasibilityScore = Math.max(0, 1 - criticalConflicts * 0.2 - totalConflicts * 0.05);

    return {
      confidence: simulatedProposal.confidence,
      feasibilityScore,
      deadlineComplianceRate: simMetrics.deadlineComplianceRate,
      dependencyComplianceRate: simMetrics.dependencyComplianceRate,
      utilizationRate: simMetrics.utilizationRate,
      scheduleStabilityScore,
    };
  }

  private selectBestScenario(scenarios: any[]): { scenarioId: string } | null {
    if (scenarios.length === 0) return null;
    
    // Score scenarios: higher deadline compliance, lower conflicts, higher feasibility
    let best = scenarios[0];
    let bestScore = -Infinity;
    
    for (const s of scenarios) {
      const score = 
        s.metrics.deadlineComplianceRate * 0.4 +
        s.metrics.feasibilityScore * 0.3 +
        s.metrics.dependencyComplianceRate * 0.2 +
        s.metrics.scheduleStabilityScore * 0.1;
      
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    
    return { scenarioId: best.scenarioId };
  }

  private generateSummary(
    scheduleDiff: any,
    deadlineEffects: any[],
    constraintViolations: any[],
    workloadChanges: any,
    tradeoffs: any[]
  ): string {
    const parts: string[] = [];
    
    if (scheduleDiff.moved.length > 0) {
      parts.push(`${scheduleDiff.moved.length} item(s) moved`);
    }
    if (scheduleDiff.added.length > 0) {
      parts.push(`${scheduleDiff.added.length} new item(s) added`);
    }
    if (scheduleDiff.removed.length > 0) {
      parts.push(`${scheduleDiff.removed.length} item(s) removed`);
    }
    if (scheduleDiff.rescheduled.length > 0) {
      parts.push(`${scheduleDiff.rescheduled.length} task(s) rescheduled`);
    }

    const missedDeadlines = deadlineEffects.filter(d => d.impact === 'MISSED').length;
    if (missedDeadlines > 0) {
      parts.push(`${missedDeadlines} deadline(s) at risk of being missed`);
    }

    const violations = constraintViolations.filter(v => v.severity === 'VIOLATION').length;
    if (violations > 0) {
      parts.push(`${violations} new constraint violation(s)`);
    }

    if (workloadChanges.changeMinutes > 0) {
      parts.push(`Workload increased by ${Math.round(workloadChanges.changeMinutes / 60 * 10) / 10} hours`);
    } else if (workloadChanges.changeMinutes < 0) {
      parts.push(`Workload decreased by ${Math.round(-workloadChanges.changeMinutes / 60 * 10) / 10} hours`);
    }

    if (tradeoffs.length > 0) {
      parts.push(`${tradeoffs.length} tradeoff(s) identified`);
    }

    return parts.join('. ') || 'No significant changes detected';
  }
}
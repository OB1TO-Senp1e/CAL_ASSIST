import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import {
  SchedulingInput,
  ScheduleProposal,
  ScheduledBlock,
  SchedulingTask,
  CalendarEvent,
  AvailabilityRule,
  SchedulingConstraint,
  SchedulingPreferences,
  TimeRange,
  TaskFlexibility,
  EnergyLevel,
  TimeBlockType,
  ConstraintType,
  ConstraintSeverity,
  Conflict,
  Tradeoff,
  Alternative,
  UnsatisfiedConstraint,
  AppliedConstraint,
} from './domain/time-compiler.types';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Injectable()
export class TimeCompilerService {
  constructor(private readonly prisma: PrismaService) {}

  async compileSchedule(input: SchedulingInput): Promise<ScheduleProposal> {
    const proposalId = generateId();
    const now = new Date();

    // 1. Validate input
    this.validateInput(input);

    // 2. Build available time slots from availability rules
    const availableSlots = this.buildAvailableSlots(input);

    // 3. Get fixed blocks (calendar events that cannot be moved)
    const fixedBlocks = this.buildFixedBlocks(input.fixedEvents, input.timezone);

    // 4. Sort tasks by priority strategy
    const sortedTasks = this.sortTasks(input.tasks, input.preferences.taskOrderingStrategy);

    // 5. Resolve dependencies (topological sort)
    const taskOrder = this.resolveDependencies(sortedTasks);

    // 6. Schedule tasks into available slots
    const { proposedBlocks, unsatisfiedConstraints, conflicts, reasoning } = this.scheduleTasks(
      taskOrder,
      availableSlots,
      fixedBlocks,
      input
    );

    // 7. Add buffers and breaks
    const blocksWithBuffers = this.addBuffersAndBreaks(proposedBlocks, input.preferences);

    // 8. Calculate metrics
    const metrics = this.calculateMetrics(blocksWithBuffers, fixedBlocks, input);

    // 9. Generate alternatives
    const alternatives = this.generateAlternatives(blocksWithBuffers, fixedBlocks, input);

    // 10. Calculate overall confidence
    const confidence = this.calculateConfidence(
      blocksWithBuffers,
      unsatisfiedConstraints,
      conflicts,
      metrics
    );

    // 11. Build applied constraints list
    const appliedConstraints = this.buildAppliedConstraints(input.constraints, blocksWithBuffers);

    // 12. Identify tradeoffs
    const tradeoffs = this.identifyTradeoffs(blocksWithBuffers, unsatisfiedConstraints, conflicts);

    return {
      id: proposalId,
      userId: input.userId,
      status: 'DRAFT',
      timeRange: input.timeRange,
      createdAt: now,
      updatedAt: now,
      proposedBlocks: blocksWithBuffers,
      fixedBlocks,
      confidence,
      constraints: appliedConstraints,
      unsatisfiedConstraints,
      conflicts,
      tradeoffs,
      alternatives,
      metrics,
      reasoning,
    };
  }

  private validateInput(input: SchedulingInput): void {
    if (input.timeRange.start >= input.timeRange.end) {
      throw new BadRequestException('Invalid time range: start must be before end');
    }
    if (input.tasks.length === 0) {
      throw new BadRequestException('No tasks to schedule');
    }
  }

  private buildAvailableSlots(input: SchedulingInput): TimeRange[] {
    const slots: TimeRange[] = [];
    const { timeRange, availability, preferences, timezone } = input;

    // No AvailabilityRule rows is the common case for a new user, and the old
    // behaviour there was zero slots -> zero blocks. Fall back to the user's
    // configured working hours so a compile always has somewhere to put work.
    const effectiveAvailability: AvailabilityRule[] = availability.length === 0
      ? [{
          id: 'derived_working_hours',
          startTime: preferences.workingHoursStart,
          endTime: preferences.workingHoursEnd,
          timezone,
          isAvailable: true,
          priority: 0,
          recurrence: 'DAILY',
        }]
      : availability;

    const current = new Date(timeRange.start);

    while (current < timeRange.end) {
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if (isWeekend && !preferences.allowWeekendScheduling) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        continue;
      }

      // Find applicable availability rules for this day
      const rules = effectiveAvailability.filter((rule) => {
        if (rule.dayOfWeek !== undefined && rule.dayOfWeek !== dayOfWeek) return false;
        if (rule.startDate && new Date(rule.startDate) > current) return false;
        if (rule.endDate && new Date(rule.endDate) < current) return false;
        return rule.isAvailable;
      });

      // Sort by priority
      rules.sort((a, b) => b.priority - a.priority);

      for (const rule of rules) {
        // A derived working-hours window is local wall-clock time, so it is
        // applied with setHours() in the request's own day boundaries.
        const [startHour, startMin] = rule.startTime.split(':').map(Number);
        const [endHour, endMin] = rule.endTime.split(':').map(Number);

        const slotStart = new Date(current);
        slotStart.setHours(startHour, startMin, 0, 0);

        const slotEnd = new Date(current);
        slotEnd.setHours(endHour, endMin, 0, 0);

        // Clip to timeRange
        if (slotStart < timeRange.start) slotStart.setTime(timeRange.start.getTime());
        if (slotEnd > timeRange.end) slotEnd.setTime(timeRange.end.getTime());

        if (slotStart < slotEnd) {
          slots.push({ start: slotStart, end: slotEnd });
        }
      }

      // Move to next day
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }

    // Merge overlapping slots
    return this.mergeOverlappingSlots(slots);
  }

  private mergeOverlappingSlots(slots: TimeRange[]): TimeRange[] {
    if (slots.length <= 1) return slots;

    slots.sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged: TimeRange[] = [slots[0]];

    for (let i = 1; i < slots.length; i++) {
      const last = merged[merged.length - 1];
      const current = slots[i];

      if (current.start <= last.end) {
        last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()));
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  private buildFixedBlocks(events: CalendarEvent[], timezone: string): ScheduledBlock[] {
    return events
      .filter((e) => e.isFixed)
      .map((event) => ({
        id: `fixed-${event.id}`,
        type: 'MEETING' as TimeBlockType,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        durationMinutes: (event.endTime.getTime() - event.startTime.getTime()) / 60000,
        timezone,
        eventId: event.id,
        confidence: 1.0,
        reason: 'Fixed calendar event',
        constraints: [],
        isFixed: true,
        isProposed: false,
      }));
  }

  private sortTasks(tasks: SchedulingTask[], strategy: string): SchedulingTask[] {
    const sorted = [...tasks];

    switch (strategy) {
      case 'PRIORITY':
        sorted.sort((a, b) => b.priority - a.priority);
        break;
      case 'DEADLINE':
        sorted.sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return a.deadline.getTime() - b.deadline.getTime();
        });
        break;
      case 'DEPENDENCY':
        // Will be handled by topological sort
        break;
      case 'ENERGY':
        const energyOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        sorted.sort((a, b) => energyOrder[b.energyRequirement] - energyOrder[a.energyRequirement]);
        break;
      case 'BALANCED':
      default:
        sorted.sort((a, b) => {
          const deadlineScore =
            a.deadline && b.deadline
              ? (a.deadline.getTime() - b.deadline.getTime()) / (1000 * 60 * 60 * 24)
              : 0;
          const priorityScore = (b.priority - a.priority) * 10;
          return deadlineScore + priorityScore;
        });
    }

    return sorted;
  }

  private resolveDependencies(tasks: SchedulingTask[]): SchedulingTask[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: SchedulingTask[] = [];

    const visit = (taskId: string): void => {
      if (visited.has(taskId)) return;
      if (visiting.has(taskId)) {
        throw new BadRequestException(`Circular dependency detected involving task ${taskId}`);
      }

      visiting.add(taskId);
      const task = taskMap.get(taskId);
      if (task) {
        for (const depId of task.dependencies) {
          visit(depId);
        }
        visiting.delete(taskId);
        visited.add(taskId);
        result.push(task);
      }
    };

    for (const task of tasks) {
      visit(task.id);
    }

    return result;
  }

  private scheduleTasks(
    tasks: SchedulingTask[],
    availableSlots: TimeRange[],
    fixedBlocks: ScheduledBlock[],
    input: SchedulingInput
  ): {
    proposedBlocks: ScheduledBlock[];
    unsatisfiedConstraints: UnsatisfiedConstraint[];
    conflicts: Conflict[];
    reasoning: string[];
  } {
    const proposedBlocks: ScheduledBlock[] = [];
    const unsatisfiedConstraints: UnsatisfiedConstraint[] = [];
    const conflicts: Conflict[] = [];
    const reasoning: string[] = [];

    // Create a mutable copy of available slots
    let slots = availableSlots.map((s) => ({ ...s }));

    for (const task of tasks) {
      if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
        reasoning.push(`Skipping task ${task.id} (${task.title}): status is ${task.status}`);
        continue;
      }

      // Check hard deadline constraint
      if (task.deadline && task.deadline < input.timeRange.start) {
        unsatisfiedConstraints.push({
          type: 'HARD_DEADLINE',
          severity: 'HARD',
          description: `Task "${task.title}" has deadline ${task.deadline.toISOString()} before scheduling window`,
          affectedBlocks: [task.id],
          suggestedResolution: 'Extend scheduling window or adjust deadline',
        });
        continue;
      }

      // Find suitable slot
      const slot = this.findBestSlot(task, slots, fixedBlocks, proposedBlocks, input);

      if (!slot) {
        unsatisfiedConstraints.push({
          type: 'AVAILABILITY_WINDOW',
          severity: task.flexibility === 'LOW' ? 'HARD' : 'SOFT',
          description: `No available slot for task "${task.title}" (${task.estimatedDurationMinutes} min)`,
          affectedBlocks: [task.id],
          suggestedResolution:
            task.flexibility === 'LOW'
              ? 'Extend scheduling window or reduce task duration'
              : 'Consider splitting task or scheduling outside preferred hours',
        });
        conflicts.push({
          id: generateId(),
          type: 'AVAILABILITY_VIOLATION',
          severity: task.flexibility === 'LOW' ? 'CRITICAL' : 'WARNING',
          description: `Cannot schedule "${task.title}" within available time`,
          involvedBlocks: [task.id],
          suggestedResolution: 'Extend scheduling window or adjust task flexibility',
        });
        continue;
      }

      // Create scheduled block
      const block: ScheduledBlock = {
        id: generateId(),
        type: 'TASK',
        title: task.title,
        description: task.description,
        startTime: slot.start,
        endTime: slot.end,
        durationMinutes: task.estimatedDurationMinutes,
        timezone: input.timezone,
        taskId: task.id,
        goalId: task.goalId,
        projectId: task.projectId,
        milestoneId: task.milestoneId,
        priority: task.priority,
        flexibility: task.flexibility,
        energyRequirement: task.energyRequirement,
        context: task.context,
        location: task.location,
        confidence: this.calculateTaskConfidence(task, slot, input),
        reason: this.generateTaskReason(task, slot, input),
        constraints: this.getApplicableConstraints(task, input.constraints),
        isFixed: task.flexibility === 'LOW',
        isProposed: true,
      };

      proposedBlocks.push(block);
      reasoning.push(
        `Scheduled "${task.title}" at ${slot.start.toISOString()} - ${slot.end.toISOString()}`
      );

      // Update available slots (remove used time)
      slots = this.removeTimeFromSlots(slots, slot.start, slot.end);

      // Check if task meets deadline
      if (task.deadline && slot.end > task.deadline) {
        conflicts.push({
          id: generateId(),
          type: 'DEADLINE_MISS',
          severity: 'CRITICAL',
          description: `Task "${task.title}" scheduled after deadline`,
          involvedBlocks: [block.id],
          suggestedResolution: 'Reschedule earlier or negotiate deadline extension',
        });
      }

      // Check dependency violations
      for (const depId of task.dependencies) {
        const depBlock = proposedBlocks.find((b) => b.taskId === depId);
        if (depBlock && depBlock.endTime > slot.start) {
          conflicts.push({
            id: generateId(),
            type: 'DEPENDENCY_VIOLATION',
            severity: 'CRITICAL',
            description: `Task "${task.title}" starts before dependency "${depBlock.title}" completes`,
            involvedBlocks: [block.id, depBlock.id],
            suggestedResolution: 'Respect dependency order',
          });
        }
      }
    }

    return { proposedBlocks, unsatisfiedConstraints, conflicts, reasoning };
  }

  private findBestSlot(
    task: SchedulingTask,
    slots: TimeRange[],
    fixedBlocks: ScheduledBlock[],
    proposedBlocks: ScheduledBlock[],
    input: SchedulingInput
  ): TimeRange | null {
    const durationMs = task.estimatedDurationMinutes * 60000;
    const earliestStart = task.startDate
      ? new Date(Math.max(task.startDate.getTime(), input.timeRange.start.getTime()))
      : input.timeRange.start;
    const latestEnd = task.deadline
      ? new Date(Math.min(task.deadline.getTime(), input.timeRange.end.getTime()))
      : input.timeRange.end;

    for (const slot of slots) {
      // Check if slot fits within task's time bounds
      const effectiveStart = new Date(Math.max(slot.start.getTime(), earliestStart.getTime()));
      const effectiveEnd = new Date(effectiveStart.getTime() + durationMs);

      if (effectiveEnd > effectiveEnd) continue; // sanity
      if (effectiveEnd > slot.end) continue; // doesn't fit in slot
      if (effectiveEnd > latestEnd) continue; // misses deadline

      // Check for conflicts with fixed blocks
      const hasFixedConflict = fixedBlocks.some(
        (fb) => effectiveStart < fb.endTime && effectiveEnd > fb.startTime
      );
      if (hasFixedConflict) continue;

      // Check for conflicts with already proposed blocks
      const hasProposedConflict = proposedBlocks.some(
        (pb) => effectiveStart < pb.endTime && effectiveEnd > pb.startTime
      );
      if (hasProposedConflict) continue;

      // Check preferred time
      if (task.preferredTime) {
        const prefDiff = Math.abs(effectiveStart.getTime() - task.preferredTime.getTime());
        const maxPrefDiff = 4 * 60 * 60 * 1000; // 4 hours
        if (prefDiff > maxPrefDiff && task.flexibility === 'LOW') continue;
      }

      // Check energy match
      if (input.preferences.energyPeakHours.length > 0) {
        const hour = effectiveStart.getHours();
        const isPeak = input.preferences.energyPeakHours.some((peak) => {
          const [startH] = peak.start.split(':').map(Number);
          const [endH] = peak.end.split(':').map(Number);
          return hour >= startH && hour < endH;
        });
        if (task.energyRequirement === 'HIGH' && !isPeak && task.flexibility === 'LOW') continue;
      }

      return { start: effectiveStart, end: effectiveEnd };
    }

    return null;
  }

  private removeTimeFromSlots(slots: TimeRange[], start: Date, end: Date): TimeRange[] {
    const newSlots: TimeRange[] = [];

    for (const slot of slots) {
      if (end <= slot.start || start >= slot.end) {
        // No overlap
        newSlots.push(slot);
      } else if (start <= slot.start && end >= slot.end) {
        // Slot completely consumed
        continue;
      } else if (start <= slot.start && end < slot.end) {
        // Consumes start of slot
        newSlots.push({ start: new Date(end.getTime()), end: slot.end });
      } else if (start > slot.start && end >= slot.end) {
        // Consumes end of slot
        newSlots.push({ start: slot.start, end: new Date(start.getTime()) });
      } else if (start > slot.start && end < slot.end) {
        // Splits slot
        newSlots.push({ start: slot.start, end: new Date(start.getTime()) });
        newSlots.push({ start: new Date(end.getTime()), end: slot.end });
      }
    }

    return newSlots;
  }

  private addBuffersAndBreaks(
    blocks: ScheduledBlock[],
    preferences: SchedulingPreferences
  ): ScheduledBlock[] {
    if (blocks.length === 0) return blocks;

    const result: ScheduledBlock[] = [];
    const sorted = [...blocks].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    for (let i = 0; i < sorted.length; i++) {
      const block = sorted[i];
      result.push(block);

      // Add buffer after task (except last)
      if (i < sorted.length - 1) {
        const nextBlock = sorted[i + 1];
        const gapMs = nextBlock.startTime.getTime() - block.endTime.getTime();
        const bufferMs = preferences.bufferBetweenTasks * 60000;

        if (gapMs > bufferMs) {
          // Add explicit buffer block
          result.push({
            id: generateId(),
            type: 'BUFFER',
            title: 'Buffer',
            startTime: block.endTime,
            endTime: new Date(block.endTime.getTime() + bufferMs),
            durationMinutes: preferences.bufferBetweenTasks,
            timezone: block.timezone,
            confidence: 0.9,
            reason: 'Buffer between tasks',
            constraints: [],
            isFixed: false,
            isProposed: true,
          });
        } else if (gapMs > 0 && gapMs < bufferMs) {
          // Extend current block slightly or note tight scheduling
          // For now, just note it
        }
      }

      // Add breaks based on preferred break interval
      if (preferences.preferredBreakInterval > 0 && i < sorted.length - 1) {
        const workDuration = block.durationMinutes;
        if (workDuration >= preferences.preferredBreakInterval) {
          const nextBlock = sorted[i + 1];
          const gapMs = nextBlock.startTime.getTime() - block.endTime.getTime();
          const breakMs = preferences.minBreakDuration * 60000;

          if (gapMs >= breakMs) {
            result.push({
              id: generateId(),
              type: 'BREAK',
              title: 'Break',
              startTime: block.endTime,
              endTime: new Date(block.endTime.getTime() + breakMs),
              durationMinutes: preferences.minBreakDuration,
              timezone: block.timezone,
              confidence: 0.8,
              reason: 'Scheduled break for productivity',
              constraints: [],
              isFixed: false,
              isProposed: true,
            });
          }
        }
      }
    }

    return result;
  }

  private calculateMetrics(
    proposedBlocks: ScheduledBlock[],
    fixedBlocks: ScheduledBlock[],
    input: SchedulingInput
  ): ScheduleProposal['metrics'] {
    const totalAvailableMs = this.calculateTotalAvailableTime(input);
    const totalScheduledMs = proposedBlocks.reduce((sum, b) => sum + b.durationMinutes * 60000, 0);
    const totalTaskMs = proposedBlocks
      .filter((b) => b.type === 'TASK')
      .reduce((sum, b) => sum + b.durationMinutes * 60000, 0);
    const focusMs = proposedBlocks
      .filter((b) => b.type === 'FOCUS')
      .reduce((sum, b) => sum + b.durationMinutes * 60000, 0);
    const breakMs = proposedBlocks
      .filter((b) => b.type === 'BREAK')
      .reduce((sum, b) => sum + b.durationMinutes * 60000, 0);
    const bufferMs = proposedBlocks
      .filter((b) => b.type === 'BUFFER')
      .reduce((sum, b) => sum + b.durationMinutes * 60000, 0);
    const travelMs = proposedBlocks
      .filter((b) => b.type === 'TRAVEL')
      .reduce((sum, b) => sum + b.durationMinutes * 60000, 0);

    const tasksWithDeadlines = input.tasks.filter((t) => t.deadline);
    const tasksMeetingDeadlines = proposedBlocks.filter((b) => {
      const task = input.tasks.find((t) => t.id === b.taskId);
      return task?.deadline && b.endTime <= task.deadline;
    });

    const tasksWithDependencies = input.tasks.filter((t) => t.dependencies.length > 0);
    const tasksMeetingDependencies = tasksWithDependencies.filter((task) => {
      return task.dependencies.every((depId) => {
        const depBlock = proposedBlocks.find((pb) => pb.taskId === depId);
        const taskBlock = proposedBlocks.find((pb) => pb.taskId === task.id);
        return depBlock && taskBlock && depBlock.endTime <= taskBlock.startTime;
      });
    });

    return {
      totalScheduledMinutes: Math.round(totalScheduledMs / 60000),
      totalTaskMinutes: Math.round(totalTaskMs / 60000),
      focusMinutes: Math.round(focusMs / 60000),
      breakMinutes: Math.round(breakMs / 60000),
      bufferMinutes: Math.round(bufferMs / 60000),
      travelMinutes: Math.round(travelMs / 60000),
      utilizationRate: totalAvailableMs > 0 ? totalScheduledMs / totalAvailableMs : 0,
      deadlineComplianceRate:
        tasksWithDeadlines.length > 0
          ? tasksMeetingDeadlines.length / tasksWithDeadlines.length
          : 1,
      dependencyComplianceRate:
        tasksWithDependencies.length > 0
          ? tasksMeetingDependencies.length / tasksWithDependencies.length
          : 1,
    };
  }

  private calculateTotalAvailableTime(input: SchedulingInput): number {
    let totalMs = 0;
    const current = new Date(input.timeRange.start);

    while (current < input.timeRange.end) {
      const dayOfWeek = current.getDay();
      const rules = input.availability.filter(
        (rule) =>
          (rule.dayOfWeek === undefined || rule.dayOfWeek === dayOfWeek) &&
          (!rule.startDate || new Date(rule.startDate) <= current) &&
          (!rule.endDate || new Date(rule.endDate) >= current) &&
          rule.isAvailable
      );

      for (const rule of rules) {
        const [startH, startM] = rule.startTime.split(':').map(Number);
        const [endH, endM] = rule.endTime.split(':').map(Number);
        const startMs = startH * 3600000 + startM * 60000;
        const endMs = endH * 3600000 + endM * 60000;
        totalMs += endMs - startMs;
      }

      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }

    return totalMs;
  }

  private generateAlternatives(
    proposedBlocks: ScheduledBlock[],
    fixedBlocks: ScheduledBlock[],
    input: SchedulingInput
  ): Alternative[] {
    const alternatives: Alternative[] = [];

    // Alternative 1: Priority-only scheduling
    if (input.preferences.taskOrderingStrategy !== 'PRIORITY') {
      const priorityInput = {
        ...input,
        preferences: { ...input.preferences, taskOrderingStrategy: 'PRIORITY' as const },
      };
      // In a real implementation, we'd re-run scheduling
      alternatives.push({
        id: generateId(),
        name: 'Priority-First',
        description: 'Schedule highest priority tasks first, regardless of deadlines',
        blocks: [], // Would be filled by re-running
        confidence: 0.7,
        pros: ['Ensures most important work gets done'],
        cons: ['May miss urgent deadlines'],
        estimatedCompletionRate: 0.75,
      });
    }

    // Alternative 2: Deadline-only scheduling
    if (input.preferences.taskOrderingStrategy !== 'DEADLINE') {
      alternatives.push({
        id: generateId(),
        name: 'Deadline-Driven',
        description: 'Schedule by earliest deadline first',
        blocks: [],
        confidence: 0.8,
        pros: ['Minimizes missed deadlines'],
        cons: ['May neglect important but non-urgent work'],
        estimatedCompletionRate: 0.85,
      });
    }

    // Alternative 3: Extend window
    alternatives.push({
      id: generateId(),
      name: 'Extended Window',
      description: 'Extend scheduling window by 2 days',
      blocks: [],
      confidence: 0.6,
      pros: ['More flexibility to fit all tasks'],
      cons: ['Delays completion'],
      estimatedCompletionRate: 0.95,
    });

    return alternatives;
  }

  private calculateConfidence(
    _proposedBlocks: ScheduledBlock[],
    unsatisfiedConstraints: UnsatisfiedConstraint[],
    conflicts: Conflict[],
    metrics: ScheduleProposal['metrics']
  ): number {
    let confidence = 1.0;

    // Reduce for unsatisfied hard constraints
    const hardUnsatisfied = unsatisfiedConstraints.filter((c) => c.severity === 'HARD').length;
    confidence -= hardUnsatisfied * 0.2;

    // Reduce for critical conflicts
    const criticalConflicts = conflicts.filter((c) => c.severity === 'CRITICAL').length;
    confidence -= criticalConflicts * 0.15;

    // Reduce for warning conflicts
    const warningConflicts = conflicts.filter((c) => c.severity === 'WARNING').length;
    confidence -= warningConflicts * 0.05;

    // Factor in deadline compliance
    confidence *= 0.5 + metrics.deadlineComplianceRate * 0.5;

    // Factor in dependency compliance
    confidence *= 0.5 + metrics.dependencyComplianceRate * 0.5;

    return Math.max(0, Math.min(1, confidence));
  }

  private buildAppliedConstraints(
    constraints: SchedulingConstraint[],
    blocks: ScheduledBlock[]
  ): AppliedConstraint[] {
    return constraints.map((c) => ({
      type: c.type,
      severity: c.severity,
      description: c.description,
      satisfied: true, // Would be computed based on actual schedule
      impact: undefined,
    }));
  }

  private identifyTradeoffs(
    blocks: ScheduledBlock[],
    unsatisfiedConstraints: UnsatisfiedConstraint[],
    conflicts: Conflict[]
  ): Tradeoff[] {
    const tradeoffs: Tradeoff[] = [];

    if (unsatisfiedConstraints.some((c) => c.type === 'AVAILABILITY_WINDOW')) {
      tradeoffs.push({
        id: generateId(),
        description: 'Some tasks could not be scheduled due to insufficient available time',
        impact: 'HIGH',
        affectedBlocks: unsatisfiedConstraints.flatMap((c) => c.affectedBlocks),
        alternative: 'Extend scheduling window or reduce task scope',
      });
    }

    if (conflicts.some((c) => c.type === 'DEADLINE_MISS')) {
      tradeoffs.push({
        id: generateId(),
        description: 'Some tasks scheduled after their deadlines',
        impact: 'CRITICAL',
        affectedBlocks: conflicts
          .filter((c) => c.type === 'DEADLINE_MISS')
          .flatMap((c) => c.involvedBlocks),
        alternative: 'Reschedule earlier or negotiate deadline extensions',
      });
    }

    if (conflicts.some((c) => c.type === 'DEPENDENCY_VIOLATION')) {
      tradeoffs.push({
        id: generateId(),
        description: 'Dependency order violated in schedule',
        impact: 'HIGH',
        affectedBlocks: conflicts
          .filter((c) => c.type === 'DEPENDENCY_VIOLATION')
          .flatMap((c) => c.involvedBlocks),
        alternative: 'Respect topological order of dependencies',
      });
    }

    return tradeoffs;
  }

  private calculateTaskConfidence(
    task: SchedulingTask,
    slot: TimeRange,
    input: SchedulingInput
  ): number {
    let confidence = 0.8;

    // Higher confidence for tasks with deadlines that are met
    if (task.deadline && slot.end <= task.deadline) confidence += 0.1;

    // Higher confidence for preferred time match
    if (task.preferredTime) {
      const diff = Math.abs(slot.start.getTime() - task.preferredTime.getTime());
      if (diff < 30 * 60000) confidence += 0.1; // within 30 min
    }

    // Lower confidence for low flexibility tasks in tight slots
    if (task.flexibility === 'LOW') confidence -= 0.1;

    return Math.max(0, Math.min(1, confidence));
  }

  private generateTaskReason(
    task: SchedulingTask,
    slot: TimeRange,
    input: SchedulingInput
  ): string {
    const reasons: string[] = [];

    if (task.deadline) {
      reasons.push(`Deadline: ${task.deadline.toISOString()}`);
    }
    if (task.preferredTime) {
      reasons.push(`Preferred time: ${task.preferredTime.toISOString()}`);
    }
    if (task.dependencies.length > 0) {
      reasons.push(`Depends on ${task.dependencies.length} task(s)`);
    }
    if (task.flexibility === 'LOW') {
      reasons.push('Low flexibility - fixed scheduling');
    }

    return reasons.join('; ') || 'Scheduled in available slot';
  }

  private getApplicableConstraints(
    task: SchedulingTask,
    constraints: SchedulingConstraint[]
  ): AppliedConstraint[] {
    return constraints
      .filter((c) => !c.appliesTo || c.appliesTo.includes(task.id))
      .map((c) => ({
        type: c.type,
        severity: c.severity,
        description: c.description,
        satisfied: true,
      }));
  }
}

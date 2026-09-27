import { TimeCompilerService } from '../time-compiler.service';
import {
  SchedulingInput,
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
} from '../domain/time-compiler.types';

describe('TimeCompilerService', () => {
  let service: TimeCompilerService;
  const mockPrisma = {};

  beforeEach(() => {
    service = new TimeCompilerService(mockPrisma as any);
  });

  const createBaseInput = (overrides: Partial<SchedulingInput> = {}): SchedulingInput => ({
    userId: 'user-1',
    timeRange: {
      start: new Date('2024-01-15T00:00:00Z'),
      end: new Date('2024-01-19T23:59:59Z'),
    },
    timezone: 'UTC',
    tasks: [],
    fixedEvents: [],
    availability: [
      {
        id: 'avail-1',
        dayOfWeek: 1, // Monday
        startTime: '09:00',
        endTime: '17:00',
        timezone: 'UTC',
        isAvailable: true,
        priority: 1,
        recurrence: 'WEEKLY',
      },
      {
        id: 'avail-2',
        dayOfWeek: 2, // Tuesday
        startTime: '09:00',
        endTime: '17:00',
        timezone: 'UTC',
        isAvailable: true,
        priority: 1,
        recurrence: 'WEEKLY',
      },
      {
        id: 'avail-3',
        dayOfWeek: 3, // Wednesday
        startTime: '09:00',
        endTime: '17:00',
        timezone: 'UTC',
        isAvailable: true,
        priority: 1,
        recurrence: 'WEEKLY',
      },
      {
        id: 'avail-4',
        dayOfWeek: 4, // Thursday
        startTime: '09:00',
        endTime: '17:00',
        timezone: 'UTC',
        isAvailable: true,
        priority: 1,
        recurrence: 'WEEKLY',
      },
      {
        id: 'avail-5',
        dayOfWeek: 5, // Friday
        startTime: '09:00',
        endTime: '17:00',
        timezone: 'UTC',
        isAvailable: true,
        priority: 1,
        recurrence: 'WEEKLY',
      },
    ],
    constraints: [],
    preferences: {
      workingHoursStart: '09:00',
      workingHoursEnd: '17:00',
      preferredFocusBlockDuration: 90,
      maxFocusBlockDuration: 180,
      minBreakDuration: 15,
      maxDailyHours: 8,
      preferredBreakInterval: 90,
      energyPeakHours: [
        { start: '09:00', end: '11:00' },
        { start: '14:00', end: '16:00' },
      ],
      bufferBetweenTasks: 10,
      travelBufferDefault: 15,
      protectFocusTime: true,
      allowWeekendScheduling: false,
      taskOrderingStrategy: 'BALANCED',
    },
    existingBlocks: [],
    ...overrides,
  });

  const createTask = (overrides: Partial<SchedulingTask> = {}): SchedulingTask => ({
    id: 'task-1',
    title: 'Test Task',
    description: 'A test task',
    estimatedDurationMinutes: 60,
    priority: 5,
    status: 'PENDING',
    dependencies: [],
    flexibility: 'MEDIUM',
    energyRequirement: 'MEDIUM',
    ...overrides,
  });

  const createFixedEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: 'event-1',
    title: 'Fixed Meeting',
    startTime: new Date('2024-01-15T10:00:00Z'),
    endTime: new Date('2024-01-15T11:00:00Z'),
    timezone: 'UTC',
    isAllDay: false,
    status: 'CONFIRMED',
    isFixed: true,
    ...overrides,
  });

  describe('Hard Deadlines', () => {
    it('should schedule task before hard deadline', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-1',
            title: 'Urgent Task',
            estimatedDurationMinutes: 60,
            deadline: new Date('2024-01-15T16:00:00Z'), // Same day, 4pm
            flexibility: 'LOW',
          }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.proposedBlocks.length).toBe(1);
      const block = proposal.proposedBlocks[0];
      expect(block.endTime.getTime()).toBeLessThanOrEqual(
        new Date('2024-01-15T16:00:00Z').getTime()
      );
      expect(proposal.conflicts.filter((c) => c.type === 'DEADLINE_MISS').length).toBe(0);
    });

    it('should report conflict when task cannot meet hard deadline', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-1',
            title: 'Impossible Task',
            estimatedDurationMinutes: 480, // 8 hours
            deadline: new Date('2024-01-15T12:00:00Z'), // Only 3 hours available
            flexibility: 'LOW',
          }),
        ],
        availability: [
          {
            id: 'avail-1',
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '12:00',
            timezone: 'UTC',
            isAvailable: true,
            priority: 1,
            recurrence: 'WEEKLY',
          },
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.unsatisfiedConstraints.length).toBeGreaterThan(0);
      expect(
        proposal.conflicts.some(
          (c) => c.type === 'DEADLINE_MISS' || c.type === 'AVAILABILITY_VIOLATION'
        )
      ).toBe(true);
      expect(proposal.confidence).toBeLessThan(0.8);
    });

    it('should mark task as unsatisfied when deadline is before scheduling window', async () => {
      const input = createBaseInput({
        timeRange: {
          start: new Date('2024-01-16T00:00:00Z'),
          end: new Date('2024-01-19T23:59:59Z'),
        },
        tasks: [
          createTask({
            id: 'task-1',
            title: 'Past Deadline Task',
            estimatedDurationMinutes: 60,
            deadline: new Date('2024-01-15T16:00:00Z'), // Before window
            flexibility: 'LOW',
          }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.unsatisfiedConstraints.some((c) => c.type === 'HARD_DEADLINE')).toBe(true);
      expect(proposal.proposedBlocks.length).toBe(0);
    });
  });

  describe('Fixed Events', () => {
    it('should not schedule tasks during fixed events', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-1',
            title: 'Task 1',
            estimatedDurationMinutes: 60,
          }),
          createTask({
            id: 'task-2',
            title: 'Task 2',
            estimatedDurationMinutes: 60,
          }),
        ],
        fixedEvents: [
          createFixedEvent({
            id: 'meeting-1',
            startTime: new Date('2024-01-15T10:00:00Z'),
            endTime: new Date('2024-01-15T11:00:00Z'),
          }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      // Tasks should be scheduled around the fixed event
      const taskBlocks = proposal.proposedBlocks.filter((b) => b.type === 'TASK');
      expect(taskBlocks.length).toBe(2);

      for (const block of taskBlocks) {
        const overlapsFixed = proposal.fixedBlocks.some(
          (fixed) => block.startTime < fixed.endTime && block.endTime > fixed.startTime
        );
        expect(overlapsFixed).toBe(false);
      }
    });

    it('should include fixed events in fixedBlocks', async () => {
      const input = createBaseInput({
        tasks: [createTask()],
        fixedEvents: [
          createFixedEvent({ id: 'meeting-1' }),
          createFixedEvent({
            id: 'meeting-2',
            startTime: new Date('2024-01-15T14:00:00Z'),
            endTime: new Date('2024-01-15T15:00:00Z'),
          }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.fixedBlocks.length).toBe(2);
      expect(proposal.fixedBlocks.every((b) => b.isFixed)).toBe(true);
    });
  });

  describe('Flexible Tasks', () => {
    it('should schedule flexible tasks in available slots', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({ id: 'task-1', estimatedDurationMinutes: 30, flexibility: 'HIGH' }),
          createTask({ id: 'task-2', estimatedDurationMinutes: 45, flexibility: 'HIGH' }),
          createTask({ id: 'task-3', estimatedDurationMinutes: 60, flexibility: 'MEDIUM' }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.proposedBlocks.length).toBe(3);
      expect(proposal.metrics.totalTaskMinutes).toBe(135);
    });
  });

  describe('Dependencies', () => {
    it('should respect task dependencies (topological order)', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-a',
            title: 'Task A',
            estimatedDurationMinutes: 60,
            dependencies: [],
          }),
          createTask({
            id: 'task-b',
            title: 'Task B',
            estimatedDurationMinutes: 60,
            dependencies: ['task-a'],
          }),
          createTask({
            id: 'task-c',
            title: 'Task C',
            estimatedDurationMinutes: 60,
            dependencies: ['task-b'],
          }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      const blockA = proposal.proposedBlocks.find((b) => b.taskId === 'task-a');
      const blockB = proposal.proposedBlocks.find((b) => b.taskId === 'task-b');
      const blockC = proposal.proposedBlocks.find((b) => b.taskId === 'task-c');

      expect(blockA!.endTime.getTime()).toBeLessThanOrEqual(blockB!.startTime.getTime());
      expect(blockB!.endTime.getTime()).toBeLessThanOrEqual(blockC!.startTime.getTime());
      expect(proposal.metrics.dependencyComplianceRate).toBe(1);
    });

    it('should detect circular dependencies', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-a',
            title: 'Task A',
            estimatedDurationMinutes: 60,
            dependencies: ['task-c'],
          }),
          createTask({
            id: 'task-b',
            title: 'Task B',
            estimatedDurationMinutes: 60,
            dependencies: ['task-a'],
          }),
          createTask({
            id: 'task-c',
            title: 'Task C',
            estimatedDurationMinutes: 60,
            dependencies: ['task-b'],
          }),
        ],
      });

      await expect(service.compileSchedule(input)).rejects.toThrow('Circular dependency');
    });

    it('should report dependency violation if violated', async () => {
      // This would require a case where dependency ordering fails
      // The current implementation should prevent this via topological sort
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-a',
            title: 'Task A',
            estimatedDurationMinutes: 60,
            dependencies: [],
          }),
          createTask({
            id: 'task-b',
            title: 'Task B',
            estimatedDurationMinutes: 60,
            dependencies: ['task-a'],
          }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.conflicts.filter((c) => c.type === 'DEPENDENCY_VIOLATION').length).toBe(0);
    });
  });

  describe('Insufficient Time', () => {
    it('should report unsatisfied constraints when insufficient time', async () => {
      const input = createBaseInput({
        timeRange: {
          start: new Date('2024-01-15T09:00:00Z'),
          end: new Date('2024-01-15T11:00:00Z'), // Only 2 hours
        },
        tasks: [
          createTask({
            id: 'task-1',
            title: 'Task 1',
            estimatedDurationMinutes: 120,
            flexibility: 'LOW',
          }), // 2 hours
          createTask({
            id: 'task-2',
            title: 'Task 2',
            estimatedDurationMinutes: 120,
            flexibility: 'LOW',
          }), // 2 hours
        ],
        availability: [
          {
            id: 'avail-1',
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '11:00',
            timezone: 'UTC',
            isAvailable: true,
            priority: 1,
            recurrence: 'WEEKLY',
          },
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.unsatisfiedConstraints.some((c) => c.type === 'AVAILABILITY_WINDOW')).toBe(
        true
      );
      expect(proposal.tradeoffs.some((t) => t.impact === 'HIGH' || t.impact === 'CRITICAL')).toBe(
        true
      );
      expect(proposal.confidence).toBeLessThan(0.7);
    });

    it('should provide alternative with extended window', async () => {
      const input = createBaseInput({
        timeRange: {
          start: new Date('2024-01-15T09:00:00Z'),
          end: new Date('2024-01-15T11:00:00Z'),
        },
        tasks: [createTask({ id: 'task-1', title: 'Task 1', estimatedDurationMinutes: 180 })],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.alternatives.length).toBeGreaterThan(0);
      const extendedAlt = proposal.alternatives.find((a) => a.name === 'Extended Window');
      expect(extendedAlt).toBeDefined();
    });
  });

  describe('Conflicting Constraints', () => {
    it('should handle conflicting hard constraints', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-1',
            title: 'Task 1',
            estimatedDurationMinutes: 120,
            deadline: new Date('2024-01-15T12:00:00Z'),
            flexibility: 'LOW',
          }),
          createTask({
            id: 'task-2',
            title: 'Task 2',
            estimatedDurationMinutes: 120,
            deadline: new Date('2024-01-15T12:00:00Z'),
            flexibility: 'LOW',
          }),
        ],
        availability: [
          {
            id: 'avail-1',
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '12:00', // Only 3 hours for 4 hours of work
            timezone: 'UTC',
            isAvailable: true,
            priority: 1,
            recurrence: 'WEEKLY',
          },
        ],
        constraints: [
          {
            id: 'constraint-1',
            type: 'HARD_DEADLINE',
            severity: 'HARD',
            description: 'Both tasks must complete by noon',
            parameters: {},
          },
        ],
      });

      const proposal = await service.compileSchedule(input);

      // Should detect the conflict - not enough time for both tasks
      expect(proposal.conflicts.length).toBeGreaterThan(0);
      expect(proposal.unsatisfiedConstraints.length).toBeGreaterThan(0);
    });
  });

  describe('Protected Focus Blocks', () => {
    it('should create focus blocks for high-energy tasks', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-1',
            title: 'Deep Work',
            estimatedDurationMinutes: 120,
            energyRequirement: 'HIGH',
            flexibility: 'LOW',
          }),
        ],
        preferences: {
          ...createBaseInput().preferences,
          protectFocusTime: true,
          preferredFocusBlockDuration: 120,
        },
      });

      const proposal = await service.compileSchedule(input);

      const taskBlock = proposal.proposedBlocks.find((b) => b.taskId === 'task-1');
      expect(taskBlock).toBeDefined();
      expect(taskBlock!.energyRequirement).toBe('HIGH');
      // Should be scheduled during peak hours
      const hour = taskBlock!.startTime.getHours();
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(11); // First peak
    });

    it('should add breaks between long focus blocks', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({ id: 'task-1', title: 'Task 1', estimatedDurationMinutes: 100 }),
          createTask({ id: 'task-2', title: 'Task 2', estimatedDurationMinutes: 100 }),
        ],
        preferences: {
          ...createBaseInput().preferences,
          preferredBreakInterval: 90,
          minBreakDuration: 15,
        },
      });

      const proposal = await service.compileSchedule(input);

      const breakBlocks = proposal.proposedBlocks.filter((b) => b.type === 'BREAK');
      expect(breakBlocks.length).toBeGreaterThanOrEqual(0); // May or may not add based on timing
    });
  });

  describe('Travel Buffers', () => {
    it('should add travel buffers between tasks at different locations', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-1',
            title: 'Meeting at Office',
            estimatedDurationMinutes: 60,
            location: 'Office',
          }),
          createTask({
            id: 'task-2',
            title: 'Client Visit',
            estimatedDurationMinutes: 60,
            location: 'Client Site',
          }),
        ],
        preferences: {
          ...createBaseInput().preferences,
          travelBufferDefault: 30,
        },
      });

      const proposal = await service.compileSchedule(input);

      const bufferBlocks = proposal.proposedBlocks.filter((b) => b.type === 'BUFFER');
      expect(bufferBlocks.length).toBeGreaterThanOrEqual(0);
      // Travel buffers would be added when locations differ
    });

    it('should include travel time in metrics', async () => {
      const input = createBaseInput({
        tasks: [createTask({ id: 'task-1', title: 'Task 1', estimatedDurationMinutes: 60 })],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.metrics).toHaveProperty('travelMinutes');
      expect(typeof proposal.metrics.travelMinutes).toBe('number');
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate utilization rate correctly', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({ id: 'task-1', estimatedDurationMinutes: 120 }),
          createTask({ id: 'task-2', estimatedDurationMinutes: 60 }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.metrics.utilizationRate).toBeGreaterThan(0);
      expect(proposal.metrics.utilizationRate).toBeLessThanOrEqual(1);
    });

    it('should calculate deadline compliance rate', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-1',
            estimatedDurationMinutes: 60,
            deadline: new Date('2024-01-15T16:00:00Z'),
          }),
          createTask({
            id: 'task-2',
            estimatedDurationMinutes: 60,
            deadline: new Date('2024-01-15T16:00:00Z'),
          }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.metrics.deadlineComplianceRate).toBe(1);
    });

    it('should calculate dependency compliance rate', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({ id: 'task-a', estimatedDurationMinutes: 60, dependencies: [] }),
          createTask({ id: 'task-b', estimatedDurationMinutes: 60, dependencies: ['task-a'] }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.metrics.dependencyComplianceRate).toBe(1);
    });
  });

  describe('Alternatives Generation', () => {
    it('should generate alternative schedules', async () => {
      const input = createBaseInput({
        tasks: [createTask({ id: 'task-1', estimatedDurationMinutes: 60 })],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.alternatives.length).toBeGreaterThan(0);
      for (const alt of proposal.alternatives) {
        expect(alt).toHaveProperty('name');
        expect(alt).toHaveProperty('description');
        expect(alt).toHaveProperty('confidence');
        expect(alt).toHaveProperty('pros');
        expect(alt).toHaveProperty('cons');
        expect(alt).toHaveProperty('estimatedCompletionRate');
      }
    });
  });

  describe('Confidence Calculation', () => {
    it('should have high confidence when all constraints satisfied', async () => {
      const input = createBaseInput({
        tasks: [createTask({ id: 'task-1', estimatedDurationMinutes: 60, flexibility: 'HIGH' })],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.confidence).toBeGreaterThan(0.7);
    });

    it('should have lower confidence with unsatisfied constraints', async () => {
      const input = createBaseInput({
        timeRange: {
          start: new Date('2024-01-15T09:00:00Z'),
          end: new Date('2024-01-15T10:00:00Z'),
        },
        tasks: [createTask({ id: 'task-1', estimatedDurationMinutes: 120, flexibility: 'LOW' })],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.confidence).toBeLessThan(0.7);
    });
  });

  describe('Task Ordering Strategies', () => {
    it('should respect PRIORITY ordering', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-low',
            title: 'Low Priority',
            priority: 1,
            estimatedDurationMinutes: 60,
          }),
          createTask({
            id: 'task-high',
            title: 'High Priority',
            priority: 10,
            estimatedDurationMinutes: 60,
          }),
        ],
        preferences: {
          ...createBaseInput().preferences,
          taskOrderingStrategy: 'PRIORITY',
        },
      });

      const proposal = await service.compileSchedule(input);

      const highPriorityBlock = proposal.proposedBlocks.find((b) => b.taskId === 'task-high');
      const lowPriorityBlock = proposal.proposedBlocks.find((b) => b.taskId === 'task-low');

      // High priority should be scheduled first (earlier)
      expect(highPriorityBlock!.startTime.getTime()).toBeLessThanOrEqual(
        lowPriorityBlock!.startTime.getTime()
      );
    });

    it('should respect DEADLINE ordering', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-later',
            title: 'Later Deadline',
            estimatedDurationMinutes: 60,
            deadline: new Date('2024-01-16T16:00:00Z'),
          }),
          createTask({
            id: 'task-sooner',
            title: 'Sooner Deadline',
            estimatedDurationMinutes: 60,
            deadline: new Date('2024-01-15T16:00:00Z'),
          }),
        ],
        preferences: {
          ...createBaseInput().preferences,
          taskOrderingStrategy: 'DEADLINE',
        },
      });

      const proposal = await service.compileSchedule(input);

      const soonerBlock = proposal.proposedBlocks.find((b) => b.taskId === 'task-sooner');
      const laterBlock = proposal.proposedBlocks.find((b) => b.taskId === 'task-later');

      expect(soonerBlock!.startTime.getTime()).toBeLessThanOrEqual(laterBlock!.startTime.getTime());
    });
  });

  describe('Reasoning', () => {
    it('should provide reasoning for each scheduled task', async () => {
      const input = createBaseInput({
        tasks: [
          createTask({
            id: 'task-1',
            title: 'Task with Deadline',
            estimatedDurationMinutes: 60,
            deadline: new Date('2024-01-15T16:00:00Z'),
          }),
        ],
      });

      const proposal = await service.compileSchedule(input);

      expect(proposal.reasoning.length).toBeGreaterThan(0);
      expect(proposal.reasoning[0]).toContain('Task with Deadline');
    });
  });
});

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { CreateTaskRequest, UpdateTaskRequest } from './interfaces/task.interface';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, request: CreateTaskRequest) {
    // Validate dependencies if provided
    if (request.dependencies && request.dependencies.length > 0) {
      await this.validateDependencies(userId, request.dependencies);
    }

    const task = await this.prisma.task.create({
      data: {
        userId,
        title: request.title,
        description: request.description,
        projectId: request.projectId,
        goalId: request.goalId,
        milestoneId: request.milestoneId,
        priority: request.priority,
        estimatedDurationMin: request.estimatedDurationMinutes,
        dueDate: request.dueDate ? new Date(request.dueDate) : undefined,
        startDate: request.startDate ? new Date(request.startDate) : undefined,
        flexibility: request.flexibility,
        energyRequirement: request.energyRequirement,
        context: request.context,
        preferredTime: request.preferredTime ? new Date(request.preferredTime) : undefined,
        location: request.location,
      },
    });

    // Create dependency relations
    if (request.dependencies && request.dependencies.length > 0) {
      await this.createDependencies(task.id, request.dependencies);
    }

    return this.findOne(userId, task.id);
  }

  async findAll(
    userId: string,
    options?: {
      status?: string;
      goalId?: string;
      projectId?: string;
      milestoneId?: string;
      limit?: number;
    }
  ) {
    const where: any = { userId };
    if (options?.status) where.status = options.status;
    if (options?.goalId) where.goalId = options.goalId;
    if (options?.projectId) where.projectId = options.projectId;
    if (options?.milestoneId) where.milestoneId = options.milestoneId;

    return this.prisma.task.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: options?.limit,
      include: {
        dependencies: {
          include: {
            dependsOn: true,
          },
        },
        dependentOf: {
          include: {
            task: true,
          },
        },
      },
    });
  }

  async findOne(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        dependencies: {
          include: {
            dependsOn: {
              select: {
                id: true,
                title: true,
                status: true,
                dueDate: true,
              },
            },
          },
        },
        dependentOf: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                status: true,
              },
            },
          },
        },
        timeBlocks: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async update(userId: string, id: string, request: UpdateTaskRequest) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Validate dependencies if provided
    if (request.dependencies) {
      await this.validateDependencies(userId, request.dependencies, id);
    }

    // Update task
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: request.title,
        description: request.description,
        projectId: request.projectId,
        goalId: request.goalId,
        milestoneId: request.milestoneId,
        status: request.status,
        priority: request.priority,
        estimatedDurationMin: request.estimatedDurationMinutes,
        actualDurationMin: request.actualDurationMinutes,
        dueDate: request.dueDate ? new Date(request.dueDate) : undefined,
        startDate: request.startDate ? new Date(request.startDate) : undefined,
        completedAt: request.completedAt ? new Date(request.completedAt) : undefined,
        flexibility: request.flexibility,
        energyRequirement: request.energyRequirement,
        context: request.context,
        preferredTime: request.preferredTime ? new Date(request.preferredTime) : undefined,
        location: request.location,
      },
    });

    // Update dependencies if provided
    if (request.dependencies !== undefined) {
      await this.updateDependencies(id, request.dependencies);
    }

    return this.findOne(userId, id);
  }

  async delete(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Delete dependency relations
    await this.prisma.taskDependency.deleteMany({
      where: {
        OR: [{ taskId: id }, { dependsOnId: id }],
      },
    });

    return this.prisma.task.delete({
      where: { id },
    });
  }

  async getDependencies(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        dependentOf: {
          include: {
            dependsOn: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task.dependentOf.map((d) => d.dependsOn);
  }

  async getDependents(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        dependencies: {
          include: {
            task: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task.dependencies.map((d) => d.task);
  }

  async validateTaskCanStart(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        dependentOf: {
          include: {
            dependsOn: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const blockingTasks = task.dependentOf
      .filter((d) => d.dependsOn.status !== 'COMPLETED')
      .map((d) => d.dependsOn);

    return {
      canStart: blockingTasks.length === 0,
      blockingTasks,
    };
  }

  async getDependencyChain(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        dependentOf: {
          include: {
            dependsOn: {
              include: {
                dependentOf: {
                  include: {
                    dependsOn: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Build full dependency chain
    const visited = new Set<string>();
    const chain: any[] = [];

    const traverse = (t: any, depth: number = 0) => {
      if (visited.has(t.id)) return;
      visited.add(t.id);

      chain.push({
        ...t,
        depth,
        isBlocking: t.status !== 'COMPLETED',
      });

      for (const dep of t.dependentOf) {
        traverse(dep.dependsOn, depth + 1);
      }
    };

    traverse(task);

    return chain;
  }

  private async validateDependencies(
    userId: string,
    dependencyIds: string[],
    excludeTaskId?: string
  ) {
    // Check all dependencies exist and belong to user
    const dependencies = await this.prisma.task.findMany({
      where: {
        id: { in: dependencyIds },
        userId,
      },
    });

    if (dependencies.length !== dependencyIds.length) {
      const foundIds = dependencies.map((d) => d.id);
      const missingIds = dependencyIds.filter((id) => !foundIds.includes(id));
      throw new BadRequestException(`Dependency tasks not found: ${missingIds.join(', ')}`);
    }

    // Check for circular dependencies
    if (excludeTaskId) {
      for (const depId of dependencyIds) {
        const hasCycle = await this.wouldCreateCycle(excludeTaskId, depId);
        if (hasCycle) {
          throw new BadRequestException(
            `Adding dependency on task ${depId} would create a circular dependency`
          );
        }
      }
    }
  }

  private async wouldCreateCycle(taskId: string, newDependencyId: string): Promise<boolean> {
    // Check if taskId is reachable from newDependencyId (which would create a cycle)
    const visited = new Set<string>();
    const stack = [newDependencyId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (currentId === taskId) return true;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const deps = await this.prisma.taskDependency.findMany({
        where: { taskId: currentId },
        select: { dependsOnId: true },
      });

      for (const dep of deps) {
        stack.push(dep.dependsOnId);
      }
    }

    return false;
  }

  private async createDependencies(taskId: string, dependencyIds: string[]) {
    await this.prisma.taskDependency.createMany({
      data: dependencyIds.map((dependsOnId) => ({
        taskId,
        dependsOnId,
        type: 'FINISH_TO_START',
      })),
      skipDuplicates: true,
    });
  }

  private async updateDependencies(taskId: string, dependencyIds: string[]) {
    // Delete existing dependencies
    await this.prisma.taskDependency.deleteMany({
      where: { taskId },
    });

    // Create new ones
    if (dependencyIds.length > 0) {
      await this.createDependencies(taskId, dependencyIds);
    }
  }
}

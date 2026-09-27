import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';

export interface UserContext {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
  preferences: Record<string, any>;
  workingHours: { start: string; end: string; days: number[] };
  timezone: string;
  currentDate: string;
  activeGoals: Array<{
    id: string;
    title: string;
    status: string;
    priority: number;
  }>;
  upcomingEvents: Array<{
    id: string;
    title: string;
    startDate: Date;
    endDate: Date;
  }>;
  pendingTasks: Array<{
    id: string;
    title: string;
    dueDate?: Date | null;
    priority: number;
  }>;
  recentMemories: string[];
}

@Injectable()
export class ContextEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserContext(userId: string): Promise<UserContext> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      include: {
        preferences: true,
        goals: {
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
        },
        events: {
          where: {
            startDate: {
              gte: new Date(),
            },
          },
          take: 10,
          orderBy: { startDate: 'asc' },
        },
        tasks: {
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
          take: 10,
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const preferences: Record<string, any> = {};
    user.preferences.forEach((p) => {
      preferences[p.key] = JSON.parse(p.valueJson);
    });

    const workingHours = preferences.working_hours || {
      start: '09:00',
      end: '17:00',
      days: [1, 2, 3, 4, 5],
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      preferences,
      workingHours,
      timezone: preferences.timezone || 'local',
      currentDate: new Date().toISOString(),
      activeGoals: user.goals.map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        priority: g.priority,
      })),
      upcomingEvents: user.events.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
      })),
      pendingTasks: user.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
      })),
      recentMemories: [],
    };
  }

  async updatePreference(
    userId: string,
    key: string,
    value: any,
    category?: string,
    description?: string
  ) {
    return this.prisma.preference.upsert({
      where: {
        userId_category_key: {
          userId,
          category: (category || 'USER_PREFERENCES') as any,
          key,
        },
      },
      update: {
        valueJson: JSON.stringify(value),
        description,
      },
      create: {
        userId,
        category: (category || 'USER_PREFERENCES') as any,
        key,
        valueJson: JSON.stringify(value),
        description,
      },
    });
  }

  async logAuditEvent(
    userId: string,
    action: string,
    entityType: string,
    details: string,
    entityId?: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        details,
        ipAddress,
        userAgent,
      },
    });
  }
}

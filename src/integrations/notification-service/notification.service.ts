import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/common/services/prisma.service';
import { EmailNotificationProvider } from './email-notification.provider';
import { SmsNotificationProvider } from './sms-notification.provider';
import { PushNotificationProvider } from './push-notification.provider';
import { InAppNotificationProvider } from './in-app-notification.provider';
import {
  NotificationProvider,
  NotificationPayload,
  NotificationPreferences,
  NotificationResult,
} from './notification.interface';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly providers: Map<string, NotificationProvider> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailProvider: EmailNotificationProvider,
    private readonly smsProvider: SmsNotificationProvider,
    private readonly pushProvider: PushNotificationProvider,
    private readonly inAppProvider: InAppNotificationProvider
  ) {
    this.providers.set('EMAIL', this.emailProvider);
    this.providers.set('SMS', this.smsProvider);
    this.providers.set('PUSH', this.pushProvider);
    this.providers.set('APP', this.inAppProvider);
  }

  async sendNotification(
    userId: string,
    payload: NotificationPayload,
    channels?: string[]
  ): Promise<NotificationResult[]> {
    const preferences = await this.getUserPreferences(userId);
    const results: NotificationResult[] = [];

    const targetChannels = channels || this.getDefaultChannels(payload, preferences);

    for (const channel of targetChannels) {
      const provider = this.providers.get(channel.toUpperCase());
      if (!provider) {
        this.logger.warn(`No provider for channel: ${channel}`);
        results.push({ channel, success: false, error: 'Provider not found' });
        continue;
      }

      // Check if user has muted notifications
      if (preferences.muteUntil && preferences.muteUntil > new Date()) {
        results.push({ channel, success: false, error: 'User has muted notifications' });
        continue;
      }

      // Check working hours for non-urgent notifications
      if (payload.priority !== 'URGENT' && !this.isWithinWorkingHours(preferences)) {
        // Schedule for later
        const scheduledAt = this.getNextWorkingHourStart(preferences);
        payload.scheduledAt = scheduledAt.toISOString();
      }

      const result = await provider.send(userId, payload, preferences);
      results.push({ ...result, channel });

      // Log to audit
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'NOTIFICATION_SENT',
          entityType: 'Notification',
          details: `Sent ${payload.type} via ${channel}: ${result.success ? 'success' : 'failed'}`,
          success: result.success,
          errorMessage: result.error,
        },
      });
    }

    return results;
  }

  async sendToMultipleUsers(
    userIds: string[],
    payload: NotificationPayload,
    channels?: string[]
  ): Promise<Map<string, NotificationResult[]>> {
    const results = new Map<string, NotificationResult[]>();

    for (const userId of userIds) {
      results.set(userId, await this.sendNotification(userId, payload, channels));
    }

    return results;
  }

  async sendReminder(
    userId: string,
    title: string,
    message: string,
    entityType: string,
    entityId: string,
    actionUrl?: string
  ): Promise<NotificationResult[]> {
    return this.sendNotification(userId, {
      type: 'REMINDER',
      priority: 'HIGH',
      title,
      message,
      channel: 'APP',
      entityType,
      entityId,
      actionUrl,
    });
  }

  async sendConflictAlert(
    userId: string,
    title: string,
    message: string,
    entityType: string,
    entityId: string
  ): Promise<NotificationResult[]> {
    return this.sendNotification(userId, {
      type: 'CONFLICT_ALERT',
      priority: 'HIGH',
      title,
      message,
      channel: 'APP',
      entityType,
      entityId,
    });
  }

  async sendRecommendation(
    userId: string,
    title: string,
    message: string,
    actionUrl: string
  ): Promise<NotificationResult[]> {
    return this.sendNotification(userId, {
      type: 'RECOMMENDATION',
      priority: 'NORMAL',
      title,
      message,
      channel: 'APP',
      actionUrl,
    });
  }

  async sendSystemNotification(
    userId: string,
    title: string,
    message: string,
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL'
  ): Promise<NotificationResult[]> {
    return this.sendNotification(userId, {
      type: 'SYSTEM',
      priority,
      title,
      message,
      channel: 'APP',
    });
  }

  async getUserNotifications(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number }
  ) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(options?.unreadOnly && { isRead: false }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async dismissNotification(userId: string, notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId, userId },
      data: { isDismissed: true },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false, isDismissed: false },
    });
  }

  async updatePreferences(userId: string, preferences: Partial<NotificationPreferences>) {
    return this.prisma.preference.upsert({
      where: {
        userId_category_key: {
          userId,
          category: 'NOTIFICATION_SETTINGS',
          key: 'preferences',
        },
      },
      update: { valueJson: JSON.stringify(preferences) },
      create: {
        userId,
        category: 'NOTIFICATION_SETTINGS',
        key: 'preferences',
        valueJson: JSON.stringify(preferences),
      },
    });
  }

  private async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    const prefs = await this.prisma.preference.findMany({
      where: { userId, category: 'NOTIFICATION_SETTINGS' },
    });

    const preferences: NotificationPreferences = {
      app: { enabled: true },
      email: { enabled: false },
      sms: { enabled: false },
      push: { enabled: false },
      workingHours: { enabled: true, start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
      timezone: 'UTC',
    };

    for (const pref of prefs) {
      try {
        const value = JSON.parse(pref.valueJson);
        if (pref.key === 'preferences') {
          Object.assign(preferences, value);
        } else if (pref.key === 'email') {
          preferences.email = value;
        } else if (pref.key === 'sms') {
          preferences.sms = value;
        } else if (pref.key === 'push') {
          preferences.push = value;
        } else if (pref.key === 'working_hours') {
          preferences.workingHours = value;
        } else if (pref.key === 'timezone') {
          preferences.timezone = value;
        } else if (pref.key === 'mute_until') {
          preferences.muteUntil = new Date(value);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    return preferences;
  }

  private getDefaultChannels(
    payload: NotificationPayload,
    preferences: NotificationPreferences
  ): string[] {
    const channels: string[] = [];

    // Always send in-app
    if (preferences.app?.enabled) channels.push('APP');

    // High/Urgent priority gets email and push
    if (payload.priority === 'HIGH' || payload.priority === 'URGENT') {
      if (preferences.email?.enabled) channels.push('EMAIL');
      if (preferences.push?.enabled) channels.push('PUSH');
    }

    // Urgent gets SMS
    if (payload.priority === 'URGENT') {
      if (preferences.sms?.enabled) channels.push('SMS');
    }

    // Reminders get push if enabled
    if (payload.type === 'REMINDER' && preferences.push?.enabled) {
      if (!channels.includes('PUSH')) channels.push('PUSH');
    }

    return channels;
  }

  private isWithinWorkingHours(preferences: NotificationPreferences): boolean {
    if (!preferences.workingHours?.enabled) return true;

    const now = new Date();
    const userTimezone = preferences.timezone || 'UTC';

    // Convert to user's timezone
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
    const day = userTime.getDay();
    const hour = userTime.getHours();
    const minute = userTime.getMinutes();
    const currentMinutes = hour * 60 + minute;

    if (!preferences.workingHours.days.includes(day)) return false;

    const [startHour, startMin] = preferences.workingHours.start.split(':').map(Number);
    const [endHour, endMin] = preferences.workingHours.end.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  private getNextWorkingHourStart(preferences: NotificationPreferences): Date {
    const now = new Date();
    const userTimezone = preferences.timezone || 'UTC';

    // Simple implementation - return next working day at start time
    // In production, this would be more sophisticated
    const [startHour, startMin] = (preferences.workingHours?.start || '09:00')
      .split(':')
      .map(Number);

    const next = new Date(now);
    next.setHours(startHour, startMin, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    // Skip weekends
    while (!preferences.workingHours?.days?.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }
}

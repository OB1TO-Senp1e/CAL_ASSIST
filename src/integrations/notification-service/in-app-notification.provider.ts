import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/common/services/prisma.service';
import {
  NotificationProvider,
  NotificationPayload,
  NotificationPreferences,
  NotificationResult,
} from './notification.interface';

@Injectable()
export class InAppNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(InAppNotificationProvider.name);
  readonly channel = 'APP';

  constructor(private readonly prisma: PrismaService) {}

  async send(
    userId: string,
    payload: NotificationPayload,
    preferences: NotificationPreferences
  ): Promise<NotificationResult> {
    if (!preferences.app?.enabled) {
      return { channel: this.channel, success: false, error: 'In-app notifications disabled' };
    }

    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId,
          type: payload.type as any,
          title: payload.title,
          message: payload.message,
          priority: payload.priority as any,
          channel: 'APP' as any,
          entityType: payload.entityType,
          entityId: payload.entityId,
          actionUrl: payload.actionUrl,
          scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : new Date(),
          sentAt: new Date(),
        },
      });

      this.logger.log(`Created in-app notification ${notification.id} for user ${userId}`);
      return { channel: this.channel, success: true, messageId: notification.id };
    } catch (error: any) {
      this.logger.error(`In-app notification failed: ${error.message}`);
      return { channel: this.channel, success: false, error: error.message };
    }
  }
}

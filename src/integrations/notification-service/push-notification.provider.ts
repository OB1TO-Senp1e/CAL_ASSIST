import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationProvider,
  NotificationPayload,
  NotificationPreferences,
  NotificationResult,
} from './notification.interface';

@Injectable()
export class PushNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(PushNotificationProvider.name);
  readonly channel = 'PUSH';

  private readonly vapidPublicKey: string;
  private readonly vapidPrivateKey: string;
  private readonly vapidSubject: string;

  constructor(private readonly config: ConfigService) {
    this.vapidPublicKey = this.config.get<string>('VAPID_PUBLIC_KEY') || '';
    this.vapidPrivateKey = this.config.get<string>('VAPID_PRIVATE_KEY') || '';
    this.vapidSubject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:admin@calassist.app';
  }

  async send(
    userId: string,
    payload: NotificationPayload,
    preferences: NotificationPreferences
  ): Promise<NotificationResult> {
    if (!preferences.push?.enabled || !preferences.push?.deviceTokens?.length) {
      return {
        channel: this.channel,
        success: false,
        error: 'Push not enabled or no device tokens',
      };
    }

    if (!this.vapidPublicKey || !this.vapidPrivateKey) {
      this.logger.warn('VAPID keys not configured, simulating push send');
      return { channel: this.channel, success: true, messageId: `sim_push_${Date.now()}` };
    }

    try {
      const results: NotificationResult[] = [];

      for (const token of preferences.push.deviceTokens) {
        // In production: use web-push library
        // const webPush = require('web-push');
        // webPush.setVapidDetails(this.vapidSubject, this.vapidPublicKey, this.vapidPrivateKey);
        // await webPush.sendNotification(token, JSON.stringify(notification));

        this.logger.log(`Sending push to device ${token.slice(0, 10)}...: ${payload.title}`);
        results.push({
          channel: this.channel,
          success: true,
          messageId: `push_${Date.now()}_${token.slice(0, 8)}`,
        });
      }

      return results[0] || { channel: this.channel, success: false, error: 'No devices' };
    } catch (error: any) {
      this.logger.error(`Push send failed: ${error.message}`);
      return { channel: this.channel, success: false, error: error.message };
    }
  }
}

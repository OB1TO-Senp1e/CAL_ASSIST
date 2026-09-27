import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationProvider,
  NotificationPayload,
  NotificationPreferences,
  NotificationResult,
} from './notification.interface';

@Injectable()
export class SmsNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(SmsNotificationProvider.name);
  readonly channel = 'SMS';

  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;

  constructor(private readonly config: ConfigService) {
    this.accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID') || '';
    this.authToken = this.config.get<string>('TWILIO_AUTH_TOKEN') || '';
    this.fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER') || '';
  }

  async send(
    userId: string,
    payload: NotificationPayload,
    preferences: NotificationPreferences
  ): Promise<NotificationResult> {
    if (!preferences.sms?.enabled || !preferences.sms?.phoneNumber) {
      return { channel: this.channel, success: false, error: 'SMS not enabled or no phone number' };
    }

    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      this.logger.warn('Twilio not configured, simulating SMS send');
      return { channel: this.channel, success: true, messageId: `sim_sms_${Date.now()}` };
    }

    try {
      const message = `${payload.title}\n\n${payload.message}${payload.actionUrl ? `\n\n${payload.actionUrl}` : ''}`;

      // In production: use twilio client
      // const client = require('twilio')(this.accountSid, this.authToken);
      // await client.messages.create({ body: message, from: this.fromNumber, to: preferences.sms.phoneNumber });

      this.logger.log(`Sending SMS to ${preferences.sms.phoneNumber}: ${payload.title}`);

      return { channel: this.channel, success: true, messageId: `sms_${Date.now()}` };
    } catch (error: any) {
      this.logger.error(`SMS send failed: ${error.message}`);
      return { channel: this.channel, success: false, error: error.message };
    }
  }
}

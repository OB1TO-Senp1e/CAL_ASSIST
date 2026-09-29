import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationProvider,
  NotificationPayload,
  NotificationPreferences,
  NotificationResult,
} from './notification.interface';

/**
 * R3 — explicit failure codes for the email channel.
 *
 * Exported so callers and tests can assert *why* an email did not go out,
 * instead of having to match on free-text log messages. Both codes mean
 * "not delivered"; neither may ever be paired with `success: true`.
 */
export const EMAIL_NOT_CONFIGURED = 'EMAIL_NOT_CONFIGURED';
export const EMAIL_TRANSPORT_NOT_IMPLEMENTED = 'EMAIL_TRANSPORT_NOT_IMPLEMENTED';

@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(EmailNotificationProvider.name);
  readonly channel = 'EMAIL';

  private readonly smtpHost: string;
  private readonly smtpPort: number;
  private readonly smtpUser: string;
  private readonly smtpPass: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    this.smtpHost = this.config.get<string>('SMTP_HOST') || 'localhost';
    this.smtpPort = parseInt(this.config.get<string>('SMTP_PORT') || '587', 10);
    this.smtpUser = this.config.get<string>('SMTP_USER') || '';
    this.smtpPass = this.config.get<string>('SMTP_PASS') || '';
    this.fromEmail = this.config.get<string>('SMTP_FROM_EMAIL') || 'noreply@calassist.app';
    this.fromName = this.config.get<string>('SMTP_FROM_NAME') || 'CalAssist';
  }

  async send(
    userId: string,
    payload: NotificationPayload,
    preferences: NotificationPreferences
  ): Promise<NotificationResult> {
    if (!preferences.email?.enabled || !preferences.email?.address) {
      return { channel: this.channel, success: false, error: 'Email not enabled or no address' };
    }

    // R3: never report success for a message that was never handed to a transport.
    // This branch used to return `success: true` with `messageId: sim_<epoch>`,
    // so `NotificationService` wrote a `NOTIFICATION_SENT` audit row and callers
    // believed an email had gone out when nothing had.
    if (!this.smtpUser || !this.smtpPass) {
      this.logger.error(
        'SMTP not configured (SMTP_USER/SMTP_PASS): reporting failure, not a simulated success'
      );
      return {
        channel: this.channel,
        success: false,
        error: `${EMAIL_NOT_CONFIGURED}: SMTP_USER/SMTP_PASS are not set`,
      };
    }

    // R3: credentials exist, but there is still no transport to use them —
    // `nodemailer` is not a dependency and the call below has always been
    // commented out. Returning a synthetic id here is a fabrication, so this
    // reports an explicit failure until a real transport is wired up.
    this.logger.error(
      'No email transport is implemented: reporting failure, not a fabricated messageId'
    );
    return {
      channel: this.channel,
      success: false,
      error: `${EMAIL_TRANSPORT_NOT_IMPLEMENTED}: no transport is wired up (nodemailer is not a dependency)`,
    };
  }

  /**
   * Renders the HTML body for a notification.
   *
   * Retained deliberately: this is the payload-rendering half of the email
   * contract and is what the real transport will send once one is added. It is
   * intentionally unreferenced by `send()` until that happens — returning
   * `success: true` without delivering was the R3 defect.
   */
  private generateHtml(payload: NotificationPayload): string {
    const priorityColors = {
      LOW: '#6b7280',
      NORMAL: '#3b82f6',
      HIGH: '#f59e0b',
      URGENT: '#ef4444',
    };

    const color = priorityColors[payload.priority];

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">CalAssist</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
          <div style="display: inline-block; background: ${color}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px;">
            ${payload.type.replace('_', ' ')}
          </div>
          <h2 style="margin: 0 0 16px; color: #111827; font-size: 20px;">${payload.title}</h2>
          <p style="margin: 0 0 24px; color: #374151; font-size: 16px;">${payload.message}</p>
          ${
            payload.actionUrl
              ? `
            <a href="${payload.actionUrl}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              View in CalAssist
            </a>
          `
              : ''
          }
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">
            You're receiving this because you have notifications enabled in CalAssist.
          </p>
        </div>
      </body>
      </html>
    `;
  }
}

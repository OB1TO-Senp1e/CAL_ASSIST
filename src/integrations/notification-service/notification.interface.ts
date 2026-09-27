import { z } from 'zod';

export const NotificationPayloadSchema = z.object({
  type: z.enum([
    'REMINDER',
    'CONFLICT_ALERT',
    'RISK_ALERT',
    'RECOMMENDATION',
    'STATUS_UPDATE',
    'MESSAGE',
    'SYSTEM',
  ]),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  channel: z.enum(['APP', 'EMAIL', 'SMS', 'PUSH']).default('APP'),
  channels: z.array(z.enum(['APP', 'EMAIL', 'SMS', 'PUSH'])).optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actionUrl: z.string().url().optional(),
  scheduledAt: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

export interface NotificationProvider {
  readonly channel: string;
  send(
    userId: string,
    payload: NotificationPayload,
    preferences: NotificationPreferences
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export interface NotificationPreferences {
  email?: { enabled: boolean; address?: string };
  sms?: { enabled: boolean; phoneNumber?: string };
  push?: { enabled: boolean; deviceTokens?: string[] };
  app?: { enabled: boolean };
  workingHours?: { enabled: boolean; start: string; end: string; days: number[] };
  timezone?: string;
  muteUntil?: Date;
}

export interface NotificationResult {
  channel: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

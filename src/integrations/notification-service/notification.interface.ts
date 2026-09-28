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

/**
 * Runtime contract for `PATCH/POST /api/notifications/preferences`.
 *
 * The controller used to declare `@Body() body: any`, so nothing was checked
 * before the payload was `JSON.stringify`-ed straight into the Preference row —
 * a typo'd or hostile body silently became the user's stored settings. Every
 * field is optional because updates are merged onto the stored preferences.
 */
export const NotificationPreferencesSchema = z.object({
  email: z
    .object({
      enabled: z.boolean(),
      address: z.string().email().optional(),
    })
    .optional(),
  sms: z
    .object({
      enabled: z.boolean(),
      phoneNumber: z.string().min(1).optional(),
    })
    .optional(),
  push: z
    .object({
      enabled: z.boolean(),
      deviceTokens: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  app: z
    .object({
      enabled: z.boolean(),
    })
    .optional(),
  workingHours: z
    .object({
      enabled: z.boolean(),
      start: z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:mm').optional(),
      end: z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:mm').optional(),
      days: z.array(z.number().int().min(0).max(6)).optional(),
    })
    .optional(),
  timezone: z.string().min(1).optional(),
  muteUntil: z.union([z.string().datetime(), z.number().int().nonnegative()]).optional(),
});

/**
 * Partial-update shape. Deliberately its own type rather than
 * `Partial<NotificationPreferences>`: the stored interface marks
 * `workingHours.start/end/days` as required, but a patch that only toggles
 * `workingHours.enabled` is legitimate because updates merge.
 */
export type NotificationPreferencesUpdate = z.infer<typeof NotificationPreferencesSchema>;

export interface NotificationResult {
  channel: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

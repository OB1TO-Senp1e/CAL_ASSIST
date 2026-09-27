import { z } from 'zod';

export const CalendarEventSchema = z.object({
  externalId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  allDay: z.boolean().default(false),
  timezone: z.string().default('UTC'),
  recurrenceRule: z.string().optional(),
  exceptionDates: z.array(z.string().datetime()).optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .optional(),
  metadata: z.record(z.any()).optional(),
});

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const WebhookEventSchema = z.object({
  provider: z.string(),
  eventType: z.enum(['CREATED', 'UPDATED', 'DELETED', 'SYNC']),
  resourceId: z.string(),
  resourceUri: z.string().optional(),
  timestamp: z.string().datetime(),
  payload: z.record(z.any()).optional(),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  burstAllowance: number;
}

export interface WebhookConfig {
  webhookUrl: string;
  secret: string;
  events: string[];
}

export interface CalendarAdapter {
  readonly providerName: string;
  readonly provider: string;
  readonly scopes: string[];

  // OAuth / Connection
  getAuthUrl(userId: string, state: string): string;
  handleCallback(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    externalUserId: string;
  }>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }>;

  // Retry & Rate Limiting
  getRetryConfig(): RetryConfig;
  getRateLimitConfig(): RateLimitConfig;
  executeWithRetry<T>(operation: () => Promise<T>, context?: string): Promise<T>;

  // Webhook Support
  getWebhookConfig(accessToken: string, userId: string): Promise<WebhookConfig>;
  registerWebhook(accessToken: string, webhookConfig: WebhookConfig): Promise<string>;
  unregisterWebhook(accessToken: string, webhookId: string): Promise<void>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
  processWebhookEvent(payload: any, signature: string): Promise<WebhookEvent[]>;

  // Disconnect/Reconnect
  disconnect(accessToken: string, refreshToken: string): Promise<void>;
  isTokenValid(accessToken: string): Promise<boolean>;
  revokeAccess(refreshToken: string): Promise<void>;

  // Event CRUD
  createEvent(
    accessToken: string,
    event: CalendarEvent
  ): Promise<{ externalId: string; externalETag: string }>;
  updateEvent(
    accessToken: string,
    externalId: string,
    event: Partial<CalendarEvent>
  ): Promise<{ externalETag: string }>;
  deleteEvent(accessToken: string, externalId: string): Promise<void>;
  getEvent(
    accessToken: string,
    externalId: string
  ): Promise<(CalendarEvent & { externalETag: string }) | null>;

  // Sync
  listEvents(
    accessToken: string,
    options: { syncToken?: string; timeMin?: string; timeMax?: string }
  ): Promise<{
    events: Array<CalendarEvent & { externalId: string; externalETag: string }>;
    nextSyncToken?: string;
  }>;
}

export interface BaseAdapterConfig {
  retryConfig: RetryConfig;
  rateLimitConfig: RateLimitConfig;
}

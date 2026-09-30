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
  /**
   * C8: Google calendar push notifications are NOT HMAC-signed. Authenticity
   * comes from a secret channel token we choose at watch-creation time and
   * Google echoes back in the X-Goog-Channel-Token header. (The old `secret`
   * field fed a misleading HMAC check that Google never satisfies.)
   */
  channelToken: string;
  events: string[];
}

/** Headers Google delivers on a push notification (C8 verification inputs). */
export interface CalendarWebhookHeaders {
  channelToken?: string;
  channelId?: string;
  /** Opaque X-Goog-Resource-ID (logged, not compared). */
  resourceId?: string;
  /** X-Goog-Resource-URI — compared against the stored watched URI. */
  resourceUri?: string;
  resourceState?: string; // 'sync' for the initial probe notification
}

/**
 * Options for building a provider authorization URL.
 *
 * `requestConsentPrompt` is true only when the caller knows no refresh token is
 * stored for this user (first connect or re-auth after token loss). Google only
 * reissues a refresh token when the consent screen is shown, so sending
 * `prompt=consent` every time (C1) both annoys users and is unnecessary;
 * skipping it when a refresh token already exists is the policy-minimal choice.
 */
export interface CalendarAuthUrlOptions {
  requestConsentPrompt?: boolean;
  /**
   * C7: PKCE challenge material minted by the server for this exact state.
   * Adapters that support PKCE MUST append code_challenge + code_challenge_method
   * to the authorization URL. The verifier itself never travels here — it
   * stays server-side (PkceService).
   */
  codeChallenge?: string;
  codeChallengeMethod?: 'S256';
}

export interface CalendarCallbackResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  externalUserId: string;
  /** Scopes actually granted by the provider (from the token response), not the ones requested. */
  scopes: string[];
}

export interface CalendarAdapter {
  readonly providerName: string;
  readonly provider: string;
  readonly scopes: string[];

  // OAuth / Connection
  getAuthUrl(userId: string, state: string, options?: CalendarAuthUrlOptions): string;
  handleCallback(code: string, codeVerifier?: string): Promise<CalendarCallbackResult>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }>;

  // Retry & Rate Limiting
  getRetryConfig(): RetryConfig;
  getRateLimitConfig(): RateLimitConfig;
  executeWithRetry<T>(operation: () => Promise<T>, context?: string): Promise<T>;

  // Webhook Support
  getWebhookConfig(accessToken: string, userId: string): Promise<WebhookConfig>;
  registerWebhook(accessToken: string, webhookConfig: WebhookConfig): Promise<string>;
  unregisterWebhook(accessToken: string, webhookId: string): Promise<void>;
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

import { Injectable, Logger } from '@nestjs/common';
import { CalendarAdapter, CalendarEvent, RetryConfig, RateLimitConfig, WebhookConfig, WebhookEvent } from './calendar-adapter.interface';

@Injectable()
export abstract class BaseCalendarAdapter implements CalendarAdapter {
  protected readonly logger = new Logger(BaseCalendarAdapter.name);
  protected abstract readonly _providerName: string;
  protected abstract readonly _provider: string;
  protected abstract readonly _scopes: string[];

  protected readonly retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  };

  protected readonly rateLimitConfig: RateLimitConfig = {
    requestsPerSecond: 10,
    requestsPerMinute: 100,
    burstAllowance: 20,
  };

  get providerName(): string {
    return this._providerName;
  }

  get provider(): string {
    return this._provider;
  }

  get scopes(): string[] {
    return this._scopes;
  }

  getRetryConfig(): RetryConfig {
    return this.retryConfig;
  }

  getRateLimitConfig(): RateLimitConfig {
    return this.rateLimitConfig;
  }

  async executeWithRetry<T>(operation: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error;
    const config = this.retryConfig;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        if (attempt === config.maxRetries) {
          throw error;
        }

        const isRetryable = error.status && config.retryableStatusCodes.includes(error.status);
        if (!isRetryable) {
          throw error;
        }

        const delay = Math.min(
          config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelayMs
        );

        this.logger.warn(
          `${context || 'Operation'} failed (attempt ${attempt + 1}/${config.maxRetries}), retrying in ${delay}ms: ${error.message}`
        );

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  async getWebhookConfig(accessToken: string, userId: string): Promise<WebhookConfig> {
    throw new Error('Webhook configuration not implemented for this provider');
  }

  async registerWebhook(accessToken: string, webhookConfig: WebhookConfig): Promise<string> {
    throw new Error('Webhook registration not implemented for this provider');
  }

  async unregisterWebhook(accessToken: string, webhookId: string): Promise<void> {
    throw new Error('Webhook unregistration not implemented for this provider');
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    throw new Error('Webhook verification not implemented for this provider');
  }

  async processWebhookEvent(payload: any, signature: string): Promise<any[]> {
    throw new Error('Webhook processing not implemented for this provider');
  }

  async disconnect(accessToken: string, refreshToken: string): Promise<void> {
    throw new Error('Disconnect not implemented for this provider');
  }

  async isTokenValid(accessToken: string): Promise<boolean> {
    throw new Error('Token validation not implemented for this provider');
  }

  async revokeAccess(refreshToken: string): Promise<void> {
    throw new Error('Access revocation not implemented for this provider');
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Abstract methods to be implemented by subclasses
  abstract getAuthUrl(userId: string, state: string): string;
  abstract handleCallback(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    externalUserId: string;
  }>;
  abstract refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }>;
  abstract createEvent(accessToken: string, event: CalendarEvent): Promise<{ externalId: string; externalETag: string }>;
  abstract updateEvent(accessToken: string, externalId: string, event: Partial<CalendarEvent>): Promise<{ externalETag: string }>;
  abstract deleteEvent(accessToken: string, externalId: string): Promise<void>;
  abstract getEvent(accessToken: string, externalId: string): Promise<(CalendarEvent & { externalETag: string }) | null>;
  abstract listEvents(accessToken: string, options: { syncToken?: string; timeMin?: string; timeMax?: string }): Promise<{
    events: Array<CalendarEvent & { externalId: string; externalETag: string }>;
    nextSyncToken?: string;
  }>;
}
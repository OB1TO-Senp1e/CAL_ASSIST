import { Logger, UnauthorizedException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { timingSafeEqual, createHash } from 'node:crypto';
import { PrismaService } from '@app/common/services/prisma.service';
import { CalendarConnectionService } from './calendar-connection.service';
import { CalendarSyncService } from './calendar-sync.service';
import { GoogleCalendarAdapter } from './google-calendar.adapter';
import { CalendarWebhookHeaders } from './calendar-adapter.interface';

/**
 * C8 — Google Calendar push-notification verification.
 *
 * Google does NOT HMAC-sign notification payloads. Authenticity model:
 *  1. we mint a random channelToken when creating the watch and register it
 *     with Google;
 *  2. Google echoes it back on every notification (X-Goog-Channel-Token);
 *  3. the notification must also name a channel id + resource id we have a
 *     live row for (X-Goog-Channel-ID / X-Goog-Resource-ID);
 *  4. the payload itself is ignored — the stored access token is then used to
 *     re-fetch actual changes (delta sync), so a forged or replayed
 *     notification can only ever cause a (no-op or legitimate) refresh, never
 *     data injection.
 *
 * The first notification for a channel arrives with
 * X-Goog-Resource-State: sync and carries no token; it is acknowledged, not
 * treated as a change (still gated on the channel existing).
 */

@Injectable()
export class CalendarWebhookService {
  private readonly logger = new Logger(CalendarWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectionService: CalendarConnectionService,
    private readonly syncService: CalendarSyncService,
    private readonly googleAdapter: GoogleCalendarAdapter
  ) {}

  /** Registers a watch for a user's Google connection and stores the channel. */
  async createWatch(userId: string): Promise<{ channelId: string; expiration: Date | null }> {
    const accessToken = await this.connectionService.getValidAccessToken(userId, 'GOOGLE');
    const config = await this.googleAdapter.getWebhookConfig(accessToken, userId);
    const channelId = await this.googleAdapter.registerWebhook(accessToken, {
      ...config,
      channelId: undefined as any, // adapter generates a UUID when absent
    });
    const row = await this.prisma.calendarPushChannel.create({
      data: {
        userId,
        provider: 'GOOGLE',
        channelId,
        resourceUri: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        channelToken: config.channelToken,
      },
    });
    return { channelId: row.channelId, expiration: row.expiration };
  }

  /**
   * Validates one notification. Returns the owning userId on success; throws
   * UnauthorizedException for an invalid token or unknown channel.
   */
  async verifyAndDispatch(
    pathUserId: string,
    headers: CalendarWebhookHeaders
  ): Promise<{ userId: string; synced: boolean }> {
    if (!headers.channelId) {
      throw new UnauthorizedException('Webhook rejected: missing channel id');
    }

    const channel = await this.prisma.calendarPushChannel.findUnique({
      where: {
        provider_channelId: { provider: 'GOOGLE', channelId: headers.channelId },
      },
    });
    if (!channel) {
      // Unknown channel: reject (also the right answer for replayed stops).
      this.logger.warn(`Webhook rejected: unknown channel ${headers.channelId}`);
      throw new UnauthorizedException('Webhook rejected: unknown channel');
    }

    // The path user must own the channel; otherwise this is someone guessing
    // channel ids against the wrong account endpoint.
    if (channel.userId !== pathUserId) {
      this.logger.warn(
        `Webhook rejected: channel ${headers.channelId} does not belong to user ${pathUserId}`
      );
      throw new UnauthorizedException('Webhook rejected: unknown channel');
    }

    // The initial 'sync' probe carries no token; acknowledging it is safe
    // because everything else below still requires the stored channel.
    if (headers.resourceState !== 'sync') {
      if (!this.tokenMatches(channel.channelToken, headers.channelToken)) {
        this.logger.warn(`Webhook rejected: bad channel token for ${headers.channelId}`);
        throw new UnauthorizedException('Webhook rejected: invalid channel token');
      }
      // Google echoes the watched resource in X-Goog-Resource-URI (the value
      // may arrive percent-encoded); a mismatch means the notification is not
      // for the channel we stored. X-Goog-Resource-ID is an opaque hash and
      // is only logged.
      const presentedResource = headers.resourceUri
        ? decodeURIComponent(headers.resourceUri)
        : undefined;
      if (presentedResource && channel.resourceUri && presentedResource !== channel.resourceUri) {
        this.logger.warn(`Webhook rejected: resource mismatch on channel ${headers.channelId}`);
        throw new UnauthorizedException('Webhook rejected: unknown channel');
      }
    }

    // Trusted enough to refresh: re-fetch changes with the stored access
    // token instead of acting on the notification body. A failed refresh is
    // logged, not surfaced to Google (we still 200 to keep the channel alive).
    let synced = false;
    try {
      await this.syncService.syncCalendars(channel.userId, 'GOOGLE');
      synced = true;
    } catch (error: any) {
      this.logger.warn(
        `Webhook re-fetch failed for user ${channel.userId}: ${error?.message ?? error}`
      );
    }
    return { userId: channel.userId, synced };
  }

  /** Constant-time comparison over fixed-length digests (no length leak). */
  private tokenMatches(expected: string, presented?: string): boolean {
    if (!presented) return false;
    const a = createHash('sha256').update(expected).digest();
    const b = createHash('sha256').update(presented).digest();
    return timingSafeEqual(a, b);
  }
}

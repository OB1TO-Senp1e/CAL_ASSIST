import { Controller, Logger, Param, Post, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { CalendarWebhookService } from './calendar-webhook.service';

/**
 * C8: Google Calendar push notifications land here. Unauthenticated by
 * design (Google sends no Authorization header); authenticity comes from the
 * channel token + ids verified inside CalendarWebhookService.
 *
 *   POST /api/calendar/webhook/google/:userId
 */
@Controller('calendar/webhook')
export class CalendarWebhookController {
  private readonly logger = new Logger(CalendarWebhookController.name);

  constructor(private readonly webhook: CalendarWebhookService) {}

  /**
   * Status codes matter to Google: anything but 2xx within ~5s counts as a
   * failed notification and 410/404 tells Google to stop the channel. Valid →
   * 200; unknown channel → 404 (channel is not ours, stop it); token mismatch
   * → 403 (kept alive in case of a transient misconfiguration, but rejected).
   */
  @Post('google/:userId')
  async googleNotification(
    @Param('userId') userId: string,
    @Req() req: { headers: Record<string, string | string[] | undefined> },
    @Res() res: Response
  ) {
    const header = (name: string): string | undefined => {
      const value = req.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    try {
      const result = await this.webhook.verifyAndDispatch(userId, {
        channelToken: header('x-goog-channel-token'),
        channelId: header('x-goog-channel-id'),
        resourceId: header('x-goog-resource-id'),
        resourceUri: header('x-goog-resource-uri'),
        resourceState: header('x-goog-resource-state'),
      });
      return res.status(200).json({ ok: true, synced: result.synced });
    } catch (error: any) {
      this.logger.warn(`Rejected Google webhook for ${userId}: ${error?.message}`);
      const status = /unknown channel|missing channel id/.test(String(error?.message)) ? 404 : 403;
      return res.status(status).json({ ok: false });
    }
  }
}

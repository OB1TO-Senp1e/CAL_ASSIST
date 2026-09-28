import { Controller, Get, Param, Query, Res, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CalendarConnectionService } from './calendar-connection.service';
import { CalendarSyncService } from './calendar-sync.service';

/**
 * Browser-facing OAuth return leg for calendar providers.
 *
 * This lives in its own controller with no guard on purpose: Google/Microsoft
 * redirect the user's browser here with ?code&state and that request carries no
 * Authorization header, so it cannot sit behind JwtAuthGuard. Identity comes
 * from the signed `state` minted by GET /api/calendar/auth-url/:provider, which
 * means this route cannot be used to attach someone else's calendar.
 *
 *   GET /api/calendar/callback/:provider
 */
@Controller('calendar/callback')
export class CalendarOAuthCallbackController {
  private readonly logger = new Logger(CalendarOAuthCallbackController.name);

  constructor(
    private readonly connectionService: CalendarConnectionService,
    private readonly syncService: CalendarSyncService,
    private readonly config: ConfigService,
  ) {}

  @Get(':provider')
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const clientUrl = this.config.get<string>('CLIENT_URL') || 'http://localhost:5173';
    const target = new URL('/integrations', clientUrl);

    try {
      if (!code || !state) {
        throw new Error('code and state are both required');
      }
      const { userId } = this.connectionService.verifyOAuthState(state);
      await this.connectionService.handleCallback(userId, provider, code);

      // Prime the connection so the user is not looking at an empty calendar
      // until the next scheduled sync. Failure here must not lose the tokens.
      await this.syncService.syncCalendars(userId, provider).catch((error) => {
        this.logger.warn(`Initial sync failed for ${provider}: ${error}`);
      });

      target.searchParams.set('connected', provider.toLowerCase());
    } catch (error: any) {
      this.logger.warn(`Calendar OAuth callback failed for ${provider}: ${error?.message}`);
      target.searchParams.set('error', error?.message || `Could not connect ${provider} calendar`);
    }

    return res.redirect(target.toString());
  }
}

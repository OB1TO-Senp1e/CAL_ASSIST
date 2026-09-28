import { forwardRef, Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarOAuthCallbackController } from './calendar-oauth-callback.controller';
import { CalendarConnectionService } from './calendar-connection.service';
import { CalendarSyncService } from './calendar-sync.service';
import { GoogleCalendarAdapter } from './google-calendar.adapter';
import { OutlookCalendarAdapter } from './outlook-calendar.adapter';
import { LocalCalendarAdapter } from './local-calendar.adapter';
import { AppleCalendarAdapter } from './apple-calendar.adapter';
import { CalendarWebhookController } from './calendar-webhook.controller';
import { CalendarWebhookService } from './calendar-webhook.service';
import { OAuthTokenCryptoService } from './oauth-token-crypto.service';
import { PkceService } from './pkce.service';
import { PrismaService } from '../../common/services/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [ConfigModule, forwardRef(() => AuthModule)],
  controllers: [CalendarController, CalendarOAuthCallbackController, CalendarWebhookController],
  providers: [
    CalendarConnectionService,
    CalendarSyncService,
    CalendarWebhookService,
    GoogleCalendarAdapter,
    OutlookCalendarAdapter,
    LocalCalendarAdapter,
    AppleCalendarAdapter,
    OAuthTokenCryptoService,
    PkceService,
    PrismaService,
  ],
  exports: [
    CalendarConnectionService,
    CalendarWebhookService,
    OAuthTokenCryptoService,
    PkceService,
    CalendarSyncService,
    GoogleCalendarAdapter,
    OutlookCalendarAdapter,
    LocalCalendarAdapter,
    AppleCalendarAdapter,
  ],
})
export class CalendarAdaptersModule {}

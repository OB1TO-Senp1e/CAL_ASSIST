import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarConnectionService } from './calendar-connection.service';
import { CalendarSyncService } from './calendar-sync.service';
import { GoogleCalendarAdapter } from './google-calendar.adapter';
import { OutlookCalendarAdapter } from './outlook-calendar.adapter';
import { LocalCalendarAdapter } from './local-calendar.adapter';
import { AppleCalendarAdapter } from './apple-calendar.adapter';
import { PrismaService } from '../../common/services/prisma.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [CalendarController],
  providers: [
    CalendarConnectionService,
    CalendarSyncService,
    GoogleCalendarAdapter,
    OutlookCalendarAdapter,
    LocalCalendarAdapter,
    AppleCalendarAdapter,
    PrismaService,
  ],
  exports: [
    CalendarConnectionService,
    CalendarSyncService,
    GoogleCalendarAdapter,
    OutlookCalendarAdapter,
    LocalCalendarAdapter,
    AppleCalendarAdapter,
  ],
})
export class CalendarAdaptersModule {}

import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './services/calendar.service';
import { ConflictDetector } from './services/conflict-detector';
import { AvailabilityCalculator } from './services/availability-calculator';
import { ViewGenerator } from './views/view-generator';
import { PrismaService } from '../common/services/prisma.service';

@Module({
  controllers: [CalendarController],
  providers: [
    CalendarService,
    ConflictDetector,
    AvailabilityCalculator,
    ViewGenerator,
    PrismaService,
  ],
  exports: [CalendarService, ConflictDetector, AvailabilityCalculator, ViewGenerator],
})
export class CalendarModule {}

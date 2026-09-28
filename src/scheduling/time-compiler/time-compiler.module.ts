import { Module } from '@nestjs/common';
import { TimeCompilerController } from './time-compiler.controller';
import { TimeCompilerService } from './time-compiler.service';
import { SchedulingInputLoader } from './scheduling-input-loader';
import { SchedulingPreferencesResolver } from './scheduling-preferences.resolver';
import { ScheduleProposalStore } from './schedule-proposal.store';
import { PrismaService } from '../../common/services/prisma.service';

@Module({
  controllers: [TimeCompilerController],
  providers: [
    TimeCompilerService,
    SchedulingInputLoader,
    SchedulingPreferencesResolver,
    ScheduleProposalStore,
    PrismaService,
  ],
  exports: [TimeCompilerService, SchedulingInputLoader, ScheduleProposalStore],
})
export class TimeCompilerModule {}


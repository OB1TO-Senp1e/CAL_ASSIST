import { Module } from '@nestjs/common';
import { DailyExperienceController } from './daily-experience.controller';
import { DailyExperienceService } from './daily-experience.service';
import { PrismaService } from '../common/services/prisma.service';
import { AiProvidersModule } from '../integrations/ai-providers/ai-providers.module';
import { RealityEngineModule } from '../scheduling/reality-engine/reality-engine.module';
import { ReplanningEngineModule } from '../scheduling/replanning-engine/replanning-engine.module';
import { CommitmentsModule } from '../commitments/commitments.module';
import { ProactiveAssistantModule } from '../ai/proactive/proactive.module';
import { MeetingIntelligenceModule } from '../meetings/meeting-intelligence.module';
import { TimeCompilerModule } from '../scheduling/time-compiler/time-compiler.module';

@Module({
  imports: [
    AiProvidersModule,
    RealityEngineModule,
    ReplanningEngineModule,
    CommitmentsModule,
    ProactiveAssistantModule,
    MeetingIntelligenceModule,
    TimeCompilerModule,
  ],
  controllers: [DailyExperienceController],
  providers: [DailyExperienceService, PrismaService],
  exports: [DailyExperienceService],
})
export class DailyExperienceModule {}
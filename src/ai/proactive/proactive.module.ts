import { Module } from '@nestjs/common';
import { ProactiveAssistantController } from './proactive-assistant.controller';
import { ProactiveAssistantService } from './proactive-assistant.service';
import { PrismaService } from '../../common/services/prisma.service';
import { CommitmentsModule } from '../../commitments/commitments.module';
import { RealityEngineModule } from '../../scheduling/reality-engine/reality-engine.module';
import { SchedulingEngineModule } from '../../scheduling/scheduling-engine/scheduling-engine.module';
import { AiProvidersModule } from '../../integrations/ai-providers/ai-providers.module';
import { TimeCompilerModule } from '../../scheduling/time-compiler/time-compiler.module';

@Module({
  imports: [
    CommitmentsModule,
    RealityEngineModule,
    SchedulingEngineModule,
    AiProvidersModule,
    TimeCompilerModule,
  ],
  controllers: [ProactiveAssistantController],
  providers: [ProactiveAssistantService, PrismaService],
  exports: [ProactiveAssistantService],
})
export class ProactiveAssistantModule {}

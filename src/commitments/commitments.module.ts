import { Module } from '@nestjs/common';
import { CommitmentEngineController } from './commitment-engine.controller';
import { CommitmentEngineService } from './commitment-engine.service';
import { PrismaService } from '../common/services/prisma.service';
import { AiProvidersModule } from '../integrations/ai-providers/ai-providers.module';
import { RealityEngineModule } from '../scheduling/reality-engine/reality-engine.module';
import { SchedulingEngineModule } from '../scheduling/scheduling-engine/scheduling-engine.module';

@Module({
  imports: [AiProvidersModule, RealityEngineModule, SchedulingEngineModule],
  controllers: [CommitmentEngineController],
  providers: [CommitmentEngineService, PrismaService],
  exports: [CommitmentEngineService],
})
export class CommitmentsModule {}

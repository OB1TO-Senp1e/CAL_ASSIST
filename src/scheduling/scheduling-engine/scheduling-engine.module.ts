import { Module } from '@nestjs/common';
import { SchedulingEngineController } from './scheduling-engine.controller';
import { SchedulingEngineService } from './scheduling-engine.service';
import { PrismaService } from '@app/common/services/prisma.service';
import { AiProvidersModule } from '@app/integrations/ai-providers/ai-providers.module';
import { ContextEngineModule } from '@app/core/context-engine/context-engine.module';

@Module({
  imports: [AiProvidersModule, ContextEngineModule],
  controllers: [SchedulingEngineController],
  providers: [SchedulingEngineService, PrismaService],
  exports: [SchedulingEngineService],
})
export class SchedulingEngineModule {}

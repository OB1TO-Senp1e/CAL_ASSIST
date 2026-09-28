import { Module } from '@nestjs/common';
import { MemoryEngineController } from './memory-engine.controller';
import { MemoryEngineService } from './memory-engine.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProvidersModule } from '../../integrations/ai-providers/ai-providers.module';
import { MetricsModule } from '../../metrics/metrics.module';

@Module({
  // MetricsModule is imported directly: Nest does not re-export the providers of
  // a transitive import, so relying on AiProvidersModule would leave the
  // @Optional() MetricsService undefined and the recency fallback invisible.
  imports: [AiProvidersModule, MetricsModule],
  controllers: [MemoryEngineController],
  providers: [MemoryEngineService, PrismaService],
  exports: [MemoryEngineService],
})
export class MemoryEngineModule {}

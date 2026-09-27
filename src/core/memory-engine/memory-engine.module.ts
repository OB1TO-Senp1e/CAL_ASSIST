import { Module } from '@nestjs/common';
import { MemoryEngineController } from './memory-engine.controller';
import { MemoryEngineService } from './memory-engine.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProvidersModule } from '../../integrations/ai-providers/ai-providers.module';

@Module({
  imports: [AiProvidersModule],
  controllers: [MemoryEngineController],
  providers: [MemoryEngineService, PrismaService],
  exports: [MemoryEngineService],
})
export class MemoryEngineModule {}

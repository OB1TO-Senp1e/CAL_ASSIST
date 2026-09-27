import { Module } from '@nestjs/common';
import { RulesEngineController } from './rules-engine.controller';
import { RulesEngineService } from './rules-engine.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProvidersModule } from '../../integrations/ai-providers/ai-providers.module';

@Module({
  imports: [AiProvidersModule],
  controllers: [RulesEngineController],
  providers: [RulesEngineService, PrismaService],
  exports: [RulesEngineService],
})
export class RulesEngineModule {}

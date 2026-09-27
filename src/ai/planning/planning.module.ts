import { Module } from '@nestjs/common';
import { PlanningEngineController } from './planning-engine.controller';
import { PlanningEngineService } from './planning-engine.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProvidersModule } from '../../integrations/ai-providers/ai-providers.module';

@Module({
  imports: [AiProvidersModule],
  controllers: [PlanningEngineController],
  providers: [PlanningEngineService, PrismaService],
  exports: [PlanningEngineService],
})
export class PlanningModule {}

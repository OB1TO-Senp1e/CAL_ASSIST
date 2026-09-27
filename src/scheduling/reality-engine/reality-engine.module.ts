import { Module } from '@nestjs/common';
import { RealityEngineController } from './reality-engine.controller';
import { RealityEngineService } from './reality-engine.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProvidersModule } from '../../integrations/ai-providers/ai-providers.module';
import { TimeCompilerModule } from '../time-compiler/time-compiler.module';

@Module({
  imports: [AiProvidersModule, TimeCompilerModule],
  controllers: [RealityEngineController],
  providers: [RealityEngineService, PrismaService],
  exports: [RealityEngineService],
})
export class RealityEngineModule {}

import { Module } from '@nestjs/common';
import { ReplanningEngineController } from './replanning-engine.controller';
import { ReplanningEngineService } from './replanning-engine.service';
import { PrismaService } from '@app/common/services/prisma.service';
import { RealityEngineModule } from '../reality-engine/reality-engine.module';
import { SchedulingEngineModule } from '../scheduling-engine/scheduling-engine.module';
import { ContextEngineModule } from '@app/core/context-engine/context-engine.module';
import { TimeCompilerModule } from '../time-compiler/time-compiler.module';

@Module({
  imports: [RealityEngineModule, SchedulingEngineModule, ContextEngineModule, TimeCompilerModule],
  controllers: [ReplanningEngineController],
  providers: [ReplanningEngineService, PrismaService],
  exports: [ReplanningEngineService],
})
export class ReplanningEngineModule {}

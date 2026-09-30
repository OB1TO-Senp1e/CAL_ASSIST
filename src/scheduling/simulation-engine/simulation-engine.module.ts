import { Module } from '@nestjs/common';
import { SimulationEngineService } from './simulation-engine.service';
import { SimulationEngineController } from './simulation-engine.controller';
import { TimeCompilerModule } from '../time-compiler/time-compiler.module';
import { PrismaService } from '../../common/services/prisma.service';

@Module({
  imports: [TimeCompilerModule],
  controllers: [SimulationEngineController],
  providers: [SimulationEngineService, PrismaService],
  exports: [SimulationEngineService],
})
export class SimulationEngineModule {}

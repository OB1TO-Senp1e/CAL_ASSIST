import { Module } from '@nestjs/common';
import { ContextEngineController } from './context-engine.controller';
import { ContextEngineService } from './context-engine.service';
import { PrismaService } from '../../common/services/prisma.service';

@Module({
  controllers: [ContextEngineController],
  providers: [ContextEngineService, PrismaService],
  exports: [ContextEngineService],
})
export class ContextEngineModule {}

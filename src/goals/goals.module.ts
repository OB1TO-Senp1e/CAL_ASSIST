import { Module } from '@nestjs/common';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { GoalEngine } from './domain/goal-engine';
import { PrismaService } from '../common/services/prisma.service';

@Module({
  controllers: [GoalsController],
  providers: [GoalsService, GoalEngine, PrismaService],
  exports: [GoalsService],
})
export class GoalsModule {}

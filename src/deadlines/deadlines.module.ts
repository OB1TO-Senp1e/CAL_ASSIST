import { Module } from '@nestjs/common';
import { DeadlinesController } from './deadlines.controller';
import { DeadlinesService } from './deadlines.service';
import { PrismaService } from '../common/services/prisma.service';

@Module({
  controllers: [DeadlinesController],
  providers: [DeadlinesService, PrismaService],
  exports: [DeadlinesService],
})
export class DeadlinesModule {}

import { Module } from '@nestjs/common';
import { TimeBlocksController } from './time-blocks.controller';
import { TimeBlocksService } from './time-blocks.service';
import { PrismaService } from '../common/services/prisma.service';

@Module({
  controllers: [TimeBlocksController],
  providers: [TimeBlocksService, PrismaService],
  exports: [TimeBlocksService],
})
export class TimeBlocksModule {}

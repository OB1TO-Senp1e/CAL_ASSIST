import { Module } from '@nestjs/common';
import { TimeCompilerController } from './time-compiler.controller';
import { TimeCompilerService } from './time-compiler.service';
import { PrismaService } from '../../common/services/prisma.service';

@Module({
  controllers: [TimeCompilerController],
  providers: [TimeCompilerService, PrismaService],
  exports: [TimeCompilerService],
})
export class TimeCompilerModule {}

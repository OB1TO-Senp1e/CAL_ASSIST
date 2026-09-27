import { Module } from '@nestjs/common';
import { IntentParserController } from './intent-parser.controller';
import { IntentParserService } from './intent-parser.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProvidersModule } from '../../integrations/ai-providers/ai-providers.module';

@Module({
  imports: [AiProvidersModule],
  controllers: [IntentParserController],
  providers: [IntentParserService, PrismaService],
  exports: [IntentParserService],
})
export class IntentModule {}

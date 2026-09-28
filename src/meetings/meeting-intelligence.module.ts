import { Module } from '@nestjs/common';
import { MeetingIntelligenceController } from './meeting-intelligence.controller';
import { MeetingIntelligenceService } from './meeting-intelligence.service';
import { MeetingArtifactStore } from './meeting-artifact.store';
import { PrismaService } from '../common/services/prisma.service';
import { AiProvidersModule } from '../integrations/ai-providers/ai-providers.module';

@Module({
  imports: [AiProvidersModule],
  controllers: [MeetingIntelligenceController],
  providers: [MeetingIntelligenceService, MeetingArtifactStore, PrismaService],
  exports: [MeetingIntelligenceService, MeetingArtifactStore],
})
export class MeetingIntelligenceModule {}

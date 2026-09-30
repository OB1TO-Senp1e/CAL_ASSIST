import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../../integrations/ai-providers/ai-providers.module';
import { AiConsentController } from './ai-consent.controller';

/** C6: consent management routes; the service is exported by AiProvidersModule. */
@Module({
  imports: [AiProvidersModule],
  controllers: [AiConsentController],
})
export class AiConsentModule {}

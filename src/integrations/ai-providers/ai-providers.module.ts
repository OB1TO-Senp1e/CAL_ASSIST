import { Module } from '@nestjs/common';
import { AI_CONSENT_GATE, AiProviderService } from './ai-provider.service';
import { OpenAIProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';
import { NemotronNimProvider } from './nemotron-nim.provider';
import { ConfigModule } from '@nestjs/config';
import { MetricsModule } from '../../metrics/metrics.module';
import { AiConsentService } from '../../ai/consent/ai-consent.service';
import { PrismaService } from '../../common/services/prisma.service';

@Module({
  // MetricsModule is imported, not just the service, so the provider breaker
  // state lands on the same registry the /metrics endpoint scrapes. The service
  // injects MetricsService optionally, so manual construction in specs and the
  // probe script keeps working without it.
  imports: [ConfigModule, MetricsModule],
  providers: [
    AiProviderService,
    OpenAIProvider,
    OllamaProvider,
    NemotronNimProvider,
    // C6: consent gate. AiConsentService only needs the global PrismaService,
    // so it lives here without creating a module cycle; the token alias binds
    // the erased interface type for injection into AiProviderService.
    AiConsentService,
    PrismaService,
    { provide: AI_CONSENT_GATE, useExisting: AiConsentService },
  ],
  exports: [AiProviderService, AiConsentService],
})
export class AiProvidersModule {}

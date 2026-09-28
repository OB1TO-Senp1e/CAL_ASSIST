import { Module } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { OpenAIProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';
import { NemotronNimProvider } from './nemotron-nim.provider';
import { ConfigModule } from '@nestjs/config';
import { MetricsModule } from '../../metrics/metrics.module';

@Module({
  // MetricsModule is imported, not just the service, so the provider breaker
  // state lands on the same registry the /metrics endpoint scrapes. The service
  // injects MetricsService optionally, so manual construction in specs and the
  // probe script keeps working without it.
  imports: [ConfigModule, MetricsModule],
  providers: [AiProviderService, OpenAIProvider, OllamaProvider, NemotronNimProvider],
  exports: [AiProviderService],
})
export class AiProvidersModule {}

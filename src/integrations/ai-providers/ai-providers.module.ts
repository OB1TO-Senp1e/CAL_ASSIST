import { Module } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { OpenAIProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';
import { NemotronNimProvider } from './nemotron-nim.provider';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [AiProviderService, OpenAIProvider, OllamaProvider, NemotronNimProvider],
  exports: [AiProviderService],
})
export class AiProvidersModule {}

import { Injectable, Logger } from '@nestjs/common';
import { OpenAiCompatibleProvider, OpenAiCompatibleConfig } from './openai-compatible.provider';

@Injectable()
export class OpenAIProvider extends OpenAiCompatibleProvider {
  protected readonly logger = new Logger(OpenAIProvider.name);

  constructor() {
    const config: OpenAiCompatibleConfig = {
      providerKey: 'openai',
      providerName: 'OpenAI',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY || '',
      chatModel: process.env.OPENAI_MODEL || 'gpt-4o',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      // `generate()` historically omitted temperature unless the caller set it,
      // so no defaultTemperature here; structured calls alone wanted the colder
      // 0.3 the old implementation hard-coded.
      defaultStructuredTemperature: 0.3,
    };
    super(config);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { OpenAiCompatibleProvider, OpenAiCompatibleConfig } from './openai-compatible.provider';

@Injectable()
export class NemotronNimProvider extends OpenAiCompatibleProvider {
  protected readonly logger = new Logger(NemotronNimProvider.name);

  constructor() {
    const model = process.env.NVIDIA_NIM_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
    const config: OpenAiCompatibleConfig = {
      providerKey: 'nemotron',
      providerName: 'Nemotron-NIM',
      baseUrl: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_NIM_API_KEY || '',
      chatModel: model,
      embeddingModel: process.env.NVIDIA_NIM_EMBEDDING_MODEL || 'nvidia/nv-embedqa-e5-v5',
      // Preserved from the previous implementation: this endpoint wanted cold,
      // bounded generations, and it rejects requests with no `max_tokens`.
      defaultTemperature: 0.3,
      defaultStructuredTemperature: 0.1,
      defaultMaxTokens: 4096,
      alwaysSendMaxTokens: true,
    };
    super(config);
  }
}

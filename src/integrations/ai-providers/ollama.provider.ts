import { Injectable, Logger } from '@nestjs/common';
import { OpenAiCompatibleProvider, OpenAiCompatibleConfig } from './openai-compatible.provider';

@Injectable()
export class OllamaProvider extends OpenAiCompatibleProvider {
  protected readonly logger = new Logger(OllamaProvider.name);

  constructor() {
    const config: OpenAiCompatibleConfig = {
      providerKey: 'ollama',
      providerName: 'Ollama',
      baseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, ''),
      apiKey: process.env.OLLAMA_API_KEY || '',
      chatModel: process.env.OLLAMA_MODEL || 'llama3.2:latest',
      embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || '',
      // Ollama historically sent neither temperature nor max_tokens unless the
      // caller asked, so the model's own defaults applied. Left alone: forcing
      // values here would silently change local answer quality for every caller.
      noJsonError: 'Ollama returned no JSON value',
      emptyJsonError: 'Ollama returned no JSON value',
      httpError: (status) => `Ollama API request failed with HTTP ${status}`,
    };
    super(config);
  }
}

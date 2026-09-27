import { Injectable, Logger } from '@nestjs/common';
import { AIProviderInterface, GenerateOptions } from './interfaces/ai-provider.interface';

@Injectable()
export class OllamaProvider implements AIProviderInterface {
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl: string;
  private _providerName = 'Ollama';

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  }

  get providerName() {
    return this._providerName;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    try {
      const model = options?.model || 'llama3.2:latest';

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: options?.temperature,
            num_predict: options?.maxTokens,
          },
        }),
      });

      const data: any = await response.json();
      return data.response || '';
    } catch (error: any) {
      this.logger.error(`Ollama generation failed: ${error?.message || error}`);
      throw error;
    }
  }

  async generateStructured(prompt: string, options?: GenerateOptions): Promise<any> {
    const response = await this.generate(prompt, {
      ...options,
      temperature: options?.temperature || 0.3,
    });

    try {
      return JSON.parse(response);
    } catch (e) {
      this.logger.error('Failed to parse structured response from Ollama:', response);
      return { confidence: 0, reasoning: '' };
    }
  }

  async embed(text: string): Promise<number[]> {
    this.logger.warn('Embedding not supported with Ollama provider');
    return [];
  }
}

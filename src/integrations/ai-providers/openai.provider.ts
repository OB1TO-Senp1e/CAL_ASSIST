import { Injectable, Logger } from '@nestjs/common';
import { AIProviderInterface, GenerateOptions } from './interfaces/ai-provider.interface';

@Injectable()
export class OpenAIProvider implements AIProviderInterface {
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private _providerName = 'OpenAI';

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

  get providerName() {
    return this._providerName;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    if (!this.apiKey) {
      this.logger.warn('OpenAI API key not configured');
      return '';
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          stream: options?.stream || false,
        }),
      });

      const data: any = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error: any) {
      this.logger.error(`OpenAI generation failed: ${error?.message || error}`);
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
      this.logger.error('Failed to parse structured response:', response);
      return { confidence: 0, reasoning: '' };
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
        }),
      });

      const data: any = await response.json();
      return data.data[0]?.embedding || [];
    } catch (error: any) {
      this.logger.error(`Embedding failed: ${error?.message || error}`);
      return [];
    }
  }
}

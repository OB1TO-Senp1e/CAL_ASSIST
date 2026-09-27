import { Injectable, Logger } from '@nestjs/common';
import { AIProviderInterface, GenerateOptions } from './interfaces/ai-provider.interface';

@Injectable()
export class NemotronNimProvider implements AIProviderInterface {
  private readonly logger = new Logger(NemotronNimProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private _providerName = 'Nemotron-NIM';

  constructor() {
    this.apiKey = process.env.NVIDIA_NIM_API_KEY || '';
    this.baseUrl = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
    this.model = process.env.NVIDIA_NIM_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
  }

  get providerName() {
    return this._providerName;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    if (!this.apiKey) {
      this.logger.warn('NVIDIA NIM API key not configured');
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
          model: options?.model || this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 4096,
          stream: options?.stream || false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NVIDIA NIM API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: any = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error: any) {
      this.logger.error(`Nemotron NIM generation failed: ${error?.message || error}`);
      throw error;
    }
  }

  async generateStructured(prompt: string, options?: GenerateOptions): Promise<any> {
    const response = await this.generate(prompt, {
      ...options,
      temperature: options?.temperature ?? 0.1,
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
          model: 'nvidia/nv-embed-v1',
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
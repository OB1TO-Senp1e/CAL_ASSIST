import { Injectable, Logger } from '@nestjs/common';
import { AIProviderInterface, GenerateOptions } from './interfaces/ai-provider.interface';

@Injectable()
export class OllamaProvider implements AIProviderInterface {
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private _providerName = 'Ollama';

  constructor() {
    this.baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
    this.apiKey = process.env.OLLAMA_API_KEY || '';
    this.defaultModel = process.env.OLLAMA_MODEL || 'llama3.2:latest';
  }

  get providerName() {
    return this._providerName;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options?.model || this.defaultModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          stream: options?.stream ?? false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API request failed with HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('Ollama API returned no chat completion content');
      }
      return content;
    } catch (error: any) {
      this.logger.error(`Ollama generation failed: ${error?.message || error}`);
      throw error;
    }
  }

  async generateStructured(prompt: string, options?: GenerateOptions): Promise<any> {
    const response = await this.generate(prompt, {
      ...options,
      temperature: options?.temperature ?? 0.3,
    });

    const unfenced = response
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    const start = Math.min(
      ...[unfenced.indexOf('{'), unfenced.indexOf('[')].filter((index) => index >= 0)
    );
    if (!Number.isFinite(start)) throw new Error('Ollama returned no JSON value');
    const end = Math.max(unfenced.lastIndexOf('}'), unfenced.lastIndexOf(']'));
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      throw new Error('Ollama returned invalid structured JSON');
    }
  }

  async embed(text: string): Promise<number[]> {
    this.logger.warn('Embedding not supported with Ollama provider');
    return [];
  }
}

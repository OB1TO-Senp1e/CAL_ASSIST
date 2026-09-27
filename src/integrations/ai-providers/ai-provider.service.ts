import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AIProviderInterface, GenerateOptions } from './interfaces/ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';
import { NemotronNimProvider } from './nemotron-nim.provider';

@Injectable()
export class AiProviderService implements AIProviderInterface, OnModuleInit {
  private readonly logger = new Logger(AiProviderService.name);
  private defaultProvider: AIProviderInterface;
  private fallbackProvider: AIProviderInterface;
  private useFallback = false;

  constructor(
    private readonly openAIProvider: OpenAIProvider,
    private readonly ollamaProvider: OllamaProvider,
    private readonly nemotronNimProvider: NemotronNimProvider
  ) {
    this.defaultProvider = openAIProvider;
    this.fallbackProvider = ollamaProvider;
  }

  async onModuleInit() {
    const providerName = process.env.AI_PROVIDER || 'openai';
    this.useFallback = providerName === 'ollama' || providerName === 'nemotron';

    if (providerName === 'ollama') {
      this.defaultProvider = this.ollamaProvider;
      this.fallbackProvider = this.openAIProvider;
    } else if (providerName === 'nemotron') {
      this.defaultProvider = this.nemotronNimProvider;
      this.fallbackProvider = this.openAIProvider;
    }

    this.logger.log(`AI Provider initialized: ${providerName}`);
  }

  get providerName(): string {
    return this.defaultProvider.providerName;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    try {
      return await this.defaultProvider.generate(prompt, options);
    } catch (error: any) {
      this.logger.warn(`Primary AI provider failed, trying fallback: ${error?.message || error}`);
      try {
        return await this.fallbackProvider.generate(prompt, options);
      } catch (fallbackError: any) {
        this.logger.error(`Both AI providers failed: ${fallbackError?.message || fallbackError}`);
        throw fallbackError;
      }
    }
  }

  async generateStructured(prompt: string, options?: GenerateOptions): Promise<any> {
    try {
      return await this.defaultProvider.generateStructured(prompt, options);
    } catch (error: any) {
      this.logger.warn(`Primary AI provider failed, trying fallback: ${error?.message || error}`);
      try {
        return await this.fallbackProvider.generateStructured(prompt, options);
      } catch (fallbackError: any) {
        this.logger.error(
          `Both AI providers failed for structured response: ${fallbackError?.message || fallbackError}`
        );
        throw fallbackError;
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      return (await this.defaultProvider.embed?.(text)) || [];
    } catch (error) {
      this.logger.error('Embedding failed:', error);
      return [];
    }
  }
}

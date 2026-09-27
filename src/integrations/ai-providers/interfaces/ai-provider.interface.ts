import { z } from 'zod';

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  stream?: boolean;
}

export interface AIProviderInterface {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  generateStructured(prompt: string, options?: GenerateOptions): Promise<any>;
  embed?(text: string): Promise<number[]>;
  get providerName(): string;
}

export interface StructuredResponse {
  data: any;
  confidence?: number;
  reasoning?: string;
}

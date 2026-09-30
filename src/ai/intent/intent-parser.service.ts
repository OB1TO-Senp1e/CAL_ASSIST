import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { INTENT_TYPES, ParsedIntent } from './interfaces/intent.interface';
import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import { AiProviderError } from '../../integrations/ai-providers/ai-provider.error';
import {
  classifyLocally,
  extractTitle,
  LOCAL_INTENT_HIGH_CONFIDENCE,
  MAX_TITLE_LENGTH,
} from './local-intent.classifier';
import { mergeDateTimeIntoEntities, readOnlyIntentForQuery } from './date-time.parser';

@Injectable()
export class IntentParserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService
  ) {}

  async parseIntent(userId: string, text: string): Promise<ParsedIntent> {
    const userContext = await this.getUserContext(userId);

    try {
      const prompt = this.buildIntentParsingPrompt(text, userContext);

      const aiResponse = await this.aiProvider.generateStructured(prompt, {
        temperature: 0.3,
        maxTokens: 2000,
      });
      if (!aiResponse || !INTENT_TYPES.includes(aiResponse.type)) {
        throw new Error('AI provider returned an invalid intent type');
      }

      const { entities, parsed } = mergeDateTimeIntoEntities(
        this.sanitizeEntities(aiResponse.entities, text),
        text
      );

      const intent: ParsedIntent = {
        type: parsed.isQuery ? readOnlyIntentForQuery(text) : aiResponse.type,
        confidence: aiResponse.confidence,
        entities,
        constraints: aiResponse.constraints,
        originalText: text,
      };

      await this.prisma.intent.create({
        data: {
          userId,
          originalText: text,
          parsedJson: JSON.stringify(intent),
          status: 'COMPLETED',
        },
      });

      return intent;
    } catch (error: unknown) {
      const fallback = this.localFallback(text);
      if (AiProviderError.is(error)) {
        if (fallback.confidence < LOCAL_INTENT_HIGH_CONFIDENCE) throw error;
      }

      // Neither LLM provider is reachable (no OPENAI_API_KEY / OLLAMA_URL).
      // Explicit local commands remain available; ambiguous requests still
      // surface typed provider outages rather than masquerading as AI responses.
      const errorMessage =
        error instanceof Error ? error.message : 'LLM provider unavailable; local classifier used';
      await this.prisma.intent.create({
        data: {
          userId,
          originalText: text,
          parsedJson: JSON.stringify(fallback),
          status: 'COMPLETED',
          errorMessage,
        },
      });
      return fallback;
    }
  }

  /**
   * Runs the pure local classifier and widens it into a `ParsedIntent`.
   * Kept as a one-line adapter so the classifier stays unit-testable without
   * Nest, Prisma or an AI provider.
   */
  private localFallback(text: string): ParsedIntent {
    const local = classifyLocally(text);
    return {
      type: local.type,
      confidence: local.confidence,
      entities: {
        title: local.title,
        ...(local.durationMinutes ? { durationMinutes: local.durationMinutes } : {}),
        ...(local.startDate ? { startDate: local.startDate } : {}),
        ...(local.endDate ? { endDate: local.endDate } : {}),
        ...(local.dueDate ? { dueDate: local.dueDate } : {}),
        ...(local.priority !== undefined ? { priority: local.priority } : {}),
        ...(isQueryIntent(local.type) ? { isQuery: true } : {}),
      },
      constraints: local.constraints,
      originalText: local.originalText,
    };
  }

  /**
   * Normalises entities coming back from an LLM. The local classifier already
   * emits clean titles; provider output must not bypass the same guarantees.
   */
  private sanitizeEntities(entities: any, originalText: string): Record<string, any> {
    const safe = entities && typeof entities === 'object' ? { ...entities } : {};
    const raw = typeof safe.title === 'string' ? safe.title.trim() : '';
    // Prefer the model's own wording, but strip the command prefix if the model
    // simply echoed the request back, and never allow an empty title.
    let title = raw;
    if (!title || title.toLowerCase() === originalText.toLowerCase().trim()) {
      title = extractTitle(originalText).title || title || 'Untitled';
    } else {
      title = extractTitle(title).title || title;
    }
    safe.title = title.slice(0, MAX_TITLE_LENGTH);
    return mergeDateTimeIntoEntities(safe, originalText).entities;
  }

  private buildIntentParsingPrompt(text: string, context: any): string {
    return `
You are CalAssist's intent parser. Your job is to understand natural language requests from users and convert them into structured intents.

User Request: "${text}"

User Context:
- Working hours: ${context.workingHours || '9am - 5pm'}
- Timezone: ${context.timezone || 'local'}
- Today is: ${context.currentDate || new Date().toISOString()}

Please analyze the request and respond with valid JSON in this exact format:
{
  "type": "<one of ${INTENT_TYPES.join(', ')}>",
  "confidence": <0.0-1.0 confidence score>,
  "entities": {
    "title": "<the thing to create, WITHOUT the command words — for 'Create task buy milk' the title is 'buy milk'>",
    "description": "<extracted description, if any>",
    "startDate": "<ISO date string if mentioned>",
    "endDate": "<ISO date string if mentioned>",
    "durationMinutes": "<number of minutes if mentioned>",
    "priority": "<integer from 0 to 10 if stated or implied>",
    "dueDate": "<ISO datetime if a deadline is mentioned>"
  },
  "constraints": ["<list of constraint strings>"]
}
    `;
  }

  private async getUserContext(userId: string): Promise<any> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      include: {
        preferences: {
          where: {
            category: 'WORKING_HOURS',
          },
        },
      },
    });

    const workingHoursPref = user?.preferences.find((p) => p.key === 'working_hours');

    return {
      workingHours: workingHoursPref ? JSON.parse(workingHoursPref.valueJson) : null,
      timezone: user?.preferences.find((p) => p.key === 'timezone')?.valueJson || 'local',
      currentDate: new Date().toISOString(),
    };
  }
}

function isQueryIntent(type: string): boolean {
  return (
    type === 'QUERY_AVAILABILITY' || type === 'CHECK_CONFLICTS' || type === 'GET_RECOMMENDATIONS'
  );
}

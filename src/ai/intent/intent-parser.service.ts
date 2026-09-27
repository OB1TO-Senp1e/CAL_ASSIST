import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { ParsedIntent } from './interfaces/intent.interface';
import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';

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

      const intent: ParsedIntent = {
        type: aiResponse.type,
        confidence: aiResponse.confidence,
        entities: aiResponse.entities,
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
    } catch (error: any) {
      // Neither LLM provider is reachable (no OPENAI_API_KEY / OLLAMA_URL).
      // Fall back to a deterministic classification so the assistant thread
      // still answers instead of 500-ing. Kept simple: intent + entities only.
      const fallback = this.classifyLocally(text);
      await this.prisma.intent.create({
        data: {
          userId,
          originalText: text,
          parsedJson: JSON.stringify(fallback),
          status: 'COMPLETED',
          errorMessage: error?.message || 'LLM provider unavailable; local classifier used',
        },
      });
      return fallback;
    }
  }

  /**
   * Local classifier used when no AI provider is reachable. Uses the same
   * nine IntentType members the LLM prompt does; crude keyword buckets are
   * enough to keep proposals flowing in a live-but-LLM-less environment.
   */
  private classifyLocally(text: string): ParsedIntent {
    const lower = text.toLowerCase().trim();

    const includes = (...tokens: string[]) => tokens.some((t) => lower.includes(t));

    const maybeDate = /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|at \d|march|april|\d{1,2}[:/.]\d{1,2})\b/;

    if (includes('create', 'make')) {
      if (includes('event', 'meeting', 'appointment', 'lunch', 'call', 'dr')) return { type: 'CREATE_EVENT', confidence: 0.9, entities: { title: text }, originalText: text, constraints: [] };
      if (includes('task', 'todo', 'to-do', 'follow up', 'email')) return { type: 'CREATE_TASK', confidence: 0.9, entities: { title: text }, originalText: text, constraints: [] };
      if (includes('goal', 'objective', 'aim', 'target')) return { type: 'CREATE_GOAL', confidence: 0.9, entities: { title: text }, originalText: text, constraints: [] };
      if (includes('proposal', 'plan', 'schedule')) return { type: 'SCHEDULE_TASK', confidence: 0.8, entities: { title: text }, originalText: text, constraints: [] };
      return { type: 'CREATE_TASK', confidence: 0.75, entities: { title: text }, originalText: text, constraints: [] };
    }

    if (includes('move', 'reschedule', 'postpone', 'push')) return { type: 'RESCHEDULE_EVENT', confidence: 0.85, entities: { title: text }, originalText: text, constraints: [] };
    if (includes('cancel', 'delete', 'remove', 'drop')) return { type: 'CANCEL_EVENT', confidence: 0.85, entities: { title: text }, originalText: text, constraints: [] };
    if (includes('schedule', 'plan', 'block', 'time for', 'find time')) return { type: 'SCHEDULE_TASK', confidence: 0.85, entities: { title: text }, originalText: text, constraints: [] };
    if (includes('conflict', 'double-book', 'overlap')) return { type: 'CHECK_CONFLICTS', confidence: 0.9, entities: { title: text }, originalText: text, constraints: [] };
    if (includes('available', 'availability', 'free', 'when', 'slot')) return { type: 'QUERY_AVAILABILITY', confidence: 0.9, entities: { title: text }, originalText: text, constraints: [] };
    if (includes('recommend', 'priority', 'suggest') || maybeDate.test(lower)) return { type: 'GET_RECOMMENDATIONS', confidence: 0.7, entities: { title: text }, originalText: text, constraints: [] };

    return { type: 'CREATE_TASK', confidence: 0.5, entities: { title: text }, originalText: text, constraints: [] };
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
  "type": "<one of CREATE_GOAL, CREATE_TASK, CREATE_EVENT, SCHEDULE_TASK, RESCHEDULE_EVENT, CANCEL_EVENT, QUERY_AVAILABILITY, CHECK_CONFLICTS, GET_RECOMMENDATIONS>",
  "confidence": <0.0-1.0 confidence score>,
  "entities": {
    "title": "<extracted title>",
    "description": "<extracted description, if any>",
    "startDate": "<ISO date string if mentioned>",
    "endDate": "<ISO date string if mentioned>",
    "duration": "<duration in minutes if mentioned>",
    "priority": "<priority level if implied>"
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

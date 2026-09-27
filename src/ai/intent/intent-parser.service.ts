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

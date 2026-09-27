import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import { ParsedIntent } from '../intent/interfaces/intent.interface';

export interface Plan {
  planId: string;
  goalTitle: string;
  description?: string;
  tasks: PlannedTask[];
  constraints: string[];
  confidence: number;
  reasoning: string;
}

export interface PlannedTask {
  title: string;
  description?: string;
  estimatedDurationMinutes: number;
  priority: number;
  dependencies: string[];
}

@Injectable()
export class PlanningEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService
  ) {}

  async createPlanFromIntent(userId: string, intent: ParsedIntent): Promise<Plan> {
    const userContext = await this.getUserContext(userId);

    const prompt = this.buildPlanningPrompt(intent, userContext);

    const aiResponse = await this.aiProvider.generateStructured(prompt, {
      temperature: 0.4,
      maxTokens: 3000,
    });

    return {
      planId: `plan_${Date.now()}`,
      goalTitle: intent.entities.title || 'New Plan',
      description: intent.entities.description,
      tasks: aiResponse.tasks,
      constraints: intent.constraints || [],
      confidence: aiResponse.confidence,
      reasoning: aiResponse.reasoning,
    };
  }

  async decomposeGoal(userId: string, goalId: string): Promise<Plan> {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
    });

    if (!goal) {
      throw new Error('Goal not found');
    }

    const userContext = await this.getUserContext(userId);

    const prompt = this.buildDecompositionPrompt(goal, userContext);

    const aiResponse = await this.aiProvider.generateStructured(prompt, {
      temperature: 0.4,
      maxTokens: 3000,
    });

    return {
      planId: `plan_${Date.now()}`,
      goalTitle: goal.title,
      description: goal.description || undefined,
      tasks: aiResponse.tasks,
      constraints: [],
      confidence: aiResponse.confidence,
      reasoning: aiResponse.reasoning,
    };
  }

  private buildPlanningPrompt(intent: ParsedIntent, context: any): string {
    return `
You are CalAssist's planning engine. Your job is to create structured plans from user intents.

Intent Type: ${intent.type}
Intent Entities: ${JSON.stringify(intent.entities)}
Constraints: ${JSON.stringify(intent.constraints)}

User Context:
- Working hours: ${context.workingHours || '9am - 5pm'}
- Today is: ${context.currentDate || new Date().toISOString()}

Please generate a plan with detailed tasks. Respond with valid JSON:
{
  "tasks": [
    {
      "title": "<task title>",
      "description": "<task description>",
      "estimatedDurationMinutes": <number>,
      "priority": <number 1-10>,
      "dependencies": ["<dependency task title>"]
    }
  ],
  "confidence": <0.0-1.0>,
  "reasoning": "<explanation of the plan>"
}
    `;
  }

  private buildDecompositionPrompt(goal: any, context: any): string {
    return `
You are CalAssist's planning engine. Your job is to decompose goals into actionable tasks.

Goal: ${goal.title}
Description: ${goal.description || 'N/A'}
Priority: ${goal.priority}
StartDate: ${goal.startDate || 'N/A'}
TargetDate: ${goal.targetDate || 'N/A'}

User Context:
- Working hours: ${context.workingHours || '9am - 5pm'}
- Today is: ${context.currentDate || new Date().toISOString()}

Please decompose this goal into concrete tasks. Each task should have estimated duration, priority, and any dependencies. Respond with valid JSON:
{
  "tasks": [
    {
      "title": "<task title>",
      "description": "<task description>",
      "estimatedDurationMinutes": <number>,
      "priority": <number 1-10>,
      "dependencies": ["<dependency task title>"]
    }
  ],
  "confidence": <0.0-1.0>,
  "reasoning": "<explanation of the decomposition>"
}
    `;
  }

  private async getUserContext(userId: string): Promise<any> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      include: {
        preferences: true,
      },
    });

    return {
      workingHours: user?.preferences.find((p) => p.key === 'working_hours')?.valueJson,
      currentDate: new Date().toISOString(),
    };
  }
}

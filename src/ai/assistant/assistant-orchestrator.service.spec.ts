import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import { PrismaService } from '../../common/services/prisma.service';
import { IntentParserService } from '../intent/intent-parser.service';
import { ParsedIntent } from '../intent/interfaces/intent.interface';
import { IntentAction } from './interfaces/assistant-tools.interface';
import { ToolRegistry } from './tool-registry.service';
import { AssistantOrchestratorService } from './assistant-orchestrator.service';

describe('AssistantOrchestratorService parsed tool payloads', () => {
  const registry = { getTool: jest.fn(() => undefined) } as unknown as ToolRegistry;
  const service = new AssistantOrchestratorService(
    {} as PrismaService,
    {} as AiProviderService,
    {} as IntentParserService,
    registry
  );

  const action = (toolName: string): IntentAction => ({
    toolName,
    input: {},
    reasoning: 'test action',
    confidence: 0.9,
    requiresConfirmation: false,
    confirmationLevel: 'NONE',
  });

  it.each([
    [
      'CREATE_TASK',
      'create_task',
      {
        durationMinutes: 45,
        dueDate: '2026-10-02T09:00:00.000Z',
        priority: 8,
        startDate: '2026-09-28T15:00:00.000Z',
      },
      {
        estimatedDurationMinutes: 45,
        dueDate: '2026-10-02T09:00:00.000Z',
        priority: 8,
        startDate: '2026-09-28T15:00:00.000Z',
      },
    ],
    [
      'CREATE_EVENT',
      'create_event',
      {
        endDate: '2026-09-28T15:45:00.000Z',
        startDate: '2026-09-28T15:00:00.000Z',
      },
      {
        endDate: '2026-09-28T15:45:00.000Z',
        startDate: '2026-09-28T15:00:00.000Z',
      },
    ],
    [
      'CREATE_GOAL',
      'create_goal',
      { dueDate: '2026-10-02T09:00:00.000Z', priority: 8 },
      { targetDate: '2026-10-02T09:00:00.000Z', priority: 8 },
    ],
    [
      'CREATE_PROJECT',
      'create_project',
      { dueDate: '2026-10-02T09:00:00.000Z', priority: 8 },
      { dueDate: '2026-10-02T09:00:00.000Z', priority: 8 },
    ],
  ] as const)(
    'enriches %s action inputs with locally parsed fields',
    (type, toolName, entities, expected) => {
      const intent = {
        type,
        confidence: 0.9,
        entities: { title: 'Finish report', ...entities },
        originalText: 'Create a prioritized item',
      } as ParsedIntent;
      const [enriched] = service['enrichActionsWithParsedEntities'](intent, [action(toolName)]);

      expect(enriched.input).toMatchObject({ title: 'Finish report', ...expected });
    }
  );

  it('maps parsed entities into tool payloads when the AI provider is unavailable', () => {
    const intent: ParsedIntent = {
      type: 'CREATE_TASK',
      confidence: 0.9,
      entities: {
        title: 'Finish report',
        durationMinutes: 45,
        dueDate: '2026-10-02T09:00:00.000Z',
        priority: 8,
        startDate: '2026-09-28T15:00:00.000Z',
      },
      constraints: [],
      originalText: 'Create task Finish report tomorrow',
    };

    const [action] = service['mapIntentToActionsLocally'](intent);

    expect(action.toolName).toBe('create_task');
    expect(action.input).toMatchObject({
      title: 'Finish report',
      estimatedDurationMinutes: 45,
      dueDate: intent.entities.dueDate,
      priority: 8,
      startDate: intent.entities.startDate,
    });
  });

  it('preserves distinct task titles from a multi-task AI response', () => {
    const intent = {
      type: 'CREATE_TASK',
      confidence: 0.9,
      entities: { title: 'planning, designing, execution' },
      originalText: 'Create tasks for planning, designing, and execution',
    } as ParsedIntent;
    const actions = [action('create_task'), action('create_task'), action('create_task')].map(
      (item, index) => ({
        ...item,
        input: { title: ['Planning', 'Designing', 'Execution'][index] },
      })
    );

    const enriched = service['enrichActionsWithParsedEntities'](intent, actions);

    expect(enriched.map((item) => item.input.title)).toEqual([
      'Planning',
      'Designing',
      'Execution',
    ]);
  });

  it('maps schedule questions to explain_schedule rather than a write action', () => {
    const intent: ParsedIntent = {
      type: 'GET_RECOMMENDATIONS',
      confidence: 0.9,
      entities: { isQuery: true, startDate: '2026-09-28T09:00:00.000Z' },
      constraints: [],
      originalText: 'What do I have tomorrow?',
    };

    const [action] = service['mapIntentToActionsLocally'](intent);

    expect(action.toolName).toBe('explain_schedule');
    expect(action.input.date).toBe('2026-09-28T09:00:00.000Z');
  });
});

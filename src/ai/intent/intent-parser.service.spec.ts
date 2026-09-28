import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import { PrismaService } from '../../common/services/prisma.service';
import { IntentParserService } from './intent-parser.service';

describe('IntentParserService date/time integration', () => {
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    intent: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  const aiProvider = {
    generateStructured: jest.fn(),
  } as unknown as AiProviderService;
  const service = new IntentParserService(prisma, aiProvider);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('merges deterministic dates, duration, and priority over model entities', async () => {
    aiProvider.generateStructured = jest.fn().mockResolvedValue({
      type: 'CREATE_EVENT',
      confidence: 0.9,
      entities: { title: 'Create event team sync', priority: 2 },
      constraints: [],
    });

    const result = await service.parseIntent(
      'user-1',
      'Create event team sync tomorrow at 3pm for 45 minutes high priority'
    );

    expect(result.type).toBe('CREATE_EVENT');
    expect(result.entities.title).toBe('team sync');
    expect(result.entities.priority).toBe(8);
    expect(result.entities.durationMinutes).toBe(45);
    expect(Date.parse(result.entities.endDate) - Date.parse(result.entities.startDate)).toBe(
      45 * 60_000
    );
  });

  it('overrides a model write classification for a read-only date question', async () => {
    aiProvider.generateStructured = jest.fn().mockResolvedValue({
      type: 'CREATE_TASK',
      confidence: 0.9,
      entities: { title: 'what do I have tomorrow' },
      constraints: [],
    });

    const result = await service.parseIntent('user-1', 'What do I have tomorrow?');

    expect(result.type).toBe('GET_RECOMMENDATIONS');
    expect(result.entities.isQuery).toBe(true);
    expect(result.entities.startDate).toBeDefined();
  });

  it('includes parsed dates and priority in the local fallback when the provider fails', async () => {
    aiProvider.generateStructured = jest.fn().mockRejectedValue(new Error('provider unavailable'));

    const result = await service.parseIntent(
      'user-1',
      'Create task submit report due tomorrow urgent'
    );

    expect(result.type).toBe('CREATE_TASK');
    expect(result.entities.title).toBe('submit report');
    expect(result.entities.dueDate).toBeDefined();
    expect(result.entities.priority).toBe(8);
  });
});

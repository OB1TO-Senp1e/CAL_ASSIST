import { MemoryEngineService } from './memory-engine.service';
import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import { AiProviderError } from '../../integrations/ai-providers/ai-provider.error';
import { PrismaService } from '../../common/services/prisma.service';
import { MetricsService } from '../../metrics/metrics.service';

/**
 * Covers the degradation path added in Stage 5a: when embeddings are
 * unavailable, retrieval must still answer — and must say so — rather than
 * returning a confidently meaningless ranking.
 */
function memoryRow(
  id: string,
  content: string,
  createdAt: Date,
  embeddingVector: number[] | null = null
) {
  return {
    id,
    userId: 'user_1',
    content,
    description: null,
    category: 'PREFERENCE',
    importance: 0.5,
    status: 'ACTIVE',
    source: 'USER_INPUT',
    scope: 'PERSONAL',
    isUserEditable: true,
    isConfirmed: true,
    confirmedAt: createdAt,
    confirmedBy: null,
    tags: [],
    metadata: {},
    embedding: embeddingVector,
    createdAt,
    updatedAt: createdAt,
    expiresAt: null,
    lastAccessedAt: null,
    accessCount: 0,
  };
}

/**
 * `SearchMemoryInput` is the parsed zod output type, so the defaulted fields are
 * required at the call site even though the schema supplies them.
 */
function searchInput(overrides: { query?: string; limit?: number; offset?: number }) {
  return {
    query: overrides.query,
    limit: overrides.limit ?? 20,
    offset: overrides.offset ?? 0,
    confirmedOnly: false,
    userEditableOnly: false,
  };
}

function build(rows: ReturnType<typeof memoryRow>[], embed: jest.Mock) {
  const prisma = {
    memory: { findMany: jest.fn(async () => rows) },
  } as unknown as PrismaService;
  const aiProvider = { embed } as unknown as AiProviderService;
  const metrics = { recordMemoryRecencyFallback: jest.fn() } as unknown as MetricsService;
  const service = new MemoryEngineService(prisma, aiProvider, metrics);
  return { service, prisma, metrics };
}

describe('MemoryEngineService search degradation', () => {
  const rows = [
    memoryRow('m1', 'Prefers morning standups', new Date('2026-01-01'), [1, 0]),
    // Newest and keyword-matching, so the recency fallback must rank it first.
    memoryRow('m2', 'Standup moved to Thursday morning', new Date('2026-09-20'), [0, 1]),
    memoryRow('m3', 'Loves Italian food', new Date('2026-09-27'), [0, 1]),
  ];

  it('ranks by cosine similarity when embeddings work', async () => {
    const embed = jest.fn(async () => [1, 0]);
    const { service, metrics } = build(rows, embed);

    const results = await service.searchMemories(
      'user_1',
      searchInput({ query: 'standup', limit: 5 })
    );

    // m1 is the only memory with a vector aligned to the query embedding, so it
    // must rank first; the rest follow with a score of 0.
    expect(results[0].id).toBe('m1');
    expect(metrics.recordMemoryRecencyFallback).not.toHaveBeenCalled();
  });

  it('falls back to recency + keyword overlap when embed throws', async () => {
    const embed = jest.fn(async () => {
      throw new AiProviderError('OpenAI: down', {
        provider: 'OpenAI',
        kind: 'network',
        retryable: true,
      });
    });
    const { service, metrics } = build(rows, embed);

    const results = await service.searchMemories(
      'user_1',
      searchInput({ query: 'standup', limit: 5 })
    );

    // m2 matches "standup" and is newer than m1; m3 is newest of all but matches
    // nothing, so keyword overlap must outrank recency.
    expect(results.map((m) => m.id)).toEqual(['m2', 'm1', 'm3']);
    expect(metrics.recordMemoryRecencyFallback).toHaveBeenCalledWith('search');
  });

  it('falls back when the provider answers with an empty vector', async () => {
    const embed = jest.fn(async () => []);
    const { service, metrics } = build(rows, embed);

    const results = await service.searchMemories(
      'user_1',
      searchInput({ query: 'italian', limit: 5 })
    );

    expect(results[0].id).toBe('m3');
    expect(metrics.recordMemoryRecencyFallback).toHaveBeenCalledWith('search');
  });

  it('still scopes results to the requesting user during an outage', async () => {
    const embed = jest.fn(async () => {
      throw new AiProviderError('boom', { provider: 'OpenAI', kind: 'timeout', retryable: true });
    });
    const { service, prisma } = build(rows, embed);

    await service.searchMemories('user_1', searchInput({ query: 'standup', limit: 5 }));

    const where = (prisma.memory.findMany as jest.Mock).mock.calls.at(-1)![0].where;
    expect(where.userId).toBe('user_1');
    expect(where.status).toEqual({ not: 'DELETED' });
  });

  it('honours offset and limit on the fallback path', async () => {
    const embed = jest.fn(async () => {
      throw new AiProviderError('boom', { provider: 'OpenAI', kind: 'network', retryable: true });
    });
    const { service } = build(rows, embed);

    const results = await service.searchMemories(
      'user_1',
      searchInput({ query: 'standup', limit: 1, offset: 1 })
    );
    expect(results.map((m) => m.id)).toEqual(['m1']);
  });

  it('does not swallow a non-provider error', async () => {
    const embed = jest.fn(async () => {
      throw new Error('bug not outage');
    });
    const { service } = build(rows, embed);

    await expect(
      service.searchMemories('user_1', searchInput({ query: 'standup' }))
    ).rejects.toThrow('bug not outage');
  });

  it('keeps plain listing behaviour when no query is given', async () => {
    const embed = jest.fn(async () => [1, 0]);
    const { service, prisma } = build(rows, embed);

    const results = await service.searchMemories('user_1', searchInput({ limit: 10 }));

    expect(embed).not.toHaveBeenCalled();
    expect(results).toHaveLength(rows.length);
    // Ordered by recency at the database level, newest first.
    expect((prisma.memory.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('works without a MetricsService injected', async () => {
    const embed = jest.fn(async () => {
      throw new AiProviderError('boom', { provider: 'OpenAI', kind: 'network', retryable: true });
    });
    const prisma = {
      memory: { findMany: jest.fn(async () => rows) },
    } as unknown as PrismaService;
    const service = new MemoryEngineService(prisma, { embed } as unknown as AiProviderService);

    const results = await service.searchMemories(
      'user_1',
      searchInput({ query: 'standup', limit: 5 })
    );
    expect(results.length).toBeGreaterThan(0);
  });
});

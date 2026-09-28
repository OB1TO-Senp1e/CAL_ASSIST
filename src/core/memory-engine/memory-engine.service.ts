import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AiProviderService } from '../../integrations/ai-providers/ai-provider.service';
import { AiProviderError } from '../../integrations/ai-providers/ai-provider.error';
import { MetricsService } from '../../metrics/metrics.service';
import {
  MemoryType,
  MemorySource,
  MemoryStatus,
  MemoryScope,
  MemoryEntry,
  MemoryEntrySchema,
  CreateMemoryInput,
  CreateMemoryInputSchema,
  UpdateMemoryInput,
  UpdateMemoryInputSchema,
  SearchMemoryInput,
  SearchMemoryInputSchema,
  MemoryConflict,
  MemoryInsight,
  BulkMemoryAction,
  MemoryStats,
  MemoryExport,
} from './memory.types';

@Injectable()
export class MemoryEngineService {
  private readonly logger = new Logger(MemoryEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    // Optional so the service stays constructible in tests and scripts that do
    // not care about metrics; a missing MetricsService must not break retrieval.
    @Optional() private readonly metrics?: MetricsService
  ) {}

  async createMemory(userId: string, input: CreateMemoryInput): Promise<MemoryEntry> {
    const validated = CreateMemoryInputSchema.parse(input);

    const memory = await this.prisma.memory.create({
      data: {
        userId,
        content: validated.content,
        category: validated.type,
        importance: validated.confidence,
        source: validated.source,
        description: validated.description,
        metadata: validated.metadata,
        tags: validated.tags,
        scope: validated.scope,
        status: 'ACTIVE',
        isUserEditable: validated.isUserEditable,
        isConfirmed: validated.source === 'USER_INPUT',
        confirmedAt: validated.source === 'USER_INPUT' ? new Date() : null,
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : null,
      },
    });

    await this.checkAndDetectConflicts(userId, memory);

    return this.mapToMemoryEntry(memory);
  }

  async getMemory(userId: string, memoryId: string): Promise<MemoryEntry> {
    const memory = await this.prisma.memory.findFirst({
      where: { id: memoryId, userId },
    });

    if (!memory) {
      throw new NotFoundException(`Memory ${memoryId} not found`);
    }

    await this.prisma.memory.update({
      where: { id: memoryId },
      data: {
        lastAccessed: new Date(),
        accessCount: { increment: 1 },
      },
    });

    return this.mapToMemoryEntry(memory);
  }

  async updateMemory(userId: string, input: UpdateMemoryInput): Promise<MemoryEntry> {
    const validated = UpdateMemoryInputSchema.parse(input);
    const { id, ...updateData } = validated;

    const existing = await this.prisma.memory.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException(`Memory ${id} not found`);
    }

    if (!existing.isUserEditable && updateData.content) {
      throw new ConflictException('This memory is not user-editable');
    }

    const memory = await this.prisma.memory.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    if (updateData.content || updateData.confidence || updateData.scope) {
      await this.checkAndDetectConflicts(userId, memory);
    }

    return this.mapToMemoryEntry(memory);
  }

  async deleteMemory(userId: string, memoryId: string, permanent = false): Promise<void> {
    const memory = await this.prisma.memory.findFirst({
      where: { id: memoryId, userId },
    });

    if (!memory) {
      throw new NotFoundException(`Memory ${memoryId} not found`);
    }

    if (permanent) {
      await this.prisma.memory.delete({ where: { id: memoryId } });
    } else {
      await this.prisma.memory.update({
        where: { id: memoryId },
        data: { status: 'DELETED' },
      });
    }

    await this.prisma.memoryConflict.updateMany({
      where: { OR: [{ memoryId1: memoryId }, { memoryId2: memoryId }] },
      data: { resolvedAt: new Date(), resolution: 'DELETE_BOTH' },
    });
  }

  async bulkAction(userId: string, action: BulkMemoryAction): Promise<{ affected: number }> {
    const validated = action;

    const memories = await this.prisma.memory.findMany({
      where: { id: { in: validated.memoryIds }, userId },
    });

    if (memories.length !== validated.memoryIds.length) {
      throw new BadRequestException('Some memories not found or access denied');
    }

    let affected = 0;

    switch (validated.action) {
      case 'DELETE':
        await this.prisma.memory.updateMany({
          where: { id: { in: validated.memoryIds }, userId },
          data: { status: 'DELETED' },
        });
        affected = memories.length;
        break;

      case 'ARCHIVE':
        await this.prisma.memory.updateMany({
          where: { id: { in: validated.memoryIds }, userId },
          data: { status: 'ARCHIVED' },
        });
        affected = memories.length;
        break;

      case 'CONFIRM':
        await this.prisma.memory.updateMany({
          where: { id: { in: validated.memoryIds }, userId },
          data: { isConfirmed: true, confirmedAt: new Date(), status: 'ACTIVE' },
        });
        affected = memories.length;
        break;

      case 'UPDATE_CONFIDENCE':
        if (validated.data?.confidence !== undefined) {
          await this.prisma.memory.updateMany({
            where: { id: { in: validated.memoryIds }, userId },
            data: { importance: validated.data.confidence },
          });
          affected = memories.length;
        }
        break;

      case 'UPDATE_SCOPE':
        if (validated.data?.scope) {
          await this.prisma.memory.updateMany({
            where: { id: { in: validated.memoryIds }, userId },
            data: { scope: validated.data.scope },
          });
          affected = memories.length;
        }
        break;
    }

    return { affected };
  }

  async searchMemories(userId: string, input: SearchMemoryInput): Promise<MemoryEntry[]> {
    const validated = SearchMemoryInputSchema.parse(input);

    const where: any = { userId };

    if (validated.types && validated.types.length > 0) {
      where.category = { in: validated.types };
    }

    if (validated.sources && validated.sources.length > 0) {
      where.source = { in: validated.sources };
    }

    if (validated.scopes && validated.scopes.length > 0) {
      where.scope = { in: validated.scopes };
    }

    if (validated.statuses && validated.statuses.length > 0) {
      where.status = { in: validated.statuses };
    } else {
      where.status = { not: 'DELETED' };
    }

    if (validated.confirmedOnly) {
      where.isConfirmed = true;
    }

    if (validated.userEditableOnly) {
      where.isUserEditable = true;
    }

    if (validated.tags && validated.tags.length > 0) {
      where.tags = { hasSome: validated.tags };
    }

    if (validated.query) {
      return this.searchByQuery(where, validated);
    }

    const memories = await this.prisma.memory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: validated.offset,
      take: validated.limit,
    });

    return memories.map((m) => this.mapToMemoryEntry(m));
  }

  /**
   * Semantic search with an explicit degradation path.
   *
   * `AiProviderService.embed()` no longer returns `[]` on failure, so a provider
   * outage now reaches us as a thrown `AiProviderError`. That matters because of
   * `cosineSimilarity()`: it returns 0 whenever either vector is empty, so the
   * old `embed() -> [] -> score everything 0 -> sort` path silently answered a
   * total embedding outage with "these are your most relevant memories, in
   * whatever order the sort happened to produce". Both a real score of 0 and an
   * outage looked like a legitimate ranking.
   *
   * On failure we fall back to recency + keyword overlap, which is a genuinely
   * weaker answer but an honest one, and it is counted as a fallback so the
   * outage is visible in metrics instead of disguised as low relevance.
   */
  private async searchByQuery(
    where: any,
    validated: { query?: string; offset: number; limit: number }
  ): Promise<MemoryEntry[]> {
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.aiProvider.embed(validated.query as string);
    } catch (error) {
      if (!AiProviderError.is(error)) throw error;
      this.logger.warn(
        `Embedding unavailable for memory search (${error.kind}); using recency fallback`
      );
      this.metrics?.recordMemoryRecencyFallback('search');
      return this.searchByRecency(where, validated);
    }

    if (!queryEmbedding.length) {
      this.metrics?.recordMemoryRecencyFallback('search');
      return this.searchByRecency(where, validated);
    }

    const memories = await this.prisma.memory.findMany({ where });
    const scored = memories.map((m) => ({
      ...m,
      score: this.cosineSimilarity((m.embedding as number[]) || [], queryEmbedding),
    }));
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(validated.offset, validated.offset + validated.limit)
      .map((m) => this.mapToMemoryEntry(m));
  }

  /**
   * Degraded retrieval: newest first, with keyword overlap as a tie-breaker.
   *
   * Keyword overlap is deliberately crude (substring hits, no stemming) — it is a
   * stopgap for the duration of an embedding outage, not a replacement for
   * semantic search. Sorting purely by recency would surface a 2-year-old
   * irrelevant memory over yesterday's answer to the same question whenever the
   * query text matched.
   */
  private async searchByRecency(
    where: any,
    validated: { query?: string; offset: number; limit: number }
  ): Promise<MemoryEntry[]> {
    // `where` already carries the userId scope, so this path cannot widen access
    // to another user's memories during an embedding outage.
    const memories = await this.prisma.memory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const terms = (validated.query ?? '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length > 2);

    const scored = memories.map((m) => {
      const haystack = `${m.content ?? ''} ${m.description ?? ''} ${(m.tags ?? []).join(' ')}`.toLowerCase();
      const overlaps = terms.reduce((count, term) => (haystack.includes(term) ? count + 1 : count), 0);
      return { memory: m, overlaps, createdAt: m.createdAt.getTime() };
    });

    return scored
      .sort((a, b) => b.overlaps - a.overlaps || b.createdAt - a.createdAt)
      .slice(validated.offset, validated.offset + validated.limit)
      .map((m) => this.mapToMemoryEntry(m.memory));
  }

  async getMemoryStats(userId: string): Promise<MemoryStats> {
    const memories = await this.prisma.memory.findMany({
      where: { userId, status: { not: 'DELETED' } },
    });

    const conflicts = await this.prisma.memoryConflict.findMany({
      where: {
        OR: [
          { memoryId1: { in: memories.map((m) => m.id) } },
          { memoryId2: { in: memories.map((m) => m.id) } },
        ],
        resolvedAt: null,
      },
    });

    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byScope: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    let confirmedCount = 0;
    let userEditableCount = 0;
    let totalConfidence = 0;

    for (const m of memories) {
      byType[m.category] = (byType[m.category] || 0) + 1;
      bySource[m.source] = (bySource[m.source] || 0) + 1;
      byScope[m.scope] = (byScope[m.scope] || 0) + 1;
      byStatus[m.status] = (byStatus[m.status] || 0) + 1;

      if (m.isConfirmed) confirmedCount++;
      if (m.isUserEditable) userEditableCount++;
      totalConfidence += m.importance;
    }

    const sorted = [...memories].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return {
      total: memories.length,
      byType,
      bySource,
      byScope,
      byStatus,
      confirmedCount,
      userEditableCount,
      averageConfidence: memories.length > 0 ? totalConfidence / memories.length : 0,
      conflictsCount: conflicts.length,
      oldestMemory: sorted[0]?.createdAt.toISOString() || null,
      newestMemory: sorted[sorted.length - 1]?.createdAt.toISOString() || null,
    };
  }

  async getConflicts(userId: string): Promise<MemoryConflict[]> {
    const memories = await this.prisma.memory.findMany({
      where: { userId },
      select: { id: true },
    });

    const conflicts = await this.prisma.memoryConflict.findMany({
      where: {
        OR: [
          { memoryId1: { in: memories.map((m) => m.id) } },
          { memoryId2: { in: memories.map((m) => m.id) } },
        ],
      },
      orderBy: { detectedAt: 'desc' },
    });

    return conflicts.map((c) => ({
      id: c.id,
      memoryId1: c.memoryId1,
      memoryId2: c.memoryId2,
      type: c.type as 'CONTRADICTION' | 'DUPLICATE' | 'OUTDATED' | 'SCOPE_OVERLAP',
      description: c.description,
      severity: c.severity as 'LOW' | 'MEDIUM' | 'HIGH',
      detectedAt: c.detectedAt.toISOString(),
      resolvedAt: c.resolvedAt?.toISOString() || null,
      resolution: c.resolution as 'KEEP_FIRST' | 'KEEP_SECOND' | 'MERGE' | 'DELETE_BOTH' | 'MANUAL' | undefined,
    }));
  }

  async resolveConflict(
    userId: string,
    conflictId: string,
    resolution: 'KEEP_FIRST' | 'KEEP_SECOND' | 'MERGE' | 'DELETE_BOTH' | 'MANUAL'
  ): Promise<void> {
    const conflict = await this.prisma.memoryConflict.findFirst({
      where: { id: conflictId },
      include: { memory1: true, memory2: true },
    });

    if (!conflict) {
      throw new NotFoundException(`Conflict ${conflictId} not found`);
    }

    if (conflict.memory1.userId !== userId || conflict.memory2.userId !== userId) {
      throw new ConflictException('Cannot resolve conflict for another user');
    }

    switch (resolution) {
      case 'KEEP_FIRST':
        await this.prisma.memory.update({
          where: { id: conflict.memoryId2 },
          data: { status: 'DELETED' },
        });
        break;
      case 'KEEP_SECOND':
        await this.prisma.memory.update({
          where: { id: conflict.memoryId1 },
          data: { status: 'DELETED' },
        });
        break;
      case 'DELETE_BOTH':
        await this.prisma.memory.updateMany({
          where: { id: { in: [conflict.memoryId1, conflict.memoryId2] } },
          data: { status: 'DELETED' },
        });
        break;
      case 'MERGE':
        await this.mergeMemories(userId, conflict.memoryId1, conflict.memoryId2);
        break;
    }

    await this.prisma.memoryConflict.update({
      where: { id: conflictId },
      data: { resolvedAt: new Date(), resolution },
    });
  }

  async exportMemories(userId: string): Promise<MemoryExport> {
    const memories = await this.prisma.memory.findMany({
      where: { userId, status: { not: 'DELETED' } },
    });

    const conflicts = await this.getConflicts(userId);

    const insights = await this.generateInsights(userId);

    return {
      memories: memories.map((m) => this.mapToMemoryEntry(m)),
      conflicts,
      insights,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
  }

  async importMemories(
    userId: string,
    exportData: MemoryExport,
    overwrite = false
  ): Promise<{ imported: number; conflicts: number }> {
    let imported = 0;
    let conflicts = 0;

    for (const mem of exportData.memories) {
      const existing = await this.prisma.memory.findFirst({
        where: { userId, content: mem.content, category: mem.type },
      });

      if (existing && !overwrite) {
        conflicts++;
        continue;
      }

      if (existing && overwrite) {
        await this.prisma.memory.update({
          where: { id: existing.id },
          data: {
            content: mem.content,
            description: mem.description,
            category: mem.type,
            source: mem.source,
            scope: mem.scope,
            status: mem.status,
            importance: mem.confidence,
            metadata: mem.metadata,
            tags: mem.tags,
            isUserEditable: mem.isUserEditable,
            isConfirmed: mem.isConfirmed,
            confirmedAt: mem.confirmedAt ? new Date(mem.confirmedAt) : null,
            expiresAt: mem.expiresAt ? new Date(mem.expiresAt) : null,
          },
        });
      } else {
        await this.prisma.memory.create({
          data: {
            userId,
            content: mem.content,
            description: mem.description,
            category: mem.type,
            source: mem.source,
            scope: mem.scope,
            status: mem.status,
            importance: mem.confidence,
            metadata: mem.metadata,
            tags: mem.tags,
            isUserEditable: mem.isUserEditable,
            isConfirmed: mem.isConfirmed,
            confirmedAt: mem.confirmedAt ? new Date(mem.confirmedAt) : null,
            expiresAt: mem.expiresAt ? new Date(mem.expiresAt) : null,
          },
        });
      }
      imported++;
    }

    return { imported, conflicts };
  }

  private async checkAndDetectConflicts(userId: string, newMemory: any): Promise<void> {
    const existingMemories = await this.prisma.memory.findMany({
      where: {
        userId,
        id: { not: newMemory.id },
        status: { not: 'DELETED' },
        OR: [{ scope: newMemory.scope }, { tags: { hasSome: newMemory.tags } }],
      },
    });

    for (const existing of existingMemories) {
      const conflict = await this.detectConflict(newMemory, existing);
      if (conflict) {
        await this.prisma.memoryConflict
          .create({
            data: {
              userId,
              memoryId1: newMemory.id,
              memoryId2: existing.id,
              type: conflict.type as any,
              description: conflict.description,
              severity: conflict.severity as any,
            },
          })
          .catch(() => {});
      }
    }
  }

  private async detectConflict(
    newMem: any,
    existing: any
  ): Promise<{ type: string; description: string; severity: string } | null> {
    const prompt = `
Compare these two memories for conflicts:

Memory 1 (new): ${JSON.stringify(newMem)}
Memory 2 (existing): ${JSON.stringify(existing)}

Identify if they conflict. Types:
- CONTRADICTION: Directly contradictory information
- DUPLICATE: Same information stored twice
- OUTDATED: One supersedes the other
- SCOPE_OVERLAP: Overlapping scope with different values

Return JSON:
{
  "hasConflict": boolean,
  "type": "CONTRADICTION|DUPLICATE|OUTDATED|SCOPE_OVERLAP|null",
  "description": "string",
  "severity": "LOW|MEDIUM|HIGH"
}`;

    try {
      const response = await this.aiProvider.generateStructured(prompt, {
        temperature: 0.2,
        maxTokens: 500,
      });

      if (response.hasConflict && response.type) {
        return {
          type: response.type,
          description: response.description,
          severity: response.severity || 'MEDIUM',
        };
      }
    } catch (e) {
      this.logger.warn(`Conflict detection failed: ${e}`);
    }

    return null;
  }

  private async mergeMemories(userId: string, id1: string, id2: string): Promise<void> {
    const [mem1, mem2] = await Promise.all([
      this.prisma.memory.findUnique({ where: { id: id1 } }),
      this.prisma.memory.findUnique({ where: { id: id2 } }),
    ]);

    if (!mem1 || !mem2) return;

    const mergedContent = `${mem1.content}\n\n--- Merged with ---\n\n${mem2.content}`;
    const mergedMetadata = { ...(mem1.metadata as object), ...(mem2.metadata as object) };
    const mergedTags = [...new Set([...(mem1.tags || []), ...(mem2.tags || [])])];

    await this.prisma.memory.update({
      where: { id: id1 },
      data: {
        content: mergedContent,
        metadata: mergedMetadata,
        tags: mergedTags,
        importance: Math.max(mem1.importance, mem2.importance),
      },
    });

    await this.prisma.memory.update({
      where: { id: id2 },
      data: { status: 'DELETED' },
    });
  }

  private async generateInsights(userId: string): Promise<MemoryInsight[]> {
    const memories = await this.prisma.memory.findMany({
      where: { userId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const insights: MemoryInsight[] = [];

    const typeCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};

    for (const m of memories) {
      typeCounts[m.category] = (typeCounts[m.category] || 0) + 1;
      sourceCounts[m.source] = (sourceCounts[m.source] || 0) + 1;
    }

    const mostCommonType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
    if (mostCommonType && mostCommonType[1] > 5) {
      insights.push({
        id: `insight_${Date.now()}_1`,
        userId,
        type: 'PATTERN',
        title: `Dominant memory type: ${mostCommonType[0]}`,
        description: `You have ${mostCommonType[1]} memories of type ${mostCommonType[0]}. Consider diversifying memory types for better coverage.`,
        relatedMemoryIds: memories
          .filter((m) => m.category === mostCommonType[0])
          .slice(0, 10)
          .map((m) => m.id),
        confidence: 0.8,
        actionable: true,
        suggestedAction: 'Review and categorize memories',
        createdAt: new Date().toISOString(),
        acknowledgedAt: null,
      });
    }

    const aiInferences = memories.filter((m) => m.source === 'AI_INFERENCE' && !m.isConfirmed);
    if (aiInferences.length > 10) {
      insights.push({
        id: `insight_${Date.now()}_2`,
        userId,
        type: 'SUGGESTION',
        title: 'Many unconfirmed AI inferences',
        description: `You have ${aiInferences.length} AI-inferred memories that are not confirmed. Review and confirm or delete them.`,
        relatedMemoryIds: aiInferences.slice(0, 10).map((m) => m.id),
        confidence: 0.9,
        actionable: true,
        suggestedAction: 'Review unconfirmed memories',
        createdAt: new Date().toISOString(),
        acknowledgedAt: null,
      });
    }

    const expiredMemories = memories.filter(
      (m) => m.expiresAt && new Date(m.expiresAt) < new Date()
    );
    if (expiredMemories.length > 0) {
      insights.push({
        id: `insight_${Date.now()}_3`,
        userId,
        type: 'ANOMALY',
        title: 'Expired memories detected',
        description: `${expiredMemories.length} memories have expired. Consider cleaning them up.`,
        relatedMemoryIds: expiredMemories.map((m) => m.id),
        confidence: 1.0,
        actionable: true,
        suggestedAction: 'Delete or extend expired memories',
        createdAt: new Date().toISOString(),
        acknowledgedAt: null,
      });
    }

    return insights;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  private mapToMemoryEntry(memory: any): MemoryEntry {
    return {
      id: memory.id,
      userId: memory.userId,
      type: memory.category,
      source: memory.source,
      scope: memory.scope,
      content: memory.content,
      description: memory.description || undefined,
      confidence: memory.importance,
      status: memory.status,
      isUserEditable: memory.isUserEditable,
      isConfirmed: memory.isConfirmed,
      confirmedAt: memory.confirmedAt?.toISOString() || null,
      confirmedBy: memory.confirmedBy || null,
      tags: memory.tags || [],
      metadata: memory.metadata || {},
      createdAt: memory.createdAt.toISOString(),
      updatedAt: memory.updatedAt.toISOString(),
      expiresAt: memory.expiresAt?.toISOString() || null,
      lastAccessedAt: memory.lastAccessedAt?.toISOString() || null,
      accessCount: memory.accessCount || 0,
    };
  }
}

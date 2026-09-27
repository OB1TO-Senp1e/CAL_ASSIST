import { z } from 'zod';

export const MemoryTypeSchema = z.enum([
  'EXPLICIT_PREFERENCE',
  'EXPLICIT_FACT',
  'USER_RULE',
  'LEARNED_PATTERN',
  'TEMPORARY_CONTEXT',
]);

export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemorySourceSchema = z.enum([
  'USER_INPUT',
  'AI_INFERENCE',
  'SYSTEM_OBSERVATION',
  'EXTERNAL_SYNC',
  'IMPORTED',
]);

export type MemorySource = z.infer<typeof MemorySourceSchema>;

export const MemoryStatusSchema = z.enum([
  'ACTIVE',
  'DEPRECATED',
  'CONFLICTING',
  'ARCHIVED',
  'DELETED',
]);

export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;

export const MemoryScopeSchema = z.enum([
  'GLOBAL',
  'SCHEDULING',
  'TASKS',
  'MEETINGS',
  'FOCUS_TIME',
  'BREAKS',
  'TRAVEL',
  'WORK_HOURS',
  'PERSONAL',
]);

export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const MemoryEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: MemoryTypeSchema,
  source: MemorySourceSchema,
  scope: MemoryScopeSchema,
  content: z.string(),
  description: z.string().optional(),
  confidence: z.number().min(0).max(1),
  status: MemoryStatusSchema,
  isUserEditable: z.boolean().default(true),
  isConfirmed: z.boolean().default(false),
  confirmedAt: z.string().datetime().optional().nullable(),
  confirmedBy: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.any()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional().nullable(),
  lastAccessedAt: z.string().datetime().optional().nullable(),
  accessCount: z.number().int().nonnegative().default(0),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const CreateMemoryInputSchema = z.object({
  type: MemoryTypeSchema,
  source: MemorySourceSchema,
  scope: MemoryScopeSchema,
  content: z.string().min(1).max(2000),
  description: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  isUserEditable: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.any()).default({}),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type CreateMemoryInput = z.infer<typeof CreateMemoryInputSchema>;

export const UpdateMemoryInputSchema = z.object({
  id: z.string(),
  content: z.string().min(1).max(2000).optional(),
  description: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1).optional(),
  status: MemoryStatusSchema.optional(),
  scope: MemoryScopeSchema.optional(),
  isUserEditable: z.boolean().optional(),
  isConfirmed: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type UpdateMemoryInput = z.infer<typeof UpdateMemoryInputSchema>;

export const SearchMemoryInputSchema = z.object({
  query: z.string().optional(),
  types: z.array(MemoryTypeSchema).optional(),
  sources: z.array(MemorySourceSchema).optional(),
  scopes: z.array(MemoryScopeSchema).optional(),
  statuses: z.array(MemoryStatusSchema).optional(),
  tags: z.array(z.string()).optional(),
  confirmedOnly: z.boolean().default(false),
  userEditableOnly: z.boolean().default(false),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().nonnegative().default(0),
});

export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>;

export const MemoryConflictSchema = z.object({
  id: z.string(),
  memoryId1: z.string(),
  memoryId2: z.string(),
  type: z.enum(['CONTRADICTION', 'DUPLICATE', 'OUTDATED', 'SCOPE_OVERLAP']),
  description: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  detectedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional().nullable(),
  resolution: z.enum(['KEEP_FIRST', 'KEEP_SECOND', 'MERGE', 'DELETE_BOTH', 'MANUAL']).optional(),
});

export type MemoryConflict = z.infer<typeof MemoryConflictSchema>;

export const MemoryInsightSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(['PATTERN', 'ANOMALY', 'SUGGESTION', 'CONFLICT']),
  title: z.string(),
  description: z.string(),
  relatedMemoryIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  actionable: z.boolean(),
  suggestedAction: z.string().optional(),
  createdAt: z.string().datetime(),
  acknowledgedAt: z.string().datetime().optional().nullable(),
});

export type MemoryInsight = z.infer<typeof MemoryInsightSchema>;

export const BulkMemoryActionSchema = z.object({
  action: z.enum(['DELETE', 'ARCHIVE', 'CONFIRM', 'UPDATE_CONFIDENCE', 'UPDATE_SCOPE']),
  memoryIds: z.array(z.string()),
  data: z.record(z.any()).optional(),
});

export type BulkMemoryAction = z.infer<typeof BulkMemoryActionSchema>;

export const MemoryStatsSchema = z.object({
  total: z.number(),
  byType: z.record(z.number()),
  bySource: z.record(z.number()),
  byScope: z.record(z.number()),
  byStatus: z.record(z.number()),
  confirmedCount: z.number(),
  userEditableCount: z.number(),
  averageConfidence: z.number(),
  conflictsCount: z.number(),
  oldestMemory: z.string().datetime().optional().nullable(),
  newestMemory: z.string().datetime().optional().nullable(),
});

export type MemoryStats = z.infer<typeof MemoryStatsSchema>;

export const MemoryExportSchema = z.object({
  memories: z.array(MemoryEntrySchema),
  conflicts: z.array(MemoryConflictSchema),
  insights: z.array(MemoryInsightSchema),
  exportedAt: z.string().datetime(),
  version: z.string(),
});

export type MemoryExport = z.infer<typeof MemoryExportSchema>;

import { z } from 'zod';

export const CommitmentSourceSchema = z.enum([
  'USER_INPUT',
  'AI_INFERRED',
  'EMAIL_EXTRACTED',
]);

export type CommitmentSource = z.infer<typeof CommitmentSourceSchema>;

export const CommitmentStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'OVERDUE',
  'CANCELLED',
]);

export type CommitmentStatus = z.infer<typeof CommitmentStatusSchema>;

/**
 * The extraction prompt already instructs the model to report < 0.5 for
 * vague/inferred commitments, so this is the point where "vague" turns into a
 * risk the user has to resolve before the scheduler relies on it.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export const ReminderPolicySchema = z.object({
  enabled: z.boolean().default(true),
  intervals: z.array(z.number().int().positive()).default([1440, 60, 15]),
  channels: z.array(z.enum(['EMAIL', 'PUSH', 'SMS', 'IN_APP'])).default(['IN_APP']),
  customMessage: z.string().optional(),
});

export type ReminderPolicy = z.infer<typeof ReminderPolicySchema>;

/**
 * What a commitment is promised *against*. Kept as a loose string union rather
 * than a Prisma enum because the linked row is not a foreign key — the entity
 * may be a task, project, meeting or something outside the schema entirely.
 */
export const CommitmentRelatedEntityTypeSchema = z.enum([
  'TASK',
  'PROJECT',
  'MEETING',
  'GOAL',
  'EVENT',
]);

export type CommitmentRelatedEntityType = z.infer<
  typeof CommitmentRelatedEntityTypeSchema
>;

export const CommitmentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  object: z.string(),
  description: z.string().optional(),
  deadline: z.string().datetime(),
  status: CommitmentStatusSchema,
  source: CommitmentSourceSchema,
  /** Who the commitment was made to — 'I promised Sam…'. */
  person: z.string().optional(),
  personEmail: z.string().optional(),
  /** Extraction confidence, 0..1. Absent for hand-entered commitments. */
  confidence: z.number().min(0).max(1).optional(),
  /** Verbatim snippet the commitment was extracted from, for user review. */
  context: z.string().optional(),
  relatedEntityType: CommitmentRelatedEntityTypeSchema.optional(),
  relatedEntityId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Commitment = z.infer<typeof CommitmentSchema>;

export const CreateCommitmentInputSchema = z.object({
  object: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  deadline: z.string().datetime(),
  source: CommitmentSourceSchema.default('USER_INPUT'),
  person: z.string().max(200).optional(),
  personEmail: z.string().email().optional(),
  confidence: z.number().min(0).max(1).optional(),
  context: z.string().max(2000).optional(),
  relatedEntityType: CommitmentRelatedEntityTypeSchema.optional(),
  relatedEntityId: z.string().max(64).optional(),
}).strict();

export type CreateCommitmentInput = z.infer<typeof CreateCommitmentInputSchema>;

export const UpdateCommitmentInputSchema = z.object({
  id: z.string(),
  object: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  deadline: z.string().datetime().optional(),
  status: CommitmentStatusSchema.optional(),
  person: z.string().max(200).optional(),
  personEmail: z.string().email().optional(),
  confidence: z.number().min(0).max(1).optional(),
  context: z.string().max(2000).optional(),
  relatedEntityType: CommitmentRelatedEntityTypeSchema.optional(),
  relatedEntityId: z.string().max(64).optional(),
}).strict();

export type UpdateCommitmentInput = z.infer<typeof UpdateCommitmentInputSchema>;

export const CommitmentRiskSchema = z.object({
  commitmentId: z.string(),
  riskLevel: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  riskFactors: z.array(z.enum([
    'NO_TIME_ALLOCATED',
    'DEADLINE_APPROACHING',
    'OVERDUE',
    'CONFLICTING_COMMITMENT',
    'DEPENDENCY_BLOCKING',
    'LOW_CONFIDENCE',
    'REPEATEDLY_POSTPONED',
    'MISSING_PREPARATION',
  ])),
  details: z.string(),
  recommendation: z.string(),
  suggestedActions: z.array(z.object({
    type: z.enum(['ALLOCATE_TIME', 'RESCHEDULE', 'DELEGATE', 'CANCEL', 'ESCALATE']),
    description: z.string(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  })),
  assessedAt: z.string().datetime(),
});

export type CommitmentRisk = z.infer<typeof CommitmentRiskSchema>;

export const SearchCommitmentsInputSchema = z.object({
  statuses: z.array(CommitmentStatusSchema).optional(),
  sources: z.array(CommitmentSourceSchema).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  hasRisk: z.boolean().optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
}).strict();

export type SearchCommitmentsInput = z.infer<typeof SearchCommitmentsInputSchema>;

export const CommitmentStatsSchema = z.object({
  total: z.number(),
  byStatus: z.record(z.number()),
  bySource: z.record(z.number()),
  overdueCount: z.number(),
  pendingCount: z.number(),
  highRiskCount: z.number(),
  averageConfidence: z.number().optional(),
  oldestPending: z.string().datetime().optional().nullable(),
});

export type CommitmentStats = z.infer<typeof CommitmentStatsSchema>;

export const ExtractCommitmentsInputSchema = z.object({
  text: z.string().min(1).max(10000),
  context: z.record(z.any()).optional(),
  source: CommitmentSourceSchema.default('AI_INFERRED'),
});

export type ExtractCommitmentsInput = z.infer<typeof ExtractCommitmentsInputSchema>;

/**
 * Extraction prompts ask the model for "string or null", so every optional
 * string here has to accept an explicit `null` as well as an absent key.
 */
const nullishString = (maxLength?: number) =>
  z
    .union([typeof maxLength === 'number' ? z.string().max(maxLength) : z.string(), z.null()])
    .optional()
    .transform((value) => value ?? undefined);

export const ExtractedCommitmentSchema = z.object({
  person: nullishString(200),
  personEmail: nullishString(),
  object: z.string(),
  description: nullishString(2000),
  deadline: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  /** Verbatim snippet from the source text, surfaced for user review. */
  context: nullishString(2000),
  suggestedTaskId: nullishString(),
  suggestedProjectId: nullishString(),
  metadata: z.record(z.any()).default({}),
});

export type ExtractedCommitment = z.infer<typeof ExtractedCommitmentSchema>;

export const ExtractResultSchema = z.object({
  commitments: z.array(ExtractedCommitmentSchema),
  ambiguous: z.array(z.object({
    text: z.string(),
    possibleInterpretations: z.array(z.string()),
  })),
  errors: z.array(z.string()),
});

export type ExtractResult = z.infer<typeof ExtractResultSchema>;
import { z } from 'zod';

/**
 * The single source of truth for intent types.
 *
 * `CREATE_PROJECT` was added in Stage 4. A `create_project` tool has been
 * registered since Phase 8 (`src/ai/assistant/tools/create-project.tool.ts`),
 * but the enum never had a matching member, so "create a project X" could only
 * ever misroute. The client mock carried a local `ResponderIntent =
 * IntentType | 'CREATE_PROJECT'` widening for the same reason
 * (`client/src/lib/mock/assistant.ts:260`); that workaround is now redundant.
 *
 * The LLM prompt in `intent-parser.service.ts` and the fallback classifier both
 * derive their vocabulary from this array, so the three cannot drift again.
 */
export const INTENT_TYPES = [
  'CREATE_GOAL',
  'CREATE_PROJECT',
  'CREATE_TASK',
  'CREATE_EVENT',
  'SCHEDULE_TASK',
  'RESCHEDULE_EVENT',
  'CANCEL_EVENT',
  'QUERY_AVAILABILITY',
  'CHECK_CONFLICTS',
  'GET_RECOMMENDATIONS',
] as const;

export type IntentType = (typeof INTENT_TYPES)[number];

export const IntentSchema = z.object({
  type: z.enum(INTENT_TYPES),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.any()),
  constraints: z.array(z.string()).optional(),
  originalText: z.string(),
});

export type ParsedIntent = z.infer<typeof IntentSchema>;

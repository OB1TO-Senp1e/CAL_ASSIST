import { z } from 'zod';

export const IntentSchema = z.object({
  type: z.enum([
    'CREATE_GOAL',
    'CREATE_TASK',
    'CREATE_EVENT',
    'SCHEDULE_TASK',
    'RESCHEDULE_EVENT',
    'CANCEL_EVENT',
    'QUERY_AVAILABILITY',
    'CHECK_CONFLICTS',
    'GET_RECOMMENDATIONS',
  ]),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.any()),
  constraints: z.array(z.string()).optional(),
  originalText: z.string(),
});

export type ParsedIntent = z.infer<typeof IntentSchema>;

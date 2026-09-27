import { z } from 'zod';

export const CreateEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  allDay: z.boolean().default(false),
  timezone: z.string().optional(),
  recurrence: z.string().optional(),
  status: z.enum(['CONFIRMED', 'TENTATIVE', 'CANCELLED']).default('CONFIRMED'),
});

export const UpdateEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  timezone: z.string().optional(),
  recurrence: z.string().optional(),
  status: z.enum(['CONFIRMED', 'TENTATIVE', 'CANCELLED']).optional(),
});

export type CreateEventRequest = z.infer<typeof CreateEventSchema>;
export type UpdateEventRequest = z.infer<typeof UpdateEventSchema>;

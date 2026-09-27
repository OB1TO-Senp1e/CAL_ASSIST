import { z } from 'zod';

export const CreateProjectSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  goalId: z.string().optional().nullable(),
  priority: z.number().int().min(0).max(10).default(5),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
});

export const UpdateProjectSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  goalId: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'BLOCKED']).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
});

export type CreateProjectRequest = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectRequest = z.infer<typeof UpdateProjectSchema>;

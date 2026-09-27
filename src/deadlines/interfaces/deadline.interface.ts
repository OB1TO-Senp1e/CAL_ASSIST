import { z } from 'zod';

export const CreateDeadlineSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().datetime(),
  goalId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  priority: z.number().int().min(0).max(10).default(5),
  timezone: z.string().default('UTC'),
});

export const UpdateDeadlineSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  goalId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'MISSED']).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  timezone: z.string().optional(),
});

export type CreateDeadlineRequest = z.infer<typeof CreateDeadlineSchema>;
export type UpdateDeadlineRequest = z.infer<typeof UpdateDeadlineSchema>;

export interface Deadline {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  dueDate: Date;
  goalId?: string | null;
  projectId?: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'MISSED';
  priority: number;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

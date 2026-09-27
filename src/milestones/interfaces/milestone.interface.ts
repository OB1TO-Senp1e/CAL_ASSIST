import { z } from 'zod';

export const CreateMilestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
  dueDate: z.string().datetime(),
  priority: z.number().int().min(0).max(10).default(5),
});

export const UpdateMilestoneSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  projectId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'BLOCKED']).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  dueDate: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export type CreateMilestoneRequest = z.infer<typeof CreateMilestoneSchema>;
export type UpdateMilestoneRequest = z.infer<typeof UpdateMilestoneSchema>;

export interface Milestone {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'BLOCKED';
  priority: number;
  dueDate: Date;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

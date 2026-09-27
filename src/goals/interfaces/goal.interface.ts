import { z } from 'zod';

export const CreateGoalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(10).default(5),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
});

export const UpdateGoalSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  startDate: z.string().datetime().optional(),
  targetDate: z.string().datetime().optional(),
});

export type CreateGoalRequest = z.infer<typeof CreateGoalSchema>;
export type UpdateGoalRequest = z.infer<typeof UpdateGoalSchema>;

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  priority: number;
  startDate?: Date | null;
  targetDate?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

import { z } from 'zod';

export const CreateTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string().optional().nullable(),
  goalId: z.string().optional().nullable(),
  milestoneId: z.string().optional().nullable(),
  priority: z.number().int().min(0).max(10).default(5),
  estimatedDurationMinutes: z.number().int().positive().optional(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  dependencies: z.array(z.string()).optional(),
  // New fields for Phase 6
  flexibility: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  energyRequirement: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  context: z.string().optional(),
  preferredTime: z.string().datetime().optional(),
  location: z.string().optional(),
});

export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  projectId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  status: z
    .enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'BLOCKED', 'ON_HOLD'])
    .optional(),
  priority: z.number().int().min(0).max(10).optional(),
  estimatedDurationMinutes: z.number().int().positive().optional(),
  actualDurationMinutes: z.number().int().positive().optional(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  dependencies: z.array(z.string()).optional(),
  // New fields for Phase 6
  flexibility: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  energyRequirement: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  context: z.string().optional(),
  preferredTime: z.string().datetime().optional(),
  location: z.string().optional(),
});

export type UpdateTaskRequest = z.infer<typeof UpdateTaskSchema>;

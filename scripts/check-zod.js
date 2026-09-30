const { z } = require('zod');

const CreateTaskInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(10).optional(),
  estimatedDurationMinutes: z.number().int().positive(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
});

const llmInput = {
  title: 'review Q4 budget',
  description: '',
  startDate: '2026-09-28T10:00:00.000Z',
  endDate: '2026-09-28T10:45:00.000Z',
  durationMinutes: 45,
  priority: 0,
  dueDate: '',
};

const r = CreateTaskInputSchema.safeParse(llmInput);
console.log('safeParse.success =', r.success);
if (!r.success) {
  console.log('issues:', JSON.stringify(r.error.issues, null, 2));
}

// Same input with the empty-string date dropped and the duration alias mapped.
const cleaned = { ...llmInput, dueDate: undefined, estimatedDurationMinutes: 45 };
const r2 = CreateTaskInputSchema.safeParse(cleaned);
console.log('\nafter cleanup success =', r2.success);
if (!r2.success) console.log(JSON.stringify(r2.error.issues, null, 2));
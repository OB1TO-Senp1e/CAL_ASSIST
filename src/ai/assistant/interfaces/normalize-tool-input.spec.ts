import {
  applyRequiredDurationDefault,
  describeToolInputSchema,
  normalizeToolInput,
} from './normalize-tool-input';
import { CreateTaskInputSchema, CreateEventInputSchema } from './tool-schemas';

/**
 * Regression suite for the live bug of 2026-09-27: `POST /api/assistant/message`
 * answered 200 with a real LLM response but zero `proposedActions`, because
 * `gpt-oss:20b` returned `durationMinutes` instead of the required
 * `estimatedDurationMinutes` and an empty-string `dueDate` that
 * `z.string().datetime()` rejects.
 */
describe('normalizeToolInput', () => {
  it('makes the observed gpt-oss:20b create_task payload valid', () => {
    // Captured verbatim from scripts/repro-actions.js.
    const llmOutput = {
      title: 'review Q4 budget',
      description: '',
      startDate: '2026-09-28T10:00:00.000Z',
      endDate: '2026-09-28T10:45:00.000Z',
      durationMinutes: 45,
      priority: 0,
      dueDate: '',
    };

    expect(CreateTaskInputSchema.safeParse(llmOutput).success).toBe(false);

    const normalized = applyRequiredDurationDefault(
      'create_task',
      normalizeToolInput('create_task', llmOutput)
    );

    expect(normalized).toEqual({
      title: 'review Q4 budget',
      startDate: '2026-09-28T10:00:00.000Z',
      // `endDate` survives normalisation (it is a real datetime field) but
      // zod's object parsing strips it because create_task does not declare it.
      endDate: '2026-09-28T10:45:00.000Z',
      estimatedDurationMinutes: 45,
      priority: 0,
    });

    const parsed = CreateTaskInputSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.estimatedDurationMinutes).toBe(45);
    expect(parsed.success && parsed.data.dueDate).toBeUndefined();
    expect(parsed.success && (parsed.data as Record<string, any>).endDate).toBeUndefined();
    expect(parsed.success && parsed.data.description).toBeUndefined();
  });

  it('drops unusable optional values instead of failing validation', () => {
    const normalized = normalizeToolInput('create_task', {
      title: '   ',
      dueDate: 'not-a-date',
      estimatedDurationMinutes: 45,
    });

    expect(normalized).toEqual({ estimatedDurationMinutes: 45 });
  });

  it('normalises datetime offsets and date-only strings to ISO UTC', () => {
    const normalized = normalizeToolInput('create_event', {
      title: 'Design review',
      startDate: '2026-09-28T15:00:00+02:00',
      endDate: '2026-09-28',
    });

    expect(normalized.startDate).toBe('2026-09-28T13:00:00.000Z');
    expect(normalized.endDate).toBe(new Date('2026-09-28').toISOString());
    expect(CreateEventInputSchema.safeParse(normalized).success).toBe(true);
  });

  it('coerces stringified numbers, clamps out-of-range integers and upper-cases enums', () => {
    const normalized = normalizeToolInput('create_task', {
      title: 'Ship release',
      estimatedDurationMinutes: '90',
      priority: '12',
      flexibility: 'high',
    });

    expect(normalized).toEqual({
      title: 'Ship release',
      estimatedDurationMinutes: 90,
      // 12 exceeds the schema's `.max(10)`, so it is dropped rather than
      // producing another parse failure.
      flexibility: 'HIGH',
    });
  });

  it('truncates titles to the schema max length and squashes whitespace', () => {
    const normalized = normalizeToolInput('create_task', {
      title: `  ${'x'.repeat(260)}  `,
      estimatedDurationMinutes: 30,
    });

    expect(normalized.title).toHaveLength(200);
    expect(normalized.title.startsWith(' ')).toBe(false);
    expect(CreateTaskInputSchema.safeParse(normalized).success).toBe(true);
  });

  it('repairs a nested timeRange pair', () => {
    const normalized = normalizeToolInput('create_schedule_proposal', {
      timeRange: { start: '2026-09-28T09:00:00Z', end: '' },
    });

    expect(normalized.timeRange).toBeUndefined();
  });

  it('defaults the required task duration when the model omits it entirely', () => {
    const normalized = applyRequiredDurationDefault('create_task', { title: 'Read spec' });

    expect(normalized.estimatedDurationMinutes).toBe(60);
    expect(CreateTaskInputSchema.safeParse(normalized).success).toBe(true);
  });

  it('leaves non-object input empty rather than throwing', () => {
    expect(normalizeToolInput('create_task', null)).toEqual({});
    expect(normalizeToolInput('create_task', '')).toEqual({});
    expect(normalizeToolInput('create_task', [])).toEqual({});
  });

  it('does not rewrite durationMinutes for tools that legitimately use it', () => {
    const normalized = normalizeToolInput('find_availability', {
      startDate: '2026-09-28T09:00:00Z',
      endDate: '2026-09-29T09:00:00Z',
      durationMinutes: 60,
    });

    expect(normalized.durationMinutes).toBe(60);
    expect(normalized.estimatedDurationMinutes).toBeUndefined();
  });
});

describe('describeToolInputSchema', () => {
  it('lists required and optional field names for the prompt', () => {
    const described = describeToolInputSchema(CreateTaskInputSchema).split(', ');

    expect(described).toContain('title');
    expect(described).toContain('estimatedDurationMinutes');
    expect(described).toContain('dueDate?');
  });

  it('degrades to {} for non-schema values', () => {
    expect(describeToolInputSchema(undefined)).toBe('{}');
    expect(describeToolInputSchema({})).toBe('{}');
  });
});

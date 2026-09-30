import { CommitmentEngineService } from './commitment-engine.service';
import {
  CommitmentSchema,
  CreateCommitmentInputSchema,
  ExtractedCommitmentSchema,
  LOW_CONFIDENCE_THRESHOLD,
} from './commitment.types';

/**
 * Stage 4f — commitment person / confidence persistence.
 *
 * The meeting and text extractors already produced `person`, `personEmail` and
 * `confidence`, but the Prisma model had no columns for them, so an extracted
 * commitment silently lost everything that made it reviewable. `CommitmentRisk`
 * also declared a `LOW_CONFIDENCE` factor that could never fire because
 * confidence was not stored anywhere.
 */

interface FakeRow {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  deadline: Date;
  status: string;
  source: string;
  person: string | null;
  personEmail: string | null;
  confidence: number | null;
  context: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const baseRow = (overrides: Partial<FakeRow> = {}): FakeRow => ({
  id: 'cmt_1',
  userId: 'usr_1',
  title: 'Send revised contract',
  description: null,
  deadline: new Date('2026-10-02T16:00:00.000Z'),
  status: 'PENDING',
  source: 'AI_GENERATED',
  person: null,
  personEmail: null,
  confidence: null,
  context: null,
  relatedEntityType: null,
  relatedEntityId: null,
  createdAt: new Date('2026-09-27T09:00:00.000Z'),
  updatedAt: new Date('2026-09-27T09:00:00.000Z'),
  ...overrides,
});

const futureDeadline = (daysFromNow = 30) =>
  new Date(Date.now() + daysFromNow * 86_400_000).toISOString();

function makeService(
  options: {
    rows?: FakeRow[];
    extractResponse?: unknown;
  } = {}
) {
  const rows = options.rows ?? [];
  const created: FakeRow[] = [];

  const prisma = {
    commitment: {
      create: jest.fn(async ({ data }: any) => {
        const row: FakeRow = baseRow({
          ...data,
          id: `cmt_${created.length + 1}`,
          deadline: data.deadline instanceof Date ? data.deadline : new Date(data.deadline),
        });
        created.push(row);
        rows.push(row);
        return { ...row, reminders: data.reminders?.create ?? [] };
      }),
      findFirst: jest.fn(
        async ({ where }: any) =>
          rows.find(
            (r) =>
              r.userId === where.userId &&
              (where.id === undefined || r.id === where.id) &&
              (where.title === undefined || r.title === where.title) &&
              (where.deadline === undefined ||
                r.deadline.getTime() === new Date(where.deadline).getTime()) &&
              (where.source === undefined || r.source === where.source)
          ) ?? null
      ),
      findMany: jest.fn(async () => rows.slice()),
      update: jest.fn(async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      }),
    },
    timeBlock: { findMany: jest.fn(async () => []) },
    scheduleChange: { count: jest.fn(async () => 0) },
  };

  const aiProvider = {
    generateStructured: jest.fn(async () => options.extractResponse),
  };

  const service = new CommitmentEngineService(
    prisma as any,
    aiProvider as any,
    {} as any,
    {} as any
  );

  return { service, prisma, aiProvider, created, rows };
}

describe('commitment metadata persistence (Stage 4f)', () => {
  describe('getCommitment / updateCommitment', () => {
    it('reads stored metadata back out', async () => {
      const rows = [baseRow({ person: 'Sam', confidence: 0.9 })];
      const { service } = makeService({ rows });

      const result = await service.getCommitment('usr_1', 'cmt_1');
      expect(result.person).toBe('Sam');
      expect(result.confidence).toBe(0.9);
    });

    it('preserves metadata the update did not mention', async () => {
      const rows = [baseRow({ person: 'Sam', confidence: 0.9 })];
      const { service, prisma } = makeService({ rows });

      await service.updateCommitment('usr_1', { id: 'cmt_1', object: 'Send final contract' });

      const data = prisma.commitment.update.mock.calls[0][0].data;
      expect(data.person).toBe('Sam');
      expect(data.confidence).toBe(0.9);
    });

    it('overwrites person when the update provides one', async () => {
      const rows = [baseRow({ person: 'Sam', confidence: 0.9 })];
      const { service, prisma } = makeService({ rows });

      await service.updateCommitment('usr_1', { id: 'cmt_1', person: 'Priya' });

      const data = prisma.commitment.update.mock.calls[0][0].data;
      expect(data.person).toBe('Priya');
      expect(data.confidence).toBe(0.9);
    });

    it('drops an unrecognised relatedEntityType instead of passing it through', async () => {
      const rows = [baseRow({ relatedEntityType: 'INVOICE', relatedEntityId: 'inv_9' })];
      const { service } = makeService({ rows });

      const result = await service.getCommitment('usr_1', 'cmt_1');
      expect(result.relatedEntityType).toBeUndefined();
      expect(result.relatedEntityId).toBe('inv_9');
    });
  });

  describe('extractCommitments', () => {
    const extraction = (overrides: Record<string, unknown> = {}) => ({
      commitments: [
        {
          person: 'Sam',
          personEmail: 'sam@example.com',
          object: 'Send revised contract',
          description: null,
          deadline: futureDeadline(),
          confidence: 0.78,
          context: 'I will send Sam the revised contract',
          suggestedTaskId: null,
          suggestedProjectId: 'prj_1',
          metadata: {},
          ...overrides,
        },
      ],
      ambiguous: [],
      errors: [],
    });

    it('writes person / confidence / context instead of discarding them', async () => {
      const { service, prisma } = makeService({ extractResponse: extraction() });

      await service.extractCommitments('usr_1', {
        text: 'I will send Sam the revised contract next week',
        source: 'AI_INFERRED',
      });

      const data = prisma.commitment.create.mock.calls[0][0].data;
      expect(data.person).toBe('Sam');
      expect(data.personEmail).toBe('sam@example.com');
      expect(data.confidence).toBe(0.78);
      expect(data.context).toBe('I will send Sam the revised contract');
    });

    it('links the created commitment to the suggested project', async () => {
      const { service, prisma } = makeService({ extractResponse: extraction() });

      await service.extractCommitments('usr_1', { text: 'text', source: 'AI_INFERRED' });

      const data = prisma.commitment.create.mock.calls[0][0].data;
      expect(data.relatedEntityType).toBe('PROJECT');
      expect(data.relatedEntityId).toBe('prj_1');
    });

    it('falls back to the suggested task when there is no project', async () => {
      const response = extraction({ suggestedProjectId: null, suggestedTaskId: 'tsk_5' });
      const { service, prisma } = makeService({ extractResponse: response });

      await service.extractCommitments('usr_1', { text: 'text', source: 'AI_INFERRED' });

      const data = prisma.commitment.create.mock.calls[0][0].data;
      expect(data.relatedEntityType).toBe('TASK');
      expect(data.relatedEntityId).toBe('tsk_5');
    });

    it('survives the null strings the prompt invites', async () => {
      const { service, prisma } = makeService({ extractResponse: extraction() });

      const result = await service.extractCommitments('usr_1', {
        text: 'text',
        source: 'AI_INFERRED',
      });

      expect(result.errors).toEqual([]);
      expect(prisma.commitment.create).toHaveBeenCalledTimes(1);
    });

    it('does not write twice when the commitment already exists', async () => {
      const deadline = futureDeadline();
      const rows = [baseRow({ title: 'Send revised contract', deadline: new Date(deadline) })];
      const { service, prisma } = makeService({ rows, extractResponse: extraction({ deadline }) });

      await service.extractCommitments('usr_1', { text: 'text', source: 'AI_INFERRED' });

      expect(prisma.commitment.create).not.toHaveBeenCalled();
    });

    it('reports malformed model output instead of throwing', async () => {
      const { service } = makeService({
        extractResponse: { commitments: [{ object: 'no deadline' }], ambiguous: [], errors: [] },
      });

      const result = await service.extractCommitments('usr_1', {
        text: 'text',
        source: 'AI_INFERRED',
      });

      expect(result.commitments).toEqual([]);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('CreateCommitmentInputSchema', () => {
    it('accepts the metadata the extractors produce', () => {
      const parsed = CreateCommitmentInputSchema.safeParse({
        object: 'Send revised contract',
        deadline: futureDeadline(),
        source: 'AI_INFERRED',
        person: 'Sam',
        personEmail: 'sam@example.com',
        confidence: 0.82,
        context: 'I will send Sam the revised contract',
        relatedEntityType: 'PROJECT',
        relatedEntityId: 'prj_1',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects a confidence outside 0..1', () => {
      expect(
        CreateCommitmentInputSchema.safeParse({
          object: 'x',
          deadline: futureDeadline(),
          confidence: 1.4,
        }).success
      ).toBe(false);
    });

    it('rejects an unknown relatedEntityType', () => {
      expect(
        CreateCommitmentInputSchema.safeParse({
          object: 'x',
          deadline: futureDeadline(),
          relatedEntityType: 'INVOICE',
        }).success
      ).toBe(false);
    });
  });

  describe('ExtractedCommitmentSchema', () => {
    it('coerces the explicit nulls the prompt asks the model for', () => {
      const parsed = ExtractedCommitmentSchema.safeParse({
        person: null,
        personEmail: null,
        object: 'Ship the patch',
        description: null,
        deadline: futureDeadline(),
        confidence: 0.4,
        context: null,
        suggestedTaskId: null,
        suggestedProjectId: null,
        metadata: {},
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.person).toBeUndefined();
        expect(parsed.data.suggestedProjectId).toBeUndefined();
      }
    });
  });

  describe('createCommitment', () => {
    it('passes person / confidence / related entity through to the write', async () => {
      const { service, prisma } = makeService();

      await service.createCommitment('usr_1', {
        object: 'Send revised contract',
        deadline: futureDeadline(),
        source: 'AI_INFERRED',
        person: 'Sam',
        personEmail: 'sam@example.com',
        confidence: 0.82,
        context: 'verbatim snippet',
        relatedEntityType: 'PROJECT',
        relatedEntityId: 'prj_1',
      });

      const data = prisma.commitment.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        person: 'Sam',
        personEmail: 'sam@example.com',
        confidence: 0.82,
        context: 'verbatim snippet',
        relatedEntityType: 'PROJECT',
        relatedEntityId: 'prj_1',
      });
    });

    it('returns the metadata on the mapped commitment', async () => {
      const { service } = makeService();

      const result = await service.createCommitment('usr_1', {
        object: 'Send revised contract',
        deadline: futureDeadline(),
        source: 'AI_INFERRED',
        person: 'Sam',
        confidence: 0.31,
      });

      expect(result.person).toBe('Sam');
      expect(result.confidence).toBe(0.31);
      expect(CommitmentSchema.parse(result).person).toBe('Sam');
    });
  });

  describe('getCommitmentStats', () => {
    it('averages only the commitments that carry a confidence', async () => {
      const rows = [
        baseRow({ id: 'cmt_1', confidence: 0.8 }),
        baseRow({ id: 'cmt_2', confidence: 0.6 }),
        baseRow({ id: 'cmt_3', confidence: null }),
      ];
      const { service } = makeService({ rows });

      const stats = await service.getCommitmentStats('usr_1');
      expect(stats.averageConfidence).toBeCloseTo(0.7);
    });

    it('leaves averageConfidence undefined when nothing was extracted', async () => {
      const { service } = makeService({ rows: [baseRow({ confidence: null })] });

      const stats = await service.getCommitmentStats('usr_1');
      expect(stats.averageConfidence).toBeUndefined();
    });
  });

  describe('risk assessment', () => {
    it('flags a low-confidence commitment that was previously unflaggable', async () => {
      const rows = [
        baseRow({
          confidence: LOW_CONFIDENCE_THRESHOLD - 0.1,
          deadline: new Date(Date.now() + 30 * 86_400_000),
        }),
      ];
      const { service } = makeService({ rows });

      const risk = await service.getCommitmentRisk('usr_1', 'cmt_1');
      expect(risk.riskFactors).toContain('LOW_CONFIDENCE');
      expect(risk.riskLevel).not.toBe('NONE');
    });

    it('does not flag a confident commitment', async () => {
      const rows = [
        baseRow({ confidence: 0.95, deadline: new Date(Date.now() + 30 * 86_400_000) }),
      ];
      const { service } = makeService({ rows });

      const risk = await service.getCommitmentRisk('usr_1', 'cmt_1');
      expect(risk.riskFactors).not.toContain('LOW_CONFIDENCE');
    });

    it('does not flag hand-entered commitments that have no confidence', async () => {
      const rows = [
        baseRow({
          source: 'USER',
          confidence: null,
          deadline: new Date(Date.now() + 30 * 86_400_000),
        }),
      ];
      const { service } = makeService({ rows });

      const risk = await service.getCommitmentRisk('usr_1', 'cmt_1');
      expect(risk.riskFactors).not.toContain('LOW_CONFIDENCE');
    });
  });
});

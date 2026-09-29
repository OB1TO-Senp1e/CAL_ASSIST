import { OutboxJobStatus } from '../coordination.types';
import { OutboxJobRow } from './outbox.types';
import { OutboxStore } from './outbox.store';

type Fake = Record<string, unknown>;

function makeRow(overrides: Partial<OutboxJobRow> = {}): OutboxJobRow {
  const now = new Date('2026-09-29T10:00:00Z');
  return {
    id: 'job-1',
    userId: 'user-1',
    jobType: 'REMINDER',
    dedupeKey: null,
    payload: '{"a":1}',
    status: 'PENDING',
    availableAt: now,
    lockedUntil: null,
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Raw-SQL fake: `$queryRaw`/`$executeRaw` push their SQL text into `calls` so
 * specs can pin the locking semantics, and return queued values in order.
 * A real DB is not available to unit tests and `SKIP LOCKED` is
 * PostgreSQL-only (D1), so the raw layer is mocked, never emulated.
 */
function makePrisma(handlers: Array<(sql: string, values: unknown[]) => unknown> = []) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  let index = 0;
  const run = (sql: string, values: unknown[]): unknown => {
    calls.push({ sql, values });
    const next = handlers[index];
    index += 1;
    return next ? next(sql, values) : [];
  };
  const prisma = {
    calls,
    $transaction: jest.fn(async (fn: (tx: Fake) => Promise<unknown>) =>
      fn({
        $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
          run(strings.join('?'), values),
        $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
          run(strings.join('?'), values),
      })
    ),
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      run(strings.join('?'), values),
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      run(strings.join('?'), values),
  };
  return prisma;
}

function sqlOf(prisma: ReturnType<typeof makePrisma>, i: number): string {
  return prisma.calls[i].sql.replace(/\s+/g, ' ').trim();
}

const rowsOf = (row: OutboxJobRow) => async (): Promise<OutboxJobRow[]> => [row];
const uniqueViolation = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

const base = {
  userId: 'user-1',
  jobType: 'REMINDER',
  dedupeKey: null,
  payload: '{"a":1}',
  availableAt: new Date('2026-09-29T10:00:00Z'),
  maxAttempts: 3,
};

describe('OutboxStore', () => {
  describe('enqueue', () => {
    it('inserts a PENDING row and returns it', async () => {
      const row = makeRow();
      const prisma = makePrisma([rowsOf(row)]);
      const store = new OutboxStore(prisma as never);

      const result = await store.enqueue(base);

      expect(result).toEqual({ row, deduped: false });
      expect(sqlOf(prisma, 0)).toContain('INSERT INTO "OutboxJob"');
      expect(sqlOf(prisma, 0)).toContain("'PENDING'");
    });

    it('skips the insert when an active row already holds the dedupe key', async () => {
      const existing = makeRow({ id: 'job-0', dedupeKey: 'meeting-9:24h' });
      const prisma = makePrisma([rowsOf(existing)]);
      const store = new OutboxStore(prisma as never);

      const result = await store.enqueue({ ...base, dedupeKey: 'meeting-9:24h' });

      expect(result).toEqual({ row: existing, deduped: true });
      expect(prisma.calls).toHaveLength(1);
      expect(sqlOf(prisma, 0)).toContain("'PENDING', 'CLAIMED'");
    });

    it('returns the winner when two concurrent enqueues race the partial unique index', async () => {
      const winner = makeRow({ id: 'job-w', dedupeKey: 'k' });
      let lookups = 0;
      const prisma = makePrisma([
        async () => [], // pre-check: nothing active yet
        async () => {
          throw uniqueViolation; // INSERT loses the race
        },
        async () => {
          lookups += 1;
          return [winner]; // re-select sees the winner
        },
      ]);
      const store = new OutboxStore(prisma as never);

      const result = await store.enqueue({ ...base, dedupeKey: 'k' });

      expect(result).toEqual({ row: winner, deduped: true });
      expect(lookups).toBe(1);
    });

    it('rethrows non-P2002 insert failures', async () => {
      const prisma = makePrisma([
        async () => {
          throw new Error('connection lost');
        },
      ]);
      const store = new OutboxStore(prisma as never);

      await expect(store.enqueue(base)).rejects.toThrow('connection lost');
    });
  });

  describe('claimOne', () => {
    it('locks candidates with FOR UPDATE SKIP LOCKED inside one transaction', async () => {
      const candidate = makeRow({ status: 'PENDING', attempts: 0 });
      const leased = makeRow({
        status: 'CLAIMED',
        attempts: 1,
        lockedUntil: new Date('2026-09-29T10:01:00Z'),
      });
      const prisma = makePrisma([rowsOf(candidate), rowsOf(leased)]);
      const store = new OutboxStore(prisma as never);

      const job = await store.claimOne(new Date('2026-09-29T10:00:00Z'), 60_000);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const selectSql = sqlOf(prisma, 0);
      expect(selectSql).toContain('FOR UPDATE SKIP LOCKED');
      // Crashed-worker recovery: an expired CLAIMED lease is due again.
      expect(selectSql).toContain(`"status" = 'CLAIMED' AND "lockedUntil" <`);
      expect(selectSql).toContain('"attempts" < "maxAttempts"');
      expect(job).toEqual({
        id: 'job-1',
        userId: 'user-1',
        jobType: 'REMINDER',
        payload: { a: 1 },
        attempts: 1,
        maxAttempts: 3,
      });
      const leaseSql = sqlOf(prisma, 1);
      expect(leaseSql).toContain('"attempts" = "attempts" + 1');
      expect(leaseSql).toContain('RETURNING');
      // The lease is exactly `leaseMs` past the supplied now().
      expect(prisma.calls[1].values[0]).toEqual(new Date('2026-09-29T10:01:00Z'));
    });

    it('returns null when nothing is due, without leasing', async () => {
      const prisma = makePrisma([async () => []]);
      const store = new OutboxStore(prisma as never);

      await expect(store.claimOne(new Date(), 60_000)).resolves.toBeNull();
      expect(prisma.calls).toHaveLength(1);
    });

    it('fails a poisoned row and returns null so the FAILED update commits', async () => {
      const candidate = makeRow({ payload: '{not json' });
      const prisma = makePrisma([rowsOf(candidate), async () => 1]);
      const store = new OutboxStore(prisma as never);

      await expect(store.claimOne(new Date(), 60_000)).resolves.toBeNull();
      expect(sqlOf(prisma, 1)).toContain("'FAILED'");
      expect(sqlOf(prisma, 1)).toContain('PAYLOAD_UNPARSEABLE');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('ack / nack', () => {
    it('ack completes the row and clears the lease', async () => {
      const prisma = makePrisma([async () => 1]);
      const store = new OutboxStore(prisma as never);

      await store.ack('job-1');

      expect(sqlOf(prisma, 0)).toContain("'COMPLETED'");
      expect(sqlOf(prisma, 0)).toContain('"lockedUntil" = NULL');
    });

    it('nack defers with the caller retry time while attempts remain', async () => {
      const retryAt = new Date('2026-09-29T10:00:30Z');
      const prisma = makePrisma([async () => [{ status: 'PENDING' satisfies OutboxJobStatus }]]);
      const store = new OutboxStore(prisma as never);

      await expect(store.nack('job-1', 'provider 503', retryAt)).resolves.toBe('PENDING');

      const sql = sqlOf(prisma, 0);
      expect(sql).toContain(
        `CASE WHEN "attempts" >= "maxAttempts" THEN 'FAILED' ELSE 'PENDING' END`
      );
      expect(prisma.calls[0].values).toContain('provider 503');
      expect(prisma.calls[0].values).toContain(retryAt);
    });

    it('nack truncates an over-long error to 500 chars', async () => {
      const prisma = makePrisma([async () => [{ status: 'FAILED' }]]);
      const store = new OutboxStore(prisma as never);

      await store.nack('job-1', 'x'.repeat(2000), new Date());

      expect(String(prisma.calls[0].values[0])).toHaveLength(500);
    });

    it('nack on a vanished row reports FAILED instead of throwing', async () => {
      const prisma = makePrisma([async () => []]);
      const store = new OutboxStore(prisma as never);

      await expect(store.nack('gone', 'boom', new Date())).resolves.toBe('FAILED');
    });
  });

  describe('reads', () => {
    it('scope every read by userId (service-level authorization, §18 / R10)', async () => {
      const prisma = makePrisma([async () => [], async () => [], async () => []]);
      const store = new OutboxStore(prisma as never);

      await store.findOwned('user-1', 'job-1');
      await store.listOwned('user-1', 20);
      const counts = await store.statusCounts('user-1');

      expect(prisma.calls.every((c) => c.sql.includes('"userId"'))).toBe(true);
      expect(counts).toEqual({ PENDING: 0, CLAIMED: 0, COMPLETED: 0, FAILED: 0 });
    });

    it('zero-fills statuses the group-by did not return', async () => {
      const prisma = makePrisma([async () => [{ status: 'COMPLETED', count: 4 }]]);
      const store = new OutboxStore(prisma as never);

      expect(await store.statusCounts('user-1')).toEqual({
        PENDING: 0,
        CLAIMED: 0,
        COMPLETED: 4,
        FAILED: 0,
      });
    });
  });
});

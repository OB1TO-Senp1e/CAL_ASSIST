import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PkceService, stateIdFor } from './pkce.service';

loadEnv();

const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';
const dbReachable = process.env.DB_REACHABLE === '1';

let db: PrismaClient;
beforeAll(() => {
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
});
afterAll(async () => {
  if (db) await db.$disconnect().catch(() => undefined);
});

/**
 * C7 acceptance: valid flow, expired verifier, reused (single-use) verifier,
 * missing verifier — all against the real PKCE table, plus the S256 math.
 */
describe('PkceService (C7)', () => {
  jest.setTimeout(30000);
  const guard = dbReachable ? describe : describe.skip;

  guard('live store', () => {
    let service: PkceService;
    const state = () => `state-${Math.random().toString(36).slice(2)}`;

    beforeEach(() => {
      service = new PkceService(db as any);
    });

    afterEach(async () => {
      await db.calendarOAuthPkce.deleteMany({ where: { userId: { startsWith: 'pkce-test' } } });
    });

    it('creates a 43-char S256 verifier and stores it keyed by state hash', async () => {
      const s = state();
      const { verifier, challenge, method } = await service.create(s, 'pkce-test-1', 'GOOGLE');
      expect(method).toBe('S256');
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // Row exists under the SHA-256 of the state, not the raw state.
      const row = await db.calendarOAuthPkce.findUnique({ where: { id: stateIdFor(s) } });
      expect(row?.codeVerifier).toBe(verifier);
      expect(row?.userId).toBe('pkce-test-1');
    });

    it('redeems a valid verifier exactly once (reuse blocked)', async () => {
      const s = state();
      const created = await service.create(s, 'pkce-test-2', 'GOOGLE');
      await expect(service.consume(s)).resolves.toBe(created.verifier);
      // Second consume = replay ⇒ rejected.
      await expect(service.consume(s)).rejects.toThrow(/expired or was already used/);
    });

    it('rejects an expired verifier', async () => {
      const s = state();
      await service.create(s, 'pkce-test-3', 'GOOGLE');
      await db.calendarOAuthPkce.update({
        where: { id: stateIdFor(s) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(service.consume(s)).rejects.toThrow(/expired or was already used/);
    });

    it('rejects a verifier that was never minted (missing)', async () => {
      await expect(service.consume('never-issued-state')).rejects.toThrow(
        /expired or was already used/
      );
    });

    it('purgeExpired removes only stale rows', async () => {
      const keep = state();
      const drop = state();
      await service.create(keep, 'pkce-test-4', 'GOOGLE');
      await service.create(drop, 'pkce-test-4', 'GOOGLE');
      await db.calendarOAuthPkce.update({
        where: { id: stateIdFor(drop) },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      const removed = await service.purgeExpired();
      expect(removed).toBeGreaterThanOrEqual(1);
      await expect(service.consume(keep)).resolves.toBeDefined();
      await expect(service.consume(drop)).rejects.toThrow();
    });
  });

  it('stateIdFor is stable, hex SHA-256, and never the raw state', () => {
    const id = stateIdFor('abc');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain('abc');
    expect(stateIdFor('abc')).toBe(id);
  });
});

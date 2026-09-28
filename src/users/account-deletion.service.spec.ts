import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

loadEnv();
import { AccountDeletionService } from './account-deletion.service';
import { CalendarConnectionService } from '../integrations/calendar-adapters/calendar-connection.service';

/**
 * C4 integration test (live local dev Postgres, same DATABASE_URL the app
 * uses). Creates a throwaway user with provider connections, calendar data,
 * AI memory/embeddings, tasks/events with parent-only child rows, sessions,
 * profile and audit rows; deletes the account; asserts no rows remain.
 *
 * If the suite cannot reach the DB it is skipped at runtime (guarded for
 * environment, not weakened for code reasons); locally it must run.
 */

const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/calassist?schema=public';

// Set by scripts/jest-global-setup.js (TCP probe) before collection.
const dbReachable = process.env.DB_REACHABLE === '1';

let db: PrismaClient;

beforeAll(async () => {
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
});

afterAll(async () => {
  if (db) await db.$disconnect().catch(() => undefined);
});

describe('AccountDeletionService (C4, integration)', () => {
  jest.setTimeout(30000);

  const guard = dbReachable ? describe : describe.skip;

  guard('full user erasure', () => {
    let userId: string;

    const makeService = (disconnectSpy: jest.Mock) => {
      // Passthrough stub keeps this spec about deletion, not the cipher
      // (cipher covered in oauth-token-crypto.service.spec.ts).
      const connectionService = {
        disconnect: disconnectSpy,
      } as unknown as CalendarConnectionService;
      return new AccountDeletionService(db as any, connectionService);
    };

    afterEach(async () => {
      // Safety net: if an assertion failed mid-test, do not leave the fixture
      // user behind.
      if (userId) {
        try {
          const ids = (await db.task.findMany({ where: { userId }, select: { id: true } })).map((r) => r.id);
          const evts = (await db.event.findMany({ where: { userId }, select: { id: true } })).map((r) => r.id);
          if (ids.length) await db.taskDependency.deleteMany({ where: { OR: [{ taskId: { in: ids } }, { dependsOnId: { in: ids } }] } });
          if (evts.length) await db.eventParticipant.deleteMany({ where: { eventId: { in: evts } } });
          await db.user.delete({ where: { id: userId } }).catch(() => undefined);
        } catch {
          /* best effort */
        }
      }
    });

    it('removes every row referencing the user and hard-deletes the account', async () => {
      const email = `c4-itest-seed-${Date.now()}@example.test`;
      const user = await db.user.create({
        data: {
          email,
          name: 'C4 Fixture',
          passwordHash: 'not-a-real-hash',
        },
      });
      userId = user.id;

      const connection = await db.calendarConnection.create({
        data: {
          userId,
          provider: 'GOOGLE',
          externalUserId: 'fixture@gmail.com',
          accessToken: 'enc-access',
          refreshToken: 'enc-refresh',
          tokenExpiresAt: new Date(Date.now() + 3600_000),
          scopes: ['https://www.googleapis.com/auth/calendar.events'],
        },
      });
      const calendar = await db.calendar.create({
        data: { userId, connectionId: connection.id, name: 'Primary', provider: 'GOOGLE', isPrimary: true },
      });
      const event = await db.event.create({
        data: {
          userId,
          calendarId: calendar.id,
          title: 'Fixture event',
          startDate: new Date(),
          endDate: new Date(Date.now() + 3600_000),
        },
      });
      await db.eventParticipant.create({
        data: { eventId: event.id, email: 'other@example.test', isOrganizer: true },
      });
      const taskA = await db.task.create({ data: { userId, title: 'Task A' } });
      const taskB = await db.task.create({ data: { userId, title: 'Task B' } });
      await db.taskDependency.create({ data: { taskId: taskA.id, dependsOnId: taskB.id } });
      await db.memory.create({
        data: { userId, content: 'likes mornings', category: 'EXPLICIT_PREFERENCE', embedding: [0.1, 0.2] },
      });
      const conversation = await db.conversation.create({ data: { userId, title: 'C1' } });
      await db.conversationMessage.create({
        data: { conversationId: conversation.id, userId, role: 'USER', content: 'plan my day' },
      });
      await db.session.create({
        data: { userId, token: `sess-c4-${userId}`, expiresAt: new Date(Date.now() + 86_400_000) },
      });
      await db.profile.create({ data: { userId, bio: 'fixture' } });
      await db.auditLog.create({
        data: { userId, action: 'ACCOUNT_TEST_SEED', entityType: 'User', details: 'seed' },
      });

      const disconnectSpy = jest.fn().mockResolvedValue(undefined);
      const service = makeService(disconnectSpy);

      // Explicit confirmation step: wrong email is rejected, account survives.
      await expect(service.requestDeleteBySelf(userId, 'attacker@example.test')).rejects.toThrow(
        /explicit confirmation/i
      );
      expect(await db.user.findUnique({ where: { id: userId } })).not.toBeNull();

      await service.requestDeleteBySelf(userId, email.toUpperCase());

      // C3 revoke path was used for the connection before rows went away.
      expect(disconnectSpy).toHaveBeenCalledWith(userId, 'GOOGLE');

      const [
        userRow,
        connections,
        calendars,
        events,
        participants,
        tasks,
        deps,
        memories,
        conversations,
        messages,
        sessions,
        profile,
        audits,
      ] = await Promise.all([
        db.user.findUnique({ where: { id: userId } }),
        db.calendarConnection.count({ where: { userId } }),
        db.calendar.count({ where: { userId } }),
        db.event.count({ where: { userId } }),
        db.eventParticipant.count({ where: { eventId: event.id } }),
        db.task.count({ where: { userId } }),
        db.taskDependency.count({ where: { taskId: taskA.id } }),
        db.memory.count({ where: { userId } }),
        db.conversation.count({ where: { userId } }),
        db.conversationMessage.count({ where: { userId } }),
        db.session.count({ where: { userId } }),
        db.profile.count({ where: { userId } }),
        db.auditLog.count({ where: { userId } }),
      ]);

      expect(userRow).toBeNull();
      expect({
        connections,
        calendars,
        events,
        participants,
        tasks,
        deps,
        memories,
        conversations,
        messages,
        sessions,
        profile,
        audits,
      }).toEqual({
        connections: 0,
        calendars: 0,
        events: 0,
        participants: 0,
        tasks: 0,
        deps: 0,
        memories: 0,
        conversations: 0,
        messages: 0,
        sessions: 0,
        profile: 0,
        audits: 0,
      });
      userId = undefined as any; // fixture fully gone; skip afterEach net
    });
  });
});

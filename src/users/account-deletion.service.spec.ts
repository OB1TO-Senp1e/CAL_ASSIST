import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveSafeTestDatabaseUrl } from '../config/test-database.guard';
import { AccountDeletionService } from './account-deletion.service';
import { CalendarConnectionService } from '../integrations/calendar-adapters/calendar-connection.service';

/**
 * C4 integration test (local dev Postgres only). Creates a throwaway user
 * with provider connections, calendar data, AI memory/embeddings,
 * tasks/events with parent-only child rows, sessions, profile and audit
 * rows; deletes the account; asserts no rows remain.
 *
 * C-02 item 9: the URL comes from TEST_DATABASE_URL or a loopback
 * DATABASE_URL in the SHELL environment only — `.env` is never loaded here,
 * so a live Supabase URL can never be reached from the test suite. When no
 * safe URL exists (or the probe in scripts/jest-global-setup.js failed),
 * the suite skips; locally it must run.
 */

const databaseUrl = resolveSafeTestDatabaseUrl(process.env);

// Set by scripts/jest-global-setup.js (loopback check + TCP probe).
const dbReachable = Boolean(databaseUrl) && process.env.DB_REACHABLE === '1';

let db: PrismaClient;

beforeAll(async () => {
  if (!dbReachable || !databaseUrl) return;
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
});

afterAll(async () => {
  if (db) await db.$disconnect().catch(() => undefined);
});

describe('AccountDeletionService (C4, integration)', () => {
  // ~60 sequential Prisma operations (seed + 55-table deletion + asserts);
  // 30s is too tight when the Prisma engine also pays cold-start cost.
  jest.setTimeout(120000);

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
          const ids = (await db.task.findMany({ where: { userId }, select: { id: true } })).map(
            (r) => r.id
          );
          const evts = (await db.event.findMany({ where: { userId }, select: { id: true } })).map(
            (r) => r.id
          );
          if (ids.length)
            await db.taskDependency.deleteMany({
              where: { OR: [{ taskId: { in: ids } }, { dependsOnId: { in: ids } }] },
            });
          if (evts.length)
            await db.eventParticipant.deleteMany({ where: { eventId: { in: evts } } });
          // C-02 children first, then the userId-owned coordination rows.
          const mts = (await db.meeting.findMany({ where: { userId }, select: { id: true } })).map(
            (r) => r.id
          );
          if (mts.length) {
            await db.meetingParticipant.deleteMany({ where: { meetingId: { in: mts } } });
            await db.meetingProposal.deleteMany({ where: { meetingId: { in: mts } } });
          }
          await db.aiActionLog.deleteMany({ where: { userId } });
          await db.schedulingPreference.deleteMany({ where: { userId } });
          await db.meeting.deleteMany({ where: { userId } });
          await db.calendarOAuthPkce.deleteMany({ where: { userId } });
          await db.calendarPushChannel.deleteMany({ where: { userId } });
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
        data: {
          userId,
          connectionId: connection.id,
          name: 'Primary',
          provider: 'GOOGLE',
          isPrimary: true,
        },
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
        data: {
          userId,
          content: 'likes mornings',
          category: 'EXPLICIT_PREFERENCE',
          embedding: [0.1, 0.2],
        },
      });
      const conversation = await db.conversation.create({ data: { userId, title: 'C1' } });
      await db.conversationMessage.create({
        data: { conversationId: conversation.id, userId, role: 'USER', content: 'plan my day' },
      });
      await db.session.create({
        data: { userId, token: `sess-c4-${userId}`, expiresAt: new Date(Date.now() + 86_400_000) },
      });
      await db.calendarOAuthPkce.create({
        data: {
          id: `c4-pkce-${userId}`,
          userId,
          provider: 'GOOGLE',
          codeVerifier: 'fixture-verifier',
          expiresAt: new Date(Date.now() + 600_000),
        },
      });
      await db.calendarPushChannel.create({
        data: {
          userId,
          provider: 'GOOGLE',
          channelId: `c4-channel-${userId}`,
          resourceUri: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          channelToken: 'fixture-channel-token',
        },
      });
      await db.profile.create({ data: { userId, bio: 'fixture' } });
      await db.auditLog.create({
        data: { userId, action: 'ACCOUNT_TEST_SEED', entityType: 'User', details: 'seed' },
      });

      // C-02 coordination-domain rows (meeting + children + preference + audit).
      const meeting = await db.meeting.create({
        data: {
          userId,
          eventId: event.id,
          title: 'Fixture meeting',
          status: 'PENDING_APPROVAL',
          idempotencyKey: `c4-idem-${userId}`,
          participants: {
            create: [{ name: 'Peer', email: 'peer@example.test', role: 'required' }],
          },
          proposals: {
            create: [
              {
                start: new Date(Date.now() + 86_400_000),
                end: new Date(Date.now() + 88_200_000),
                reasons: ['fixture reason'],
                conflicts: [],
                expiresAt: new Date(Date.now() + 172_800_000),
              },
            ],
          },
        },
      });
      await db.schedulingPreference.create({
        data: {
          userId,
          category: 'WORKING_HOURS',
          key: 'core-hours',
          value: { start: '09:00', end: '18:00' },
        },
      });
      await db.aiActionLog.create({
        data: {
          userId,
          eventType: 'PERMISSION_CHECK',
          action: 'CREATE_EVENT',
          decision: 'ALLOW',
          meetingId: meeting.id,
        },
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
        oauthPkce,
        pushChannels,
        meetings,
        meetingParticipants,
        meetingProposals,
        schedPrefs,
        aiLogs,
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
        db.calendarOAuthPkce.count({ where: { userId } }),
        db.calendarPushChannel.count({ where: { userId } }),
        db.meeting.count({ where: { userId } }),
        db.meetingParticipant.count({ where: { meetingId: meeting.id } }),
        db.meetingProposal.count({ where: { meetingId: meeting.id } }),
        db.schedulingPreference.count({ where: { userId } }),
        db.aiActionLog.count({ where: { userId } }),
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
        oauthPkce,
        pushChannels,
        meetings,
        meetingParticipants,
        meetingProposals,
        schedPrefs,
        aiLogs,
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
        oauthPkce: 0,
        pushChannels: 0,
        meetings: 0,
        meetingParticipants: 0,
        meetingProposals: 0,
        schedPrefs: 0,
        aiLogs: 0,
      });
      userId = undefined as any; // fixture fully gone; skip afterEach net
    });
  });
});

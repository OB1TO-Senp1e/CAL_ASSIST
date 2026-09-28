import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { CalendarConnectionService } from '../integrations/calendar-adapters/calendar-connection.service';

/**
 * C4 — self-service account deletion.
 *
 * Order (mandated): revoke every Google/provider connection → delete
 * connection + cached calendar data → delete AI memory/embeddings and every
 * other user-owned row → hard-delete the user row. Nothing is retained; the
 * only surviving trace is the server log line written at completion (userId
 * + timestamp, no PII). See COMPLIANCE_LOOP.md for the per-model
 * keep/delete/anonymize enumeration backing USER_OWNED_DELETIONS below.
 *
 * There are no queued/cron jobs per user in this codebase (grep: no
 * @nestjs/schedule / @Cron / @Interval usage), so "cancel scheduled jobs"
 * is a documented no-op (D12 in the decisions log).
 */

/**
 * Tables with a userId → User foreign key are deleted via USER_ID_TABLES
 * below; two child tables carry only a parent FK (TaskDependency → Task,
 * EventParticipant → Event) and are cleared by parent id first.
 */

// Ordered children-first groups. Every model listed in COMPLIANCE_LOOP.md's
// C4 table appears here; TaskDependency/EventParticipant are cleared via
// their parent ids because they carry no userId.
const USER_ID_TABLES: Array<keyof PrismaService> = [
  'memoryConflict',
  'memoryRelation',
  'memory',
  'conversationMessage',
  'assistantAction',
  'assistantRecommendation',
  'conversation',
  'aiSuggestion',
  'intent',
  'planVersion',
  'plan',
  'scheduleBlock',
  'scheduleChange',
  'schedule',
  'scheduleProposalRecord',
  'deviationState',
  'interventionState',
  'meetingArtifact',
  'recommendationState',
  'replanningPolicy',
  'notification',
  'integration',
  'permission',
  'autonomyPolicy',
  'ruleConflict',
  'autonomyRule',
  'reminder',
  'timeBlock',
  'focusBlock',
  'travelBuffer',
  'availabilityRule',
  'constraint',
  'deadline',
  'commitment',
  'routine',
  'milestone',
  'task',
  'project',
  'goal',
  'event',
  'calendar',
  'calendarConnection',
  'preference',
  'profile',
  'session',
  'auditLog',
] as unknown as Array<keyof PrismaService>;

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CalendarConnectionService))
    private readonly connectionService: CalendarConnectionService
  ) {}

  /**
   * Explicit confirmation step: the caller must echo the account's own email
   * back. Prevents a stolen session token from silently nuking the account.
   */
  async requestDeleteBySelf(userId: string, confirmEmail: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Account not found');
    }
    if (!confirmEmail || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException(
        'Account deletion requires explicit confirmation: send back your own email address in the "confirm" field.'
      );
    }
    await this.deleteAccount(userId);
  }

  /**
   * Full erasure. Idempotent enough to retry if a mid-flight step failed
   * (revocation failures are logged and never block deletion).
   */
  async deleteAccount(userId: string): Promise<void> {
    // 1. Revoke every provider grant, then drop the connection rows. Uses the
    //    C3 disconnect() path so tokens hit Google's revoke endpoint first.
    const connections = await this.prisma.calendarConnection.findMany({
      where: { userId },
      select: { provider: true },
    });
    for (const connection of connections) {
      try {
        await this.connectionService.disconnect(userId, connection.provider);
      } catch (error: any) {
        // disconnect() already tolerates revoke failure; this guard covers
        // local-DB errors, which must still not strand the deletion.
        this.logger.warn(
          `Account deletion: disconnect(${connection.provider}) failed for user ${userId}: ${error?.message}`
        );
      }
    }

    // 2. Parent-scoped rows (no userId column) must go before their owners.
    const [taskIds, eventIds] = await Promise.all([
      this.prisma.task.findMany({ where: { userId }, select: { id: true } }),
      this.prisma.event.findMany({ where: { userId }, select: { id: true } }),
    ]);
    if (taskIds.length > 0) {
      const ids = taskIds.map((t) => t.id);
      await this.prisma.taskDependency.deleteMany({
        where: { OR: [{ taskId: { in: ids } }, { dependsOnId: { in: ids } }] },
      });
    }
    if (eventIds.length > 0) {
      await this.prisma.eventParticipant.deleteMany({
        where: { eventId: { in: eventIds.map((e) => e.id) } },
      });
    }

    // 3. Delete every user-owned row (connections/calendar data/AI memory are
    //    covered by the list; order is children-before-parents).
    for (const table of USER_ID_TABLES) {
      const delegate = (this.prisma as any)[table];
      if (!delegate?.deleteMany) {
        throw new Error(`Account deletion: unknown Prisma delegate "${String(table)}"`);
      }
      await delegate.deleteMany({ where: { userId } });
    }

    // 4. Hard-delete the account row itself.
    await this.prisma.user.delete({ where: { id: userId } });

    // Operational trail: identifiers only, no PII, survives in app logs.
    this.logger.log(`Account fully deleted for user ${userId}`);
  }
}

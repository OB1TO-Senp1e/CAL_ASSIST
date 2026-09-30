import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/services/prisma.service';
import { MeetingPreparationResult, PostMeetingResult } from './meeting-intelligence.types';

export type MeetingArtifactKind = 'PREPARATION' | 'POST_MEETING';

/**
 * Persists meeting preparation and post-meeting results.
 *
 * Before this, the six `GET /api/meetings/:id/*` routes returned a literal
 * `{ message: 'Retrieve saved preparation for meeting' }` placeholder and no
 * result was ever saved, so nothing could be retrieved.
 */
@Injectable()
export class MeetingArtifactStore {
  constructor(private readonly prisma: PrismaService) {}

  async savePreparation(
    userId: string,
    meetingId: string,
    meetingTitle: string | undefined,
    result: MeetingPreparationResult
  ): Promise<void> {
    await this.prisma.meetingArtifact.upsert({
      where: {
        userId_meetingId_kind: { userId, meetingId, kind: 'PREPARATION' },
      },
      update: {
        payload: result as unknown as Prisma.InputJsonValue,
        summary: result.summary,
        confidence: result.confidence,
        meetingTitle: meetingTitle ?? null,
      },
      create: {
        userId,
        meetingId,
        kind: 'PREPARATION',
        meetingTitle: meetingTitle ?? null,
        payload: result as unknown as Prisma.InputJsonValue,
        summary: result.summary,
        confidence: result.confidence,
      },
    });
  }

  async savePostMeeting(
    userId: string,
    meetingId: string,
    meetingTitle: string | undefined,
    result: PostMeetingResult
  ): Promise<void> {
    await this.prisma.meetingArtifact.upsert({
      where: {
        userId_meetingId_kind: { userId, meetingId, kind: 'POST_MEETING' },
      },
      update: {
        payload: result as unknown as Prisma.InputJsonValue,
        summary: result.summary,
        confidence: result.confidence,
        meetingTitle: meetingTitle ?? null,
      },
      create: {
        userId,
        meetingId,
        kind: 'POST_MEETING',
        meetingTitle: meetingTitle ?? null,
        payload: result as unknown as Prisma.InputJsonValue,
        summary: result.summary,
        confidence: result.confidence,
      },
    });
  }

  /** Reads an artifact, enforcing user scoping so ids are not guessable. */
  async load<T>(userId: string, meetingId: string, kind: MeetingArtifactKind): Promise<T> {
    const row = await this.prisma.meetingArtifact.findFirst({
      where: { userId, meetingId, kind },
    });
    if (!row) {
      throw new NotFoundException(
        `No ${kind === 'PREPARATION' ? 'preparation' : 'post-meeting result'} saved for meeting ${meetingId}`
      );
    }
    return row.payload as unknown as T;
  }

  async hasPostMeeting(userId: string, meetingId: string): Promise<boolean> {
    const count = await this.prisma.meetingArtifact.count({
      where: { userId, meetingId, kind: 'POST_MEETING' },
    });
    return count > 0;
  }
}

import { Controller, Get, Post, Body, UseGuards, Request, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MeetingIntelligenceService } from './meeting-intelligence.service';
import { MeetingArtifactStore } from './meeting-artifact.store';
import {
  MeetingPreparationInput,
  MeetingPreparationResult,
  MeetingTranscriptInput,
  PostMeetingResult,
} from './meeting-intelligence.types';

/**
 * Meeting Intelligence HTTP surface.
 *
 *   POST /prepare                       generate + persist a pre-meeting pack
 *   POST /process                       extract + persist post-meeting results
 *   GET  /:id/preparation               read the persisted preparation
 *   GET  /:id/post-meeting              read the persisted extraction
 *   GET  /:id/action-items|commitments|deadlines|follow-ups
 *
 * The GET routes previously returned placeholder objects like
 * `{ message: 'Retrieve saved preparation for meeting' }` because nothing was
 * ever stored; they now read from MeetingArtifact.
 */
@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingIntelligenceController {
  constructor(
    private readonly meetingIntelligenceService: MeetingIntelligenceService,
    private readonly artifacts: MeetingArtifactStore
  ) {}

  @Post('prepare')
  async generatePreparation(@Request() req, @Body() body: MeetingPreparationInput) {
    return this.meetingIntelligenceService.generatePreMeetingPreparation(req.user.id, body);
  }

  @Post('process')
  async processPostMeeting(@Request() req, @Body() body: MeetingTranscriptInput) {
    return this.meetingIntelligenceService.processPostMeeting(req.user.id, body);
  }

  @Get(':meetingId/preparation')
  async getPreparation(@Request() req, @Param('meetingId') meetingId: string) {
    return this.artifacts.load<MeetingPreparationResult>(req.user.id, meetingId, 'PREPARATION');
  }

  @Get(':meetingId/post-meeting')
  async getPostMeeting(@Request() req, @Param('meetingId') meetingId: string) {
    return this.artifacts.load<PostMeetingResult>(req.user.id, meetingId, 'POST_MEETING');
  }

  @Get(':meetingId/action-items')
  async getActionItems(@Request() req, @Param('meetingId') meetingId: string) {
    const result = await this.artifacts.load<PostMeetingResult>(
      req.user.id,
      meetingId,
      'POST_MEETING'
    );
    return { meetingId, actionItems: result.actionItems ?? [] };
  }

  @Get(':meetingId/commitments')
  async getCommitments(@Request() req, @Param('meetingId') meetingId: string) {
    const result = await this.artifacts.load<PostMeetingResult>(
      req.user.id,
      meetingId,
      'POST_MEETING'
    );
    return { meetingId, commitments: result.commitments ?? [] };
  }

  @Get(':meetingId/deadlines')
  async getDeadlines(@Request() req, @Param('meetingId') meetingId: string) {
    const result = await this.artifacts.load<PostMeetingResult>(
      req.user.id,
      meetingId,
      'POST_MEETING'
    );
    return { meetingId, deadlines: result.deadlines ?? [] };
  }

  @Get(':meetingId/follow-ups')
  async getFollowUps(@Request() req, @Param('meetingId') meetingId: string) {
    const result = await this.artifacts.load<PostMeetingResult>(
      req.user.id,
      meetingId,
      'POST_MEETING'
    );
    return { meetingId, followUps: result.followUps ?? [] };
  }
}

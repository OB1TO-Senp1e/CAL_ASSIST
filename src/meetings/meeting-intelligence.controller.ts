import { Controller, Get, Post, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MeetingIntelligenceService } from './meeting-intelligence.service';
import {
  MeetingPreparationInput,
  MeetingTranscriptInput,
  MeetingIntelligenceConfig,
} from './meeting-intelligence.types';

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingIntelligenceController {
  constructor(private readonly meetingIntelligenceService: MeetingIntelligenceService) {}

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
    // This would retrieve a previously generated preparation
    return { message: 'Retrieve saved preparation for meeting' };
  }

  @Get(':meetingId/post-meeting')
  async getPostMeeting(@Request() req, @Param('meetingId') meetingId: string) {
    // This would retrieve a previously processed post-meeting result
    return { message: 'Retrieve saved post-meeting result' };
  }

  @Get(':meetingId/action-items')
  async getActionItems(@Request() req, @Param('meetingId') meetingId: string) {
    // Retrieve extracted action items for a meeting
    return { message: 'Retrieve action items for meeting' };
  }

  @Get(':meetingId/commitments')
  async getCommitments(@Request() req, @Param('meetingId') meetingId: string) {
    return { message: 'Retrieve commitments from meeting' };
  }

  @Get(':meetingId/deadlines')
  async getDeadlines(@Request() req, @Param('meetingId') meetingId: string) {
    return { message: 'Retrieve deadlines from meeting' };
  }

  @Get(':meetingId/follow-ups')
  async getFollowUps(@Request() req, @Param('meetingId') meetingId: string) {
    return { message: 'Retrieve follow-ups from meeting' };
  }
}
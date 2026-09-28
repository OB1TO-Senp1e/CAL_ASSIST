import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/services/prisma.service';
import { AiProviderService } from '../integrations/ai-providers/ai-provider.service';
import { MeetingArtifactStore } from './meeting-artifact.store';
import {
  MeetingPreparationInput,
  MeetingPreparationResult,
  PreparationChecklistItem,
  PreviousContext,
  OutstandingCommitment,
  RelevantTask,
  SuggestedAgendaItem,
  MeetingTranscriptInput,
  PostMeetingResult,
  ExtractedActionItem,
  ExtractedCommitment,
  ExtractedDeadline,
  ExtractedFollowUp,
  MeetingIntelligenceConfig,
} from './meeting-intelligence.types';

@Injectable()
export class MeetingIntelligenceService {
  private readonly logger = new Logger(MeetingIntelligenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly artifacts: MeetingArtifactStore,
  ) {}

  async generatePreMeetingPreparation(
    userId: string,
    input: MeetingPreparationInput,
  ): Promise<MeetingPreparationResult> {
    const [
      checklist,
      previousContext,
      outstandingCommitments,
      relevantTasks,
      suggestedAgenda,
    ] = await Promise.all([
      this.generateChecklist(userId, input),
      this.getPreviousContext(userId, input),
      this.getOutstandingCommitments(userId, input),
      this.getRelevantTasks(userId, input),
      this.generateSuggestedAgenda(userId, input),
    ]);

    const summary = this.generatePreparationSummary(
      checklist,
      previousContext,
      outstandingCommitments,
      relevantTasks,
      suggestedAgenda,
    );

    const confidence = this.calculatePreparationConfidence(
      checklist,
      previousContext,
      outstandingCommitments,
      relevantTasks,
    );

    const result: MeetingPreparationResult = {
      meetingId: input.meetingId,
      checklist,
      previousContext,
      outstandingCommitments,
      relevantTasks,
      suggestedAgenda,
      generatedAt: new Date().toISOString(),
      confidence,
      summary,
    };

    // Persist so GET /api/meetings/:id/preparation can return it later.
    await this.artifacts.savePreparation(userId, input.meetingId, input.meetingTitle, result);

    return result;
  }

  private async generateChecklist(
    userId: string,
    input: MeetingPreparationInput,
  ): Promise<PreparationChecklistItem[]> {
    const items: PreparationChecklistItem[] = [];

    // Material preparation
    if (input.meetingType === 'CLIENT_MEETING' || input.meetingType === 'BOARD') {
      items.push({
        id: `check_${Date.now()}_1`,
        title: 'Prepare presentation materials',
        description: 'Review and finalize slides, handouts, or demo materials',
        category: 'MATERIALS',
        priority: 'HIGH',
        estimatedMinutes: 30,
        completed: false,
      });

      items.push({
        id: `check_${Date.now()}_2`,
        title: 'Review client/project background',
        description: 'Refresh on client history, recent interactions, and key metrics',
        category: 'RESEARCH',
        priority: 'HIGH',
        estimatedMinutes: 15,
        completed: false,
      });
    }

    // Decision preparation
    if (input.agendaItems?.some(a => a.title.toLowerCase().includes('decision'))) {
      items.push({
        id: `check_${Date.now()}_3`,
        title: 'Prepare decision framework',
        description: 'Gather data, options, and criteria for pending decisions',
        category: 'DECISIONS',
        priority: 'HIGH',
        estimatedMinutes: 20,
        completed: false,
      });
    }

    // Updates from previous meetings
    const previousMeetings = await this.getPreviousMeetings(userId);
    if (previousMeetings.length > 0) {
      items.push({
        id: `check_${Date.now()}_4`,
        title: 'Review previous action items',
        description: 'Check status of action items from previous meetings',
        category: 'FOLLOW_UPS',
        priority: 'MEDIUM',
        estimatedMinutes: 10,
        completed: false,
      });
    }

    // Technical preparation
    if (input.location?.includes('video') || input.meetingType?.includes('TEAM')) {
      items.push({
        id: `check_${Date.now()}_5`,
        title: 'Test video conferencing setup',
        description: 'Verify camera, microphone, screen sharing, and connection',
        category: 'TECHNICAL',
        priority: 'MEDIUM',
        estimatedMinutes: 5,
        completed: false,
      });
    }

    // Logistics
    items.push({
      id: `check_${Date.now()}_6`,
      title: 'Confirm meeting details',
      description: 'Verify time, timezone, location/link, and attendee list',
      category: 'LOGISTICS',
      priority: 'HIGH',
      estimatedMinutes: 5,
      completed: false,
    });

    return items;
  }

  private async getPreviousContext(
    userId: string,
    input: MeetingPreparationInput,
  ): Promise<PreviousContext[]> {
    // Get previous meetings with same attendees or same project
    const attendeeEmails = input.attendees?.map(a => a.email) || [];
    
    // The Prisma relation is `eventParticipants`, not `participants`, and Event
    // has no `projectId` column. The previous shape threw
    // "Unknown argument `participants`", making every POST /api/meetings/prepare 500.
    const previousMeetings = await this.prisma.event.findMany({
      where: {
        userId,
        deletedAt: null,
        endDate: { lt: new Date(input.startTime) },
        ...(attendeeEmails.length > 0 && {
          eventParticipants: { some: { email: { in: attendeeEmails } } },
        }),
      },
      orderBy: { endDate: 'desc' },
      take: 5,
    });

    return previousMeetings.map(m => ({
      meetingId: m.id,
      meetingTitle: m.title,
      date: m.endDate.toISOString(),
      summary: m.description || 'No summary available',
      actionItems: [], // Would be populated from meeting notes
      decisions: [],
      keyDiscussions: [],
      attendees: [],
    }));
  }

  private async getOutstandingCommitments(
    userId: string,
    input: MeetingPreparationInput,
  ): Promise<OutstandingCommitment[]> {
    const commitments = await this.prisma.commitment.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        deadline: { lte: new Date(input.endTime) },
      },
      orderBy: { deadline: 'asc' },
    });

    return commitments.map(c => ({
      commitmentId: c.id,
      object: c.title,
      // `person` is declared on OutstandingCommitment but could never be filled
      // while the Commitment row had nowhere to keep it.
      person: c.person ?? undefined,
      deadline: c.deadline.toISOString(),
      status: (c.deadline < new Date() ? 'OVERDUE' : c.status) as 'PENDING' | 'IN_PROGRESS' | 'OVERDUE',
      riskLevel: c.deadline < new Date() ? 'CRITICAL' : 'MEDIUM',
      relatedToMeeting: false,
    }));
  }

  private async getRelevantTasks(
    userId: string,
    input: MeetingPreparationInput,
  ): Promise<RelevantTask[]> {
    const where: any = {
      userId,
      status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] },
    };

    if (input.relatedProjectId) {
      where.projectId = input.relatedProjectId;
    }
    if (input.relatedGoalId) {
      where.goalId = input.relatedGoalId;
    }

    const tasks = await this.prisma.task.findMany({
      where,
      include: { project: true },
      orderBy: { priority: 'desc' },
      take: 10,
    });

    return tasks.map(t => ({
      taskId: t.id,
      title: t.title,
      status: t.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED',
      priority: t.priority,
      dueDate: t.dueDate?.toISOString(),
      estimatedMinutes: t.estimatedDurationMin || undefined,
      projectId: t.projectId ?? undefined,
      projectName: t.project?.title,
      relatedToMeeting: false,
    }));
  }

  private async generateSuggestedAgenda(
    userId: string,
    input: MeetingPreparationInput,
  ): Promise<SuggestedAgendaItem[]> {
    const items: SuggestedAgendaItem[] = [];

    // Add user-provided agenda items first
    if (input.agendaItems) {
      for (let i = 0; i < input.agendaItems.length; i++) {
        const item = input.agendaItems[i];
        items.push({
          id: `agenda_${i}`,
          title: item.title,
          description: item.description,
          estimatedMinutes: item.estimatedMinutes || 15,
          type: 'DISCUSSION',
          priority: 'MEDIUM',
          suggestedOwner: item.owner,
        });
      }
    }

    // Add suggested items based on meeting type
    switch (input.meetingType) {
      case 'TEAM_SYNC':
        items.push(
          { id: 'sugg_1', title: 'Team updates', description: 'Quick status from each member', estimatedMinutes: 15, type: 'UPDATE', priority: 'HIGH' },
          { id: 'sugg_2', title: 'Blockers & help needed', description: 'Identify where team needs support', estimatedMinutes: 10, type: 'DISCUSSION', priority: 'HIGH' },
          { id: 'sugg_3', title: 'Priorities for next week', description: 'Align on top priorities', estimatedMinutes: 10, type: 'PLANNING', priority: 'MEDIUM' },
        );
        break;
      case 'ONE_ON_ONE':
        items.push(
          { id: 'sugg_1', title: 'Check-in', description: 'How are things going?', estimatedMinutes: 10, type: 'UPDATE', priority: 'HIGH' },
          { id: 'sugg_2', title: 'Goals & growth', description: 'Discuss progress and development', estimatedMinutes: 15, type: 'DISCUSSION', priority: 'MEDIUM' },
          { id: 'sugg_3', title: 'Feedback & support', description: 'Two-way feedback', estimatedMinutes: 10, type: 'DISCUSSION', priority: 'MEDIUM' },
        );
        break;
      case 'CLIENT_MEETING':
        items.push(
          { id: 'sugg_1', title: 'Project status update', description: 'Current progress and milestones', estimatedMinutes: 15, type: 'UPDATE', priority: 'HIGH' },
          { id: 'sugg_2', title: 'Upcoming deliverables', description: 'Review timeline and commitments', estimatedMinutes: 10, type: 'REVIEW', priority: 'HIGH' },
          { id: 'sugg_3', title: 'Next steps & decisions', description: 'Agree on action items', estimatedMinutes: 15, type: 'DECISION', priority: 'HIGH' },
        );
        break;
      case 'RETROSPECTIVE':
        items.push(
          { id: 'sugg_1', title: 'What went well', description: 'Celebrate successes', estimatedMinutes: 15, type: 'RETROSPECTIVE', priority: 'HIGH' },
          { id: 'sugg_2', title: 'What could improve', description: 'Identify areas for improvement', estimatedMinutes: 20, type: 'RETROSPECTIVE', priority: 'HIGH' },
          { id: 'sugg_3', title: 'Action items', description: 'Commit to specific improvements', estimatedMinutes: 15, type: 'PLANNING', priority: 'HIGH' },
        );
        break;
      case 'PLANNING':
        items.push(
          { id: 'sugg_1', title: 'Review objectives', description: 'Confirm goals and constraints', estimatedMinutes: 10, type: 'REVIEW', priority: 'HIGH' },
          { id: 'sugg_2', title: 'Break down work', description: 'Decompose into tasks', estimatedMinutes: 20, type: 'PLANNING', priority: 'HIGH' },
          { id: 'sugg_3', title: 'Assign & schedule', description: 'Owners and timelines', estimatedMinutes: 15, type: 'DECISION', priority: 'HIGH' },
        );
        break;
    }

    // Add outstanding commitments discussion if any
    const commitments = await this.prisma.commitment.findMany({
      where: { userId: (await this.getUserIdFromMeeting(input.meetingId)) || '', status: { in: ['PENDING', 'IN_PROGRESS'] } },
      take: 3,
    });

    if (commitments.length > 0) {
      items.push({
        id: `sugg_commitments`,
        title: 'Review outstanding commitments',
        description: `Review ${commitments.length} pending commitments`,
        estimatedMinutes: 10,
        type: 'REVIEW',
        priority: 'HIGH',
      });
    }

    return items;
  }

  private async getPreviousMeetings(userId: string) {
    return this.prisma.event.findMany({
      where: { userId, endDate: { lt: new Date() } },
      orderBy: { endDate: 'desc' },
      take: 5,
    });
  }

  private async getUserIdFromMeeting(meetingId: string): Promise<string | null> {
    const event = await this.prisma.event.findUnique({ where: { id: meetingId }, select: { userId: true } });
    return event?.userId || null;
  }

  private generatePreparationSummary(
    checklist: PreparationChecklistItem[],
    previousContext: PreviousContext[],
    outstandingCommitments: OutstandingCommitment[],
    relevantTasks: RelevantTask[],
    suggestedAgenda: SuggestedAgendaItem[],
  ): string {
    const highPriorityChecks = checklist.filter(c => c.priority === 'HIGH').length;
    const overdueCommitments = outstandingCommitments.filter(c => c.status === 'OVERDUE').length;
    const highPriorityTasks = relevantTasks.filter(t => t.priority >= 8).length;

    return `Meeting preparation complete: ${checklist.length} checklist items (${highPriorityChecks} high priority), ${previousContext.length} previous meetings for context, ${outstandingCommitments.length} outstanding commitments (${overdueCommitments} overdue), ${relevantTasks.length} relevant tasks (${highPriorityTasks} high priority), ${suggestedAgenda.length} suggested agenda items.`;
  }

  private calculatePreparationConfidence(
    checklist: PreparationChecklistItem[],
    previousContext: PreviousContext[],
    outstandingCommitments: OutstandingCommitment[],
    relevantTasks: RelevantTask[],
  ): number {
    let confidence = 0.5;
    if (checklist.length > 0) confidence += 0.1;
    if (previousContext.length > 0) confidence += 0.1;
    if (outstandingCommitments.length > 0) confidence += 0.1;
    if (relevantTasks.length > 0) confidence += 0.1;
    return Math.min(confidence, 1.0);
  }

  async processPostMeeting(
    userId: string,
    input: MeetingTranscriptInput,
  ): Promise<PostMeetingResult> {
    const extracted = await this.extractFromMeeting(input);

    const actionItems = await this.processActionItems(userId, extracted.actionItems);
    const commitments = await this.processCommitments(userId, extracted.commitments);
    const deadlines = await this.processDeadlines(userId, extracted.deadlines);
    const followUps = await this.processFollowUps(userId, extracted.followUps);

    const requiresConfirmation = this.determineRequiresConfirmation(
      actionItems,
      commitments,
      deadlines,
      followUps,
    );

    const summary = this.generatePostMeetingSummary(
      actionItems,
      commitments,
      deadlines,
      followUps,
    );

    const result: PostMeetingResult = {
      meetingId: input.meetingId,
      actionItems,
      commitments,
      deadlines,
      followUps,
      summary,
      keyDecisions: extracted.extractedContent?.decisions || [],
      blockers: extracted.extractedContent?.blockers || [],
      risks: extracted.extractedContent?.risks || [],
      generatedAt: new Date().toISOString(),
      confidence: this.calculatePostMeetingConfidence(extracted),
      requiresConfirmation,
    };

    // Persist so the per-meeting GET routes can serve the extraction later.
    await this.artifacts.savePostMeeting(userId, input.meetingId, input.title, result);

    return result;
  }

  private async extractFromMeeting(input: MeetingTranscriptInput): Promise<{
    actionItems: ExtractedActionItem[];
    commitments: ExtractedCommitment[];
    deadlines: ExtractedDeadline[];
    followUps: ExtractedFollowUp[];
    extractedContent: any;
  }> {
    const content = input.transcript || input.notes || '';

    if (!content && !input.extractedContent) {
      return {
        actionItems: [],
        commitments: [],
        deadlines: [],
        followUps: [],
        extractedContent: input.extractedContent || {},
      };
    }

    const prompt = `
Extract structured information from this meeting:

Meeting: ${input.title}
Duration: ${input.startTime} to ${input.endTime}
Attendees: ${input.attendees?.map(a => a.name || a.email).join(', ') || 'Unknown'}
Content: ${content || 'No transcript/notes provided'}

${input.extractedContent ? `Pre-extracted content: ${JSON.stringify(input.extractedContent)}` : ''}

Extract and return JSON with:
{
  "actionItems": [{"description": "...", "assignee": "...", "dueDate": "ISO", "priority": "HIGH|MEDIUM|LOW", "confidence": 0.9}],
  "commitments": [{"description": "...", "person": "...", "deadline": "ISO", "confidence": 0.8}],
  "deadlines": [{"description": "...", "date": "ISO", "assignee": "...", "confidence": 0.9}],
  "followUps": [{"description": "...", "assignee": "...", "dueDate": "ISO", "confidence": 0.8}],
  "decisions": ["..."],
  "keyTopics": ["..."],
  "blockers": ["..."],
  "risks": ["..."]
}

Only extract information explicitly mentioned. Use confidence < 0.7 for uncertain items.
`;

    try {
      const response = await this.aiProvider.generateStructured(prompt, {
        temperature: 0.2,
        maxTokens: 3000,
      });

      return {
        actionItems: response.actionItems || [],
        commitments: response.commitments || [],
        deadlines: response.deadlines || [],
        followUps: response.followUps || [],
        extractedContent: {
          decisions: response.decisions || [],
          keyTopics: response.keyTopics || [],
          blockers: response.blockers || [],
          risks: response.risks || [],
        },
      };
    } catch (error) {
      this.logger.error(`Meeting extraction failed: ${error}`);
      return {
        actionItems: [],
        commitments: [],
        deadlines: [],
        followUps: [],
        extractedContent: input.extractedContent || {},
      };
    }
  }

  private async processActionItems(
    userId: string,
    items: ExtractedActionItem[],
  ): Promise<ExtractedActionItem[]> {
    return items.map(item => ({
      ...item,
      id: item.id || `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source: 'TRANSCRIPT',
      confidence: item.confidence || 0.8,
    }));
  }

  private async processCommitments(
    userId: string,
    items: ExtractedCommitment[],
  ): Promise<ExtractedCommitment[]> {
    return items.map(item => ({
      ...item,
      id: item.id || `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source: 'TRANSCRIPT',
      confidence: item.confidence || 0.7,
    }));
  }

  private async processDeadlines(
    userId: string,
    items: ExtractedDeadline[],
  ): Promise<ExtractedDeadline[]> {
    return items.map(item => ({
      ...item,
      id: item.id || `deadline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source: 'TRANSCRIPT',
      confidence: item.confidence || 0.8,
    }));
  }

  private async processFollowUps(
    userId: string,
    items: ExtractedFollowUp[],
  ): Promise<ExtractedFollowUp[]> {
    return items.map(item => ({
      ...item,
      id: item.id || `followup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source: 'TRANSCRIPT',
      confidence: item.confidence || 0.8,
    }));
  }

  private determineRequiresConfirmation(
    actionItems: ExtractedActionItem[],
    commitments: ExtractedCommitment[],
    deadlines: ExtractedDeadline[],
    followUps: ExtractedFollowUp[],
  ): string[] {
    const requires: string[] = [];

    if (commitments.length > 0) requires.push(`${commitments.length} commitment(s) require confirmation`);
    if (deadlines.length > 0) requires.push(`${deadlines.length} deadline(s) require confirmation`);
    if (actionItems.some(a => a.priority === 'HIGH' && a.confidence < 0.8)) {
      requires.push('High-priority action items with low confidence need review');
    }

    return requires;
  }

  private generatePostMeetingSummary(
    actionItems: ExtractedActionItem[],
    commitments: ExtractedCommitment[],
    deadlines: ExtractedDeadline[],
    followUps: ExtractedFollowUp[],
  ): string {
    return `Meeting processed: ${actionItems.length} action item(s), ${commitments.length} commitment(s), ${deadlines.length} deadline(s), ${followUps.length} follow-up(s) extracted.`;
  }

  private calculatePostMeetingConfidence(extracted: any): number {
    let confidence = 0.5;
    if (extracted.actionItems?.length > 0) confidence += 0.1;
    if (extracted.commitments?.length > 0) confidence += 0.1;
    if (extracted.deadlines?.length > 0) confidence += 0.1;
    if (extracted.extractedContent?.decisions?.length > 0) confidence += 0.1;
    return Math.min(confidence, 1.0);
  }
}
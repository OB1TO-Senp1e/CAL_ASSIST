import { z } from 'zod';

export const MeetingPreparationSchema = z.object({
  meetingId: z.string(),
  meetingTitle: z.string(),
  meetingDescription: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attendees: z.array(z.object({
    email: z.string().email(),
    name: z.string().optional(),
    role: z.enum(['ORGANIZER', 'REQUIRED', 'OPTIONAL']).optional(),
  })).optional(),
  location: z.string().optional(),
  meetingType: z.enum(['STANDARD', 'ONE_ON_ONE', 'TEAM_SYNC', 'CLIENT_MEETING', 'BOARD', 'INTERVIEW', 'RETROSPECTIVE', 'PLANNING', 'OTHER']).optional(),
  relatedProjectId: z.string().optional(),
  relatedGoalId: z.string().optional(),
  agendaItems: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    estimatedMinutes: z.number().int().positive().optional(),
    owner: z.string().optional(),
  })).optional(),
});

export type MeetingPreparationInput = z.infer<typeof MeetingPreparationSchema>;

export const PreparationChecklistItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  category: z.enum(['MATERIALS', 'RESEARCH', 'DECISIONS', 'UPDATES', 'FOLLOW_UPS', 'LOGISTICS', 'TECHNICAL', 'OTHER']),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  estimatedMinutes: z.number().int().positive().optional(),
  completed: z.boolean().default(false),
  relatedEntityType: z.enum(['TASK', 'COMMITMENT', 'DOCUMENT', 'CONTACT', 'NONE']).optional(),
  relatedEntityId: z.string().optional(),
});

export type PreparationChecklistItem = z.infer<typeof PreparationChecklistItemSchema>;

export const PreviousContextSchema = z.object({
  meetingId: z.string(),
  meetingTitle: z.string(),
  date: z.string().datetime(),
  summary: z.string(),
  actionItems: z.array(z.object({
    title: z.string(),
    assignee: z.string().optional(),
    status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    dueDate: z.string().datetime().optional(),
  })).optional(),
  decisions: z.array(z.string()).optional(),
  keyDiscussions: z.array(z.string()).optional(),
  attendees: z.array(z.string()).optional(),
});

export type PreviousContext = z.infer<typeof PreviousContextSchema>;

export const OutstandingCommitmentSchema = z.object({
  commitmentId: z.string(),
  object: z.string(),
  person: z.string().optional(),
  deadline: z.string().datetime(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'OVERDUE']),
  riskLevel: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  relatedToMeeting: z.boolean().default(false),
});

export type OutstandingCommitment = z.infer<typeof OutstandingCommitmentSchema>;

export const RelevantTaskSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']),
  priority: z.number().int().min(1).max(10),
  dueDate: z.string().datetime().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  relatedToMeeting: z.boolean().default(false),
});

export type RelevantTask = z.infer<typeof RelevantTaskSchema>;

export const SuggestedAgendaItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  estimatedMinutes: z.number().int().positive(),
  type: z.enum(['UPDATE', 'DISCUSSION', 'DECISION', 'REVIEW', 'PLANNING', 'BRAINSTORM', 'RETROSPECTIVE', 'OTHER']),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  suggestedOwner: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  relatedEntities: z.array(z.object({
    type: z.enum(['TASK', 'COMMITMENT', 'GOAL', 'PROJECT', 'PREVIOUS_MEETING']),
    id: z.string(),
    title: z.string(),
  })).optional(),
});

export type SuggestedAgendaItem = z.infer<typeof SuggestedAgendaItemSchema>;

export const MeetingPreparationResultSchema = z.object({
  meetingId: z.string(),
  checklist: z.array(PreparationChecklistItemSchema),
  previousContext: z.array(PreviousContextSchema),
  outstandingCommitments: z.array(OutstandingCommitmentSchema),
  relevantTasks: z.array(RelevantTaskSchema),
  suggestedAgenda: z.array(SuggestedAgendaItemSchema),
  generatedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

export type MeetingPreparationResult = z.infer<typeof MeetingPreparationResultSchema>;

export const MeetingTranscriptSchema = z.object({
  meetingId: z.string(),
  title: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attendees: z.array(z.object({
    email: z.string().email(),
    name: z.string().optional(),
    joinedAt: z.string().datetime().optional(),
    leftAt: z.string().datetime().optional(),
  })).optional(),
  transcript: z.string().optional(),
  recordingUrl: z.string().url().optional(),
  notes: z.string().optional(),
  extractedContent: z.object({
    decisions: z.array(z.string()).optional(),
    actionItems: z.array(z.object({
      description: z.string(),
      assignee: z.string().optional(),
      dueDate: z.string().datetime().optional(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
    })).optional(),
    commitments: z.array(z.object({
      description: z.string(),
      person: z.string().optional(),
      deadline: z.string().datetime().optional(),
    })).optional(),
    deadlines: z.array(z.object({
      description: z.string(),
      date: z.string().datetime(),
      assignee: z.string().optional(),
    })).optional(),
    followUps: z.array(z.object({
      description: z.string(),
      assignee: z.string().optional(),
      dueDate: z.string().datetime().optional(),
    })).optional(),
    keyTopics: z.array(z.string()).optional(),
    blockers: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
  }).optional(),
});

export type MeetingTranscriptInput = z.infer<typeof MeetingTranscriptSchema>;

export const ExtractedActionItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  assignee: z.string().optional(),
  assigneeEmail: z.string().email().optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PENDING'),
  source: z.enum(['TRANSCRIPT', 'NOTES', 'MANUAL']).default('TRANSCRIPT'),
  confidence: z.number().min(0).max(1).default(1.0),
  context: z.string().optional(),
  relatedEntities: z.array(z.object({
    type: z.enum(['TASK', 'COMMITMENT', 'GOAL', 'PROJECT', 'MEETING']),
    id: z.string().optional(),
    title: z.string().optional(),
  })).optional(),
});

export type ExtractedActionItem = z.infer<typeof ExtractedActionItemSchema>;

export const ExtractedCommitmentSchema = z.object({
  id: z.string(),
  description: z.string(),
  person: z.string().optional(),
  personEmail: z.string().email().optional(),
  deadline: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  source: z.enum(['TRANSCRIPT', 'NOTES', 'MANUAL']).default('TRANSCRIPT'),
  context: z.string().optional(),
  relatedEntities: z.array(z.object({
    type: z.enum(['TASK', 'COMMITMENT', 'GOAL', 'PROJECT', 'MEETING']),
    id: z.string().optional(),
    title: z.string().optional(),
  })).optional(),
});

export type ExtractedCommitment = z.infer<typeof ExtractedCommitmentSchema>;

export const ExtractedDeadlineSchema = z.object({
  id: z.string(),
  description: z.string(),
  date: z.string().datetime(),
  assignee: z.string().optional(),
  assigneeEmail: z.string().email().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  source: z.enum(['TRANSCRIPT', 'NOTES', 'MANUAL']).default('TRANSCRIPT'),
  context: z.string().optional(),
  relatedEntities: z.array(z.object({
    type: z.enum(['TASK', 'COMMITMENT', 'GOAL', 'PROJECT', 'MEETING']),
    id: z.string().optional(),
    title: z.string().optional(),
  })).optional(),
});

export type ExtractedDeadline = z.infer<typeof ExtractedDeadlineSchema>;

export const ExtractedFollowUpSchema = z.object({
  id: z.string(),
  description: z.string(),
  assignee: z.string().optional(),
  assigneeEmail: z.string().email().optional(),
  dueDate: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  source: z.enum(['TRANSCRIPT', 'NOTES', 'MANUAL']).default('TRANSCRIPT'),
  context: z.string().optional(),
  relatedEntities: z.array(z.object({
    type: z.enum(['TASK', 'COMMITMENT', 'GOAL', 'PROJECT', 'MEETING']),
    id: z.string().optional(),
    title: z.string().optional(),
  })).optional(),
});

export type ExtractedFollowUp = z.infer<typeof ExtractedFollowUpSchema>;

export const PostMeetingResultSchema = z.object({
  meetingId: z.string(),
  actionItems: z.array(ExtractedActionItemSchema),
  commitments: z.array(ExtractedCommitmentSchema),
  deadlines: z.array(ExtractedDeadlineSchema),
  followUps: z.array(ExtractedFollowUpSchema),
  summary: z.string(),
  keyDecisions: z.array(z.string()),
  blockers: z.array(z.string()),
  risks: z.array(z.string()),
  generatedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.array(z.string()),
});

export type PostMeetingResult = z.infer<typeof PostMeetingResultSchema>;

export const MeetingIntelligenceConfigSchema = z.object({
  autoCreateTasks: z.boolean().default(false),
  autoCreateCommitments: z.boolean().default(false),
  requireConfirmationFor: z.array(z.enum(['TASK', 'COMMITMENT', 'DEADLINE', 'FOLLOW_UP'])).default(['COMMITMENT', 'DEADLINE']),
  defaultTaskPriority: z.number().int().min(1).max(10).default(5),
  defaultTaskDurationMinutes: z.number().int().positive().default(60),
  includeLowConfidenceItems: z.boolean().default(false),
  minConfidenceThreshold: z.number().min(0).max(1).default(0.7),
});

export type MeetingIntelligenceConfig = z.infer<typeof MeetingIntelligenceConfigSchema>;
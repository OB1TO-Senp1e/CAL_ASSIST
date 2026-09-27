import { latency } from '@/lib/mock/db';
import { estimateTravel, integrationMock } from '@/lib/mock/integrations';
import api from './api';
import { USE_MOCK } from './auth';
import type { CalendarProvider } from './types';
import type { CalendarConnectionDTO, DeadlineDTO, MeetingExtractionDTO, MeetingPreparationDTO, NotificationPreferencesDTO, TravelRequestDTO, TravelResultDTO, MeetingType } from './workflow-types';
import type { CalendarEventDTO } from './types';
import type { TaskDTO } from './types';
import type { CommitmentDTO } from './workflow-types';

type CalendarConnectionWire = CalendarConnectionDTO & { accessToken?: string | null; refreshToken?: string | null; tokenExpiresAt?: string | null };

function sanitizeConnection(connection: CalendarConnectionWire): CalendarConnectionDTO {
  const { accessToken: _accessToken, refreshToken: _refreshToken, tokenExpiresAt: _tokenExpiresAt, ...safe } = connection;
  return safe;
}

export const integrationsService = {
  canConnectCalendar: USE_MOCK,
  canEstimateTravel: USE_MOCK,
  async connections(): Promise<CalendarConnectionDTO[]> {
    if (!USE_MOCK) return (await api.get<CalendarConnectionWire[]>('/api/calendar/connections')).data.map(sanitizeConnection);
    await latency(); return integrationMock.connections();
  },
  async getAuthUrl(provider: Exclude<CalendarProvider, 'LOCAL' | 'APPLE'>, state: string): Promise<string> {
    if (!USE_MOCK) return (await api.get<{ authUrl: string }>(`/api/calendar/auth-url/${provider.toLowerCase()}`, { params: { state } })).data.authUrl;
    return `mock://${provider.toLowerCase()}/authorize?state=${encodeURIComponent(state)}`;
  },
  async connect(provider: Exclude<CalendarProvider, 'LOCAL' | 'APPLE'>): Promise<CalendarConnectionDTO> {
    if (!USE_MOCK) throw new Error('OAuth callback wiring is incompatible with the current backend route.');
    await latency(340, 580); const rows = integrationMock.connections(); const index = rows.findIndex((row) => row.provider === provider);
    const time = integrationMock.now();
    if (index < 0) throw new Error('Unsupported calendar provider');
    rows[index] = { ...rows[index], externalUserId: provider === 'GOOGLE' ? 'demo@gmail.com' : 'demo@outlook.test', scopes: provider === 'GOOGLE' ? ['calendar.readonly', 'calendar.events'] : ['Calendars.ReadWrite'], isActive: true, syncError: null, lastSync: time, updatedAt: time, calendars: [integrationMock.calendar(`${provider.toLowerCase()}_primary`, 'Primary', provider, provider === 'GOOGLE' ? '#34a853' : '#0078d4')] };
    integrationMock.saveConnections(rows); return rows[index];
  },
  async disconnect(provider: CalendarProvider): Promise<void> {
    if (!USE_MOCK) { await api.delete(`/api/calendar/connections/${provider.toLowerCase()}`); return; }
    await latency(220, 380); integrationMock.saveConnections(integrationMock.connections().map((row) => row.provider === provider && provider !== 'LOCAL' ? { ...row, isActive: false, calendars: [], updatedAt: integrationMock.now() } : row));
  },
  async sync(provider: CalendarProvider): Promise<{ provider: CalendarProvider; calendarsSynced: number; eventsSynced: number; syncedAt: string }> {
    if (!USE_MOCK) {
      const { data } = await api.post<{ calendarsSynced: number; eventsCreated: number; eventsUpdated: number; eventsDeleted: number; errors: string[] }>(`/api/calendar/sync/${provider.toLowerCase()}`);
      if (data.errors.length) throw new Error(data.errors.join('; '));
      return { provider, calendarsSynced: data.calendarsSynced, eventsSynced: data.eventsCreated + data.eventsUpdated, syncedAt: new Date().toISOString() };
    }
    await latency(500, 900); const rows = integrationMock.connections(); const index = rows.findIndex((row) => row.provider === provider && row.isActive);
    if (index < 0) throw new Error('Connect this provider before syncing.');
    const syncedAt = integrationMock.now(); rows[index] = { ...rows[index], lastSync: syncedAt, syncError: null, updatedAt: syncedAt }; integrationMock.saveConnections(rows);
    return { provider, calendarsSynced: rows[index].calendars.length, eventsSynced: 12, syncedAt };
  },
  async notificationPreferences(): Promise<NotificationPreferencesDTO | null> {
    if (!USE_MOCK) {
      const { data } = await api.get<{ preferences: Record<string, unknown>; timezone: string }>('/api/context/user');
      const defaults = integrationMock.notificationDefaults();
      const saved = (data.preferences.preferences ?? {}) as Partial<NotificationPreferencesDTO>;
      return {
        ...defaults,
        ...saved,
        app: { ...defaults.app, ...saved.app, enabled: saved.app?.enabled ?? defaults.app?.enabled ?? true },
        email: { ...defaults.email, ...saved.email, enabled: saved.email?.enabled ?? defaults.email?.enabled ?? false },
        sms: { ...defaults.sms, ...saved.sms, enabled: saved.sms?.enabled ?? defaults.sms?.enabled ?? false },
        push: { ...defaults.push, ...saved.push, enabled: saved.push?.enabled ?? defaults.push?.enabled ?? false },
        workingHours: {
          ...defaults.workingHours,
          ...saved.workingHours,
          enabled: saved.workingHours?.enabled ?? defaults.workingHours?.enabled ?? true,
          start: saved.workingHours?.start ?? defaults.workingHours?.start ?? '09:00',
          end: saved.workingHours?.end ?? defaults.workingHours?.end ?? '17:00',
          days: saved.workingHours?.days ?? defaults.workingHours?.days ?? [1, 2, 3, 4, 5],
        },
        timezone: saved.timezone ?? (data.timezone === 'local' ? defaults.timezone : data.timezone),
      };
    }
    await latency(100, 240); return integrationMock.notificationPreferences();
  },
  async updateNotificationPreferences(patch: Partial<NotificationPreferencesDTO>): Promise<NotificationPreferencesDTO> {
    if (!USE_MOCK) {
      const current = await this.notificationPreferences();
      if (!current) throw new Error('Notification preferences could not be read.');
      const next = { ...current, ...patch };
      await api.post('/api/notifications/preferences', next);
      return next;
    }
    await latency(140, 300); const next = { ...integrationMock.notificationPreferences(), ...patch }; integrationMock.saveNotificationPreferences(next); return next;
  },
  async estimateTravel(request: TravelRequestDTO): Promise<TravelResultDTO> {
    if (!USE_MOCK) throw new Error('No travel-time HTTP controller is available in the current API.');
    await latency(360, 600); if (!request.origin.address?.trim() || !request.destination.address?.trim()) throw new Error('Enter both an origin and destination.'); return estimateTravel(request);
  },
  async preparation(meetingId: string): Promise<MeetingPreparationDTO | null> {
    if (!USE_MOCK) return null;
    await latency(80, 180); return integrationMock.preparations()[meetingId] ?? null;
  },
  async prepareMeeting(event: CalendarEventDTO, meetingType: MeetingType, tasks: TaskDTO[], commitments: CommitmentDTO[]): Promise<MeetingPreparationDTO> {
    if (!USE_MOCK) {
      const { data } = await api.post<MeetingPreparationDTO>('/api/meetings/prepare', {
        meetingId: event.id, meetingTitle: event.title, meetingDescription: event.description ?? undefined,
        startTime: event.start, endTime: event.end, location: event.location ?? undefined, meetingType,
        attendees: event.participants.map((person) => ({ email: person.email, name: person.displayName ?? undefined, role: person.role })),
      });
      return data;
    }
    await latency(620, 900); const isClient = meetingType === 'CLIENT_MEETING' || meetingType === 'BOARD';
    const checklist: MeetingPreparationDTO['checklist'] = [
      { id: integrationMock.id('check'), title: 'Confirm meeting details', description: 'Verify time, timezone, location/link, and attendee list.', category: 'LOGISTICS', priority: 'HIGH', estimatedMinutes: 5, completed: false },
      { id: integrationMock.id('check'), title: isClient ? 'Review customer background' : 'Review recent context', description: 'Gather the latest notes and decisions before the meeting.', category: 'RESEARCH', priority: isClient ? 'HIGH' : 'MEDIUM', estimatedMinutes: 15, completed: false },
      { id: integrationMock.id('check'), title: 'Prepare discussion points', description: 'Choose the decisions or updates that need time.', category: 'DECISIONS', priority: 'MEDIUM', estimatedMinutes: 10, completed: false },
    ];
    const result: MeetingPreparationDTO = {
      meetingId: event.id, checklist,
      previousContext: [{ meetingId: 'meeting_previous', meetingTitle: 'Previous planning sync', date: new Date(Date.now() - 7 * 86_400_000).toISOString(), summary: 'The team reviewed launch readiness and open customer questions.', actionItems: [{ title: 'Share the revised launch outline', status: 'IN_PROGRESS' }], decisions: ['Keep the launch checklist focused on customer blockers.'], keyDiscussions: ['Release readiness'], attendees: event.participants.map((person) => person.displayName ?? person.email) }],
      outstandingCommitments: commitments.filter((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)).slice(0, 3).map((item) => ({ commitmentId: item.id, object: item.object, deadline: item.deadline, status: item.status === 'OVERDUE' ? 'OVERDUE' : item.status as 'PENDING' | 'IN_PROGRESS', riskLevel: new Date(item.deadline) < new Date() ? 'CRITICAL' : 'MEDIUM', relatedToMeeting: false })),
      relevantTasks: tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status)).slice(0, 5).map((task) => ({ taskId: task.id, title: task.title, status: task.status === 'ON_HOLD' ? 'BLOCKED' : task.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED', priority: Math.max(1, task.priority), dueDate: task.dueDate ?? undefined, estimatedMinutes: task.estimatedDurationMin ?? undefined, projectId: task.projectId ?? undefined, relatedToMeeting: false })),
      suggestedAgenda: [
        { id: integrationMock.id('agenda'), title: 'Progress and updates', description: 'Share the current state and changes since the last discussion.', estimatedMinutes: 10, type: 'UPDATE', priority: 'HIGH', relatedEntities: [] },
        { id: integrationMock.id('agenda'), title: 'Open decisions', description: 'Resolve the decisions that unblock next steps.', estimatedMinutes: 15, type: 'DECISION', priority: 'HIGH', relatedEntities: [] },
      ],
      generatedAt: integrationMock.now(), confidence: 0.84, summary: `Preparation is ready for ${event.title}, including ${checklist.length} checklist items and ${tasks.length} relevant tasks.`,
    };
    const all = integrationMock.preparations(); all[event.id] = result; integrationMock.savePreparations(all); return result;
  },
  async processMeeting(meetingId: string, title: string, notes: string, startTime: string, endTime: string): Promise<MeetingExtractionDTO> {
    if (!USE_MOCK) {
      return (await api.post<MeetingExtractionDTO>('/api/meetings/process', { meetingId, title, startTime, endTime, notes })).data;
    }
    await latency(650, 950); const lines = notes.split(/\r?\n/).map((line) => line.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
    if (!lines.length) throw new Error('Add notes or transcript text before processing.');
    const contentLines = lines.filter((line) => !/^(decision|blocker|risk):/i.test(line));
    const result: MeetingExtractionDTO = {
      meetingId,
      actionItems: contentLines.slice(0, 4).map((description, index) => ({ id: integrationMock.id('action'), description: description.replace(/^(action|follow-up):\s*/i, ''), priority: index === 0 ? 'HIGH' : 'MEDIUM', status: 'PENDING', source: 'NOTES', confidence: index === 0 ? 0.91 : 0.78, context: title })),
      commitments: lines.filter((line) => /\b(i will|we will|committed to|promise to)\b/i.test(line)).slice(0, 3).map((description) => ({ id: integrationMock.id('commitment'), description: description.replace(/^commitment:\s*/i, ''), deadline: new Date(Date.now() + 86_400_000).toISOString(), confidence: 0.79, source: 'NOTES', context: title })),
      deadlines: lines.filter((line) => /\b(due|deadline|by\s+\w+)\b/i.test(line)).slice(0, 3).map((description) => ({ id: integrationMock.id('deadline'), description, date: new Date(Date.now() + 2 * 86_400_000).toISOString(), confidence: 0.74, source: 'NOTES', context: title })),
      followUps: lines.filter((line) => /\b(follow.?up|check back|circle back)\b/i.test(line)).slice(0, 3).map((description) => ({ id: integrationMock.id('followup'), description, dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(), confidence: 0.72, source: 'NOTES', context: title })),
      summary: `Reviewed ${lines.length} note lines from ${title}. Items below are suggestions and are not saved until you confirm them.`,
      keyDecisions: lines.filter((line) => /^decision:/i.test(line)).map((line) => line.replace(/^decision:\s*/i, '')),
      blockers: lines.filter((line) => /^blocker:/i.test(line)).map((line) => line.replace(/^blocker:\s*/i, '')),
      risks: lines.filter((line) => /^risk:/i.test(line)).map((line) => line.replace(/^risk:\s*/i, '')),
      generatedAt: integrationMock.now(), confidence: 0.81, requiresConfirmation: ['ACTION_ITEMS', 'COMMITMENTS', 'DEADLINES', 'FOLLOW_UPS'],
    };
    const all = integrationMock.extractions(); all[meetingId] = result; integrationMock.saveExtractions(all); return result;
  },
  async extraction(meetingId: string): Promise<MeetingExtractionDTO | null> {
    if (!USE_MOCK) return null;
    await latency(80, 180); return integrationMock.extractions()[meetingId] ?? null;
  },
  async createDeadline(input: { title: string; description?: string; dueDate: string; priority?: number; timezone: string }): Promise<DeadlineDTO> {
    if (!USE_MOCK) return (await api.post<DeadlineDTO>('/api/deadlines', input)).data;
    await latency(180, 320); const time = integrationMock.now();
    const row: DeadlineDTO = { id: integrationMock.id('deadline'), userId: 'usr_demo', ...input, status: 'PENDING', priority: input.priority ?? 5, createdAt: time, updatedAt: time };
    integrationMock.saveDeadlines([row, ...integrationMock.deadlines()]); return row;
  },
  async deadlines(): Promise<DeadlineDTO[]> {
    if (!USE_MOCK) return (await api.get<DeadlineDTO[]>('/api/deadlines')).data;
    await latency(80, 160); return integrationMock.deadlines();
  },
  async completeChecklist(meetingId: string, itemId: string, completed: boolean): Promise<MeetingPreparationDTO | null> {
    if (!USE_MOCK) return null;
    const all = integrationMock.preparations(); const result = all[meetingId]; if (!result) return null;
    result.checklist = result.checklist.map((item) => item.id === itemId ? { ...item, completed } : item); integrationMock.savePreparations(all); return result;
  },
};
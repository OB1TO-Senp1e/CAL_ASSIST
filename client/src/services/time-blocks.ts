import api from './api';
import { USE_MOCK } from './auth';
import { loadEvents } from '@/lib/mock/calendar';
import { latency } from '@/lib/mock/db';

export type TimeBlockType = 'FOCUS' | 'MEETING' | 'TRAVEL' | 'BREAK' | 'PERSONAL' | 'BUFFER' | 'DEADLINE' | 'ROUTINE';
export type TimeBlockStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'MISSED';
export type TimeBlockSource = 'USER' | 'AI_GENERATED' | 'SYNCED' | 'RECURRING_TEMPLATE';

export interface TimeBlockDTO {
  id: string;
  userId: string;
  eventId: string | null;
  taskId: string | null;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  blockType: TimeBlockType;
  status: TimeBlockStatus;
  focusLevel: number | null;
  source: TimeBlockSource;
}

function fromEvent(event: ReturnType<typeof loadEvents>[number]): TimeBlockDTO {
  const blockType: TimeBlockType = event.category === 'MEETING' ? 'MEETING'
    : event.category === 'FOCUS_TIME' ? 'FOCUS'
      : event.category === 'TRAVEL' ? 'TRAVEL'
        : 'PERSONAL';
  return {
    id: `tb_${event.id}`,
    userId: event.userId,
    eventId: event.id,
    taskId: null,
    title: event.title,
    description: event.description ?? null,
    startDate: event.start,
    endDate: event.end,
    timezone: event.timeZone,
    blockType,
    status: event.status === 'CANCELLED' ? 'CANCELLED' : 'SCHEDULED',
    focusLevel: blockType === 'FOCUS' ? 3 : 1,
    source: event.source === 'AI_GENERATED' ? 'AI_GENERATED' : event.source === 'SYNCED' ? 'SYNCED' : 'USER',
  };
}

export const timeBlockService = {
  async listRange(startDate: string, endDate: string): Promise<TimeBlockDTO[]> {
    if (!USE_MOCK) {
      const { data } = await api.get<TimeBlockDTO[]>('/api/time-blocks', { params: { startDate, endDate } });
      return data;
    }
    await latency(100, 240);
    return loadEvents()
      .filter((event) => event.start < endDate && event.end > startDate)
      .map(fromEvent)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  },
};

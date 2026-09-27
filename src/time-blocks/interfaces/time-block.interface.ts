export interface CreateTimeBlockRequest {
  title: string;
  description?: string | null;
  eventId?: string | null;
  taskId?: string | null;
  startDate: Date;
  endDate: Date;
  blockType: 'FOCUS' | 'MEETING' | 'TRAVEL' | 'BREAK' | 'PERSONAL' | 'BUFFER';
  status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'MISSED';
  focusLevel?: number;
}

export interface UpdateTimeBlockRequest {
  title?: string;
  description?: string | null;
  eventId?: string | null;
  taskId?: string | null;
  startDate?: Date;
  endDate?: Date;
  blockType?: 'FOCUS' | 'MEETING' | 'TRAVEL' | 'BREAK' | 'PERSONAL' | 'BUFFER';
  status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'MISSED';
  focusLevel?: number;
}

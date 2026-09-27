export interface CreateCommitmentRequest {
  title: string;
  description?: string | null;
  deadline: Date;
  priority?: number;
}

export interface UpdateCommitmentRequest {
  title?: string;
  description?: string | null;
  deadline?: Date;
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
  priority?: number;
}

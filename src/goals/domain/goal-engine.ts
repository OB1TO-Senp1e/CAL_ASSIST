export interface GoalStatus {
  type: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  progress: number;
}

export interface GoalMetrics {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  estimatedTotalHours: number;
  actualTotalHours: number;
}

export interface SubgoalBreakdown {
  title: string;
  description?: string;
  priority: number;
  estimatedHours?: number;
  dependencies?: string[];
}

export class GoalEngine {
  calculateProgress(metrics: GoalMetrics): number {
    if (metrics.totalTasks === 0) return 0;
    return Math.round((metrics.completedTasks / metrics.totalTasks) * 100);
  }

  calculateRisk(metrics: GoalMetrics, targetDate?: Date): 'low' | 'medium' | 'high' {
    if (!targetDate) return 'low';

    const now = new Date();
    const daysUntilTarget = (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (daysUntilTarget < 0) return 'high';

    const completionRate = metrics.totalTasks > 0 ? metrics.completedTasks / metrics.totalTasks : 0;

    if (daysUntilTarget < 1 && completionRate < 1) return 'high';
    if (completionRate < 0.5 && daysUntilTarget < 7) return 'high';
    if (completionRate < 0.7 && daysUntilTarget < 14) return 'medium';

    return 'low';
  }

  shouldMarkComplete(metrics: GoalMetrics): boolean {
    return metrics.completedTasks === metrics.totalTasks;
  }
}

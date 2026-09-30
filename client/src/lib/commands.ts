export type CommandAction = 'navigate' | 'assistant' | 'theme';
export interface CommandEntry {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  action: CommandAction;
  to?: string;
}

export const COMMANDS: CommandEntry[] = [
  { id: 'today', label: 'Today', description: 'Open the daily overview', keywords: ['home', 'daily', 'schedule'], action: 'navigate', to: '/' },
  { id: 'calendar', label: 'Calendar', description: 'Open day, week, month, or agenda', keywords: ['event', 'meeting', 'date'], action: 'navigate', to: '/calendar' },
  { id: 'assistant', label: 'Assistant', description: 'Open the assistant conversation', keywords: ['ask', 'chat', 'ai'], action: 'navigate', to: '/assistant' },
  { id: 'goals', label: 'Goals', description: 'Review goals and progress', keywords: ['objective', 'target'], action: 'navigate', to: '/goals' },
  { id: 'projects', label: 'Projects', description: 'Open project workspaces', keywords: ['initiative'], action: 'navigate', to: '/projects' },
  { id: 'tasks', label: 'Tasks', description: 'Review and update tasks', keywords: ['todo', 'action item'], action: 'navigate', to: '/tasks' },
  { id: 'commitments', label: 'Commitments', description: 'Review promises and deadlines', keywords: ['promise', 'risk'], action: 'navigate', to: '/commitments' },
  { id: 'compiler', label: 'Time Compiler', description: 'Generate and review a schedule proposal', keywords: ['plan', 'schedule', 'time block'], action: 'navigate', to: '/compiler' },
  { id: 'reality', label: 'Reality & Replanning', description: 'Review deviations and re-plan options', keywords: ['drift', 'replan', 'risk'], action: 'navigate', to: '/reality' },
  { id: 'memory', label: 'Memory Center', description: 'Browse and correct saved memories', keywords: ['preferences', 'facts'], action: 'navigate', to: '/memory' },
  { id: 'rules', label: 'Rules', description: 'Create and review scheduling rules', keywords: ['constraints'], action: 'navigate', to: '/rules' },
  { id: 'proactive', label: 'Proactive', description: 'Review interventions and delivery settings', keywords: ['nudge', 'notification'], action: 'navigate', to: '/proactive' },
  { id: 'permissions', label: 'Permissions & Autonomy', description: 'Set assistant action boundaries', keywords: ['safety', 'policy', 'delegate'], action: 'navigate', to: '/permissions' },
  { id: 'integrations', label: 'Integrations', description: 'Manage calendar connections and travel estimates', keywords: ['google', 'outlook', 'sync'], action: 'navigate', to: '/integrations' },
  { id: 'meetings', label: 'Meeting Intelligence', description: 'Prepare for meetings or review notes', keywords: ['agenda', 'transcript', 'minutes'], action: 'navigate', to: '/meetings' },
  { id: 'settings', label: 'Notification Preferences', description: 'Set notification channels and quiet hours', keywords: ['email', 'sms', 'push'], action: 'navigate', to: '/settings' },
  { id: 'assistant-panel', label: 'Toggle Assistant Panel', description: 'Open or close the docked assistant', keywords: ['panel', 'quick ask'], action: 'assistant' },
  { id: 'theme', label: 'Cycle Theme', description: 'Switch between light, dark, and system', keywords: ['appearance', 'dark mode'], action: 'theme' },
];
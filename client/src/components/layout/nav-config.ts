import {
  Activity,
  Bell,
  BookOpenCheck,
  CalendarDays,
  CheckSquare,
  Compass,
  FolderKanban,
  Handshake,
  HardDrive,
  LineChart,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Two-key "g then x" navigation sequence (Linear-style). */
  shortcut?: string;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * Sidebar structure. Every entry maps 1:1 to a <Route> in App.tsx.
 *
 * The sections mirror the product's actual workflow — plan it, run it, review it
 * — rather than a flat list of every backend module. Modules with no dedicated
 * screen yet (meetings, memory, rules, integrations, proactive) are reachable by
 * their route and the command palette so the nav stays scannable.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { name: 'Today', href: '/', icon: Sun, shortcut: 'T' },
      { name: 'Calendar', href: '/calendar', icon: CalendarDays, shortcut: 'C' },
      { name: 'Assistant', href: '/assistant', icon: Sparkles, shortcut: 'A' },
    ],
  },
  {
    label: 'Plan',
    items: [
      { name: 'Goals', href: '/goals', icon: Target, shortcut: 'G' },
      { name: 'Projects', href: '/projects', icon: FolderKanban, shortcut: 'P' },
      { name: 'Tasks', href: '/tasks', icon: CheckSquare, shortcut: 'K' },
      { name: 'Commitments', href: '/commitments', icon: Handshake, shortcut: 'M' },
      { name: 'Compiler', href: '/compiler', icon: Zap, shortcut: 'O' },
    ],
  },
  {
    label: 'Run',
    items: [
      { name: 'Meetings', href: '/meetings', icon: Users, shortcut: 'E' },
      { name: 'Reality', href: '/reality', icon: Activity, shortcut: 'R' },
      { name: 'Insights', href: '/insights', icon: LineChart, shortcut: 'I' },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Memory', href: '/memory', icon: HardDrive },
      { name: 'Rules', href: '/rules', icon: BookOpenCheck, shortcut: 'U' },
      { name: 'Permissions', href: '/permissions', icon: ShieldCheck },
      { name: 'Integrations', href: '/integrations', icon: Compass },
      { name: 'Proactive', href: '/proactive', icon: Bell, shortcut: 'V' },
    ],
  },
];

export const NAV_FOOTER: NavItem[] = [
  { name: 'Architecture', href: '/architecture', icon: Network },
  { name: 'Settings', href: '/settings', icon: Settings, shortcut: 'S' },
];

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_SECTIONS.flatMap((s) => s.items), ...NAV_FOOTER];

export function titleForPath(pathname: string): string {
  const match = ALL_NAV_ITEMS.filter((i) => (i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)));
  return match[0]?.name ?? 'CalAssist';
}

import {
  CalendarDays,
  CheckSquare,
  FolderKanban,
  Handshake,
  LineChart,
  Network,
  Settings,
  Sparkles,
  Sun,
  Target,
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

/** Routes map 1:1 to <Route> entries in App.tsx. */
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
    ],
  },
  {
    label: 'Review',
    items: [{ name: 'Insights', href: '/insights', icon: LineChart, shortcut: 'I' }],
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

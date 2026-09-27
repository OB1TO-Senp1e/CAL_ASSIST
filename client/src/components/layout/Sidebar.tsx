import { NavLink } from 'react-router-dom';
import { LogOut, Moon, Monitor, PanelLeftClose, PanelLeftOpen, Search, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Kbd } from '@/components/ui/kbd';
import { modKeyLabel } from '@/lib/hotkeys';
import { NAV_FOOTER, NAV_SECTIONS, type NavItem } from './nav-config';
import { useShell } from './shell-context';

function Wordmark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex h-topbar shrink-0 items-center gap-2 px-3">
      {/* Mark: a stacked "time block" glyph — CalAssist's own, not borrowed. */}
      <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
        <rect x="2" y="2" width="16" height="4.5" rx="1.5" className="fill-primary" />
        <rect x="2" y="8" width="10" height="4.5" rx="1.5" className="fill-primary/55" />
        <rect x="2" y="14" width="13" height="4" rx="1.5" className="fill-ai/70" />
      </svg>
      {!collapsed && <span className="text-base font-semibold tracking-tight">CalAssist</span>}
    </div>
  );
}

function NavRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.href}
      end={item.href === '/'}
      onClick={onNavigate}
      title={collapsed ? item.name : undefined}
      className={({ isActive }) =>
        cn(
          'group/nav flex h-row-sm items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-(--dur-instant)',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-card font-medium text-foreground shadow-e1 ring-1 ring-border'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.name}</span>
          {item.shortcut && (
            <span className="hidden items-center gap-0.5 opacity-0 transition-opacity group-hover/nav:opacity-100 lg:flex">
              <Kbd>G</Kbd>
              <Kbd>{item.shortcut}</Kbd>
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

export function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { preference, cycle } = useTheme();
  const { toggleSidebar } = useShell();
  const ThemeIcon = THEME_ICON[preference];
  const initials = (user?.name || user?.email || '?')
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <div className="flex h-full flex-col">
      <Wordmark collapsed={collapsed} />

      <div className={cn('px-2 pb-2', collapsed && 'px-1.5')}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('calassist:open-command'))}
          className={cn(
            'flex h-row-sm w-full items-center gap-2 rounded-md border border-border bg-card px-2 text-sm text-subtle-foreground shadow-e1 transition-colors hover:border-border-strong hover:text-muted-foreground',
            collapsed && 'justify-center px-0',
          )}
          title="Search or run a command"
        >
          <Search className="size-3.5 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search or ask…</span>
              <Kbd>{modKeyLabel}K</Kbd>
            </>
          )}
        </button>
      </div>

      <nav className={cn('flex-1 space-y-4 overflow-y-auto px-2 py-1', collapsed && 'px-1.5')} aria-label="Primary">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.label ?? i} className="space-y-px">
            {section.label && !collapsed && (
              <div className="px-2 pb-1 text-2xs font-medium text-subtle-foreground">{section.label}</div>
            )}
            {section.items.map((item) => (
              <NavRow key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className={cn('space-y-px border-t border-border px-2 py-2', collapsed && 'px-1.5')}>
        {NAV_FOOTER.map((item) => (
          <NavRow key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        <div className={cn('flex items-center gap-1 pt-2', collapsed && 'flex-col')}>
          <div className={cn('flex min-w-0 flex-1 items-center gap-2 px-1', collapsed && 'justify-center px-0')}>
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-2xs font-semibold text-secondary-foreground">
              {initials}
            </span>
            {!collapsed && <span className="truncate text-xs text-muted-foreground">{user?.name || user?.email}</span>}
          </div>
          <button
            type="button"
            onClick={cycle}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={`Theme: ${preference} (click to change)`}
          >
            <ThemeIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={logout}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:grid"
            title={`${collapsed ? 'Expand' : 'Collapse'} sidebar ( [ )`}
          >
            {collapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed } = useShell();
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface-sunken transition-[width] duration-(--dur-base) ease-(--ease-out-quick) md:block',
        sidebarCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
      )}
    >
      <SidebarContent collapsed={sidebarCollapsed} />
    </aside>
  );
}

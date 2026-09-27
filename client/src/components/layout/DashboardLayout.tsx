import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHotkeys } from '@/lib/hotkeys';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { CommandCenter } from './CommandCenter';
import { AssistantProvider } from '@/contexts/AssistantContext';
import { RouteFallback } from './RouteFallback';
import { ALL_NAV_ITEMS } from './nav-config';
import { ShellProvider, useShell } from './shell-context';
import { Sidebar, SidebarContent } from './Sidebar';

/**
 * App shell: [sidebar | page | assistant]. Three columns on desktop; on mobile
 * the sidebar becomes a drawer and the assistant a full-screen sheet.
 *
 * Global keys: ⌘/Ctrl+J assistant · [ collapse sidebar · G then <letter> go-to.
 */
function ShellFrame() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleAssistant, toggleSidebar, mobileNavOpen, setMobileNavOpen, setAssistantOpen } = useShell();
  const pendingG = useRef<number | null>(null);

  useEffect(() => setMobileNavOpen(false), [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useHotkeys({
    'mod+j': () => toggleAssistant(),
    '[': () => toggleSidebar(),
    escape: () => {
      setMobileNavOpen(false);
      if (window.innerWidth < 1024) setAssistantOpen(false);
    },
  });

  // Linear-style two-key navigation: "g" then the item's shortcut letter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const target = ALL_NAV_ITEMS.find((i) => i.shortcut?.toLowerCase() === key);
        if (target) {
          e.preventDefault();
          navigate(target.href);
        }
        return;
      }
      if (key === 'g') pendingG.current = window.setTimeout(() => (pendingG.current = null), 900);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      {/* Mobile nav drawer */}
      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden',
          mobileNavOpen ? 'pointer-events-auto visible' : 'pointer-events-none invisible delay-(--dur-base)',
        )}
        aria-hidden={!mobileNavOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-foreground/20 transition-opacity duration-(--dur-base)',
            mobileNavOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileNavOpen(false)}
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-sidebar border-r border-border bg-surface-sunken shadow-e4 transition-transform duration-(--dur-base) ease-(--ease-out-quick)',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="absolute top-2.5 right-2 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
          <SidebarContent collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
        </div>
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <AssistantPanel />
      <CommandCenter />
    </div>
  );
}

export function DashboardLayout() {
  // AssistantProvider sits inside the authenticated shell only: the public auth
  // routes have no assistant, and the panel + page must share one thread.
  return (
    <AssistantProvider>
      <ShellProvider>
        <ShellFrame />
      </ShellProvider>
    </AssistantProvider>
  );
}

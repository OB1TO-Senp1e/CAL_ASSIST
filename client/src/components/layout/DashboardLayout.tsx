import { Link, useLocation, Outlet } from 'react-router-dom';
import { Home, Calendar, CheckSquare, Target, BarChart3, MessageSquare, Settings, Sparkles, LogOut, Network } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Today', href: '/', icon: Home },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare },
  { name: 'Goals', href: '/goals', icon: Target },
  { name: 'Assistant', href: '/assistant', icon: MessageSquare },
  { name: 'Insights', href: '/insights', icon: BarChart3 },
  { name: 'Architecture', href: '/architecture', icon: Network },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function DashboardLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className="flex w-full flex-col border-b border-border/80 bg-card/90 px-4 py-3 backdrop-blur-xl md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r md:px-5 md:py-6">
        <div className="flex min-w-0 items-center gap-3 md:items-start">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight">CalAssist</h1>
            <p className="truncate text-xs text-muted-foreground">{user?.name || user?.email || 'Your time, in focus'}</p>
          </div>
        </div>
        
        <nav className="mt-4 flex gap-1 overflow-x-auto pb-1 md:mt-9 md:flex-1 md:flex-col md:gap-1.5 md:overflow-visible md:pb-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/15"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        
        <div className="mt-3 border-t border-border/80 pt-2 md:mt-0 md:pt-4">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

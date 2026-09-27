import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Route guard. Owns the redirect (rather than the auth context) so the user
 * returns to the page they asked for after signing in, and so a refresh on a
 * deep link does not dump them on Today.
 *
 * While the session is being restored we render the shell-shaped skeleton, not
 * a spinner: same layout, no flash of the login screen.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <AuthLoadingSkeleton />;

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: { pathname: location.pathname, search: location.search } }} />;
  }

  return <>{children}</>;
}

function AuthLoadingSkeleton() {
  return (
    <div className="flex min-h-screen bg-background" aria-busy="true" aria-label="Loading your workspace">
      <div className="hidden w-sidebar shrink-0 border-r border-border bg-surface-sunken p-3 md:block">
        <div className="flex h-topbar items-center gap-2 px-0">
          <Skeleton className="size-5 rounded-sm" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="mt-2 h-row-sm w-full" />
        <div className="mt-5 space-y-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-row-sm w-full" />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-topbar items-center border-b border-border px-4">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex-1 p-5">
          <Skeleton className="h-full min-h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

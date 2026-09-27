import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';

/**
 * Wrapper for routes whose screen-group has not been built yet: gives them the
 * real top bar so the nav is fully walkable. Every Stage 2 unit replaces its use
 * of this wrapper with a purpose-built page; it disappears once 2a–2m are done.
 *
 * Suspense is owned by DashboardLayout (around the <Outlet/>), so lazy children
 * resolve inside the shell without this component needing its own boundary.
 */
export function LegacyPage({ title, icon, children }: { title: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader title={title} icon={icon} />
      <div className="flex-1">{children}</div>
    </div>
  );
}

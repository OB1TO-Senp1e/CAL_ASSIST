import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';

/**
 * Temporary wrapper for pre-design-system pages (Today, Tasks, placeholders) so
 * they sit inside the new shell with a proper top bar. Each is rebuilt natively
 * in its Stage 2 screen-group, at which point this wrapper is removed.
 */
export function LegacyPage({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader title={title} icon={icon} />
      <div className="flex-1">{children}</div>
    </div>
  );
}

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Suspense fallback for a lazy route. Mirrors the real page anatomy (top bar +
 * content) so the transition reads as "content loading in place", not as a
 * separate loading screen. DESIGN_SYSTEM.md §Motion: never animate a page load.
 */
export function RouteFallback() {
  return (
    <div className="flex h-screen min-h-0 flex-col" aria-busy="true" aria-label="Loading page">
      <div className="flex h-topbar shrink-0 items-center gap-2 border-b border-border px-4">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex-1 space-y-4 p-5">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

import * as React from 'react';
import { cn } from 'cn';

/**
 * Loading placeholder. Used for route-level suspense and data panes so the
 * layout does not jump when content arrives (DESIGN_SYSTEM.md §Motion:
 * never animate a page load — reserve space instead).
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };

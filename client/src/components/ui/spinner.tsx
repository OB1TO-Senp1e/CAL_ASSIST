import { Loader2 } from 'lucide-react';
import { cn } from 'cn';

/**
 * Indeterminate progress. Only for work whose duration we cannot predict
 * (network round-trips) — never for layout or data refreshes.
 */
function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };

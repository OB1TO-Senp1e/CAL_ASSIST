import * as React from 'react';
import { cn } from 'cn';

/** Keyboard shortcut hint. Styling lives in the `.kbd` primitive (index.css). */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return <kbd data-slot="kbd" className={cn('kbd', className)} {...props} />;
}

function KbdGroup({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="kbd-group" className={cn('inline-flex items-center gap-0.5', className)} {...props} />;
}

export { Kbd, KbdGroup };

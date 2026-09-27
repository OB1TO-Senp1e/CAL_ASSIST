import * as React from 'react';
import { cn } from 'cn';

/**
 * Form primitives the calendar needs that shadcn/base-ui did not ship yet.
 * Built on native elements (select, textarea, checkbox) so keyboard behaviour and
 * accessibility come for free — Stage 2 does not need a custom listbox.
 * Styling matches `ui/input.tsx` so the editor reads as one surface.
 */
const CONTROL =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30';

function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select data-slot="select" className={cn(CONTROL, 'cursor-pointer appearance-none bg-none pr-7', className)} {...props}>
      {children}
    </select>
  );
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(CONTROL, 'h-auto min-h-16 resize-y py-1.5 leading-snug', className)}
      {...props}
    />
  );
}

function Checkbox({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'size-3.5 shrink-0 cursor-pointer appearance-none rounded-xs border border-input bg-transparent transition-colors outline-none checked:border-primary checked:bg-primary focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  );
}

/** A field wrapper: label, control, optional hint/error. Keeps spacing uniform. */
function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-2xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-2xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export { Select, Textarea, Checkbox, Field, CONTROL };

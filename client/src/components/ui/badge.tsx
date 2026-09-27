import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-xs px-1.5 text-2xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        outline: 'border border-border text-muted-foreground',
        primary: 'bg-secondary text-secondary-foreground',
        ai: 'bg-ai-soft text-ai-soft-foreground',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-level-high',
        destructive: 'bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

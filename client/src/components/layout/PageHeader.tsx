import type { ReactNode } from 'react';
import { Menu, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd } from '@/components/ui/kbd';
import { modKeyLabel } from '@/lib/hotkeys';
import { useShell } from './shell-context';

/**
 * The 48px top bar every page renders as its first child. Title left, page
 * controls in the middle/right, assistant toggle pinned far right so the AI
 * layer is always one click (or ⌘J) away from any surface.
 */
export function PageHeader({
  title,
  icon,
  children,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { setMobileNavOpen, assistantOpen, toggleAssistant } = useShell();

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-topbar shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md md:px-4',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="-ml-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-4" />
      </button>
      <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight">
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <span className="truncate">{title}</span>
      </h1>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">{children}</div>
      <button
        type="button"
        onClick={toggleAssistant}
        aria-pressed={assistantOpen}
        title={`Assistant (${modKeyLabel}J)`}
        className={cn(
          'ml-1 flex h-row-sm items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors duration-(--dur-instant)',
          assistantOpen
            ? 'bg-ai-soft text-ai-soft-foreground'
            : 'text-muted-foreground hover:bg-ai-soft hover:text-ai-soft-foreground',
        )}
      >
        <Sparkles className="size-3.5" />
        <span className="hidden sm:inline">Assistant</span>
        <Kbd className="hidden lg:inline-flex">{modKeyLabel}J</Kbd>
      </button>
    </header>
  );
}

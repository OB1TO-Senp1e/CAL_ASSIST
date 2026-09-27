import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd } from '@/components/ui/kbd';

/**
 * The composer. Enter sends, Shift+Enter inserts a newline (DESIGN_SYSTEM.md
 * §Interaction), and the field grows to a ceiling so a long request stays
 * readable without the composer eating the thread.
 *
 * It is a real <form> so submit works from the keyboard and from the send button
 * with no JS-specific path.
 */
export interface AssistantComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  size?: 'panel' | 'page';
  className?: string;
}

const MAX_ROWS_PX = 160;

export function AssistantComposer({
  onSend,
  disabled = false,
  sending = false,
  placeholder = 'Ask, plan, or reschedule…',
  size = 'panel',
  className,
}: AssistantComposerProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to the ceiling, then scroll internally.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !disabled && !sending;

  function submit() {
    const text = value.trim();
    if (!text || disabled || sending) return;
    onSend(text);
    setValue('');
  }

  return (
    <form
      className={cn('shrink-0 border-t border-border', size === 'page' ? 'p-3 md:p-5' : 'p-3', className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={cn('mx-auto w-full', size === 'page' && 'max-w-3xl')}>
        <div className="rounded-lg border border-input bg-background shadow-e1 transition-colors focus-within:border-ai-border focus-within:ring-2 focus-within:ring-ai/20">
          <textarea
            ref={ref}
            rows={2}
            value={value}
            disabled={disabled}
            aria-label="Message the assistant"
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-subtle-foreground disabled:opacity-60"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="flex items-center gap-1 text-2xs text-subtle-foreground">
              <Kbd>↵</Kbd> send <Kbd>⇧↵</Kbd> newline
            </span>
            <button
              type="submit"
              disabled={!canSend}
              aria-label={sending ? 'Sending' : 'Send message'}
              className={cn(
                'grid size-7 place-items-center rounded-md bg-ai text-ai-foreground transition-opacity',
                !canSend && 'opacity-40',
              )}
            >
              {sending ? <Square className="size-3" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
        </div>
        <p className="mt-1.5 px-1 text-2xs text-subtle-foreground">
          Nothing is written to your calendar without an explicit confirm.
        </p>
      </div>
    </form>
  );
}

import { Check, MessageSquare, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ConversationDTO } from '@/services/types';

/**
 * Conversation switcher. Rendered inline on the full-page surface and inside a
 * popover from the docked panel's header, so both share one implementation.
 *
 * An untitled conversation is created the moment you open a new one; the title is
 * backfilled from the first user message (see AssistantContext.send), which is
 * why null titles are shown as "New conversation" rather than hidden.
 */
export interface ConversationListProps {
  conversations: ConversationDTO[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  className?: string;
}

function when(iso: string): string {
  const t = dayjs(iso);
  if (t.isSame(dayjs(), 'day')) return t.format('HH:mm');
  if (t.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Yesterday';
  if (t.isAfter(dayjs().subtract(7, 'day'))) return t.format('ddd');
  return t.format('D MMM');
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  className,
}: ConversationListProps) {
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-2xs font-medium tracking-wide text-subtle-foreground uppercase">
          Conversations
        </span>
        <Button size="icon-xs" variant="ghost" onClick={onNew} aria-label="New conversation">
          <Plus className="size-3" />
        </Button>
      </div>

      {conversations.length === 0 ? (
        <p className="px-2.5 py-3 text-2xs text-muted-foreground">
          No conversations yet — ask something to start one.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-2">
          {conversations.map((conv) => {
            const active = conv.id === activeId;
            return (
              <li key={conv.id} className="group/conv relative">
                <button
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60',
                  )}
                >
                  <MessageSquare className={cn('size-3 shrink-0', active && 'text-ai')} />
                  <span className="min-w-0 flex-1 truncate">
                    {conv.title ?? 'New conversation'}
                  </span>
                  <span className="shrink-0 text-2xs text-subtle-foreground group-hover/conv:opacity-0">
                    {when(conv.lastMessageAt)}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`Options for ${conv.title ?? 'new conversation'}`}
                        className="absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground opacity-0 hover:bg-background group-hover/conv:opacity-100 focus-visible:opacity-100"
                      >
                        <span className="text-sm leading-none">···</span>
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onSelect(conv.id)}>
                      <Check className="size-3.5" />
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(conv.id)}>
                      <Trash2 className="size-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

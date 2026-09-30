import { useEffect, useState } from 'react';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useShell } from '@/components/layout/shell-context';
import { useAssistant } from '@/contexts/AssistantContext';
import { AssistantThread } from './AssistantThread';
import { AssistantComposer } from './AssistantComposer';
import { ConversationList } from './ConversationList';
import { assistantService } from '@/services/assistant';

/**
 * The ambient AI layer (DESIGN_SYSTEM.md §AI presence).
 *
 * Stage 1 shipped the container and empty state; 2c fills in the real thread,
 * proposal confirm/reject, tool-call disclosure and conversation switching.
 * The same state is shared with the full-page Assistant screen via
 * `AssistantContext`, so opening the panel and opening the page show one thread.
 *
 * Layout: full-screen sheet on mobile, docked column on desktop that pushes the
 * content rather than covering the calendar.
 */
export function AssistantPanel() {
  const { assistantOpen, setAssistantOpen } = useShell();
  const [showList, setShowList] = useState(false);
  const {
    conversations,
    activeId,
    messages,
    loading,
    sending,
    error,
    actionStates,
    selectConversation,
    newConversation,
    removeConversation,
    send,
    confirmAction,
    rejectAction,
    reload,
  } = useAssistant();

  // Start a conversation on first open so the composer is always usable.
  useEffect(() => {
    if (assistantService.apiAvailable && assistantOpen && !loading && !error && conversations.length === 0) {
      void newConversation();
    }
  }, [assistantOpen, loading, error, conversations.length, newConversation]);

  const active = conversations.find((c) => c.id === activeId);

  return (
    <aside
      aria-label="Assistant"
      aria-hidden={!assistantOpen}
      className={cn(
        // Mobile: full-screen sheet. Desktop: docked column that pushes content.
        'fixed inset-0 z-40 flex flex-col bg-card transition-[transform,opacity] duration-(--dur-base) ease-(--ease-out-quick)',
        'lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-assistant lg:shrink-0 lg:border-l lg:border-border lg:transition-none',
        assistantOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0 lg:hidden',
      )}
    >
      <header className="flex h-topbar shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="grid size-6 place-items-center rounded-md bg-ai-soft text-ai-soft-foreground">
          <Sparkles className="size-3.5" />
        </span>
        <button
          type="button"
          onClick={() => setShowList((v) => !v)}
          disabled={!assistantService.apiAvailable}
          aria-expanded={showList}
          className="flex min-w-0 items-center gap-1 rounded-sm text-left hover:text-foreground"
          title="Switch conversation"
        >
          <span className="truncate text-sm font-semibold tracking-tight">
            {active?.title ?? 'Assistant'}
          </span>
          <ChevronDown className={cn('size-3 shrink-0 text-muted-foreground transition-transform', showList && 'rotate-180')} />
        </button>
        <Badge variant="ai" className="ml-0.5 hidden sm:inline-flex">
          Preview
        </Badge>
        <button
          type="button"
          onClick={() => setAssistantOpen(false)}
          className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close assistant"
        >
          <X className="size-4" />
        </button>
      </header>

      {showList && (
        <div className="max-h-64 shrink-0 overflow-y-auto border-b border-border bg-surface-sunken">
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={(id) => {
              selectConversation(id);
              setShowList(false);
            }}
            onNew={() => {
              void newConversation();
              setShowList(false);
            }}
            onDelete={(id) => void removeConversation(id)}
          />
        </div>
      )}

      <AssistantThread
        messages={messages}
        loading={loading}
        sending={sending}
        error={error}
        actionStates={actionStates}
        onConfirm={(action, modified) => void confirmAction(action, modified)}
        onReject={(action) => void rejectAction(action)}
        onStarter={(text) => void send(text)}
        onRetry={reload}
        size="panel"
      />

      <AssistantComposer onSend={(text) => void send(text)} sending={sending} disabled={!assistantService.apiAvailable} />
    </aside>
  );
}

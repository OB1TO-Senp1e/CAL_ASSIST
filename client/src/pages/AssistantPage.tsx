import { useState } from 'react';
import { Plus, Sparkles, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAssistant } from '@/contexts/AssistantContext';
import { AssistantThread } from '@/components/assistant/AssistantThread';
import { AssistantComposer } from '@/components/assistant/AssistantComposer';
import { ConversationList } from '@/components/assistant/ConversationList';
import { TOOL_CATEGORY_LABEL } from '@/lib/mock/assistant';
import { assistantService } from '@/services/assistant';

/**
 * Full-page Assistant (unit 2c).
 *
 * The docked panel (⌘J) is for quick asks while you are looking at the calendar;
 * this page is for work that deserves room — long threads, several proposals on
 * screen, and the tool inventory the assistant actually has. Both read the same
 * `AssistantContext`, so a thread started in one continues in the other.
 */
export function AssistantPage() {
  const [tab, setTab] = useState<'thread' | 'tools'>('thread');
  const {
    conversations,
    activeId,
    messages,
    loading,
    sending,
    error,
    actionStates,
    tools,
    selectConversation,
    newConversation,
    removeConversation,
    send,
    confirmAction,
    rejectAction,
    reload,
  } = useAssistant();

  const byCategory = tools.reduce<Record<string, number>>((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Assistant" icon={<Sparkles />}>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5" role="tablist" aria-label="Assistant view">
          {(['thread', 'tools'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'rounded-sm px-2 py-0.5 text-xs font-medium capitalize transition-colors',
                tab === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {id === 'tools' ? `Tools (${tools.length})` : 'Thread'}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => void newConversation()} disabled={!assistantService.apiAvailable} title={!assistantService.apiAvailable ? 'Assistant conversation endpoints are not exposed by the backend.' : undefined}>
          <Plus className="size-3.5" />
          New
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        {/* Conversation rail — hidden on phones, where the thread owns the screen. */}
        {assistantService.apiAvailable && <nav
          aria-label="Conversations"
          className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface-sunken lg:flex"
        >
          <ConversationList
            className="flex-1"
            conversations={conversations}
            activeId={activeId}
            onSelect={selectConversation}
            onNew={() => void newConversation()}
            onDelete={(id) => void removeConversation(id)}
          />
        </nav>}

        <div className="flex min-w-0 flex-1 flex-col">
          {tab === 'tools' ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mx-auto max-w-3xl">
                <p className="text-sm text-muted-foreground">
                  Every tool the assistant may call. Names and confirmation levels are read from the
                  backend registry — the assistant can do nothing that is not on this list.
                </p>
                <ul className="mt-4 space-y-1.5">
                  {tools.map((tool) => (
                    <li
                      key={tool.name}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{tool.description}</p>
                        <p className="font-mono text-2xs text-subtle-foreground">{tool.name}</p>
                      </div>
                      <Badge variant="outline">{TOOL_CATEGORY_LABEL[tool.category]}</Badge>
                      <Badge
                        variant={tool.confirmationLevel === 'NONE' ? 'neutral' : 'ai'}
                        className="w-16 justify-center"
                      >
                        {tool.confirmationLevel}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-2xs text-subtle-foreground">
                  {Object.entries(byCategory)
                    .map(([c, n]) => `${TOOL_CATEGORY_LABEL[c as keyof typeof TOOL_CATEGORY_LABEL]} ${n}`)
                    .join(' · ')}
                </p>
              </div>
            </div>
          ) : (
            <>
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
                size="page"
              />
              {!assistantService.apiAvailable && <p className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">The backend does not expose assistant conversation endpoints yet.</p>}
              <AssistantComposer onSend={(text) => void send(text)} sending={sending} disabled={!assistantService.apiAvailable} size="page" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

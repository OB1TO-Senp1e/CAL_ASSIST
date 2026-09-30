import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Moon, Search, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { useShell } from './shell-context';
import { useTheme } from '@/contexts/ThemeContext';
import { COMMANDS, type CommandEntry } from '@/lib/commands';
import { useHotkeys, modKeyLabel } from '@/lib/hotkeys';
import { cn } from '@/lib/utils';

function CommandIcon({ action }: { action: CommandEntry['action'] }) {
  const Icon = action === 'assistant' ? Sparkles : action === 'theme' ? Moon : ArrowRight;
  return <Icon className={cn('size-3.5 shrink-0', action === 'assistant' && 'text-ai')} />;
}

export function CommandCenter() {
  const navigate = useNavigate();
  const { toggleAssistant } = useShell();
  const { cycle } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useHotkeys({ 'mod+k': () => setOpen(true) });
  useEffect(() => {
    const openCommand = () => setOpen(true);
    window.addEventListener('calassist:open-command', openCommand);
    return () => window.removeEventListener('calassist:open-command', openCommand);
  }, []);
  useEffect(() => { if (!open) { setQuery(''); setActiveIndex(0); } }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return COMMANDS;
    return COMMANDS.filter((item) => `${item.label} ${item.description} ${item.keywords.join(' ')}`.toLowerCase().includes(needle));
  }, [query]);

  function run(command: CommandEntry) {
    setOpen(false);
    if (command.action === 'navigate' && command.to) navigate(command.to);
    else if (command.action === 'assistant') toggleAssistant();
    else if (command.action === 'theme') cycle();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, filtered.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
    else if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); run(filtered[activeIndex]); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Command Center</DialogTitle>
        <DialogDescription className="sr-only">Search surfaces and run commands.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={onKeyDown} placeholder="Search pages and commands" aria-label="Search pages and commands" className="h-11 border-0 px-0 shadow-none focus-visible:ring-0" />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[min(60dvh,28rem)] overflow-y-auto p-1.5">
          {filtered.length ? filtered.map((command, index) => <button type="button" key={command.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => run(command)} className={cn('flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left', activeIndex === index ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60')}><CommandIcon action={command.action} /><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{command.label}</span><span className="mt-0.5 block truncate text-2xs text-muted-foreground">{command.description}</span></span>{command.to && <span className="text-2xs text-subtle-foreground">Open</span>}</button>) : <p className="px-3 py-8 text-center text-xs text-muted-foreground">No matching commands.</p>}
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-2xs text-muted-foreground"><span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate · <Kbd>Enter</Kbd> open</span><span>Command Center <Kbd>{modKeyLabel}K</Kbd></span></div>
      </DialogContent>
    </Dialog>
  );
}
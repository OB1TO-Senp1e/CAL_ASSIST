import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Shell-level UI state shared between the sidebar, top bar, pages, and the
 * assistant layer. Persisted to localStorage so layout survives reloads.
 */
interface ShellState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  toggleAssistant: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellState | undefined>(undefined);

function usePersistentBool(key: string, initial: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    const v = localStorage.getItem(key);
    return v === null ? initial : v === '1';
  });
  const set = (next: boolean) => {
    localStorage.setItem(key, next ? '1' : '0');
    setValue(next);
  };
  return [value, set] as const;
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentBool('calassist-sidebar-collapsed', false);
  const [assistantOpen, setAssistantOpen] = usePersistentBool('calassist-assistant-open', false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <ShellContext.Provider
      value={{
        sidebarCollapsed,
        toggleSidebar: () => setSidebarCollapsed(!sidebarCollapsed),
        assistantOpen,
        setAssistantOpen,
        toggleAssistant: () => setAssistantOpen(!assistantOpen),
        mobileNavOpen,
        setMobileNavOpen,
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used within ShellProvider');
  return ctx;
}

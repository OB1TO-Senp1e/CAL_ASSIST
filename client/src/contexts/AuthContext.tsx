import { createContext, useCallback, useContext, useMemo, useState, type ReactNode, useEffect } from 'react';
import { authService } from '@/services/auth';
import type { AuthUser } from '@/services/types';

/**
 * Auth state for the shell.
 *
 * Stage 2: backed by the mock layer (`services/auth.ts`) — real screens, no real
 * backend. Stage 3 flips `USE_MOCK` and the call sites below stay identical.
 *
 * Deliberately does NOT navigate. Route protection is a rendering concern, so
 * `RequireAuth` owns it — that keeps the "return to where you were" redirect
 * working instead of always dumping the user on Today.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  /** True while the initial session restore is in flight. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Restore an existing session on boot (mock session or real JWT).
  useEffect(() => {
    let cancelled = false;
    authService
      .me()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus(me ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: next } = await authService.login(email, password);
    setUser(next);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const next = await authService.register(email, password, name);
    setUser(next);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, loading: status === 'loading', login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

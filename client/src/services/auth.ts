/**
 * Auth service facade.
 *
 * Components call `authService` and never care where the data comes from. In
 * Stage 2 it is backed by the mock layer; Stage 3 flips `USE_MOCK` off and the
 * same call sites hit the real NestJS API. This is the "data-source swap" seam
 * the build loop describes — no component rewrite required.
 *
 * Real endpoints (verified in src/auth/auth.controller.ts):
 *   POST /auth/login     → { access_token, user }
 *   POST /auth/register  → { id, email, name, createdAt, updatedAt }
 *   POST /auth/logout    → { success: true }
 *   GET  /api/users/me   → profile  (note: users routes are behind the /api prefix)
 */
import api from './api';
import type { AuthResponse, AuthUser, Profile } from './types';
import {
  authenticate,
  clearSession,
  createUser,
  findUserById,
  getSessionUserId,
  DEV_BYPASS_USER,
  latency,
  setSession,
  type MockUser,
} from '@/lib/mock/db';

/**
 * Mock mode is ON by default for Stage 2. Stage 3 sets `VITE_USE_MOCK=0` (or
 * ships without the flag) to talk to the real backend.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== '0';

export const IS_DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === '1';

function toAuthUser(user: MockUser): AuthUser {
  return { id: user.id, email: user.email, name: user.name };
}

function toProfile(user: MockUser): Profile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    preferences: [],
    goals: [],
    projects: [],
  };
}

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    if (USE_MOCK) {
      await latency();
      const user = authenticate(email, password);
      return { access_token: setSession(user.id), user: toAuthUser(user) };
    }
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    localStorage.setItem('token', data.access_token);
    return data;
  },

  async register(email: string, password: string, name?: string): Promise<AuthUser> {
    if (USE_MOCK) {
      await latency();
      const user = createUser(email, password, name);
      // Register then sign straight in, so the user lands inside the app.
      setSession(user.id);
      return toAuthUser(user);
    }
    const { data } = await api.post<AuthUser>('/auth/register', { email, password, name });
    return data;
  },

  async logout(): Promise<void> {
    if (USE_MOCK) {
      clearSession();
      return;
    }
    try {
      await api.post('/auth/logout');
    } catch {
      // Logging out must never fail from the user's point of view.
    } finally {
      localStorage.removeItem('token');
    }
  },

  /** Restore the session on boot. Returns null when there is none. */
  async me(): Promise<AuthUser | null> {
    if (IS_DEV_BYPASS) return toAuthUser(DEV_BYPASS_USER);
    if (USE_MOCK) {
      const id = getSessionUserId();
      const user = id ? findUserById(id) : undefined;
      await latency(80, 180);
      return user ? toAuthUser(user) : null;
    }
    const token = localStorage.getItem('token');
    if (!token) return null;
    const { data } = await api.get<Profile>('/api/users/me');
    return { id: data.id, email: data.email, name: data.name };
  },
};

/** Normalise axios/Error/unknown into a message safe to show a user. */
export function authErrorMessage(error: unknown): string {
  const anyErr = error as { response?: { data?: { message?: string | string[] } }; message?: string };
  const raw = anyErr?.response?.data?.message ?? anyErr?.message;
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return 'Something went wrong. Please try again.';
}

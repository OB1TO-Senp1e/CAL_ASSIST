/**
 * Auth service facade.
 *
 * Components call `authService` and never care where the data comes from. In
 * Stage 3a uses the real auth/profile endpoints. Unintegrated screen groups
 * continue to use `USE_MOCK`; auth can be mocked independently for previews.
 *
 * Real endpoints (verified in src/auth/auth.controller.ts):
 *   POST /auth/login     → { access_token, user }
 *   POST /auth/register  → { id, email, name, createdAt, updatedAt }
 *   POST /api/auth/logout → { success: true } (logout is not excluded from the global prefix)
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

/** Mock switch retained for screen groups not yet tied into the backend. */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1';
/** Auth is live by default in Stage 3; set this only for an offline demo. */
export const USE_AUTH_MOCK = import.meta.env.VITE_AUTH_USE_MOCK === '1';

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
    if (USE_AUTH_MOCK) {
      await latency();
      const user = authenticate(email, password);
      return { access_token: setSession(user.id), user: toAuthUser(user) };
    }
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    localStorage.setItem('token', data.access_token);
    return data;
  },

  async register(email: string, password: string, name?: string): Promise<AuthUser> {
    if (USE_AUTH_MOCK) {
      await latency();
      const user = createUser(email, password, name);
      // Register then sign straight in, so the user lands inside the app.
      setSession(user.id);
      return toAuthUser(user);
    }
    await api.post<AuthUser>('/auth/register', { email, password, name });
    // Registration returns a user record but no JWT; log in to establish a session.
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    localStorage.setItem('token', data.access_token);
    return data.user;
  },

  async logout(): Promise<void> {
    if (USE_AUTH_MOCK) {
      clearSession();
      return;
    }
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Logging out must never fail from the user's point of view.
    } finally {
      localStorage.removeItem('token');
    }
  },

  /** Restore the session on boot. Returns null when there is none. */
  async me(): Promise<AuthUser | null> {
    if (IS_DEV_BYPASS) return toAuthUser(DEV_BYPASS_USER);
    if (USE_AUTH_MOCK) {
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

/**
 * Mock data layer (Stage 2).
 *
 * Stage 2 builds every screen against realistic mock data so the UI/UX is proven
 * before real data complexity lands. This module is the single seam: it exposes
 * the same async shape as the real services, backed by an in-memory store that is
 * persisted to localStorage so logins and edits survive a reload.
 *
 * Stage 3 replaces the *callers* (services/*.ts) with real HTTP clients — the
 * component layer never imports this module directly.
 */

/** Demo credentials shown on the sign-in screen. */
export const DEMO_CREDENTIALS = {
  email: 'demo@calassist.app',
  password: 'demo1234',
} as const;

export interface MockUser {
  id: string;
  email: string;
  name: string;
  password: string;
  createdAt: string;
  updatedAt: string;
}

interface MockDb {
  version: number;
  users: MockUser[];
}

const DB_KEY = 'calassist-mock-db';
const SESSION_KEY = 'calassist-mock-session';
const DB_VERSION = 1;

/** Simulated network latency so loading states are actually observable. */
export function latency(min = 220, max = 480): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seed(): MockDb {
  const now = new Date().toISOString();
  return {
    version: DB_VERSION,
    users: [
      {
        id: 'usr_demo',
        email: DEMO_CREDENTIALS.email,
        name: 'Demo User',
        password: DEMO_CREDENTIALS.password,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function read(): MockDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as MockDb;
    if (parsed.version !== DB_VERSION || !Array.isArray(parsed.users)) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

function write(db: MockDb): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable (private mode) — mock still works in memory this session */
  }
}

/** Wipe mock state back to the seeded demo user. Used by the Reset control. */
export function resetMockDb(): void {
  write(seed());
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function findUserByEmail(email: string): MockUser | undefined {
  const needle = email.trim().toLowerCase();
  return read().users.find((u) => u.email.toLowerCase() === needle);
}

export function findUserById(id: string): MockUser | undefined {
  return read().users.find((u) => u.id === id);
}

export function createUser(email: string, password: string, name?: string): MockUser {
  const trimmed = email.trim().toLowerCase();
  const db = read();
  if (db.users.some((u) => u.email.toLowerCase() === trimmed)) {
    // Mirrors src/users/users.service.ts
    throw new Error('User with this email already exists');
  }
  const now = new Date().toISOString();
  const user: MockUser = {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    email: trimmed,
    name: name?.trim() || trimmed.split('@')[0],
    password,
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(user);
  write(db);
  return user;
}

/** Mock login. Returns the user or throws the same message the API does. */
export function authenticate(email: string, password: string): MockUser {
  const user = findUserByEmail(email);
  if (!user || user.password !== password) {
    // Mirrors src/auth/auth.service.ts UnauthorizedException('Invalid credentials')
    throw new Error('Invalid credentials');
  }
  return user;
}

/* ───────────── Session ───────────── */

export function setSession(userId: string): string {
  const token = `mock.${btoa(userId)}.${Date.now().toString(36)}`;
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    /* ignore */
  }
  return token;
}

export function getSessionUserId(): string | null {
  try {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) return null;
    const [, payload] = token.split('.');
    return payload ? atob(payload) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Mock user for the dev-only `VITE_AUTH_BYPASS=1` design-review mode. */
export const DEV_BYPASS_USER: MockUser = {
  id: 'usr_dev',
  email: 'dev@calassist.local',
  name: 'Dev Preview',
  password: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

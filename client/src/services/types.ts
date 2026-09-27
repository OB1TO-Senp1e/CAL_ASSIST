/**
 * Shared API types. Every field here is copied from the backend source, not
 * invented — see the cited file. Stage 3 swaps the data source, not the types.
 */

/** `AuthResponse` — src/auth/auth.service.ts */
export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

/** `UsersService.findById` select — src/users/users.service.ts (GET /api/users/me) */
export interface Profile extends AuthUser {
  createdAt: string;
  updatedAt: string;
  preferences?: unknown[];
  goals?: unknown[];
  projects?: unknown[];
}

/**
 * POST /auth/login is guarded by LocalAuthGuard and returns 401 with
 * `{ message: 'Invalid credentials' }` (src/auth/auth.service.ts).
 * POST /auth/register throws `User with this email already exists`
 * (src/users/users.service.ts) — surfaced as 400.
 */
export interface ApiError {
  message: string | string[];
  error?: string;
  statusCode?: number;
}

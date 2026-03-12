export type UserRole = 'viewer' | 'editor' | 'admin';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  displayName: string;
  role: UserRole;
}

export interface AuthSessionResponse {
  user: AuthenticatedUser;
  expiresAt: string;
  absoluteExpiresAt: string;
}

export interface AuthErrorEvent {
  status: 401 | 403;
  code: 'AUTH_REQUIRED' | 'FORBIDDEN';
  method: string;
  path: string;
  message: string;
}


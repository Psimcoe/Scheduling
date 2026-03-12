export type AuthRole = 'viewer' | 'editor' | 'admin';

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string;
  role: AuthRole;
}

export interface AuthSession {
  id: string;
  csrfToken: string;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface RequestAuthContext {
  user: AuthUser;
  session: AuthSession;
}

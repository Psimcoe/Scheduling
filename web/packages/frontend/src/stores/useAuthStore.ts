import { create } from 'zustand';
import type { AuthErrorEvent, AuthSessionResponse } from '../auth/types';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'reauthenticating';

interface AuthState {
  status: AuthStatus;
  session: AuthSessionResponse | null;
  csrfToken: string | null;
  lastError: string | null;
  lastAuthEvent: AuthErrorEvent | null;
  setSession: (session: AuthSessionResponse | null) => void;
  setStatus: (status: AuthStatus) => void;
  setCsrfToken: (csrfToken: string | null) => void;
  setLastError: (message: string | null) => void;
  pushAuthEvent: (event: AuthErrorEvent) => void;
  clearAuthEvent: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  session: null,
  csrfToken: null,
  lastError: null,
  lastAuthEvent: null,
  setSession: (session) =>
    set({
      session,
      status: session ? 'authenticated' : 'unauthenticated',
      lastError: null,
    }),
  setStatus: (status) => set({ status }),
  setCsrfToken: (csrfToken) => set({ csrfToken }),
  setLastError: (lastError) => set({ lastError }),
  pushAuthEvent: (lastAuthEvent) => set({ lastAuthEvent }),
  clearAuthEvent: () => set({ lastAuthEvent: null }),
  reset: () =>
    set({
      status: 'unauthenticated',
      session: null,
      csrfToken: null,
      lastError: null,
      lastAuthEvent: null,
    }),
}));


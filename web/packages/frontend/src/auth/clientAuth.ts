import { useAuthStore } from '../stores/useAuthStore';
import type { AuthErrorEvent, AuthSessionResponse } from './types';

type AuthEventListener = (event: AuthErrorEvent) => void;

const authEventListeners = new Set<AuthEventListener>();
let csrfTokenPromise: Promise<string> | null = null;
let loginPopup: Window | null = null;

export function getCurrentReturnTo(): string {
  if (typeof window === 'undefined') {
    return '/';
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function buildLoginUrl(
  mode: 'redirect' | 'popup' = 'redirect',
  returnTo = getCurrentReturnTo(),
): string {
  const params = new URLSearchParams({
    mode,
    returnTo,
  });
  return `/auth/login?${params.toString()}`;
}

export function openLoginPopup(returnTo = getCurrentReturnTo()): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (loginPopup && !loginPopup.closed) {
    loginPopup.focus();
    return true;
  }

  const popup = window.open(
    buildLoginUrl('popup', returnTo),
    'schedulesync-oidc',
    'popup=yes,width=520,height=720,resizable=yes,scrollbars=yes',
  );

  if (!popup) {
    return false;
  }

  loginPopup = popup;
  return true;
}

export function clearLoginPopup(): void {
  loginPopup = null;
}

export function isLoginPopupOpen(): boolean {
  return Boolean(loginPopup && !loginPopup.closed);
}

export function subscribeAuthEvents(listener: AuthEventListener): () => void {
  authEventListeners.add(listener);
  return () => {
    authEventListeners.delete(listener);
  };
}

export function notifyAuthEvent(event: AuthErrorEvent): void {
  useAuthStore.getState().pushAuthEvent(event);
  for (const listener of authEventListeners) {
    listener(event);
  }
}

export function syncAuthSession(session: AuthSessionResponse | null): void {
  useAuthStore.getState().setSession(session);
  if (!session) {
    useAuthStore.getState().setCsrfToken(null);
  }
}

export function clearCsrfTokenCache(): void {
  csrfTokenPromise = null;
  useAuthStore.getState().setCsrfToken(null);
}

export async function ensureCsrfToken(
  loadToken: () => Promise<{ csrfToken: string }>,
): Promise<string> {
  const cachedToken = useAuthStore.getState().csrfToken;
  if (cachedToken) {
    return cachedToken;
  }

  if (!csrfTokenPromise) {
    csrfTokenPromise = loadToken()
      .then((result) => {
        useAuthStore.getState().setCsrfToken(result.csrfToken);
        return result.csrfToken;
      })
      .finally(() => {
        csrfTokenPromise = null;
      });
  }

  return csrfTokenPromise;
}

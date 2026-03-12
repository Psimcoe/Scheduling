import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Backdrop,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { authApi, ApiError } from '../api';
import {
  buildLoginUrl,
  clearCsrfTokenCache,
  clearLoginPopup,
  isLoginPopupOpen,
  openLoginPopup,
  subscribeAuthEvents,
  syncAuthSession,
} from './clientAuth';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import {
  pauseProjectQueuesForAuth,
  resumeProjectQueuesAfterAuth,
} from '../stores/useProjectStore';

const AUTH_QUERY_KEY = ['auth', 'session'] as const;

async function primeCsrfToken(): Promise<void> {
  const result = await authApi.csrf();
  useAuthStore.getState().setCsrfToken(result.csrfToken);
}

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const queryClient = useQueryClient();
  const status = useAuthStore((state) => state.status);
  const lastError = useAuthStore((state) => state.lastError);
  const setStatus = useAuthStore((state) => state.setStatus);
  const setLastError = useAuthStore((state) => state.setLastError);

  const sessionQuery = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => authApi.session(),
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (sessionQuery.isPending) {
      if (status === 'loading') {
        setStatus('loading');
      }
      return;
    }

    if (sessionQuery.data) {
      const currentStatus = useAuthStore.getState().status;
      if (currentStatus !== 'reauthenticating') {
        syncAuthSession(sessionQuery.data);
        setStatus('authenticated');
        setLastError(null);
        void primeCsrfToken();
      }
      return;
    }

    if (sessionQuery.error instanceof ApiError && sessionQuery.error.code === 'AUTH_REQUIRED') {
      syncAuthSession(null);
      clearCsrfTokenCache();
      if (status !== 'reauthenticating') {
        setStatus('unauthenticated');
      }
      return;
    }

    if (sessionQuery.error instanceof Error) {
      syncAuthSession(null);
      clearCsrfTokenCache();
      setStatus('unauthenticated');
      setLastError(sessionQuery.error.message);
    }
  }, [
    sessionQuery.data,
    sessionQuery.error,
    sessionQuery.isPending,
    setLastError,
    setStatus,
    status,
  ]);

  useEffect(() => {
    return subscribeAuthEvents((event) => {
      if (event.code === 'FORBIDDEN') {
        useUIStore.getState().showSnackbar(event.message, 'error');
        return;
      }

      if (useAuthStore.getState().status === 'reauthenticating') {
        return;
      }

      pauseProjectQueuesForAuth();
      clearCsrfTokenCache();
      useAuthStore.getState().setStatus('reauthenticating');
      useUIStore.getState().showSnackbar('Session expired. Reconnecting...', 'warning');
      void queryClient.cancelQueries({
        predicate: (query) => query.queryKey[0] !== 'auth',
      });

      if (!openLoginPopup()) {
        window.location.assign(buildLoginUrl('redirect'));
      }
    });
  }, [queryClient]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data as
        | { type?: string; status?: 'success' | 'error'; error?: string }
        | undefined;
      if (!payload || payload.type !== 'schedulesync:auth-callback') {
        return;
      }

      clearLoginPopup();

      if (payload.status === 'success') {
        void (async () => {
          try {
            const session = await queryClient.fetchQuery({
              queryKey: AUTH_QUERY_KEY,
              queryFn: () => authApi.session(),
              staleTime: 0,
            });
            syncAuthSession(session);
            setStatus('authenticated');
            setLastError(null);
            await primeCsrfToken();
            await resumeProjectQueuesAfterAuth();
            await queryClient.invalidateQueries({
              predicate: (query) => query.queryKey[0] !== 'auth',
            });
            useUIStore.getState().showSnackbar('Session restored.', 'success');
          } catch (error) {
            syncAuthSession(null);
            clearCsrfTokenCache();
            setStatus('unauthenticated');
            setLastError(error instanceof Error ? error.message : 'Authentication failed.');
            useUIStore.getState().showSnackbar('Authentication failed.', 'error');
          }
        })();
        return;
      }

      syncAuthSession(null);
      clearCsrfTokenCache();
      setStatus('unauthenticated');
      setLastError(payload.error ?? 'Authentication failed.');
      useUIStore.getState().showSnackbar('Authentication failed.', 'error');
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [queryClient, setLastError, setStatus]);

  useEffect(() => {
    if (status !== 'reauthenticating') {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (isLoginPopupOpen()) {
        return;
      }

      clearLoginPopup();
      syncAuthSession(null);
      clearCsrfTokenCache();
      setStatus('unauthenticated');
      setLastError('Sign-in was interrupted before the session was restored.');
    }, 500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [setLastError, setStatus, status]);

  if (status === 'loading') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(135deg, #eef3f8 0%, #dfe8f2 100%)',
        }}
      >
        <Stack spacing={2} alignItems="center">
          <CircularProgress size={32} />
          <Typography variant="body1">Checking your session...</Typography>
        </Stack>
      </Box>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(135deg, #eef3f8 0%, #dfe8f2 100%)',
          padding: 3,
        }}
      >
        <Paper elevation={6} sx={{ maxWidth: 420, width: '100%', padding: 4 }}>
          <Stack spacing={2}>
            <Typography variant="h5" fontWeight={700}>
              Sign in to ScheduleSync
            </Typography>
            <Typography color="text.secondary">
              Your organization account is required to access the scheduling workspace.
            </Typography>
            {lastError ? (
              <Typography color="error.main">{lastError}</Typography>
            ) : null}
            <Button
              variant="contained"
              size="large"
              onClick={() => window.location.assign(buildLoginUrl('redirect'))}
            >
              Sign in with SSO
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  return (
    <>
      {children}
      <Backdrop open={status === 'reauthenticating'} sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.modal + 1 }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress color="inherit" />
          <Typography>Reconnecting your session...</Typography>
        </Stack>
      </Backdrop>
    </>
  );
}

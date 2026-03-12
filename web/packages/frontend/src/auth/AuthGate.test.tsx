import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import AuthGate from './AuthGate';
import { notifyAuthEvent } from './clientAuth';
import { useAuthStore } from '../stores/useAuthStore';

describe('AuthGate', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderWithClient(ui: React.ReactElement) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );

    return queryClient;
  }

  it('shows the sign-in screen when no session is available', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'AUTH_REQUIRED',
          error: 'Authentication is required.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    renderWithClient(
      <AuthGate>
        <div>workspace</div>
      </AuthGate>,
    );

    expect(await screen.findByText('Sign in to ScheduleSync')).toBeInTheDocument();
    expect(screen.queryByText('workspace')).not.toBeInTheDocument();
  });

  it('keeps the app mounted and opens reauthentication when a 401 event arrives', async () => {
    const windowOpenSpy = vi
      .spyOn(window, 'open')
      .mockReturnValue({ closed: false, focus: vi.fn() } as unknown as Window);

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) {
        return new Response(
          JSON.stringify({
            user: {
              id: 'user-1',
              email: 'editor@example.com',
              displayName: 'Editor',
              role: 'editor',
            },
            expiresAt: '2026-03-12T23:00:00.000Z',
            absoluteExpiresAt: '2026-03-13T15:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      if (url.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({ csrfToken: 'csrf-1' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithClient(
      <AuthGate>
        <div>workspace</div>
      </AuthGate>,
    );

    expect(await screen.findByText('workspace')).toBeInTheDocument();

    await act(async () => {
      notifyAuthEvent({
        status: 401,
        code: 'AUTH_REQUIRED',
        method: 'GET',
        path: '/api/projects',
        message: 'Authentication is required.',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Reconnecting your session...')).toBeInTheDocument();
    });
    expect(windowOpenSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('workspace')).toBeInTheDocument();
    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('reauthenticating');
    });

    windowOpenSpy.mockRestore();
  });
});

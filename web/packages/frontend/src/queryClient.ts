import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/client';

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.code === 'AUTH_REQUIRED' || error.code === 'FORBIDDEN') {
      return false;
    }
  }

  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

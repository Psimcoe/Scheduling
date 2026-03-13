import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, stratusApi, type StratusJobResponse } from '../api/client';
import { useStratusJob } from './useStratusJob';

function createJob(status: StratusJobResponse['status']): StratusJobResponse {
  return {
    id: 'job-1',
    kind: 'projectImportApply',
    status,
    progress: {
      phase: 'loadingPackages',
      message: 'Running import.',
      processedPackages: 1,
      totalPackages: 4,
      processedAssemblies: 0,
      totalAssemblies: 0,
      skippedUnchangedPackages: 0,
      source: 'stratusApi',
    },
    createdAt: '2026-03-13T20:00:00.000Z',
    startedAt: '2026-03-13T20:00:01.000Z',
    finishedAt: status === 'succeeded' ? '2026-03-13T20:00:08.000Z' : null,
    error: null,
    result: null,
  };
}

describe('useStratusJob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps polling after a transient 429 and recovers on the next successful poll', async () => {
    vi.useFakeTimers();

    const getJobSpy = vi
      .spyOn(stratusApi, 'getJob')
      .mockRejectedValueOnce(
        new ApiError(429, 'RATE_LIMITED', 'Rate limit exceeded.'),
      )
      .mockResolvedValueOnce(createJob('running'))
      .mockResolvedValueOnce(createJob('succeeded'));

    const { result } = renderHook(() => useStratusJob());

    await act(async () => {
      await result.current.startJob(async () => createJob('running'));
    });

    expect(result.current.job?.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(getJobSpy).toHaveBeenCalledTimes(1);
    expect(result.current.job?.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(getJobSpy).toHaveBeenCalledTimes(2);
    expect(result.current.job?.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.job?.status).toBe('succeeded');
    expect(getJobSpy).toHaveBeenCalledTimes(3);
  }, 10_000);
});

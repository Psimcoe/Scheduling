import { useEffect, useState } from 'react';
import { ApiError, stratusApi, type StratusJobResponse } from '../api/client';
import {
  getServerEventsConnected,
  subscribeToServerEventConnection,
  subscribeToServerEvents,
} from '../realtime/serverEventsClient';

const DEFAULT_POLL_DELAY_MS = 2_000;
const MAX_POLL_DELAY_MS = 10_000;
const MAX_TRANSIENT_FAILURES = 6;

function isTransientPollError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 429 || error.status >= 500;
  }

  return true;
}

export function useStratusJob() {
  const [job, setJob] = useState<StratusJobResponse | null>(null);
  const [pollDelayMs, setPollDelayMs] = useState(DEFAULT_POLL_DELAY_MS);
  const [transientFailureCount, setTransientFailureCount] = useState(0);
  const [serverEventsConnected, setServerEventsConnected] = useState(
    getServerEventsConnected(),
  );

  useEffect(() => {
    return subscribeToServerEventConnection(setServerEventsConnected);
  }, []);

  useEffect(() => {
    return subscribeToServerEvents((event) => {
      if (event.type !== 'stratusJobUpdated') {
        return;
      }

      setJob((currentJob) => {
        if (!currentJob || currentJob.id !== event.job.id) {
          return currentJob;
        }

        return {
          ...currentJob,
          kind: currentJob.kind,
          status: event.job.status,
          progress: event.job.progress as StratusJobResponse['progress'],
          createdAt: event.job.createdAt,
          startedAt: event.job.startedAt,
          finishedAt: event.job.finishedAt,
          error: event.job.error,
          result: currentJob.result,
        };
      });
    });
  }, []);

  useEffect(() => {
    if (
      !serverEventsConnected ||
      !job ||
      job.status !== 'succeeded' ||
      job.result != null
    ) {
      return;
    }

    let cancelled = false;
    void stratusApi.getJob(job.id).then((nextJob) => {
      if (!cancelled) {
        setJob(nextJob);
      }
    }).catch(() => {
      // Ignore here; the fallback poll path will pick it up if needed.
    });

    return () => {
      cancelled = true;
    };
  }, [job, serverEventsConnected]);

  useEffect(() => {
    if (serverEventsConnected) {
      return;
    }

    if (!job || job.status === 'succeeded' || job.status === 'failed') {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const nextJob = await stratusApi.getJob(job.id);
        if (!cancelled) {
          setPollDelayMs(DEFAULT_POLL_DELAY_MS);
          setTransientFailureCount(0);
          setJob(nextJob);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          if (isTransientPollError(error)) {
            const nextFailureCount = transientFailureCount + 1;
            if (nextFailureCount >= MAX_TRANSIENT_FAILURES) {
              setJob((currentJob) =>
                currentJob
                  ? {
                      ...currentJob,
                      status: 'failed',
                      finishedAt: new Date().toISOString(),
                      error:
                        error instanceof Error
                          ? error.message
                          : 'Stratus job status could not be loaded.',
                    }
                  : null,
              );
              return;
            }

            setTransientFailureCount(nextFailureCount);
            setPollDelayMs((currentDelay) =>
              Math.min(MAX_POLL_DELAY_MS, currentDelay * 2),
            );
            return;
          }

          setJob((currentJob) =>
            currentJob
              ? {
                  ...currentJob,
                  status: 'failed',
                  finishedAt: new Date().toISOString(),
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Stratus job status could not be loaded.',
                }
              : null,
          );
        }
      }
    }, pollDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [job, pollDelayMs, serverEventsConnected, transientFailureCount]);

  const startJob = async (createJob: () => Promise<StratusJobResponse>) => {
    const createdJob = await createJob();
    setPollDelayMs(DEFAULT_POLL_DELAY_MS);
    setTransientFailureCount(0);
    setJob(createdJob);
    return createdJob;
  };

  return {
    job,
    setJob,
    clearJob: () => {
      setPollDelayMs(DEFAULT_POLL_DELAY_MS);
      setTransientFailureCount(0);
      setJob(null);
    },
    startJob,
    isRunning:
      job?.status === 'queued' || job?.status === 'running',
  };
}

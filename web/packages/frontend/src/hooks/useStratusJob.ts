import { useEffect, useState } from 'react';
import { stratusApi, type StratusJobResponse } from '../api/client';

export function useStratusJob() {
  const [job, setJob] = useState<StratusJobResponse | null>(null);

  useEffect(() => {
    if (!job || job.status === 'succeeded' || job.status === 'failed') {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const nextJob = await stratusApi.getJob(job.id);
        if (!cancelled) {
          setJob(nextJob);
        }
      } catch (error: unknown) {
        if (!cancelled) {
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
    }, 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [job]);

  const startJob = async (createJob: () => Promise<StratusJobResponse>) => {
    const createdJob = await createJob();
    setJob(createdJob);
    return createdJob;
  };

  return {
    job,
    setJob,
    clearJob: () => setJob(null),
    startJob,
    isRunning:
      job?.status === 'queued' || job?.status === 'running',
  };
}

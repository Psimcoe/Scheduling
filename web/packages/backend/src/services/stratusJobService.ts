import { randomUUID } from "node:crypto";

export type StratusJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type StratusJobKind =
  | "projectImportPreview"
  | "projectImportApply"
  | "pullPreview"
  | "pullApply";

export type StratusJobPhase =
  | "idle"
  | "loadingProjects"
  | "loadingPackages"
  | "loadingAssemblies"
  | "comparingLocal"
  | "applyingPackages"
  | "applyingAssemblies"
  | "finalizing";

export interface StratusJobProgress {
  phase: StratusJobPhase;
  message: string | null;
  processedPackages: number;
  totalPackages: number;
  processedAssemblies: number;
  totalAssemblies: number;
  skippedUnchangedPackages: number;
  source: "sqlBigData" | "stratusApi" | null;
}

export interface StratusJobRecord<TResult = unknown> {
  id: string;
  kind: StratusJobKind;
  status: StratusJobStatus;
  progress: StratusJobProgress;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: TResult | null;
}

export type StratusJobProgressReporter = (
  update: Partial<StratusJobProgress>,
) => void;

const STRATUS_JOB_MAX_ENTRIES = 48;
const STRATUS_JOB_TTL_MS = 60 * 60 * 1_000;

const jobs = new Map<string, StratusJobRecord>();

function defaultProgress(): StratusJobProgress {
  return {
    phase: "idle",
    message: null,
    processedPackages: 0,
    totalPackages: 0,
    processedAssemblies: 0,
    totalAssemblies: 0,
    skippedUnchangedPackages: 0,
    source: null,
  };
}

function cleanupJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    const finishedAt = job.finishedAt ? Date.parse(job.finishedAt) : null;
    if (finishedAt && now - finishedAt > STRATUS_JOB_TTL_MS) {
      jobs.delete(jobId);
    }
  }

  if (jobs.size <= STRATUS_JOB_MAX_ENTRIES) {
    return;
  }

  const sorted = [...jobs.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
  for (const job of sorted.slice(0, jobs.size - STRATUS_JOB_MAX_ENTRIES)) {
    jobs.delete(job.id);
  }
}

export function createStratusJob<TResult>(
  kind: StratusJobKind,
  runner: (reportProgress: StratusJobProgressReporter) => Promise<TResult>,
): StratusJobRecord<TResult> {
  cleanupJobs();

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const job: StratusJobRecord<TResult> = {
    id,
    kind,
    status: "queued",
    progress: defaultProgress(),
    createdAt,
    startedAt: null,
    finishedAt: null,
    error: null,
    result: null,
  };
  jobs.set(id, job as StratusJobRecord);

  queueMicrotask(async () => {
    const startedAt = new Date().toISOString();
    const runningJob = jobs.get(id);
    if (!runningJob) {
      return;
    }

    runningJob.status = "running";
    runningJob.startedAt = startedAt;
    jobs.set(id, runningJob);

    try {
      const result = await runner((update) => {
        const current = jobs.get(id);
        if (!current) {
          return;
        }
        current.progress = {
          ...current.progress,
          ...update,
        };
        jobs.set(id, current);
      });

      const completedJob = jobs.get(id);
      if (!completedJob) {
        return;
      }
      completedJob.status = "succeeded";
      completedJob.finishedAt = new Date().toISOString();
      completedJob.error = null;
      completedJob.result = result;
      jobs.set(id, completedJob);
    } catch (error) {
      const failedJob = jobs.get(id);
      if (!failedJob) {
        return;
      }
      failedJob.status = "failed";
      failedJob.finishedAt = new Date().toISOString();
      failedJob.error =
        error instanceof Error ? error.message : "Stratus job failed.";
      failedJob.result = null;
      jobs.set(id, failedJob);
    }
  });

  return job;
}

export function getStratusJob<TResult = unknown>(
  jobId: string,
): StratusJobRecord<TResult> | null {
  cleanupJobs();
  return (jobs.get(jobId) as StratusJobRecord<TResult> | undefined) ?? null;
}

export function clearStratusJobsForTests() {
  jobs.clear();
}

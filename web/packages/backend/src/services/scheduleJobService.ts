import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { invalidateProjectSnapshotCache } from "./projectSnapshotService.js";
import {
  publishRealtimeEvent,
  type RealtimeScheduleJobSummary,
} from "./realtimeEvents.js";
import { recalculateProject } from "./schedulingService.js";

export type ScheduleJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface ScheduleJobRecord {
  id: string;
  projectId: string;
  status: ScheduleJobStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  revision: number | null;
  calculationTimeMs: number | null;
}

interface ProjectScheduleState {
  job: ScheduleJobRecord | null;
  processing: boolean;
  rerunRequested: boolean;
}

const projectScheduleStates = new Map<string, ProjectScheduleState>();

function getOrCreateProjectScheduleState(projectId: string): ProjectScheduleState {
  let state = projectScheduleStates.get(projectId);
  if (!state) {
    state = {
      job: null,
      processing: false,
      rerunRequested: false,
    };
    projectScheduleStates.set(projectId, state);
  }

  return state;
}

function toScheduleJobSummary(job: ScheduleJobRecord): RealtimeScheduleJobSummary {
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    revision: job.revision,
    calculationTimeMs: job.calculationTimeMs,
  };
}

function publishScheduleJob(job: ScheduleJobRecord): void {
  publishRealtimeEvent({
    type: "scheduleJobUpdated",
    projectId: job.projectId,
    job: toScheduleJobSummary(job),
  });
}

export function notifyProjectRevision(projectId: string, revision: number): void {
  invalidateProjectSnapshotCache(projectId);
  publishRealtimeEvent({
    type: "projectRevision",
    projectId,
    revision,
  });
  publishRealtimeEvent({
    type: "projectSnapshotInvalidated",
    projectId,
    revision,
  });
}

async function runQueuedSchedule(projectId: string): Promise<void> {
  const state = getOrCreateProjectScheduleState(projectId);
  if (state.processing || !state.job) {
    return;
  }

  state.processing = true;

  try {
    do {
      state.rerunRequested = false;
      const job = state.job;
      if (!job) {
        break;
      }

      job.status = "running";
      job.startedAt = new Date().toISOString();
      job.finishedAt = null;
      job.error = null;
      publishScheduleJob(job);

      try {
        const result = await recalculateProject(projectId);
        job.status = "succeeded";
        job.finishedAt = new Date().toISOString();
        job.revision = result.revision;
        job.calculationTimeMs = result.calculationTimeMs;
        job.error = null;
        publishScheduleJob(job);
        notifyProjectRevision(projectId, result.revision);
      } catch (error) {
        job.status = "failed";
        job.finishedAt = new Date().toISOString();
        job.error =
          error instanceof Error ? error.message : "Project recalculation failed.";
        publishScheduleJob(job);
      }
    } while (state.rerunRequested && state.job?.status !== "failed");
  } finally {
    state.processing = false;
  }
}

export function enqueueProjectRecalculation(projectId: string): {
  status: "queued" | "running";
  jobId: string;
} {
  const state = getOrCreateProjectScheduleState(projectId);
  const activeJob = state.job;

  if (activeJob && (activeJob.status === "queued" || activeJob.status === "running")) {
    state.rerunRequested = true;
    publishScheduleJob(activeJob);
    return {
      status: activeJob.status,
      jobId: activeJob.id,
    };
  }

  const job: ScheduleJobRecord = {
    id: randomUUID(),
    projectId,
    status: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null,
    revision: null,
    calculationTimeMs: null,
  };

  state.job = job;
  state.rerunRequested = false;
  publishScheduleJob(job);
  queueMicrotask(() => {
    void runQueuedSchedule(projectId);
  });

  return {
    status: "queued",
    jobId: job.id,
  };
}

export async function incrementProjectRevision(projectId: string): Promise<number> {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { revision: { increment: 1 } },
    select: { revision: true },
  });

  notifyProjectRevision(projectId, project.revision);

  return project.revision;
}

export async function notifyCurrentProjectRevision(projectId: string): Promise<number> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { revision: true },
  });
  notifyProjectRevision(projectId, project.revision);
  return project.revision;
}

export function clearScheduleJobsForTests(): void {
  projectScheduleStates.clear();
}

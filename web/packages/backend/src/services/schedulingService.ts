/**
 * Scheduling service — loads project data, runs the scheduling engine in a
 * worker thread, and persists the resulting schedule fields plus project revision.
 */

import { Worker } from 'node:worker_threads';
import type { ProjectData, ScheduleResult, ScheduleWarning } from '@schedulesync/engine';
import { prisma } from '../db.js';
import { loadProjectData } from './costService.js';

const WORKER_URL = new URL(
  import.meta.url.endsWith('.ts')
    ? '../workers/recalculateWorker.ts'
    : '../workers/recalculateWorker.js',
  import.meta.url,
);

export interface RecalculationResult {
  revision: number;
  warnings: ScheduleWarning[];
  calculationTimeMs: number;
}

function runScheduleWorker(projectData: ProjectData): Promise<ScheduleResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, {
      execArgv: import.meta.url.endsWith('.ts') ? ['--import', 'tsx'] : undefined,
      workerData: projectData,
    });

    worker.once('message', (message: { ok: true; result: ScheduleResult } | { ok: false; error: string }) => {
      worker.terminate().catch(() => {});
      if (message.ok) {
        resolve(message.result);
        return;
      }

      reject(new Error(message.error));
    });

    worker.once('error', (error) => {
      worker.terminate().catch(() => {});
      reject(error);
    });

    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Scheduling worker exited with code ${code}.`));
      }
    });
  });
}

export async function recalculateProjectData(projectData: ProjectData): Promise<ScheduleResult> {
  return runScheduleWorker(projectData);
}

interface TaskScheduleUpdate {
  id: string;
  data: {
    start: Date;
    finish: Date;
    durationMinutes: number;
    percentComplete: number;
    isCritical: boolean;
    totalSlackMinutes: number;
    freeSlackMinutes: number;
    earlyStart: Date | null;
    earlyFinish: Date | null;
    lateStart: Date | null;
    lateFinish: Date | null;
  };
}

function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function buildTaskScheduleUpdates(
  projectData: ProjectData,
  result: ScheduleResult,
): TaskScheduleUpdate[] {
  const existingTasks = new Map(projectData.tasks.map((task) => [task.id, task]));

  return result.tasks.flatMap((task) => {
    const existingTask = existingTasks.get(task.id);

    if (
      existingTask &&
      existingTask.start === task.start &&
      existingTask.finish === task.finish &&
      existingTask.durationMinutes === task.durationMinutes &&
      existingTask.percentComplete === task.percentComplete &&
      existingTask.isCritical === task.isCritical &&
      existingTask.totalSlackMinutes === task.totalSlackMinutes &&
      existingTask.freeSlackMinutes === task.freeSlackMinutes &&
      existingTask.earlyStart === task.earlyStart &&
      existingTask.earlyFinish === task.earlyFinish &&
      existingTask.lateStart === task.lateStart &&
      existingTask.lateFinish === task.lateFinish
    ) {
      return [];
    }

    return [
      {
        id: task.id,
        data: {
          start: new Date(task.start),
          finish: new Date(task.finish),
          durationMinutes: task.durationMinutes,
          percentComplete: task.percentComplete,
          isCritical: task.isCritical,
          totalSlackMinutes: task.totalSlackMinutes,
          freeSlackMinutes: task.freeSlackMinutes,
          earlyStart: toDateOrNull(task.earlyStart),
          earlyFinish: toDateOrNull(task.earlyFinish),
          lateStart: toDateOrNull(task.lateStart),
          lateFinish: toDateOrNull(task.lateFinish),
        },
      },
    ];
  });
}

export async function persistScheduleResult(
  projectId: string,
  projectData: ProjectData,
  result: ScheduleResult,
): Promise<number> {
  const taskScheduleUpdates = buildTaskScheduleUpdates(projectData, result);
  const updatedProject = await prisma.$transaction(async (tx) => {
    for (const taskScheduleUpdate of taskScheduleUpdates) {
      await tx.task.update({
        where: { id: taskScheduleUpdate.id },
        data: taskScheduleUpdate.data,
      });
    }

    return tx.project.update({
      where: { id: projectId },
      data: {
        finishDate: projectData.settings.finishDate
          ? new Date(projectData.settings.finishDate)
          : null,
        revision: { increment: 1 },
      },
      select: { revision: true },
    });
  }, {
    maxWait: 10_000,
    timeout: 60_000,
  });

  return updatedProject.revision;
}

/**
 * Recalculate the schedule for a project and persist the authoritative result.
 */
export async function recalculateProject(projectId: string): Promise<RecalculationResult> {
  const projectData = await loadProjectData(projectId);
  const result = await recalculateProjectData(projectData);
  const revision = await persistScheduleResult(projectId, projectData, result);

  return {
    revision,
    warnings: result.warnings,
    calculationTimeMs: result.calculationTimeMs,
  };
}

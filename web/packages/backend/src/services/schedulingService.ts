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

export async function persistScheduleResult(
  projectId: string,
  projectData: ProjectData,
  result: ScheduleResult,
): Promise<number> {
  const updatedProject = await prisma.$transaction(async (tx) => {
    await Promise.all(
      result.tasks.map((task) =>
        tx.task.update({
          where: { id: task.id },
          data: {
            start: new Date(task.start),
            finish: new Date(task.finish),
            durationMinutes: task.durationMinutes,
            percentComplete: task.percentComplete,
            isCritical: task.isCritical,
            totalSlackMinutes: task.totalSlackMinutes,
            freeSlackMinutes: task.freeSlackMinutes,
            earlyStart: task.earlyStart ? new Date(task.earlyStart) : null,
            earlyFinish: task.earlyFinish ? new Date(task.earlyFinish) : null,
            lateStart: task.lateStart ? new Date(task.lateStart) : null,
            lateFinish: task.lateFinish ? new Date(task.lateFinish) : null,
          },
        }),
      ),
    );

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

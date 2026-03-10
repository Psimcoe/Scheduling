/**
 * Undo / Redo service — snapshot-based.
 *
 * Captures full undo snapshots of project task state
 * and provides undo/redo via a position-stack stored in UndoEntry table.
 */

import { prisma } from '../db.js';
import { recalculateProject } from './schedulingService.js';

interface TaskSnapshot {
  id: string;
  name: string;
  type: string;
  durationMinutes: number;
  start: string;
  finish: string;
  percentComplete: number;
  constraintType: number;
  constraintDate: string | null;
  isManuallyScheduled: boolean;
  parentId: string | null;
  sortOrder: number;
  calendarId: string | null;
  notes: string | null;
  externalKey: string | null;
}

interface DependencySnapshot {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  type: string;
  lagMinutes: number;
}

interface UndoSnapshot {
  tasks: TaskSnapshot[];
  dependencies: DependencySnapshot[];
}

const MAX_UNDO_ENTRIES = 100;

/**
 * Capture the current project state as an undo snapshot.
 */
export async function captureUndo(
  projectId: string,
  description: string,
): Promise<void> {
  const [tasks, deps] = await Promise.all([
    prisma.task.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.dependency.findMany({ where: { projectId } }),
  ]);

  const snapshot: UndoSnapshot = {
    tasks: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      durationMinutes: t.durationMinutes,
      start: t.start.toISOString(),
      finish: t.finish.toISOString(),
      percentComplete: t.percentComplete,
      constraintType: t.constraintType,
      constraintDate: t.constraintDate?.toISOString() ?? null,
      isManuallyScheduled: t.isManuallyScheduled,
      parentId: t.parentId,
      sortOrder: t.sortOrder,
      calendarId: t.calendarId,
      notes: t.notes,
      externalKey: t.externalKey,
    })),
    dependencies: deps.map((d) => ({
      id: d.id,
      fromTaskId: d.fromTaskId,
      toTaskId: d.toTaskId,
      type: d.type,
      lagMinutes: d.lagMinutes,
    })),
  };

  // Get current highest position
  const topEntry = await prisma.undoEntry.findFirst({
    where: { projectId },
    orderBy: { position: 'desc' },
  });
  const nextPosition = (topEntry?.position ?? -1) + 1;

  // Remove any redo entries above current pointer
  const current = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { undoPointer: true },
  });
  if (current.undoPointer !== null && current.undoPointer < nextPosition - 1) {
    await prisma.undoEntry.deleteMany({
      where: {
        projectId,
        position: { gt: current.undoPointer },
      },
    });
  }

  // Re-calculate next position after cleanup
  const newTop = await prisma.undoEntry.findFirst({
    where: { projectId },
    orderBy: { position: 'desc' },
  });
  const pos = (newTop?.position ?? -1) + 1;

  await prisma.undoEntry.create({
    data: {
      projectId,
      position: pos,
      description,
      snapshotJson: JSON.stringify(snapshot),
    },
  });

  // Update pointer
  await prisma.project.update({
    where: { id: projectId },
    data: { undoPointer: pos },
  });

  // Prune old entries
  const count = await prisma.undoEntry.count({ where: { projectId } });
  if (count > MAX_UNDO_ENTRIES) {
    const toDelete = await prisma.undoEntry.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
      take: count - MAX_UNDO_ENTRIES,
      select: { id: true },
    });
    await prisma.undoEntry.deleteMany({
      where: { id: { in: toDelete.map((e) => e.id) } },
    });
  }
}

/**
 * Undo the last change — restore from the previous snapshot.
 */
export async function undo(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { undoPointer: true },
  });

  if (project.undoPointer === null || project.undoPointer <= 0) {
    return false; // nothing to undo
  }

  const prevPosition = project.undoPointer - 1;
  const entry = await prisma.undoEntry.findFirst({
    where: { projectId, position: prevPosition },
  });

  if (!entry) return false;

  let snapshot: UndoSnapshot;
  try {
    snapshot = JSON.parse(entry.snapshotJson);
  } catch {
    throw new Error(`Corrupted undo snapshot at position ${prevPosition}`);
  }

  await restoreSnapshot(projectId, snapshot);

  await prisma.project.update({
    where: { id: projectId },
    data: { undoPointer: prevPosition },
  });

  await recalculateProject(projectId);
  return true;
}

/**
 * Redo the previously undone change.
 */
export async function redo(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { undoPointer: true },
  });

  if (project.undoPointer === null) return false;

  const nextPosition = project.undoPointer + 1;
  const entry = await prisma.undoEntry.findFirst({
    where: { projectId, position: nextPosition },
  });

  if (!entry) return false;

  let snapshot: UndoSnapshot;
  try {
    snapshot = JSON.parse(entry.snapshotJson);
  } catch {
    throw new Error(`Corrupted redo snapshot at position ${nextPosition}`);
  }

  await restoreSnapshot(projectId, snapshot);

  await prisma.project.update({
    where: { id: projectId },
    data: { undoPointer: nextPosition },
  });

  await recalculateProject(projectId);
  return true;
}

/**
 * Restore a full snapshot — replaces tasks and dependencies for the project.
 */
async function restoreSnapshot(
  projectId: string,
  snapshot: UndoSnapshot,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Delete current tasks and deps for the project
    await tx.dependency.deleteMany({ where: { projectId } });
    await tx.assignment.deleteMany({ where: { task: { projectId } } });
    await tx.baseline.deleteMany({ where: { task: { projectId } } });
    await tx.task.deleteMany({ where: { projectId } });

    // Re-create tasks
    for (const t of snapshot.tasks) {
      await tx.task.create({
        data: {
          id: t.id,
          projectId,
          name: t.name,
          wbsCode: '',
          outlineLevel: 0,
          type: t.type,
          durationMinutes: t.durationMinutes,
          start: new Date(t.start),
          finish: new Date(t.finish),
          percentComplete: t.percentComplete,
          constraintType: t.constraintType,
          constraintDate: t.constraintDate ? new Date(t.constraintDate) : null,
          isManuallyScheduled: t.isManuallyScheduled,
          parentId: t.parentId,
          sortOrder: t.sortOrder,
          calendarId: t.calendarId,
          notes: t.notes ?? '',
          externalKey: t.externalKey ?? undefined,
        },
      });
    }

    // Re-create dependencies
    for (const d of snapshot.dependencies) {
      await tx.dependency.create({
        data: {
          id: d.id,
          projectId,
          fromTaskId: d.fromTaskId,
          toTaskId: d.toTaskId,
          type: d.type,
          lagMinutes: d.lagMinutes,
        },
      });
    }
  });
}

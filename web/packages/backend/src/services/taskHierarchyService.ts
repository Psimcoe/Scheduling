import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { notifyProjectRevision } from "./scheduleJobService.js";
import {
  buildUndefinedPackageExternalKey,
  buildUndefinedPackageName,
  buildUndefinedPackageNote,
  extractUndefinedPackageKey,
} from "./stratusPackagePlaceholder.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

interface HierarchyTaskRecord {
  id: string;
  projectId: string;
  parentId: string | null;
  outlineLevel: number;
  type: string;
  name: string;
  sortOrder: number;
  externalKey: string | null;
  durationMinutes: number;
  start: Date;
  finish: Date;
  notes: string;
  stratusSync: {
    packageId: string;
  } | null;
  stratusAssemblySync: {
    packageId: string;
    externalKey: string;
  } | null;
}

interface PlaceholderGroupInfo {
  packageId: string;
  bestAvailableKey: string | null;
  earliestSortOrder: number;
  start: Date;
  finish: Date;
}

interface NormalizeTaskHierarchyResult {
  changed: boolean;
  revision: number | null;
}

interface NormalizeTaskHierarchyOptions {
  incrementRevision?: boolean;
}

function compareTasksBySortOrder(
  left: Pick<HierarchyTaskRecord, "sortOrder" | "id">,
  right: Pick<HierarchyTaskRecord, "sortOrder" | "id">,
): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

function isUndefinedPlaceholderTask(task: HierarchyTaskRecord): boolean {
  return (
    extractUndefinedPackageKey(task.externalKey) !== null &&
    task.stratusAssemblySync === null
  );
}

function getAssemblyPackageKey(
  task: Pick<HierarchyTaskRecord, "externalKey">,
): string | null {
  const externalKey = task.externalKey;
  if (!externalKey) {
    return null;
  }

  const separatorIndex = externalKey.indexOf("::assembly:");
  if (separatorIndex === -1) {
    return null;
  }

  return externalKey.slice(0, separatorIndex) || null;
}

function resolvePlaceholderGroupInfo(
  tasks: HierarchyTaskRecord[],
): Map<string, PlaceholderGroupInfo> {
  const groups = new Map<string, PlaceholderGroupInfo>();

  for (const task of tasks) {
    const packageId = task.stratusAssemblySync?.packageId;
    if (!packageId) {
      continue;
    }

    const bestAvailableKey =
      getAssemblyPackageKey(task) ??
      extractUndefinedPackageKey(task.externalKey) ??
      packageId;
    const current = groups.get(packageId);
    if (!current) {
      groups.set(packageId, {
        packageId,
        bestAvailableKey,
        earliestSortOrder: task.sortOrder,
        start: task.start,
        finish: task.finish,
      });
      continue;
    }

    groups.set(packageId, {
      packageId,
      bestAvailableKey: current.bestAvailableKey ?? bestAvailableKey,
      earliestSortOrder: Math.min(current.earliestSortOrder, task.sortOrder),
      start: current.start <= task.start ? current.start : task.start,
      finish: current.finish >= task.finish ? current.finish : task.finish,
    });
  }

  return groups;
}

function resolveSafeParentId(
  taskId: string,
  desiredParentId: string | null,
  taskMap: Map<string, HierarchyTaskRecord>,
  proposedParentIds: Map<string, string | null>,
  resolvedParentIds: Map<string, string | null>,
): string | null {
  if (!desiredParentId || !taskMap.has(desiredParentId) || desiredParentId === taskId) {
    return null;
  }

  const seen = new Set([taskId]);
  let currentId: string | null = desiredParentId;

  while (currentId) {
    if (!taskMap.has(currentId) || seen.has(currentId)) {
      return null;
    }

    seen.add(currentId);
    currentId = resolvedParentIds.has(currentId)
      ? (resolvedParentIds.get(currentId) ?? null)
      : (proposedParentIds.get(currentId) ?? null);
  }

  return desiredParentId;
}

function computeOutlineLevel(
  taskId: string,
  parentIds: Map<string, string | null>,
  memo: Map<string, number>,
): number {
  const cached = memo.get(taskId);
  if (cached !== undefined) {
    return cached;
  }

  const parentId = parentIds.get(taskId) ?? null;
  const outlineLevel = parentId ? computeOutlineLevel(parentId, parentIds, memo) + 1 : 0;
  memo.set(taskId, outlineLevel);
  return outlineLevel;
}

function computeEffectivePosition(
  taskId: string,
  childIdsByParentId: Map<string, string[]>,
  basePositionByTaskId: Map<string, number>,
  memo: Map<string, number>,
): number {
  const cached = memo.get(taskId);
  if (cached !== undefined) {
    return cached;
  }

  const basePosition = basePositionByTaskId.get(taskId) ?? 0;
  const childIds = childIdsByParentId.get(taskId) ?? [];
  if (childIds.length === 0) {
    memo.set(taskId, basePosition);
    return basePosition;
  }

  const earliestDescendantPosition = childIds.reduce((earliest, childId) => {
    const childPosition = computeEffectivePosition(
      childId,
      childIdsByParentId,
      basePositionByTaskId,
      memo,
    );
    return Math.min(earliest, childPosition);
  }, Number.POSITIVE_INFINITY);
  const effectivePosition = Math.min(basePosition, earliestDescendantPosition - 0.5);
  memo.set(taskId, effectivePosition);
  return effectivePosition;
}

async function loadHierarchyTasks(
  db: DbClient,
  projectId: string,
): Promise<HierarchyTaskRecord[]> {
  return db.task.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      projectId: true,
      parentId: true,
      outlineLevel: true,
      type: true,
      name: true,
      sortOrder: true,
      externalKey: true,
      durationMinutes: true,
      start: true,
      finish: true,
      notes: true,
      stratusSync: {
        select: {
          packageId: true,
        },
      },
      stratusAssemblySync: {
        select: {
          packageId: true,
          externalKey: true,
        },
      },
    },
  });
}

async function ensurePlaceholderTasks(
  db: DbClient,
  projectId: string,
  tasks: HierarchyTaskRecord[],
): Promise<{ tasks: HierarchyTaskRecord[]; changed: boolean }> {
  const nextTasks = [...tasks];
  const placeholderGroups = resolvePlaceholderGroupInfo(tasks);
  const packageParentByPackageId = new Map<string, HierarchyTaskRecord>();

  for (const task of nextTasks) {
    if (task.stratusSync?.packageId) {
      packageParentByPackageId.set(task.stratusSync.packageId, task);
      continue;
    }

    const placeholderPackageId = extractUndefinedPackageKey(task.externalKey);
    if (placeholderPackageId && isUndefinedPlaceholderTask(task)) {
      packageParentByPackageId.set(placeholderPackageId, task);
    }
  }

  let changed = false;

  for (const [packageId, info] of placeholderGroups.entries()) {
    if (packageParentByPackageId.has(packageId)) {
      continue;
    }

    const placeholderTask = await db.task.create({
      data: {
        projectId,
        name: buildUndefinedPackageName(info.bestAvailableKey),
        type: "summary",
        wbsCode: "",
        outlineLevel: 0,
        parentId: null,
        durationMinutes: Math.max(
          0,
          (info.finish.getTime() - info.start.getTime()) / 60_000,
        ),
        start: info.start,
        finish: info.finish,
        constraintType: 0,
        percentComplete: 0,
        isManuallyScheduled: true,
        notes: buildUndefinedPackageNote(info.bestAvailableKey),
        externalKey: buildUndefinedPackageExternalKey(packageId),
        sortOrder: info.earliestSortOrder,
      },
      select: {
        id: true,
        projectId: true,
        parentId: true,
        outlineLevel: true,
        type: true,
        name: true,
        sortOrder: true,
        externalKey: true,
        durationMinutes: true,
        start: true,
        finish: true,
        notes: true,
        stratusSync: {
          select: {
            packageId: true,
          },
        },
        stratusAssemblySync: {
          select: {
            packageId: true,
            externalKey: true,
          },
        },
      },
    });

    nextTasks.push(placeholderTask);
    packageParentByPackageId.set(packageId, placeholderTask);
    changed = true;
  }

  return { tasks: nextTasks, changed };
}

async function normalizeTaskHierarchyWithDb(
  db: DbClient,
  projectId: string,
  options: NormalizeTaskHierarchyOptions = {},
): Promise<NormalizeTaskHierarchyResult> {
  const incrementRevision = options.incrementRevision ?? false;
  const loadedTasks = await loadHierarchyTasks(db, projectId);
  const { tasks, changed: placeholderCreated } = await ensurePlaceholderTasks(
    db,
    projectId,
    loadedTasks,
  );

  if (tasks.length === 0) {
    return { changed: false, revision: null };
  }

  const orderedTasksByExistingOrder = [...tasks].sort(compareTasksBySortOrder);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const placeholderInfoByPackageId = resolvePlaceholderGroupInfo(tasks);
  const packageParentByPackageId = new Map<string, HierarchyTaskRecord>();

  for (const task of tasks) {
    if (task.stratusSync?.packageId) {
      packageParentByPackageId.set(task.stratusSync.packageId, task);
      continue;
    }

    const placeholderPackageId = extractUndefinedPackageKey(task.externalKey);
    if (placeholderPackageId && isUndefinedPlaceholderTask(task)) {
      packageParentByPackageId.set(placeholderPackageId, task);
    }
  }

  const proposedParentIds = new Map<string, string | null>();
  for (const task of orderedTasksByExistingOrder) {
    const assemblyPackageId = task.stratusAssemblySync?.packageId ?? null;
    const packageParentId = assemblyPackageId
      ? (packageParentByPackageId.get(assemblyPackageId)?.id ?? null)
      : null;
    proposedParentIds.set(task.id, packageParentId ?? task.parentId ?? null);
  }

  const resolvedParentIds = new Map<string, string | null>();
  for (const task of orderedTasksByExistingOrder) {
    resolvedParentIds.set(
      task.id,
      resolveSafeParentId(
        task.id,
        proposedParentIds.get(task.id) ?? null,
        taskMap,
        proposedParentIds,
        resolvedParentIds,
      ),
    );
  }

  const childIdsByParentId = new Map<string, string[]>();
  for (const task of orderedTasksByExistingOrder) {
    const parentId = resolvedParentIds.get(task.id) ?? null;
    if (!parentId) {
      continue;
    }

    const children = childIdsByParentId.get(parentId) ?? [];
    children.push(task.id);
    childIdsByParentId.set(parentId, children);
  }

  const outlineLevelMemo = new Map<string, number>();
  const basePositionByTaskId = new Map<string, number>();
  for (const task of orderedTasksByExistingOrder) {
    const placeholderPackageId = extractUndefinedPackageKey(task.externalKey);
    if (placeholderPackageId && isUndefinedPlaceholderTask(task)) {
      const info = placeholderInfoByPackageId.get(placeholderPackageId);
      basePositionByTaskId.set(
        task.id,
        info ? info.earliestSortOrder - 0.5 : task.sortOrder,
      );
      continue;
    }

    basePositionByTaskId.set(task.id, task.sortOrder);
  }

  const effectivePositionMemo = new Map<string, number>();
  const tasksByNormalizedOrder = [...orderedTasksByExistingOrder].sort((left, right) => {
    const leftPosition = computeEffectivePosition(
      left.id,
      childIdsByParentId,
      basePositionByTaskId,
      effectivePositionMemo,
    );
    const rightPosition = computeEffectivePosition(
      right.id,
      childIdsByParentId,
      basePositionByTaskId,
      effectivePositionMemo,
    );

    return (
      leftPosition - rightPosition ||
      (basePositionByTaskId.get(left.id) ?? 0) - (basePositionByTaskId.get(right.id) ?? 0) ||
      left.id.localeCompare(right.id)
    );
  });

  const updates = tasksByNormalizedOrder.flatMap((task, index) => {
    const nextParentId = resolvedParentIds.get(task.id) ?? null;
    const nextOutlineLevel = computeOutlineLevel(task.id, resolvedParentIds, outlineLevelMemo);
    const hasChildren = (childIdsByParentId.get(task.id)?.length ?? 0) > 0;
    const placeholderPackageId = extractUndefinedPackageKey(task.externalKey);
    const placeholderInfo = placeholderPackageId
      ? (placeholderInfoByPackageId.get(placeholderPackageId) ?? null)
      : null;
    const isPlaceholder = Boolean(placeholderPackageId) && isUndefinedPlaceholderTask(task);
    const nextType =
      task.stratusSync || isPlaceholder || hasChildren
        ? "summary"
        : task.type === "milestone"
          ? "milestone"
          : "task";
    const nextName =
      isPlaceholder && placeholderInfo
        ? buildUndefinedPackageName(placeholderInfo.bestAvailableKey)
        : task.name;
    const nextNotes =
      isPlaceholder && placeholderInfo
        ? buildUndefinedPackageNote(placeholderInfo.bestAvailableKey)
        : task.notes;
    const nextStart =
      isPlaceholder && placeholderInfo ? placeholderInfo.start : task.start;
    const nextFinish =
      isPlaceholder && placeholderInfo ? placeholderInfo.finish : task.finish;
    const nextDurationMinutes =
      isPlaceholder && placeholderInfo
        ? Math.max(0, (placeholderInfo.finish.getTime() - placeholderInfo.start.getTime()) / 60_000)
        : task.durationMinutes;
    const nextExternalKey =
      isPlaceholder && placeholderPackageId
        ? buildUndefinedPackageExternalKey(placeholderPackageId)
        : task.externalKey;

    if (
      task.parentId === nextParentId &&
      task.outlineLevel === nextOutlineLevel &&
      task.type === nextType &&
      task.sortOrder === index &&
      task.name === nextName &&
      task.notes === nextNotes &&
      task.externalKey === nextExternalKey &&
      task.start.getTime() === nextStart.getTime() &&
      task.finish.getTime() === nextFinish.getTime() &&
      task.durationMinutes === nextDurationMinutes
    ) {
      return [];
    }

    return [
      db.task.update({
        where: { id: task.id },
        data: {
          parentId: nextParentId,
          outlineLevel: nextOutlineLevel,
          type: nextType,
          sortOrder: index,
          name: nextName,
          notes: nextNotes,
          externalKey: nextExternalKey,
          start: nextStart,
          finish: nextFinish,
          durationMinutes: nextDurationMinutes,
        },
      }),
    ];
  });

  if (updates.length === 0 && !placeholderCreated) {
    return { changed: false, revision: null };
  }

  await Promise.all(updates);

  return {
    changed: true,
    revision: incrementRevision
      ? (
          await db.project.update({
            where: { id: projectId },
            data: {
              revision: { increment: 1 },
            },
            select: { revision: true },
          })
        ).revision
      : null,
  };
}

export async function normalizeTaskHierarchy(
  projectId: string,
  options: NormalizeTaskHierarchyOptions = {},
): Promise<NormalizeTaskHierarchyResult> {
  const incrementRevision = options.incrementRevision ?? true;
  const result = await prisma.$transaction((tx) =>
    normalizeTaskHierarchyWithDb(tx, projectId, {
      incrementRevision,
    }),
  );

  if (result.changed && result.revision !== null) {
    notifyProjectRevision(projectId, result.revision);
  }

  return result;
}

export async function normalizeTaskHierarchyInTransaction(
  tx: Prisma.TransactionClient,
  projectId: string,
  options: NormalizeTaskHierarchyOptions = {},
): Promise<NormalizeTaskHierarchyResult> {
  return normalizeTaskHierarchyWithDb(tx, projectId, options);
}

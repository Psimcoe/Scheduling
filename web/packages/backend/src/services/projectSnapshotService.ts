import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import {
  toStratusStatusSummary,
  toStratusSyncSummary,
} from "./stratusSyncService.js";

export type ProjectSnapshotDetailLevel = "shell" | "full";

export interface ProjectSnapshotResponse {
  detailLevel: ProjectSnapshotDetailLevel;
  revision: number;
  project: Awaited<ReturnType<typeof loadProjectDetails>>;
  taskBounds: {
    start: string | null;
    finish: string | null;
  };
  tasks: SerializedTask[];
  dependencies: Awaited<ReturnType<typeof loadDependencies>>;
  resources: Awaited<ReturnType<typeof loadResources>>;
  assignments: Awaited<ReturnType<typeof loadAssignments>>;
}

const taskShellSelect = {
  id: true,
  projectId: true,
  wbsCode: true,
  outlineLevel: true,
  parentId: true,
  name: true,
  type: true,
  durationMinutes: true,
  start: true,
  finish: true,
  constraintType: true,
  constraintDate: true,
  calendarId: true,
  percentComplete: true,
  isManuallyScheduled: true,
  isCritical: true,
  totalSlackMinutes: true,
  freeSlackMinutes: true,
  earlyStart: true,
  earlyFinish: true,
  lateStart: true,
  lateFinish: true,
  deadline: true,
  externalKey: true,
  sortOrder: true,
  stratusSync: true,
  stratusAssemblySync: true,
} satisfies Prisma.TaskSelect;

const taskFullSelect = {
  ...taskShellSelect,
  notes: true,
  fixedCost: true,
  fixedCostAccrual: true,
  cost: true,
  actualCost: true,
  remainingCost: true,
  work: true,
  actualWork: true,
  remainingWork: true,
  actualStart: true,
  actualFinish: true,
  actualDurationMinutes: true,
  remainingDuration: true,
  bcws: true,
  bcwp: true,
  acwp: true,
} satisfies Prisma.TaskSelect;

async function loadProjectDetails(projectId: string) {
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      _count: {
        select: { tasks: true, calendars: true, resources: true },
      },
    },
  });
}

async function loadDependencies(projectId: string) {
  return prisma.dependency.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}

async function loadResources(projectId: string) {
  return prisma.resource.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
  });
}

async function loadAssignments(projectId: string) {
  return prisma.assignment.findMany({
    where: { task: { projectId } },
    include: {
      task: { select: { id: true, name: true } },
      resource: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function loadShellTasks(projectId: string) {
  return prisma.task.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: taskShellSelect,
  });
}

async function loadFullTasks(projectId: string) {
  return prisma.task.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: taskFullSelect,
  });
}

async function loadTaskBounds(projectId: string) {
  const bounds = await prisma.task.aggregate({
    where: { projectId },
    _min: { start: true },
    _max: { finish: true },
  });

  return {
    start: bounds._min.start?.toISOString() ?? null,
    finish: bounds._max.finish?.toISOString() ?? null,
  };
}

type LoadedShellTask = Awaited<ReturnType<typeof loadShellTasks>>[number];
type LoadedFullTask = Awaited<ReturnType<typeof loadFullTasks>>[number];
type LoadedTask = LoadedShellTask | LoadedFullTask;

export type SerializedTask = Omit<
  LoadedTask,
  "stratusSync" | "stratusAssemblySync"
> & {
  detailLevel: ProjectSnapshotDetailLevel;
  stratusSync: ReturnType<typeof toStratusSyncSummary>;
  stratusStatus: ReturnType<typeof toStratusStatusSummary>;
};

function serializeTasks(
  tasks: LoadedTask[],
  detailLevel: ProjectSnapshotDetailLevel,
): SerializedTask[] {
  const includePulledSignatures = detailLevel === "full";

  return tasks.map((task) => ({
    ...task,
    detailLevel,
    stratusSync: toStratusSyncSummary(
      task.stratusSync ?? null,
      includePulledSignatures,
    ),
    stratusStatus: toStratusStatusSummary(
      task.stratusSync ?? null,
      task.stratusAssemblySync,
    ),
  }));
}

export async function loadProjectSnapshot(
  projectId: string,
  detailLevel: ProjectSnapshotDetailLevel = "full",
): Promise<ProjectSnapshotResponse> {
  const tasksPromise =
    detailLevel === "shell" ? loadShellTasks(projectId) : loadFullTasks(projectId);

  const [project, taskBounds, tasks, dependencies, resources, assignments] =
    await Promise.all([
      loadProjectDetails(projectId),
      loadTaskBounds(projectId),
      tasksPromise,
      loadDependencies(projectId),
      loadResources(projectId),
      loadAssignments(projectId),
    ]);

  return {
    detailLevel,
    revision: project.revision,
    project,
    taskBounds,
    tasks: serializeTasks(tasks, detailLevel),
    dependencies,
    resources,
    assignments,
  };
}

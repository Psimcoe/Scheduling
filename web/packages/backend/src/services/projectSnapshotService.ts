import { prisma } from '../db.js';
import {
  toStratusStatusSummary,
  toStratusSyncSummary,
} from './stratusSyncService.js';

export interface ProjectSnapshotResponse {
  revision: number;
  project: Awaited<ReturnType<typeof loadProjectDetails>>;
  tasks: SerializedTask[];
  dependencies: Awaited<ReturnType<typeof loadDependencies>>;
  resources: Awaited<ReturnType<typeof loadResources>>;
  assignments: Awaited<ReturnType<typeof loadAssignments>>;
}

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
    orderBy: { createdAt: 'asc' },
  });
}

async function loadResources(projectId: string) {
  return prisma.resource.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
  });
}

async function loadAssignments(projectId: string) {
  return prisma.assignment.findMany({
    where: { task: { projectId } },
    include: {
      task: { select: { id: true, name: true } },
      resource: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function loadTasks(projectId: string) {
  return prisma.task.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    include: { stratusSync: true, stratusAssemblySync: true },
  });
}

type LoadedTask = Awaited<ReturnType<typeof loadTasks>>[number];
export type SerializedTask = Omit<
  LoadedTask,
  'stratusSync' | 'stratusAssemblySync'
> & {
  stratusSync: ReturnType<typeof toStratusSyncSummary>;
  stratusStatus: ReturnType<typeof toStratusStatusSummary>;
};

function serializeTasks(tasks: LoadedTask[]): SerializedTask[] {
  return tasks.map((task) => ({
    ...task,
    stratusSync: toStratusSyncSummary(task.stratusSync ?? null),
    stratusStatus: toStratusStatusSummary(
      task.stratusSync ?? null,
      task.stratusAssemblySync,
    ),
  }));
}

export async function loadProjectSnapshot(projectId: string): Promise<ProjectSnapshotResponse> {
  const [project, tasks, dependencies, resources, assignments] = await Promise.all([
    loadProjectDetails(projectId),
    loadTasks(projectId),
    loadDependencies(projectId),
    loadResources(projectId),
    loadAssignments(projectId),
  ]);

  return {
    revision: project.revision,
    project,
    tasks: serializeTasks(tasks),
    dependencies,
    resources,
    assignments,
  };
}

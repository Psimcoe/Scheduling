/**
 * Project store — UI-facing project state backed by React Query cache.
 *
 * Query cache is the source of truth for server data. This store keeps the
 * compatibility surface used throughout the app plus selection/loading state.
 */

import { create } from 'zustand';
import {
  assignmentsApi,
  dependenciesApi,
  projectsApi,
  resourcesApi,
  tasksApi,
  type AssignmentResponse,
  type DependencyBatchResponse,
  type DependencyMutationResponse,
  type DependencyResponse,
  type MutationRecalculationResponse,
  type ProjectDetailResponse,
  type ProjectSnapshotResponse,
  type ProjectSummaryResponse,
  type ResourceResponse,
  type TaskBatchUpdateResponse,
  type TaskDeleteResponse,
  type TaskMutationResponse,
  type TaskRecalculateResponse,
  type TaskResponse,
  type TaskUpdateResponse,
} from '../api/client';
import {
  getCachedProjectSnapshot,
  removeCachedProjectSnapshots,
  setCachedProjectSnapshot,
} from '../data/projectSnapshotCache';
import { projectQueryKeys } from '../data/projectQueries';
import { queryClient } from '../queryClient';

export type ProjectSummary = ProjectSummaryResponse;
export type TaskRow = TaskResponse;
export type DependencyRow = DependencyResponse;
export type ResourceRow = ResourceResponse;
export type AssignmentRow = AssignmentResponse;

type SnapshotMutationResult =
  | TaskUpdateResponse
  | TaskMutationResponse
  | TaskBatchUpdateResponse
  | TaskDeleteResponse
  | TaskRecalculateResponse
  | DependencyMutationResponse
  | DependencyBatchResponse;

interface QueueObserver {
  resolve: (value: SnapshotMutationResult) => void;
  reject: (error: unknown) => void;
}

interface QueueItem {
  actionKey: string;
  clientMutationId: string;
  baseRevision: number;
  entityKey: string;
  coalesceKey: string;
  applyPatch: (snapshot: ProjectSnapshotResponse) => ProjectSnapshotResponse;
  rollbackPatch: (snapshot: ProjectSnapshotResponse) => ProjectSnapshotResponse;
  execute: () => Promise<SnapshotMutationResult>;
  observers: QueueObserver[];
}

interface ProjectQueueState {
  authoritativeSnapshot: ProjectSnapshotResponse | null;
  inFlight: QueueItem | null;
  queued: QueueItem[];
  processing: boolean;
}

export interface ScheduleJobState {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  revision: number | null;
  calculationTimeMs: number | null;
}

interface ProjectState {
  projects: ProjectSummary[];
  loadingProjects: boolean;

  activeProjectId: string | null;
  activeProject: ProjectDetailResponse | null;
  taskBounds: ProjectSnapshotResponse['taskBounds'] | null;

  tasks: TaskRow[];
  dependencies: DependencyRow[];
  resources: ResourceRow[];
  assignments: AssignmentRow[];
  loading: boolean;
  error: string | null;

  selectedTaskIds: Set<string>;
  pendingActions: Record<string, number>;
  scheduleJobs: Record<string, ScheduleJobState | undefined>;

  syncProjects: (
    projects: ProjectSummary[],
    loadingProjects: boolean,
    error: string | null,
  ) => void;
  syncSnapshot: (snapshot: ProjectSnapshotResponse) => void;
  clearActiveProjectData: () => void;
  setProjectLoading: (loading: boolean) => void;
  setProjectError: (error: string | null) => void;
  startPendingAction: (actionKey: string) => void;
  finishPendingAction: (actionKey: string) => void;
  syncScheduleJob: (projectId: string, job: ScheduleJobState) => void;

  fetchProjects: () => Promise<void>;
  createProject: (name: string, startDate: string) => Promise<string>;
  setActiveProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  fetchTasks: () => Promise<void>;
  createTask: (data: Record<string, unknown>) => Promise<TaskRow>;
  updateTask: (taskId: string, data: Record<string, unknown>) => Promise<void>;
  batchUpdateTasks: (updates: { id: string; data: Record<string, unknown> }[]) => Promise<void>;
  deleteTasks: (taskIds: string[]) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  recalculate: () => Promise<void>;

  fetchDependencies: () => Promise<void>;
  createDependency: (data: Record<string, unknown>) => Promise<void>;
  createDependenciesBatch: (
    dependencies: { fromTaskId: string; toTaskId: string; type?: string; lagMinutes?: number }[],
  ) => Promise<void>;
  updateDependency: (depId: string, data: Record<string, unknown>) => Promise<void>;
  deleteDependency: (depId: string) => Promise<void>;
  deleteDependenciesBatch: (dependencyIds: string[]) => Promise<void>;

  fetchResources: () => Promise<void>;
  createResource: (data: Record<string, unknown>) => Promise<void>;
  updateResource: (resId: string, data: Record<string, unknown>) => Promise<void>;
  deleteResource: (resId: string) => Promise<void>;

  fetchAssignments: () => Promise<void>;
  createAssignment: (data: Record<string, unknown>) => Promise<void>;
  deleteAssignment: (assignId: string) => Promise<void>;

  selectTask: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
}

const projectQueues = new Map<string, ProjectQueueState>();
let authPauseState = false;

function getProjectSnapshot(projectId: string): ProjectSnapshotResponse | null {
  return getCachedProjectSnapshot(projectId, 'shell');
}

function setProjectSnapshot(projectId: string, snapshot: ProjectSnapshotResponse): void {
  setCachedProjectSnapshot(projectId, snapshot);
}

function syncActiveProjectFromSnapshot(snapshot: ProjectSnapshotResponse): void {
  if (useProjectStore.getState().activeProjectId !== snapshot.project.id) {
    return;
  }

  useProjectStore.setState({
    activeProject: snapshot.project,
    taskBounds: snapshot.taskBounds,
    tasks: snapshot.tasks,
    dependencies: snapshot.dependencies,
    resources: snapshot.resources,
    assignments: snapshot.assignments,
    loading: false,
    error: null,
  });
}

function getOrCreateQueue(projectId: string): ProjectQueueState {
  let queue = projectQueues.get(projectId);
  if (!queue) {
    queue = {
      authoritativeSnapshot: getProjectSnapshot(projectId),
      inFlight: null,
      queued: [],
      processing: false,
    };
    projectQueues.set(projectId, queue);
  }

  if (!queue.authoritativeSnapshot) {
    queue.authoritativeSnapshot = getProjectSnapshot(projectId);
  }

  return queue;
}

function buildOptimisticTask(
  snapshot: ProjectSnapshotResponse,
  data: Record<string, unknown>,
  tempId: string,
): TaskRow {
  const start =
    typeof data.start === 'string'
      ? data.start
      : snapshot.project.startDate;
  const durationMinutes =
    typeof data.durationMinutes === 'number' ? data.durationMinutes : 480;
  const finish =
    typeof data.finish === 'string'
      ? data.finish
      : new Date(new Date(start).getTime() + durationMinutes * 60_000).toISOString();
  const maxSortOrder = snapshot.tasks.reduce(
    (currentMax, task) => Math.max(currentMax, task.sortOrder ?? 0),
    -1,
  );

  return {
    id: tempId,
    detailLevel: snapshot.detailLevel,
    projectId: snapshot.project.id,
    wbsCode: '',
    outlineLevel: typeof data.outlineLevel === 'number' ? data.outlineLevel : 0,
    parentId: (data.parentId as string | null | undefined) ?? null,
    name: typeof data.name === 'string' ? data.name : 'New Task',
    type: typeof data.type === 'string' ? data.type : durationMinutes === 0 ? 'milestone' : 'task',
    durationMinutes,
    start,
    finish,
    constraintType: typeof data.constraintType === 'number' ? data.constraintType : 0,
    constraintDate: (data.constraintDate as string | null | undefined) ?? null,
    calendarId: (data.calendarId as string | null | undefined) ?? null,
    percentComplete:
      typeof data.percentComplete === 'number' ? data.percentComplete : 0,
    isManuallyScheduled: Boolean(data.isManuallyScheduled),
    isCritical: false,
    totalSlackMinutes: 0,
    freeSlackMinutes: 0,
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    deadline: (data.deadline as string | null | undefined) ?? null,
    notes: typeof data.notes === 'string' ? data.notes : null,
    externalKey: typeof data.externalKey === 'string' ? data.externalKey : null,
    isNameManagedByStratus: false,
    sortOrder:
      typeof data.sortOrder === 'number' ? data.sortOrder : maxSortOrder + 1,
    stratusSync: null,
    stratusStatus: null,
    fixedCost: null,
    fixedCostAccrual: null,
    cost: null,
    actualCost: null,
    remainingCost: null,
    work: null,
    actualWork: null,
    remainingWork: null,
    actualStart: null,
    actualFinish: null,
    actualDurationMinutes: null,
    remainingDuration: null,
    bcws: null,
    bcwp: null,
    acwp: null,
  };
}

function applyTaskPatch(
  snapshot: ProjectSnapshotResponse,
  taskId: string,
  data: Record<string, unknown>,
): ProjectSnapshotResponse {
  return {
    ...snapshot,
    tasks: snapshot.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            ...data,
            start: typeof data.start === 'string' ? data.start : task.start,
            finish: typeof data.finish === 'string' ? data.finish : task.finish,
          }
        : task,
    ),
  };
}

function removeTasksFromSnapshot(
  snapshot: ProjectSnapshotResponse,
  taskIds: string[],
): ProjectSnapshotResponse {
  const idSet = new Set(taskIds);
  return {
    ...snapshot,
    project: snapshot.project._count
      ? {
          ...snapshot.project,
          _count: {
            ...snapshot.project._count,
            tasks: Math.max(snapshot.project._count.tasks - taskIds.length, 0),
          },
        }
      : snapshot.project,
    tasks: snapshot.tasks.filter((task) => !idSet.has(task.id)),
    dependencies: snapshot.dependencies.filter(
      (dependency) =>
        !idSet.has(dependency.fromTaskId) && !idSet.has(dependency.toTaskId),
    ),
    assignments: snapshot.assignments.filter(
      (assignment) => !idSet.has(assignment.taskId),
    ),
  };
}

function addDependenciesToSnapshot(
  snapshot: ProjectSnapshotResponse,
  dependencies: { fromTaskId: string; toTaskId: string; type?: string; lagMinutes?: number }[],
): ProjectSnapshotResponse {
  const existingPairs = new Set(
    snapshot.dependencies.map((dependency) => `${dependency.fromTaskId}->${dependency.toTaskId}`),
  );
  const optimisticDependencies = dependencies
    .filter((dependency) => !existingPairs.has(`${dependency.fromTaskId}->${dependency.toTaskId}`))
    .map((dependency) => ({
      id: `temp-dependency:${crypto.randomUUID()}`,
      projectId: snapshot.project.id,
      fromTaskId: dependency.fromTaskId,
      toTaskId: dependency.toTaskId,
      type: dependency.type ?? 'FS',
      lagMinutes: dependency.lagMinutes ?? 0,
    }));

  return {
    ...snapshot,
    dependencies: [...snapshot.dependencies, ...optimisticDependencies],
  };
}

function removeDependenciesFromSnapshot(
  snapshot: ProjectSnapshotResponse,
  dependencyIds: string[],
): ProjectSnapshotResponse {
  const idSet = new Set(dependencyIds);
  return {
    ...snapshot,
    dependencies: snapshot.dependencies.filter((dependency) => !idSet.has(dependency.id)),
  };
}

function applySnapshotMutation(
  snapshot: ProjectSnapshotResponse,
  applyPatch: (value: ProjectSnapshotResponse) => ProjectSnapshotResponse,
): ProjectSnapshotResponse {
  return applyPatch(snapshot);
}

function hasSnapshotResult(
  result: SnapshotMutationResult,
): result is Exclude<SnapshotMutationResult, TaskUpdateResponse> {
  return 'snapshot' in result;
}

function isCompactTaskUpdateResult(
  result: SnapshotMutationResult,
): result is TaskUpdateResponse {
  return 'task' in result && !('snapshot' in result);
}

function syncRecalculationState(
  projectId: string,
  recalculation: MutationRecalculationResponse | undefined,
): void {
  if (!recalculation || recalculation.status === 'notNeeded') {
    return;
  }

  useProjectStore.setState((state) => {
    const existingJob = state.scheduleJobs[projectId];
    const status: ScheduleJobState['status'] =
      recalculation.status === 'completed'
        ? 'succeeded'
        : recalculation.status === 'queued'
          ? 'queued'
          : 'running';
    const scheduleJobs = {
      ...state.scheduleJobs,
      [projectId]: {
        id: recalculation.jobId ?? existingJob?.id ?? `schedule:${projectId}`,
        status,
        startedAt: existingJob?.startedAt ?? null,
        finishedAt: existingJob?.finishedAt ?? null,
        error: existingJob?.error ?? null,
        revision: existingJob?.revision ?? null,
        calculationTimeMs: existingJob?.calculationTimeMs ?? null,
      },
    };

    return { scheduleJobs };
  });
}

function mergeTaskForSnapshot(
  existingTask: TaskRow,
  updatedTask: TaskRow,
  detailLevel: ProjectSnapshotResponse['detailLevel'],
): TaskRow {
  const mergedTask: TaskRow = {
    ...existingTask,
    ...updatedTask,
    detailLevel,
  };

  if (detailLevel === 'full') {
    return mergedTask;
  }

  return {
    ...mergedTask,
    detailLevel,
    notes: existingTask.notes,
    fixedCost: existingTask.fixedCost,
    fixedCostAccrual: existingTask.fixedCostAccrual,
    cost: existingTask.cost,
    actualCost: existingTask.actualCost,
    remainingCost: existingTask.remainingCost,
    work: existingTask.work,
    actualWork: existingTask.actualWork,
    remainingWork: existingTask.remainingWork,
    actualStart: existingTask.actualStart,
    actualFinish: existingTask.actualFinish,
    actualDurationMinutes: existingTask.actualDurationMinutes,
    remainingDuration: existingTask.remainingDuration,
    bcws: existingTask.bcws,
    bcwp: existingTask.bcwp,
    acwp: existingTask.acwp,
  };
}

function computeTaskBounds(
  tasks: TaskRow[],
): ProjectSnapshotResponse['taskBounds'] {
  let start: string | null = null;
  let finish: string | null = null;

  for (const task of tasks) {
    if (!start || task.start < start) {
      start = task.start;
    }

    if (!finish || task.finish > finish) {
      finish = task.finish;
    }
  }

  return { start, finish };
}

function mergeCompactTaskUpdateIntoSnapshot(
  snapshot: ProjectSnapshotResponse,
  updatedTask: TaskRow,
  revision: number,
): ProjectSnapshotResponse {
  let taskFound = false;
  const tasks = snapshot.tasks.map((task) => {
    if (task.id !== updatedTask.id) {
      return task;
    }

    taskFound = true;
    return mergeTaskForSnapshot(task, updatedTask, snapshot.detailLevel);
  });

  return {
    ...snapshot,
    revision,
    project: {
      ...snapshot.project,
      revision,
    },
    taskBounds: computeTaskBounds(taskFound ? tasks : snapshot.tasks),
    tasks: taskFound ? tasks : snapshot.tasks,
  };
}

function recomputeOptimisticSnapshot(projectId: string): void {
  const queue = getOrCreateQueue(projectId);
  let snapshot = queue.authoritativeSnapshot ?? getProjectSnapshot(projectId);
  if (!snapshot) {
    return;
  }

  if (authPauseState) {
    setProjectSnapshot(projectId, snapshot);
    syncActiveProjectFromSnapshot(snapshot);
    return;
  }

  if (queue.inFlight && queue.inFlight.baseRevision >= snapshot.revision) {
    snapshot = applySnapshotMutation(snapshot, queue.inFlight.applyPatch);
  }

  for (const item of queue.queued) {
    snapshot = applySnapshotMutation(snapshot, item.applyPatch);
  }

  setProjectSnapshot(projectId, snapshot);
  syncActiveProjectFromSnapshot(snapshot);
}

function isAuthRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as { code?: unknown }).code === 'AUTH_REQUIRED';
}

async function fetchProjectsQuery(): Promise<ProjectSummary[]> {
  await queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
  return queryClient.fetchQuery({
    queryKey: projectQueryKeys.list(),
    queryFn: () => projectsApi.list(),
  });
}

async function fetchProjectSnapshot(projectId: string): Promise<ProjectSnapshotResponse> {
  await queryClient.invalidateQueries({
    queryKey: projectQueryKeys.snapshotBase(projectId),
  });
  return queryClient.fetchQuery({
    queryKey: projectQueryKeys.snapshot(projectId, 'shell'),
    queryFn: () => projectsApi.snapshot(projectId, 'shell'),
  });
}

function normalizeDependencyCoalesceKey(
  snapshot: ProjectSnapshotResponse,
  dependenciesToCreate: { fromTaskId: string; toTaskId: string }[],
  dependenciesToDelete: string[],
): string {
  const deletePairs = dependenciesToDelete
    .map((dependencyId) =>
      snapshot.dependencies.find((dependency) => dependency.id === dependencyId),
    )
    .filter((dependency): dependency is DependencyRow => Boolean(dependency))
    .map((dependency) => `${dependency.fromTaskId}->${dependency.toTaskId}`);
  const createPairs = dependenciesToCreate.map(
    (dependency) => `${dependency.fromTaskId}->${dependency.toTaskId}`,
  );
  return ['dependency-batch', ...createPairs, ...deletePairs].sort().join('|');
}

function createSnapshotQueueMutation<T extends SnapshotMutationResult>(
  projectId: string,
  item: Omit<QueueItem, 'execute' | 'observers'> & {
    execute: () => Promise<T>;
  },
): Promise<T> {
  const queue = getOrCreateQueue(projectId);
  const authoritativeSnapshot = queue.authoritativeSnapshot ?? getProjectSnapshot(projectId);

  if (!authoritativeSnapshot) {
    return Promise.reject(new Error('Project snapshot is not loaded.'));
  }

  queue.authoritativeSnapshot = authoritativeSnapshot;

  return new Promise<T>((resolve, reject) => {
    const observer: QueueObserver = {
      resolve: (value) => resolve(value as T),
      reject,
    };

    const queuedItem: QueueItem = {
      ...item,
      execute: item.execute as () => Promise<SnapshotMutationResult>,
      observers: [observer],
    };

    const existingIndex = queue.queued.findIndex(
      (candidate) => candidate.coalesceKey === queuedItem.coalesceKey,
    );

    if (existingIndex >= 0) {
      const existing = queue.queued[existingIndex];
      queue.queued[existingIndex] = {
        ...queuedItem,
        observers: [...existing.observers, observer],
      };
    } else {
      queue.queued.push(queuedItem);
      useProjectStore.getState().startPendingAction(queuedItem.actionKey);
    }

    recomputeOptimisticSnapshot(projectId);
    if (!authPauseState) {
      void processProjectQueue(projectId);
    }
  });
}

async function processProjectQueue(projectId: string): Promise<void> {
  const queue = getOrCreateQueue(projectId);
  if (queue.processing) {
    return;
  }

  queue.processing = true;

  try {
    while (queue.inFlight || queue.queued.length > 0) {
      if (!queue.inFlight) {
        queue.inFlight = queue.queued.shift() ?? null;
      }

      const current = queue.inFlight;
      if (!current) {
        break;
      }

      try {
        const result = await current.execute();
        syncRecalculationState(projectId, result.recalculation);
        if (hasSnapshotResult(result)) {
          if (
            result.snapshot.project.id === projectId &&
            (!queue.authoritativeSnapshot ||
              result.revision >= queue.authoritativeSnapshot.revision)
          ) {
            queue.authoritativeSnapshot = result.snapshot;
            setProjectSnapshot(projectId, result.snapshot);
          }
        } else if (
          isCompactTaskUpdateResult(result) &&
          queue.authoritativeSnapshot &&
          result.revision >= queue.authoritativeSnapshot.revision
        ) {
          const mergedSnapshot = mergeCompactTaskUpdateIntoSnapshot(
            queue.authoritativeSnapshot,
            result.task,
            result.revision,
          );
          queue.authoritativeSnapshot = mergedSnapshot;
          setProjectSnapshot(projectId, mergedSnapshot);
          queryClient.setQueryData(
            projectQueryKeys.taskDetail(projectId, result.task.id),
            result.task,
          );
          void queryClient.invalidateQueries({
            queryKey: projectQueryKeys.snapshotBase(projectId),
          });
        }

        for (const observer of current.observers) {
          observer.resolve(result);
        }
      } catch (error) {
        if (isAuthRequiredError(error)) {
          if (queue.authoritativeSnapshot) {
            setProjectSnapshot(projectId, queue.authoritativeSnapshot);
            syncActiveProjectFromSnapshot(queue.authoritativeSnapshot);
          }

          queue.queued.unshift(current);
          queue.inFlight = null;
          authPauseState = true;
          break;
        }

        if (queue.authoritativeSnapshot) {
          setProjectSnapshot(projectId, queue.authoritativeSnapshot);
          syncActiveProjectFromSnapshot(queue.authoritativeSnapshot);
        }

        for (const observer of current.observers) {
          observer.reject(error);
        }
      } finally {
        useProjectStore.getState().finishPendingAction(current.actionKey);
        queue.inFlight = null;
        recomputeOptimisticSnapshot(projectId);
      }
    }
  } finally {
    queue.processing = false;
  }
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loadingProjects: false,
  activeProjectId: null,
  activeProject: null,
  taskBounds: null,
  tasks: [],
  dependencies: [],
  resources: [],
  assignments: [],
  loading: false,
  error: null,
  selectedTaskIds: new Set(),
  pendingActions: {},
  scheduleJobs: {},

  syncProjects: (projects, loadingProjects, error) =>
    set({
      projects,
      loadingProjects,
      error,
    }),

  syncSnapshot: (snapshot) => {
    const queue = getOrCreateQueue(snapshot.project.id);
    const hasPendingMutations = Boolean(queue.inFlight) || queue.queued.length > 0;
    const authoritativeSnapshot = queue.authoritativeSnapshot;

    if (authoritativeSnapshot && snapshot.revision < authoritativeSnapshot.revision) {
      return;
    }

    if (!hasPendingMutations) {
      queue.authoritativeSnapshot = snapshot;
    } else if (
      authoritativeSnapshot &&
      (snapshot.revision > authoritativeSnapshot.revision ||
        (snapshot.revision === authoritativeSnapshot.revision &&
          snapshot.detailLevel === 'full' &&
          authoritativeSnapshot.detailLevel !== 'full'))
    ) {
      queue.authoritativeSnapshot = snapshot;
      recomputeOptimisticSnapshot(snapshot.project.id);
      return;
    }

    if (get().activeProjectId !== snapshot.project.id) {
      return;
    }

    set({
      activeProject: snapshot.project,
      taskBounds: snapshot.taskBounds,
      tasks: snapshot.tasks,
      dependencies: snapshot.dependencies,
      resources: snapshot.resources,
      assignments: snapshot.assignments,
      loading: false,
      error: null,
    });
  },

  clearActiveProjectData: () =>
    set({
      activeProject: null,
      taskBounds: null,
      tasks: [],
      dependencies: [],
      resources: [],
      assignments: [],
      loading: false,
      error: null,
      selectedTaskIds: new Set(),
    }),

  setProjectLoading: (loading) =>
    set((state) => (state.loading === loading ? state : { loading })),
  setProjectError: (error) =>
    set((state) =>
      state.error === error && state.loading === false
        ? state
        : { error, loading: false },
    ),

  startPendingAction: (actionKey) =>
    set((state) => ({
      pendingActions: {
        ...state.pendingActions,
        [actionKey]: (state.pendingActions[actionKey] ?? 0) + 1,
      },
    })),

  finishPendingAction: (actionKey) =>
    set((state) => {
      const nextCount = (state.pendingActions[actionKey] ?? 1) - 1;
      const pendingActions = { ...state.pendingActions };
      if (nextCount <= 0) {
        delete pendingActions[actionKey];
      } else {
        pendingActions[actionKey] = nextCount;
      }
      return { pendingActions };
    }),

  syncScheduleJob: (projectId, job) =>
    set((state) => ({
      scheduleJobs: {
        ...state.scheduleJobs,
        [projectId]: job,
      },
    })),

  fetchProjects: async () => {
    set({ loadingProjects: true });
    try {
      await fetchProjectsQuery();
    } catch (error: unknown) {
      set({
        loadingProjects: false,
        error: error instanceof Error ? error.message : 'Failed to load projects',
      });
    }
  },

  createProject: async (name, startDate) => {
    const project = await projectsApi.create({ name, startDate });
    await fetchProjectsQuery();
    return project.id;
  },

  setActiveProject: async (id) => {
    const cachedSnapshot = getProjectSnapshot(id);
    set({
      activeProjectId: id,
      activeProject: cachedSnapshot?.project ?? null,
      taskBounds: cachedSnapshot?.taskBounds ?? null,
      tasks: cachedSnapshot?.tasks ?? [],
      dependencies: cachedSnapshot?.dependencies ?? [],
      resources: cachedSnapshot?.resources ?? [],
      assignments: cachedSnapshot?.assignments ?? [],
      loading: true,
      error: null,
      selectedTaskIds: new Set(),
    });
    await fetchProjectSnapshot(id);
  },

  deleteProject: async (id) => {
    await projectsApi.delete(id);
    removeCachedProjectSnapshots(id);
    projectQueues.delete(id);

    if (get().activeProjectId === id) {
      set({
        activeProjectId: null,
        selectedTaskIds: new Set(),
      });
      get().clearActiveProjectData();
    }

    await fetchProjectsQuery();
  },

  fetchTasks: async () => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    await fetchProjectSnapshot(projectId);
  },

  createTask: async (data) => {
    const projectId = get().activeProjectId;
    if (!projectId) {
      throw new Error('No active project');
    }

    const snapshot = getProjectSnapshot(projectId);
    if (!snapshot) {
      throw new Error('Project snapshot is not loaded');
    }
    const tempId = `temp-task:${crypto.randomUUID()}`;

    const result = await createSnapshotQueueMutation<TaskMutationResponse>(projectId, {
      actionKey: 'task:create',
      clientMutationId: crypto.randomUUID(),
      baseRevision: snapshot.revision,
      entityKey: `task:${tempId}`,
      coalesceKey: `task:create:${tempId}`,
      applyPatch: (current) => ({
        ...current,
        project: current.project._count
          ? {
              ...current.project,
              _count: {
                ...current.project._count,
                tasks: current.project._count.tasks + 1,
              },
            }
          : current.project,
        tasks: [...current.tasks, buildOptimisticTask(current, data, tempId)].sort(
          (left, right) => left.sortOrder - right.sortOrder,
        ),
      }),
      rollbackPatch: (current) => ({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== tempId),
      }),
      execute: () => tasksApi.create(projectId, data),
    });

    return result.task;
  },

  updateTask: async (taskId, data) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    const snapshot = getProjectSnapshot(projectId);
    if (!snapshot) {
      throw new Error('Project snapshot is not loaded');
    }

    await createSnapshotQueueMutation<TaskUpdateResponse>(projectId, {
      actionKey: 'task:update',
      clientMutationId: crypto.randomUUID(),
      baseRevision: snapshot.revision,
      entityKey: `task:${taskId}`,
      coalesceKey: `task:update:${taskId}`,
      applyPatch: (current) => applyTaskPatch(current, taskId, data),
      rollbackPatch: (current) => current,
      execute: () => tasksApi.update(projectId, taskId, data),
    });
  },

  batchUpdateTasks: async (updates) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    const snapshot = getProjectSnapshot(projectId);
    if (!snapshot) {
      throw new Error('Project snapshot is not loaded');
    }

    await createSnapshotQueueMutation<TaskBatchUpdateResponse>(projectId, {
      actionKey: 'task:batch-update',
      clientMutationId: crypto.randomUUID(),
      baseRevision: snapshot.revision,
      entityKey: `tasks:${updates.map((update) => update.id).sort().join(',')}`,
      coalesceKey: `task:batch-update:${updates.map((update) => update.id).sort().join(',')}`,
      applyPatch: (current) =>
        updates.reduce(
          (nextSnapshot, update) => applyTaskPatch(nextSnapshot, update.id, update.data),
          current,
        ),
      rollbackPatch: (current) => current,
      execute: () => tasksApi.batchUpdate(projectId, updates),
    });
  },

  deleteTasks: async (taskIds) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    const snapshot = getProjectSnapshot(projectId);
    if (!snapshot) {
      throw new Error('Project snapshot is not loaded');
    }

    const uniqueTaskIds = [...new Set(taskIds)];
    if (uniqueTaskIds.length === 0) {
      return;
    }

    await createSnapshotQueueMutation<TaskDeleteResponse>(projectId, {
      actionKey: 'task:delete',
      clientMutationId: crypto.randomUUID(),
      baseRevision: snapshot.revision,
      entityKey: `tasks:${uniqueTaskIds.sort().join(',')}`,
      coalesceKey: `task:delete:${uniqueTaskIds.sort().join(',')}`,
      applyPatch: (current) => removeTasksFromSnapshot(current, uniqueTaskIds),
      rollbackPatch: (current) => current,
      execute: () => tasksApi.deleteBatch(projectId, uniqueTaskIds),
    });

    const nextSelection = new Set(get().selectedTaskIds);
    for (const taskId of uniqueTaskIds) {
      nextSelection.delete(taskId);
    }
    set({ selectedTaskIds: nextSelection });
  },

  deleteTask: async (taskId) => {
    await get().deleteTasks([taskId]);
  },

  recalculate: async () => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    const snapshot = getProjectSnapshot(projectId);
    if (!snapshot) {
      throw new Error('Project snapshot is not loaded');
    }

    await createSnapshotQueueMutation<TaskRecalculateResponse>(projectId, {
      actionKey: 'task:recalculate',
      clientMutationId: crypto.randomUUID(),
      baseRevision: snapshot.revision,
      entityKey: `project:${projectId}`,
      coalesceKey: `project:recalculate:${projectId}`,
      applyPatch: (current) => current,
      rollbackPatch: (current) => current,
      execute: () => tasksApi.recalculate(projectId),
    });
  },

  fetchDependencies: async () => {
    await get().fetchTasks();
  },

  createDependency: async (data) => {
    await get().createDependenciesBatch([
      {
        fromTaskId: String(data.fromTaskId),
        toTaskId: String(data.toTaskId),
        type: typeof data.type === 'string' ? data.type : 'FS',
        lagMinutes:
          typeof data.lagMinutes === 'number' ? data.lagMinutes : 0,
      },
    ]);
  },

  createDependenciesBatch: async (dependenciesToCreate) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    const snapshot = getProjectSnapshot(projectId);
    if (!snapshot) {
      throw new Error('Project snapshot is not loaded');
    }
    if (dependenciesToCreate.length === 0) return;

    await createSnapshotQueueMutation<DependencyBatchResponse>(projectId, {
      actionKey: 'dependency:create',
      clientMutationId: crypto.randomUUID(),
      baseRevision: snapshot.revision,
      entityKey: dependenciesToCreate
        .map((dependency) => `${dependency.fromTaskId}->${dependency.toTaskId}`)
        .sort()
        .join(','),
      coalesceKey: normalizeDependencyCoalesceKey(
        snapshot,
        dependenciesToCreate,
        [],
      ),
      applyPatch: (current) => addDependenciesToSnapshot(current, dependenciesToCreate),
      rollbackPatch: (current) => current,
      execute: () =>
        dependenciesApi.batch(projectId, {
          create: dependenciesToCreate,
        }),
    });
  },

  updateDependency: async (depId, data) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    const response = await dependenciesApi.update(projectId, depId, data);
    syncRecalculationState(projectId, response.recalculation);
    setProjectSnapshot(projectId, response.snapshot);
    get().syncSnapshot(response.snapshot);
  },

  deleteDependency: async (depId) => {
    await get().deleteDependenciesBatch([depId]);
  },

  deleteDependenciesBatch: async (dependencyIds) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    const snapshot = getProjectSnapshot(projectId);
    if (!snapshot) {
      throw new Error('Project snapshot is not loaded');
    }
    const uniqueDependencyIds = [...new Set(dependencyIds)];
    if (uniqueDependencyIds.length === 0) return;

    await createSnapshotQueueMutation<DependencyBatchResponse>(projectId, {
      actionKey: 'dependency:delete',
      clientMutationId: crypto.randomUUID(),
      baseRevision: snapshot.revision,
      entityKey: uniqueDependencyIds.sort().join(','),
      coalesceKey: normalizeDependencyCoalesceKey(
        snapshot,
        [],
        uniqueDependencyIds,
      ),
      applyPatch: (current) => removeDependenciesFromSnapshot(current, uniqueDependencyIds),
      rollbackPatch: (current) => current,
      execute: () =>
        dependenciesApi.batch(projectId, {
          deleteDependencyIds: uniqueDependencyIds,
        }),
    });
  },

  fetchResources: async () => {
    await get().fetchTasks();
  },

  createResource: async (data) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    await resourcesApi.create(projectId, data);
    await fetchProjectSnapshot(projectId);
  },

  updateResource: async (resId, data) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    await resourcesApi.update(projectId, resId, data);
    await fetchProjectSnapshot(projectId);
  },

  deleteResource: async (resId) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    await resourcesApi.delete(projectId, resId);
    await fetchProjectSnapshot(projectId);
  },

  fetchAssignments: async () => {
    await get().fetchTasks();
  },

  createAssignment: async (data) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    await assignmentsApi.create(projectId, data);
    await fetchProjectSnapshot(projectId);
  },

  deleteAssignment: async (assignId) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    await assignmentsApi.delete(projectId, assignId);
    await fetchProjectSnapshot(projectId);
  },

  selectTask: (id, multi = false) => {
    const selected = multi ? new Set(get().selectedTaskIds) : new Set<string>();
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    set({ selectedTaskIds: selected });
  },

  clearSelection: () => set({ selectedTaskIds: new Set() }),
}));

export function pauseProjectQueuesForAuth(): void {
  authPauseState = true;

  for (const [projectId, queue] of projectQueues.entries()) {
    if (!queue.authoritativeSnapshot) {
      continue;
    }

    setProjectSnapshot(projectId, queue.authoritativeSnapshot);
    syncActiveProjectFromSnapshot(queue.authoritativeSnapshot);
  }
}

export async function resumeProjectQueuesAfterAuth(): Promise<void> {
  authPauseState = false;
  await Promise.all([...projectQueues.keys()].map((projectId) => processProjectQueue(projectId)));
}

export function resetProjectQueuesForTesting(): void {
  authPauseState = false;
  projectQueues.clear();
}

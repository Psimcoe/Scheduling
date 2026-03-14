import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useProjectStore,
  useUIStore,
  type DependencyRow,
  type TaskRow,
} from '../stores';
import {
  buildDependencyShells,
  buildTaskShells,
  buildVisibleTaskRows,
  getProjectedTaskFields,
  materializeVisibleTaskRows,
  type RowModelDependencyShell,
  type RowModelTaskShell,
  type VisibleTaskListRow,
  type VisibleTaskRowsModel,
  type VisibleTaskRowsResult,
} from './visibleTaskRowsModel';

const LARGE_PROJECT_TASK_THRESHOLD = 3_000;
const EMPTY_RESOURCE_NAME_BY_ID = new Map<string, string>();
const EMPTY_RESOURCE_NAMES_BY_TASK_ID = new Map<string, string>();

interface VisibleTaskRowsWorkerResponse {
  projectId: string | null;
  revision: number;
  requestId: number;
  model: VisibleTaskRowsModel;
}

const EMPTY_VISIBLE_TASK_ROWS: VisibleTaskRowsResult = {
  rows: [{ kind: 'newTask', key: 'new-task' }],
  visibleTasks: [],
  visibleDependencies: [],
};

function shouldUseWorker(tasks: TaskRow[]): boolean {
  return tasks.length >= LARGE_PROJECT_TASK_THRESHOLD;
}

function getProjectId(rows: TaskRow[] | DependencyRow[]): string | null {
  return rows[0]?.projectId ?? null;
}

function describeWorkerError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (error && typeof error === 'object') {
    const candidate = error as { name?: unknown; message?: unknown };
    return {
      name: typeof candidate.name === 'string' ? candidate.name : 'UnknownError',
      message:
        typeof candidate.message === 'string'
          ? candidate.message
          : 'Unknown worker failure.',
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

function buildWorkerRuntimeError(event: ErrorEvent): Error {
  const error =
    event.error instanceof Error
      ? event.error
      : new Error(event.message || 'Visible task row worker failed.');
  error.name = error.name || 'WorkerRuntimeError';
  return error;
}

export {
  buildVisibleTaskRows,
  type VisibleTaskListRow,
  type VisibleTaskRowsResult,
};

export function useVisibleTaskRows(): VisibleTaskRowsResult {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const tasks = useProjectStore((state) => state.tasks);
  const dependencies = useProjectStore((state) => state.dependencies);
  const assignments = useProjectStore((state) => state.assignments);
  const resources = useProjectStore((state) => state.resources);
  const activeProject = useProjectStore((state) => state.activeProject);
  const selectedTaskIds = useProjectStore((state) => state.selectedTaskIds);
  const collapsedIds = useUIStore((state) => state.collapsedIds);
  const filters = useUIStore((state) => state.filters);
  const sortCriteria = useUIStore((state) => state.sortCriteria);
  const groupBy = useUIStore((state) => state.groupBy);
  const deferredTasks = useDeferredValue(tasks);
  const deferredDependencies = useDeferredValue(dependencies);
  const currentTaskProjectId = getProjectId(tasks);
  const deferredTaskProjectId = getProjectId(deferredTasks);
  const currentDependencyProjectId = getProjectId(dependencies);
  const deferredDependencyProjectId = getProjectId(deferredDependencies);
  const taskSource =
    activeProjectId && currentTaskProjectId === activeProjectId && deferredTaskProjectId !== activeProjectId
      ? tasks
      : activeProjectId && currentTaskProjectId !== activeProjectId
        ? []
        : deferredTasks;
  const dependencySource =
    activeProjectId &&
    currentDependencyProjectId === activeProjectId &&
    deferredDependencyProjectId !== activeProjectId
      ? dependencies
      : activeProjectId && currentDependencyProjectId !== activeProjectId
        ? []
        : deferredDependencies;
  const useWorker = shouldUseWorker(taskSource);
  const currentProjectId = activeProjectId ?? getProjectId(taskSource);
  const currentRevision = activeProject?.revision ?? 0;
  const [workerBootstrapUnavailable, setWorkerBootstrapUnavailable] = useState(false);
  const [workerCompatibilityProjectIds, setWorkerCompatibilityProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [workerSessionId, setWorkerSessionId] = useState(0);
  const workerEnabled =
    useWorker &&
    !workerBootstrapUnavailable &&
    !(currentProjectId !== null && workerCompatibilityProjectIds.has(currentProjectId));
  const projectedTaskFields = useMemo(
    () => getProjectedTaskFields(filters, sortCriteria, groupBy),
    [filters, groupBy, sortCriteria],
  );
  const requiresResourceNames = projectedTaskFields.includes('resourceNames');
  const resourceNameById = useMemo(() => {
    if (!requiresResourceNames) {
      return EMPTY_RESOURCE_NAME_BY_ID;
    }

    return new Map(resources.map((resource) => [resource.id, resource.name]));
  }, [requiresResourceNames, resources]);
  const resourceNamesByTaskId = useMemo(() => {
    if (!requiresResourceNames) {
      return EMPTY_RESOURCE_NAMES_BY_TASK_ID;
    }

    const namesByTaskId = new Map<string, string[]>();
    for (const assignment of assignments) {
      const resourceName = resourceNameById.get(assignment.resourceId);
      if (!resourceName) {
        continue;
      }

      const names = namesByTaskId.get(assignment.taskId) ?? [];
      names.push(resourceName);
      namesByTaskId.set(assignment.taskId, names);
    }

    return new Map(
      [...namesByTaskId.entries()].map(([taskId, names]) => [taskId, names.join(', ')]),
    );
  }, [assignments, requiresResourceNames, resourceNameById]);
  const taskShells = useMemo<RowModelTaskShell[]>(
    () =>
      buildTaskShells(taskSource, {
        requiredFields: projectedTaskFields,
        resourceNamesByTaskId,
      }),
    [projectedTaskFields, resourceNamesByTaskId, taskSource],
  );
  const dependencyShells = useMemo<RowModelDependencyShell[]>(
    () => buildDependencyShells(dependencySource),
    [dependencySource],
  );

  const syncResult = useMemo(
    () =>
      workerEnabled
        ? null
        : buildVisibleTaskRows({
            tasks: taskSource,
            dependencies: dependencySource,
            taskShells,
            dependencyShells,
            selectedTaskIds,
            collapsedIds,
            filters,
            sortCriteria,
            groupBy,
          }),
    [
      collapsedIds,
      dependencySource,
      dependencyShells,
      filters,
      groupBy,
      selectedTaskIds,
      sortCriteria,
      taskShells,
      taskSource,
      workerEnabled,
    ],
  );

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const activeWorkerProjectIdRef = useRef<string | null>(null);
  const loggedWorkerBootstrapFailureRef = useRef(false);
  const loggedCompatibilityProjectIdsRef = useRef(new Set<string>());
  const [workerState, setWorkerState] = useState<{
    projectId: string | null;
    revision: number;
    requestId: number;
    model: VisibleTaskRowsModel;
  } | null>(null);

  const markWorkerBootstrapUnavailable = useCallback((error: unknown) => {
    if (!loggedWorkerBootstrapFailureRef.current) {
      loggedWorkerBootstrapFailureRef.current = true;
      console.warn('ScheduleSync: visible task row worker is unavailable; using sync rendering.', {
        error: describeWorkerError(error),
      });
    }

    activeWorkerProjectIdRef.current = null;
    setWorkerBootstrapUnavailable(true);
  }, []);

  const enableProjectCompatibilityMode = useCallback(
    (projectId: string | null, error: unknown) => {
      if (!projectId) {
        markWorkerBootstrapUnavailable(error);
        return;
      }

      activeWorkerProjectIdRef.current = null;
      setWorkerState((current) =>
        current?.projectId === projectId ? null : current,
      );
      setWorkerCompatibilityProjectIds((current) => {
        if (current.has(projectId)) {
          return current;
        }

        const next = new Set(current);
        next.add(projectId);

        if (!loggedCompatibilityProjectIdsRef.current.has(projectId)) {
          loggedCompatibilityProjectIdsRef.current.add(projectId);
          console.warn(
            'ScheduleSync: visible task row worker failed for a large project; using compatibility mode.',
            {
              projectId,
              error: describeWorkerError(error),
            },
          );
        }

        return next;
      });
    },
    [markWorkerBootstrapUnavailable],
  );

  useEffect(() => {
    if (workerBootstrapUnavailable) {
      return;
    }

    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      markWorkerBootstrapUnavailable(
        new Error('Worker is not available in this environment.'),
      );
      return;
    }

    let worker: Worker;

    try {
      worker = new Worker(
        new URL('../workers/visibleTaskRowsWorker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch (error: unknown) {
      markWorkerBootstrapUnavailable(error);
      return;
    }

    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<VisibleTaskRowsWorkerResponse>) => {
      const { projectId, revision, requestId, model } = event.data;
      startTransition(() => {
        setWorkerState((current) => {
          if (requestId < requestIdRef.current) {
            return current;
          }

          return {
            projectId,
            revision,
            requestId,
            model,
          };
        });
      });
    };

    worker.onerror = (event) => {
      event.preventDefault?.();
      enableProjectCompatibilityMode(
        activeWorkerProjectIdRef.current,
        buildWorkerRuntimeError(event),
      );
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
      setWorkerSessionId((current) => current + 1);
    };

    return () => {
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
      worker.terminate();
    };
  }, [
    enableProjectCompatibilityMode,
    markWorkerBootstrapUnavailable,
    workerBootstrapUnavailable,
    workerSessionId,
  ]);

  useEffect(() => {
    if (!workerEnabled || !workerRef.current) {
      return;
    }

    requestIdRef.current += 1;
    activeWorkerProjectIdRef.current = currentProjectId;

    try {
      workerRef.current.postMessage({
        projectId: currentProjectId,
        revision: currentRevision,
        requestId: requestIdRef.current,
        tasks: taskShells,
        dependencies: dependencyShells,
        selectedTaskIds: [...selectedTaskIds],
        collapsedIds: [...collapsedIds],
        filters,
        sortCriteria,
        groupBy,
      });
    } catch (error: unknown) {
      enableProjectCompatibilityMode(currentProjectId, error);
    }
  }, [
    collapsedIds,
    currentProjectId,
    currentRevision,
    dependencyShells,
    enableProjectCompatibilityMode,
    filters,
    groupBy,
    selectedTaskIds,
    sortCriteria,
    taskShells,
    workerEnabled,
  ]);

  useEffect(() => {
    setWorkerState((current) =>
      current &&
      (current.projectId !== currentProjectId || current.revision !== currentRevision)
        ? null
        : current,
    );
  }, [currentProjectId, currentRevision]);

  const workerResult = useMemo(() => {
    if (
      !workerEnabled ||
      !workerState ||
      workerState.projectId !== currentProjectId ||
      workerState.revision !== currentRevision
    ) {
      return null;
    }

    return materializeVisibleTaskRows(
      workerState.model,
      taskSource,
      dependencySource,
    );
  }, [
    currentProjectId,
    currentRevision,
    dependencySource,
    taskSource,
    workerEnabled,
    workerState,
  ]);

  return syncResult ?? workerResult ?? EMPTY_VISIBLE_TASK_ROWS;
}

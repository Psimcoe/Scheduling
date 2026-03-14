import {
  startTransition,
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
  type FilterCriteria,
  type GroupByOption,
  type SortCriteria,
  type TaskRow,
} from '../stores';
import {
  buildDependencyShells,
  buildTaskShells,
  buildVisibleTaskRows,
  materializeVisibleTaskRows,
  type RowModelDependencyShell,
  type RowModelTaskShell,
  type VisibleTaskListRow,
  type VisibleTaskRowsModel,
  type VisibleTaskRowsResult,
} from './visibleTaskRowsModel';

const LARGE_PROJECT_TASK_THRESHOLD = 3_000;

interface WorkerMessage {
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
  const [workerUnavailable, setWorkerUnavailable] = useState(false);
  const workerEnabled = useWorker && !workerUnavailable;
  const resourceNameById = useMemo(
    () => new Map(resources.map((resource) => [resource.id, resource.name])),
    [resources],
  );
  const resourceNamesByTaskId = useMemo(() => {
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
  }, [assignments, resourceNameById]);
  const taskShells = useMemo<RowModelTaskShell[]>(
    () => buildTaskShells(taskSource, resourceNamesByTaskId),
    [resourceNamesByTaskId, taskSource],
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
  const [workerState, setWorkerState] = useState<{
    projectId: string | null;
    revision: number;
    requestId: number;
    model: VisibleTaskRowsModel;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      setWorkerUnavailable(true);
      return;
    }

    const worker = new Worker(
      new URL('../workers/visibleTaskRowsWorker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
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

    worker.onerror = () => {
      setWorkerUnavailable(true);
      worker.terminate();
      workerRef.current = null;
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!workerEnabled || !workerRef.current) {
      return;
    }

    requestIdRef.current += 1;
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
  }, [
      collapsedIds,
      currentRevision,
      currentProjectId,
      dependencyShells,
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

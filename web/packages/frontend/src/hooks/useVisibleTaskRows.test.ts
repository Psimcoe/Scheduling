import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDetailResponse } from '../api/client';
import {
  DEFAULT_BAR_STYLES,
  DEFAULT_COLUMNS,
  useProjectStore,
  useUIStore,
  type DependencyRow,
  type FilterCriteria,
  type GroupByOption,
  type SortCriteria,
  type TaskRow,
} from '../stores';
import { buildVisibleTaskRows, useVisibleTaskRows } from './useVisibleTaskRows';
import {
  buildDependencyShells,
  buildTaskShells,
  buildVisibleTaskRowsModel,
  getProjectedTaskFields,
  materializeVisibleTaskRows,
  type RowModelDependencyShell,
  type RowModelTaskShell,
  type VisibleTaskRowsModel,
  type VisibleTaskRowsResult,
} from './visibleTaskRowsModel';

const LARGE_PROJECT_TASK_COUNT = 3_000;
const FIXED_START = '2026-03-01T00:00:00.000Z';
const FIXED_FINISH = '2026-03-02T00:00:00.000Z';

interface WorkerRequest {
  projectId: string | null;
  revision: number;
  requestId: number;
  tasks: RowModelTaskShell[];
  dependencies: RowModelDependencyShell[];
  selectedTaskIds: string[];
  collapsedIds: string[];
  filters: FilterCriteria[];
  sortCriteria: SortCriteria[];
  groupBy: GroupByOption | null;
}

interface WorkerResponse {
  projectId: string | null;
  revision: number;
  requestId: number;
  model: VisibleTaskRowsModel;
}

class MockWorker {
  static instances: MockWorker[] = [];
  static postMessageCalls: WorkerRequest[] = [];
  static handler: ((worker: MockWorker, message: WorkerRequest) => void) | null = null;

  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  constructor(_url?: unknown, _options?: unknown) {
    MockWorker.instances.push(this);
  }

  static reset() {
    MockWorker.instances = [];
    MockWorker.postMessageCalls = [];
    MockWorker.handler = null;
  }

  postMessage(message: WorkerRequest) {
    MockWorker.postMessageCalls.push(message);

    if (MockWorker.handler) {
      MockWorker.handler(this, message);
      return;
    }

    this.emitSuccess(message);
  }

  terminate() {
    this.terminated = true;
  }

  emitSuccess(message: WorkerRequest) {
    const model = buildVisibleTaskRowsModel({
      tasks: message.tasks,
      dependencies: message.dependencies,
      selectedTaskIds: new Set(message.selectedTaskIds),
      collapsedIds: new Set(message.collapsedIds),
      filters: message.filters,
      sortCriteria: message.sortCriteria,
      groupBy: message.groupBy,
    });

    Promise.resolve().then(() => {
      this.onmessage?.({
        data: {
          projectId: message.projectId,
          revision: message.revision,
          requestId: message.requestId,
          model,
        },
      } as MessageEvent<WorkerResponse>);
    });
  }
}

function makeTask(overrides: Partial<TaskRow>): TaskRow {
  return {
    id: 'task',
    detailLevel: 'full',
    projectId: 'project-1',
    wbsCode: '',
    outlineLevel: 0,
    parentId: null,
    name: 'Task',
    type: 'task',
    durationMinutes: 480,
    start: FIXED_START,
    finish: FIXED_FINISH,
    constraintType: 0,
    constraintDate: null,
    calendarId: null,
    percentComplete: 0,
    isManuallyScheduled: false,
    isCritical: false,
    totalSlackMinutes: 0,
    freeSlackMinutes: 0,
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    deadline: null,
    notes: null,
    externalKey: null,
    isNameManagedByStratus: false,
    sortOrder: 0,
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
    ...overrides,
  };
}

function makeDependency(overrides: Partial<DependencyRow>): DependencyRow {
  return {
    id: 'dependency',
    projectId: 'project-1',
    fromTaskId: 'task-a',
    toTaskId: 'task-b',
    type: 'FS',
    lagMinutes: 0,
    ...overrides,
  };
}

function makeProjectDetail(
  projectId: string,
  revision: number,
  taskCount: number,
): ProjectDetailResponse {
  return {
    id: projectId,
    name: projectId,
    revision,
    startDate: FIXED_START,
    finishDate: null,
    projectType: null,
    sector: null,
    region: null,
    stratusProjectId: null,
    stratusModelId: null,
    stratusPackageWhere: null,
    stratusLastPullAt: null,
    stratusLastPushAt: null,
    createdAt: FIXED_START,
    updatedAt: FIXED_START,
    defaultCalendarId: '__default__',
    scheduleFrom: 'start',
    statusDate: null,
    stratusLocalMetadataVersion: 1,
    _count: {
      tasks: taskCount,
      calendars: 1,
      resources: 0,
    },
  };
}

function makeLargeTasks(count: number, projectId: string): TaskRow[] {
  return Array.from({ length: count }, (_, index) =>
    makeTask({
      id: `${projectId}-task-${index}`,
      projectId,
      name: `Task ${index}`,
      type: index % 2 === 0 ? 'task' : 'summary',
      durationMinutes: ((index % 5) + 1) * 60,
      percentComplete: index % 100,
      totalSlackMinutes: (index % 4) * 15,
      sortOrder: index,
      wbsCode: `${index + 1}`,
    }),
  );
}

function summarizeVisibleTaskRows(result: VisibleTaskRowsResult) {
  return {
    visibleTaskIds: result.visibleTasks.map((task) => task.id),
    visibleDependencyIds: result.visibleDependencies.map((dependency) => dependency.id),
    rowKeys: result.rows.map((row) => {
      if (row.kind === 'task') {
        return `task:${row.task.id}:${row.index}:${row.isSelected}:${row.isExpanded}:${row.hasChildren}`;
      }

      if (row.kind === 'group') {
        return `group:${row.label}:${row.count}`;
      }

      return 'new-task';
    }),
  };
}

function createDataCloneError(): Error {
  const error = new Error(
    "Failed to execute 'postMessage' on 'Worker': Data cannot be cloned, out of memory.",
  );
  error.name = 'DataCloneError';
  return error;
}

function resetStores() {
  act(() => {
    useProjectStore.setState({
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
      selectedTaskIds: new Set<string>(),
      pendingActions: {},
      scheduleJobs: {},
    });
    useUIStore.setState({
      activeView: 'gantt',
      activeRibbonTab: 'task',
      sidebarOpen: true,
      ganttZoom: 'week',
      ganttScrollDate: null,
      showBaseline: null,
      gridSplitPercent: 50,
      showCriticalPath: false,
      collapsedIds: new Set<string>(),
      openDialog: 'none',
      dialogPayload: null,
      filters: [],
      sortCriteria: [],
      groupBy: null,
      snackbar: null,
      columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
      barStyles: DEFAULT_BAR_STYLES.map((style) => ({ ...style })),
    });
  });
}

function seedVisibleTaskRowsState(args: {
  projectId: string;
  revision?: number;
  tasks: TaskRow[];
  dependencies?: DependencyRow[];
  filters?: FilterCriteria[];
  sortCriteria?: SortCriteria[];
  groupBy?: GroupByOption | null;
  collapsedIds?: Set<string>;
  selectedTaskIds?: Set<string>;
}) {
  const {
    projectId,
    revision = 1,
    tasks,
    dependencies = [],
    filters = [],
    sortCriteria = [],
    groupBy = null,
    collapsedIds = new Set<string>(),
    selectedTaskIds = new Set<string>(),
  } = args;

  act(() => {
    useProjectStore.setState({
      activeProjectId: projectId,
      activeProject: makeProjectDetail(projectId, revision, tasks.length),
      taskBounds: null,
      tasks,
      dependencies,
      resources: [],
      assignments: [],
      loading: false,
      error: null,
      selectedTaskIds: new Set(selectedTaskIds),
    });
    useUIStore.setState({
      collapsedIds: new Set(collapsedIds),
      filters,
      sortCriteria,
      groupBy,
    });
  });
}

describe('buildVisibleTaskRows', () => {
  it('derives projected fields from filters, sorting, and grouping', () => {
    const projectedFields = getProjectedTaskFields(
      [
        { field: 'percentComplete', operator: 'gt', value: 50 },
        { field: 'resourceNames', operator: 'contains', value: 'crew' },
      ],
      [
        { field: 'duration', direction: 'desc' },
        { field: 'start', direction: 'asc' },
      ],
      { field: 'type', direction: 'asc' },
    );

    expect(projectedFields).toEqual([
      'percentComplete',
      'resourceNames',
      'durationMinutes',
      'startMs',
      'type',
    ]);
  });

  it('builds only the projected task fields needed for the worker', () => {
    const task = makeTask({
      id: 'task-1',
      name: 'Projected Task',
      percentComplete: 75,
      durationMinutes: 180,
    });

    const taskShells = buildTaskShells([task], {
      requiredFields: getProjectedTaskFields(
        [{ field: 'percentComplete', operator: 'gt', value: 50 }],
        [{ field: 'duration', direction: 'desc' }],
        null,
      ),
    });

    expect(taskShells).toEqual([
      {
        id: 'task-1',
        parentId: null,
        fields: {
          percentComplete: 75,
          durationMinutes: 180,
        },
      },
    ]);
  });

  it('does not include unnecessary projected fields when no filter, sort, or group is active', () => {
    const taskShells = buildTaskShells([makeTask({ id: 'task-1' })], {
      requiredFields: getProjectedTaskFields([], [], null),
    });

    expect(taskShells[0]).toEqual({
      id: 'task-1',
      parentId: null,
      fields: {},
    });
  });

  it('hides descendants of collapsed tasks and removes dependencies to hidden rows', () => {
    const parent = makeTask({ id: 'parent', name: 'Parent', type: 'summary' });
    const child = makeTask({ id: 'child', name: 'Child', parentId: 'parent', outlineLevel: 1 });
    const standalone = makeTask({ id: 'solo', name: 'Standalone', sortOrder: 2 });
    const dependency = makeDependency({ fromTaskId: 'child', toTaskId: 'solo' });

    const result = buildVisibleTaskRows({
      tasks: [parent, child, standalone],
      dependencies: [dependency],
      selectedTaskIds: new Set(['solo']),
      collapsedIds: new Set(['parent']),
      filters: [],
      sortCriteria: [],
      groupBy: null,
    });

    expect(result.visibleTasks.map((task) => task.id)).toEqual(['parent', 'solo']);
    expect(result.visibleDependencies).toEqual([]);
    expect(result.rows.filter((row) => row.kind === 'task')).toHaveLength(2);
  });

  it('applies filters and numeric sorting before building rows', () => {
    const alpha = makeTask({ id: 'alpha', name: 'Alpha', percentComplete: 25, sortOrder: 2 });
    const beta = makeTask({ id: 'beta', name: 'Beta', percentComplete: 75, sortOrder: 1 });
    const gamma = makeTask({ id: 'gamma', name: 'Gamma', percentComplete: 50, sortOrder: 3 });

    const result = buildVisibleTaskRows({
      tasks: [alpha, beta, gamma],
      dependencies: [],
      selectedTaskIds: new Set(['beta']),
      collapsedIds: new Set(),
      filters: [{ field: 'percentComplete', operator: 'gt', value: 30 }],
      sortCriteria: [{ field: 'percentComplete', direction: 'desc' }],
      groupBy: null,
    });

    expect(result.visibleTasks.map((task) => task.id)).toEqual(['beta', 'gamma']);
    expect(result.rows[0]).toMatchObject({
      kind: 'task',
      task: { id: 'beta' },
      isSelected: true,
    });
  });

  it('creates grouped rows and keeps the new-task sentinel at the end', () => {
    const design = makeTask({ id: 'design', name: 'Design', type: 'summary' });
    const build = makeTask({ id: 'build', name: 'Build', type: 'task' });

    const result = buildVisibleTaskRows({
      tasks: [design, build],
      dependencies: [],
      selectedTaskIds: new Set(),
      collapsedIds: new Set(),
      filters: [],
      sortCriteria: [],
      groupBy: { field: 'type', direction: 'asc' },
    });

    expect(result.rows[0]).toMatchObject({
      kind: 'group',
      label: 'type: summary',
      count: 1,
    });
    expect(result.rows[1]).toMatchObject({
      kind: 'task',
      task: { id: 'design' },
    });
    expect(result.rows.at(-1)).toEqual({ kind: 'newTask', key: 'new-task' });
  });

  it('materializes the worker model back to the same visible row result after shell projection', () => {
    const parent = makeTask({ id: 'parent', name: 'Parent', type: 'summary' });
    const child = makeTask({ id: 'child', name: 'Child', parentId: 'parent', outlineLevel: 1 });
    const dependency = makeDependency({ id: 'dep-1', fromTaskId: 'parent', toTaskId: 'child' });
    const args = {
      tasks: [parent, child],
      dependencies: [dependency],
      selectedTaskIds: new Set(['child']),
      collapsedIds: new Set<string>(),
      filters: [{ field: 'type', operator: 'contains', value: 'task' }] as FilterCriteria[],
      sortCriteria: [{ field: 'duration', direction: 'desc' }] as SortCriteria[],
      groupBy: { field: 'type', direction: 'asc' } as GroupByOption,
    };

    const direct = buildVisibleTaskRows(args);
    const materialized = materializeVisibleTaskRows(
      buildVisibleTaskRowsModel({
        ...args,
        tasks: buildTaskShells(args.tasks, {
          requiredFields: getProjectedTaskFields(args.filters, args.sortCriteria, args.groupBy),
        }),
        dependencies: buildDependencyShells(args.dependencies),
      }),
      args.tasks,
      args.dependencies,
    );

    expect(materialized).toEqual(direct);
  });
});

describe('useVisibleTaskRows worker fallback', () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    MockWorker.reset();
    resetStores();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.Worker = MockWorker as unknown as typeof Worker;
  });

  afterEach(() => {
    cleanup();
    resetStores();
    MockWorker.reset();
    vi.restoreAllMocks();

    if (originalWorker) {
      globalThis.Worker = originalWorker;
    } else {
      delete (globalThis as { Worker?: typeof Worker }).Worker;
    }
  });

  it('falls back to sync rendering when postMessage throws DataCloneError for a large project', async () => {
    const tasks = makeLargeTasks(LARGE_PROJECT_TASK_COUNT, 'project-a');
    MockWorker.handler = () => {
      throw createDataCloneError();
    };

    seedVisibleTaskRowsState({
      projectId: 'project-a',
      tasks,
    });

    let renderedHook: { result: { current: VisibleTaskRowsResult } } | undefined;
    expect(() => {
      renderedHook = renderHook(() => useVisibleTaskRows());
    }).not.toThrow();

    const { result } = renderedHook!;

    await waitFor(() => {
      expect(result.current.visibleTasks).toHaveLength(tasks.length);
    });

    expect(MockWorker.postMessageCalls).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed large project in sync compatibility mode for the rest of the session', async () => {
    const tasks = makeLargeTasks(LARGE_PROJECT_TASK_COUNT, 'project-a');
    const updatedTasks = tasks.map((task, index) =>
      index === 0 ? { ...task, name: 'Updated Task 0' } : task,
    );

    MockWorker.handler = (_worker, message) => {
      if (message.projectId === 'project-a') {
        throw createDataCloneError();
      }
    };

    seedVisibleTaskRowsState({
      projectId: 'project-a',
      tasks,
    });

    const { result } = renderHook(() => useVisibleTaskRows());

    await waitFor(() => {
      expect(result.current.visibleTasks).toHaveLength(tasks.length);
    });

    const postMessageCountAfterFailure = MockWorker.postMessageCalls.length;

    seedVisibleTaskRowsState({
      projectId: 'project-a',
      revision: 2,
      tasks: updatedTasks,
    });

    await waitFor(() => {
      expect(result.current.visibleTasks[0]?.name).toBe('Updated Task 0');
    });

    expect(MockWorker.postMessageCalls).toHaveLength(postMessageCountAfterFailure);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('still uses the worker for a different large project after one project enters compatibility mode', async () => {
    const tasksA = makeLargeTasks(LARGE_PROJECT_TASK_COUNT, 'project-a');
    const tasksB = makeLargeTasks(LARGE_PROJECT_TASK_COUNT, 'project-b');

    MockWorker.handler = (worker, message) => {
      if (message.projectId === 'project-a') {
        throw createDataCloneError();
      }

      worker.emitSuccess(message);
    };

    seedVisibleTaskRowsState({
      projectId: 'project-a',
      tasks: tasksA,
    });

    const { result } = renderHook(() => useVisibleTaskRows());

    await waitFor(() => {
      expect(result.current.visibleTasks).toHaveLength(tasksA.length);
    });

    seedVisibleTaskRowsState({
      projectId: 'project-b',
      tasks: tasksB,
    });

    await waitFor(() => {
      expect(
        MockWorker.postMessageCalls.some((message) => message.projectId === 'project-b'),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.visibleTasks).toHaveLength(tasksB.length);
    });

    expect(
      MockWorker.postMessageCalls.filter((message) => message.projectId === 'project-a'),
    ).toHaveLength(1);
    expect(
      MockWorker.postMessageCalls.filter((message) => message.projectId === 'project-b'),
    ).not.toHaveLength(0);
  });

  it('returns the same visible rows through the worker path as the direct builder for large projects', async () => {
    const tasks = makeLargeTasks(LARGE_PROJECT_TASK_COUNT, 'project-success');
    const filters: FilterCriteria[] = [
      { field: 'percentComplete', operator: 'gt', value: 50 },
    ];
    const sortCriteria: SortCriteria[] = [
      { field: 'duration', direction: 'desc' },
    ];
    const groupBy: GroupByOption = {
      field: 'type',
      direction: 'asc',
    };
    const selectedTaskIds = new Set([tasks[151]?.id ?? '']);
    const expected = summarizeVisibleTaskRows(
      buildVisibleTaskRows({
        tasks,
        dependencies: [],
        selectedTaskIds,
        collapsedIds: new Set<string>(),
        filters,
        sortCriteria,
        groupBy,
      }),
    );

    MockWorker.handler = (worker, message) => {
      worker.emitSuccess(message);
    };

    seedVisibleTaskRowsState({
      projectId: 'project-success',
      tasks,
      filters,
      sortCriteria,
      groupBy,
      selectedTaskIds,
    });

    const { result } = renderHook(() => useVisibleTaskRows());

    await waitFor(() => {
      expect(summarizeVisibleTaskRows(result.current)).toEqual(expected);
    });

    expect(Object.keys(MockWorker.postMessageCalls[0]?.tasks[0]?.fields ?? {}).sort()).toEqual([
      'durationMinutes',
      'percentComplete',
      'type',
    ]);
  });
});

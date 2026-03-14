import type {
  DependencyRow,
  FilterCriteria,
  GroupByOption,
  SortCriteria,
  TaskRow,
} from '../stores';

export interface RowModelTaskShell {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  outlineLevel: number;
  sortOrder: number;
  wbsCode: string;
  isManuallyScheduled: boolean;
  isCritical: boolean;
  percentComplete: number;
  constraintType: number;
  durationMinutes: number;
  startMs: number;
  finishMs: number;
  cost: number;
  actualCost: number;
  remainingCost: number;
  work: number;
  actualWork: number;
  remainingWork: number;
  totalSlackMinutes: number;
  freeSlackMinutes: number;
  resourceNames: string;
}

export interface RowModelDependencyShell {
  id: string;
  fromTaskId: string;
  toTaskId: string;
}

export type VisibleTaskListRow =
  | {
      kind: 'group';
      key: string;
      label: string;
      count: number;
    }
  | {
      kind: 'task';
      key: string;
      task: TaskRow;
      index: number;
      isSelected: boolean;
      isExpanded: boolean;
      hasChildren: boolean;
    }
  | {
      kind: 'newTask';
      key: string;
    };

export type VisibleTaskListRowModel =
  | {
      kind: 'group';
      key: string;
      label: string;
      count: number;
    }
  | {
      kind: 'task';
      key: string;
      taskId: string;
      index: number;
      isSelected: boolean;
      isExpanded: boolean;
      hasChildren: boolean;
    }
  | {
      kind: 'newTask';
      key: string;
    };

export interface VisibleTaskRowsModelArgs {
  tasks: RowModelTaskShell[];
  dependencies: RowModelDependencyShell[];
  selectedTaskIds: Set<string>;
  collapsedIds: Set<string>;
  filters: FilterCriteria[];
  sortCriteria: SortCriteria[];
  groupBy: GroupByOption | null;
}

export interface VisibleTaskRowsModel {
  rows: VisibleTaskListRowModel[];
  visibleTaskIds: string[];
  visibleDependencyIds: string[];
}

export interface VisibleTaskRowsResult {
  rows: VisibleTaskListRow[];
  visibleTasks: TaskRow[];
  visibleDependencies: DependencyRow[];
}

function normalizeFieldAlias(field: string): keyof RowModelTaskShell | string {
  switch (field) {
    case 'duration':
      return 'durationMinutes';
    case 'start':
      return 'startMs';
    case 'finish':
      return 'finishMs';
    case 'totalSlack':
      return 'totalSlackMinutes';
    case 'freeSlack':
      return 'freeSlackMinutes';
    default:
      return field;
  }
}

function getTaskFieldValue(task: RowModelTaskShell, field: string): unknown {
  const normalizedField = normalizeFieldAlias(field);
  return (task as unknown as Record<string, unknown>)[normalizedField];
}

function matchesCriterion(task: RowModelTaskShell, criterion: FilterCriteria): boolean {
  const rawValue = getTaskFieldValue(task, criterion.field);
  const stringValue = String(rawValue ?? '').toLowerCase();
  const compareValue = String(criterion.value ?? '').toLowerCase();

  switch (criterion.operator) {
    case 'contains':
      return stringValue.includes(compareValue);
    case 'eq':
      return stringValue === compareValue;
    case 'ne':
      return stringValue !== compareValue;
    case 'gt':
      return Number(rawValue) > Number(criterion.value);
    case 'lt':
      return Number(rawValue) < Number(criterion.value);
    case 'between':
      return (
        criterion.value2 != null &&
        Number(rawValue) >= Number(criterion.value) &&
        Number(rawValue) <= Number(criterion.value2)
      );
    default:
      return true;
  }
}

function sortTasks(
  tasks: RowModelTaskShell[],
  sortCriteria: SortCriteria[],
): RowModelTaskShell[] {
  if (sortCriteria.length === 0) {
    return tasks;
  }

  return [...tasks].sort((leftTask, rightTask) => {
    for (const criterion of sortCriteria) {
      const leftValue = getTaskFieldValue(leftTask, criterion.field);
      const rightValue = getTaskFieldValue(rightTask, criterion.field);
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      const comparison =
        !Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)
          ? leftNumber - rightNumber
          : String(leftValue ?? '').localeCompare(String(rightValue ?? ''));

      if (comparison !== 0) {
        return criterion.direction === 'desc' ? -comparison : comparison;
      }
    }

    return 0;
  });
}

export function buildTaskShells(
  tasks: TaskRow[],
  resourceNamesByTaskId: Map<string, string> = new Map(),
): RowModelTaskShell[] {
  return tasks.map((task) => ({
    id: task.id,
    parentId: task.parentId,
    name: task.name,
    type: task.type,
    outlineLevel: task.outlineLevel,
    sortOrder: task.sortOrder,
    wbsCode: task.wbsCode,
    isManuallyScheduled: task.isManuallyScheduled,
    isCritical: task.isCritical,
    percentComplete: task.percentComplete,
    constraintType: task.constraintType,
    durationMinutes: task.durationMinutes,
    startMs: new Date(task.start).getTime(),
    finishMs: new Date(task.finish).getTime(),
    cost: task.cost ?? 0,
    actualCost: task.actualCost ?? 0,
    remainingCost: task.remainingCost ?? 0,
    work: task.work ?? 0,
    actualWork: task.actualWork ?? 0,
    remainingWork: task.remainingWork ?? 0,
    totalSlackMinutes: task.totalSlackMinutes,
    freeSlackMinutes: task.freeSlackMinutes,
    resourceNames: resourceNamesByTaskId.get(task.id) ?? '',
  }));
}

export function buildDependencyShells(
  dependencies: DependencyRow[],
): RowModelDependencyShell[] {
  return dependencies.map((dependency) => ({
    id: dependency.id,
    fromTaskId: dependency.fromTaskId,
    toTaskId: dependency.toTaskId,
  }));
}

export function buildVisibleTaskRowsModel(
  args: VisibleTaskRowsModelArgs,
): VisibleTaskRowsModel {
  const { tasks, dependencies, selectedTaskIds, collapsedIds, filters, sortCriteria, groupBy } = args;
  const childMap = new Set<string>();
  const childrenByParentId = new Map<string, string[]>();

  for (const task of tasks) {
    if (task.parentId) {
      childMap.add(task.parentId);
      const children = childrenByParentId.get(task.parentId) ?? [];
      children.push(task.id);
      childrenByParentId.set(task.parentId, children);
    }
  }

  const hiddenIds = new Set<string>();
  if (collapsedIds.size > 0) {
    const stack = [...collapsedIds];
    while (stack.length > 0) {
      const parentId = stack.pop();
      if (!parentId) {
        continue;
      }

      for (const childId of childrenByParentId.get(parentId) ?? []) {
        if (hiddenIds.has(childId)) {
          continue;
        }

        hiddenIds.add(childId);
        stack.push(childId);
      }
    }
  }

  const filteredTasks = sortTasks(
    tasks
      .filter((task) => !hiddenIds.has(task.id))
      .filter((task) => filters.every((criterion) => matchesCriterion(task, criterion))),
    sortCriteria,
  );

  const rows: VisibleTaskListRowModel[] = [];
  let taskIndex = 0;

  if (groupBy) {
    const groups = new Map<string, RowModelTaskShell[]>();
    for (const task of filteredTasks) {
      const rawValue = getTaskFieldValue(task, groupBy.field);
      const key = String(rawValue ?? '(blank)');
      const groupTasks = groups.get(key) ?? [];
      groupTasks.push(task);
      groups.set(key, groupTasks);
    }

    const sortedKeys = [...groups.keys()].sort((left, right) =>
      groupBy.direction === 'desc'
        ? right.localeCompare(left)
        : left.localeCompare(right),
    );

    for (const key of sortedKeys) {
      const groupTasks = groups.get(key) ?? [];
      rows.push({
        kind: 'group',
        key: `group:${key}`,
        label: `${groupBy.field}: ${key}`,
        count: groupTasks.length,
      });

      for (const task of groupTasks) {
        rows.push({
          kind: 'task',
          key: task.id,
          taskId: task.id,
          index: taskIndex++,
          isSelected: selectedTaskIds.has(task.id),
          isExpanded: !collapsedIds.has(task.id),
          hasChildren: childMap.has(task.id),
        });
      }
    }
  } else {
    for (const task of filteredTasks) {
      rows.push({
        kind: 'task',
        key: task.id,
        taskId: task.id,
        index: taskIndex++,
        isSelected: selectedTaskIds.has(task.id),
        isExpanded: !collapsedIds.has(task.id),
        hasChildren: childMap.has(task.id),
      });
    }
  }

  rows.push({ kind: 'newTask', key: 'new-task' });

  const visibleTaskIds = filteredTasks.map((task) => task.id);
  const visibleTaskIdSet = new Set(visibleTaskIds);
  return {
    rows,
    visibleTaskIds,
    visibleDependencyIds: dependencies
      .filter(
        (dependency) =>
          visibleTaskIdSet.has(dependency.fromTaskId) &&
          visibleTaskIdSet.has(dependency.toTaskId),
      )
      .map((dependency) => dependency.id),
  };
}

export function materializeVisibleTaskRows(
  model: VisibleTaskRowsModel,
  tasks: TaskRow[],
  dependencies: DependencyRow[],
): VisibleTaskRowsResult {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const dependencyMap = new Map(
    dependencies.map((dependency) => [dependency.id, dependency]),
  );

  const visibleTasks = model.visibleTaskIds
    .map((taskId) => taskMap.get(taskId) ?? null)
    .filter((task): task is TaskRow => Boolean(task));
  const visibleDependencies = model.visibleDependencyIds
    .map((dependencyId) => dependencyMap.get(dependencyId) ?? null)
    .filter((dependency): dependency is DependencyRow => Boolean(dependency));
  const rows = model.rows
    .map((row) => {
      if (row.kind !== 'task') {
        return row;
      }

      const task = taskMap.get(row.taskId);
      if (!task) {
        return null;
      }

      return {
        kind: 'task' as const,
        key: row.key,
        task,
        index: row.index,
        isSelected: row.isSelected,
        isExpanded: row.isExpanded,
        hasChildren: row.hasChildren,
      };
    })
    .filter((row): row is VisibleTaskListRow => Boolean(row));

  return {
    rows,
    visibleTasks,
    visibleDependencies,
  };
}

export function buildVisibleTaskRows(args: {
  tasks: TaskRow[];
  dependencies: DependencyRow[];
  taskShells?: RowModelTaskShell[];
  dependencyShells?: RowModelDependencyShell[];
  selectedTaskIds: Set<string>;
  collapsedIds: Set<string>;
  filters: FilterCriteria[];
  sortCriteria: SortCriteria[];
  groupBy: GroupByOption | null;
}): VisibleTaskRowsResult {
  const taskShells = args.taskShells ?? buildTaskShells(args.tasks);
  const dependencyShells = args.dependencyShells ?? buildDependencyShells(args.dependencies);

  return materializeVisibleTaskRows(
    buildVisibleTaskRowsModel({
      tasks: taskShells,
      dependencies: dependencyShells,
      selectedTaskIds: args.selectedTaskIds,
      collapsedIds: args.collapsedIds,
      filters: args.filters,
      sortCriteria: args.sortCriteria,
      groupBy: args.groupBy,
    }),
    args.tasks,
    args.dependencies,
  );
}

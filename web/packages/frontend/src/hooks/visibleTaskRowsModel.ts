import type {
  DependencyRow,
  FilterCriteria,
  GroupByOption,
  SortCriteria,
  TaskRow,
} from '../stores';

export type RowModelTaskField =
  | 'name'
  | 'type'
  | 'outlineLevel'
  | 'sortOrder'
  | 'wbsCode'
  | 'isManuallyScheduled'
  | 'isCritical'
  | 'percentComplete'
  | 'constraintType'
  | 'durationMinutes'
  | 'startMs'
  | 'finishMs'
  | 'cost'
  | 'actualCost'
  | 'remainingCost'
  | 'work'
  | 'actualWork'
  | 'remainingWork'
  | 'totalSlackMinutes'
  | 'freeSlackMinutes'
  | 'resourceNames';

type RowModelTaskFieldValue = string | number | boolean | null;
type RowModelTaskFields = Partial<Record<RowModelTaskField, RowModelTaskFieldValue>>;

export interface RowModelTaskShell {
  id: string;
  parentId: string | null;
  fields: RowModelTaskFields;
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

interface BuildTaskShellOptions {
  requiredFields?: Iterable<RowModelTaskField>;
  resourceNamesByTaskId?: Map<string, string>;
}

const EMPTY_RESOURCE_NAMES_BY_TASK_ID = new Map<string, string>();

const TASK_FIELD_PROJECTORS: Record<
  RowModelTaskField,
  (task: TaskRow, resourceNamesByTaskId: Map<string, string>) => RowModelTaskFieldValue
> = {
  name: (task) => task.name,
  type: (task) => task.type,
  outlineLevel: (task) => task.outlineLevel,
  sortOrder: (task) => task.sortOrder,
  wbsCode: (task) => task.wbsCode,
  isManuallyScheduled: (task) => task.isManuallyScheduled,
  isCritical: (task) => task.isCritical,
  percentComplete: (task) => task.percentComplete,
  constraintType: (task) => task.constraintType,
  durationMinutes: (task) => task.durationMinutes,
  startMs: (task) => new Date(task.start).getTime(),
  finishMs: (task) => new Date(task.finish).getTime(),
  cost: (task) => task.cost ?? 0,
  actualCost: (task) => task.actualCost ?? 0,
  remainingCost: (task) => task.remainingCost ?? 0,
  work: (task) => task.work ?? 0,
  actualWork: (task) => task.actualWork ?? 0,
  remainingWork: (task) => task.remainingWork ?? 0,
  totalSlackMinutes: (task) => task.totalSlackMinutes,
  freeSlackMinutes: (task) => task.freeSlackMinutes,
  resourceNames: (task, resourceNamesByTaskId) => resourceNamesByTaskId.get(task.id) ?? '',
};

const PROJECTABLE_TASK_FIELDS = new Set<RowModelTaskField>(
  Object.keys(TASK_FIELD_PROJECTORS) as RowModelTaskField[],
);

function normalizeFieldAlias(field: string): RowModelTaskField | string {
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

function isProjectableTaskField(field: string): field is RowModelTaskField {
  return PROJECTABLE_TASK_FIELDS.has(field as RowModelTaskField);
}

export function getProjectedTaskFields(
  filters: FilterCriteria[],
  sortCriteria: SortCriteria[],
  groupBy: GroupByOption | null,
): RowModelTaskField[] {
  const projectedFields = new Set<RowModelTaskField>();

  const addProjectedField = (field: string) => {
    const normalizedField = normalizeFieldAlias(field);
    if (isProjectableTaskField(normalizedField)) {
      projectedFields.add(normalizedField);
    }
  };

  for (const filter of filters) {
    addProjectedField(filter.field);
  }

  for (const sort of sortCriteria) {
    addProjectedField(sort.field);
  }

  if (groupBy) {
    addProjectedField(groupBy.field);
  }

  return [...projectedFields];
}

function getTaskFieldValue(task: RowModelTaskShell, field: string): unknown {
  const normalizedField = normalizeFieldAlias(field);

  if (normalizedField === 'id' || normalizedField === 'parentId') {
    return task[normalizedField];
  }

  return isProjectableTaskField(normalizedField)
    ? task.fields[normalizedField]
    : undefined;
}

function resolveSafeParentId(
  taskId: string,
  desiredParentId: string | null,
  taskMap: Map<string, RowModelTaskShell>,
  proposedParentIds: Map<string, string | null>,
  resolvedParentIds: Map<string, string | null>,
): string | null {
  if (!desiredParentId || desiredParentId === taskId || !taskMap.has(desiredParentId)) {
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

function resolveNormalizedParentIds(
  tasks: RowModelTaskShell[],
): Map<string, string | null> {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const proposedParentIds = new Map(
    tasks.map((task) => [task.id, task.parentId ?? null]),
  );
  const resolvedParentIds = new Map<string, string | null>();

  for (const task of tasks) {
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

  return resolvedParentIds;
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
  options: BuildTaskShellOptions = {},
): RowModelTaskShell[] {
  const {
    requiredFields = [],
    resourceNamesByTaskId = EMPTY_RESOURCE_NAMES_BY_TASK_ID,
  } = options;
  const projectedFields = [...new Set(requiredFields)];

  return tasks.map((task) => {
    const fields: RowModelTaskFields = {};

    for (const field of projectedFields) {
      fields[field] = TASK_FIELD_PROJECTORS[field](task, resourceNamesByTaskId);
    }

    return {
      id: task.id,
      parentId: task.parentId,
      fields,
    };
  });
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
  const normalizedParentIds = resolveNormalizedParentIds(tasks);
  const childMap = new Set<string>();
  const childrenByParentId = new Map<string, string[]>();

  for (const task of tasks) {
    const parentId = normalizedParentIds.get(task.id) ?? null;
    if (parentId) {
      childMap.add(parentId);
      const children = childrenByParentId.get(parentId) ?? [];
      children.push(task.id);
      childrenByParentId.set(parentId, children);
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
  const projectedFields = getProjectedTaskFields(
    args.filters,
    args.sortCriteria,
    args.groupBy,
  );
  const taskShells =
    args.taskShells ??
    buildTaskShells(args.tasks, {
      requiredFields: projectedFields,
    });
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

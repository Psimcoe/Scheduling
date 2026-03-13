import { useDeferredValue, useMemo } from 'react';
import { useProjectStore, useUIStore, type DependencyRow, type FilterCriteria, type GroupByOption, type SortCriteria, type TaskRow } from '../stores';

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

export interface VisibleTaskRowsResult {
  rows: VisibleTaskListRow[];
  visibleTasks: TaskRow[];
  visibleDependencies: DependencyRow[];
}

function matchesCriterion(task: TaskRow, criterion: FilterCriteria): boolean {
  const rawValue = (task as unknown as Record<string, unknown>)[criterion.field];
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

function sortTasks(tasks: TaskRow[], sortCriteria: SortCriteria[]): TaskRow[] {
  if (sortCriteria.length === 0) {
    return tasks;
  }

  return [...tasks].sort((leftTask, rightTask) => {
    for (const criterion of sortCriteria) {
      const leftValue = (leftTask as unknown as Record<string, unknown>)[criterion.field];
      const rightValue = (rightTask as unknown as Record<string, unknown>)[criterion.field];
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

export function buildVisibleTaskRows(args: {
  tasks: TaskRow[];
  dependencies: DependencyRow[];
  selectedTaskIds: Set<string>;
  collapsedIds: Set<string>;
  filters: FilterCriteria[];
  sortCriteria: SortCriteria[];
  groupBy: GroupByOption | null;
}): VisibleTaskRowsResult {
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

  const rows: VisibleTaskListRow[] = [];
  let taskIndex = 0;

  if (groupBy) {
    const groups = new Map<string, TaskRow[]>();
    for (const task of filteredTasks) {
      const rawValue = (task as unknown as Record<string, unknown>)[groupBy.field];
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
          task,
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
        task,
        index: taskIndex++,
        isSelected: selectedTaskIds.has(task.id),
        isExpanded: !collapsedIds.has(task.id),
        hasChildren: childMap.has(task.id),
      });
    }
  }

  rows.push({ kind: 'newTask', key: 'new-task' });

  const visibleTaskIds = new Set(filteredTasks.map((task) => task.id));
  return {
    rows,
    visibleTasks: filteredTasks,
    visibleDependencies: dependencies.filter(
      (dependency) =>
        visibleTaskIds.has(dependency.fromTaskId) &&
        visibleTaskIds.has(dependency.toTaskId),
    ),
  };
}

export function useVisibleTaskRows(): VisibleTaskRowsResult {
  const tasks = useProjectStore((state) => state.tasks);
  const dependencies = useProjectStore((state) => state.dependencies);
  const selectedTaskIds = useProjectStore((state) => state.selectedTaskIds);
  const collapsedIds = useUIStore((state) => state.collapsedIds);
  const filters = useUIStore((state) => state.filters);
  const sortCriteria = useUIStore((state) => state.sortCriteria);
  const groupBy = useUIStore((state) => state.groupBy);
  const deferredTasks = useDeferredValue(tasks);
  const deferredDependencies = useDeferredValue(dependencies);

  return useMemo(
    () =>
      buildVisibleTaskRows({
        tasks: deferredTasks,
        dependencies: deferredDependencies,
        selectedTaskIds,
        collapsedIds,
        filters,
        sortCriteria,
        groupBy,
      }),
    [collapsedIds, deferredDependencies, deferredTasks, filters, groupBy, selectedTaskIds, sortCriteria],
  );
}

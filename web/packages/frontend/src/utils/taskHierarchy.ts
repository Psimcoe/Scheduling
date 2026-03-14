interface TaskHierarchyNode {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

export interface TaskHierarchyBatchUpdate {
  id: string;
  data: {
    parentId: string | null;
  };
}

function compareTasksBySortOrder(
  left: TaskHierarchyNode,
  right: TaskHierarchyNode,
): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

function buildParentMap(
  tasks: TaskHierarchyNode[],
): Map<string, string | null> {
  const taskIds = new Set(tasks.map((task) => task.id));
  return new Map(
    tasks.map((task) => [
      task.id,
      task.parentId && task.parentId !== task.id && taskIds.has(task.parentId)
        ? task.parentId
        : null,
    ]),
  );
}

function hasAncestor(
  taskId: string,
  ancestorId: string,
  parentIds: Map<string, string | null>,
): boolean {
  const seen = new Set<string>();
  let currentId = parentIds.get(taskId) ?? null;

  while (currentId) {
    if (currentId === ancestorId) {
      return true;
    }

    if (seen.has(currentId)) {
      return false;
    }

    seen.add(currentId);
    currentId = parentIds.get(currentId) ?? null;
  }

  return false;
}

function getSelectedRootIds(
  orderedTasks: TaskHierarchyNode[],
  selectedTaskIds: ReadonlySet<string>,
  parentIds: Map<string, string | null>,
): string[] {
  return orderedTasks
    .filter((task) => selectedTaskIds.has(task.id))
    .filter((task) => !hasAncestorInSelection(task.id, selectedTaskIds, parentIds))
    .map((task) => task.id);
}

function hasAncestorInSelection(
  taskId: string,
  selectedTaskIds: ReadonlySet<string>,
  parentIds: Map<string, string | null>,
): boolean {
  const seen = new Set<string>();
  let currentId = parentIds.get(taskId) ?? null;

  while (currentId) {
    if (selectedTaskIds.has(currentId)) {
      return true;
    }

    if (seen.has(currentId)) {
      return false;
    }

    seen.add(currentId);
    currentId = parentIds.get(currentId) ?? null;
  }

  return false;
}

function buildChildrenByParentId(
  parentIds: Map<string, string | null>,
): Map<string, string[]> {
  const childrenByParentId = new Map<string, string[]>();

  for (const [taskId, parentId] of parentIds.entries()) {
    if (!parentId) {
      continue;
    }

    const children = childrenByParentId.get(parentId) ?? [];
    children.push(taskId);
    childrenByParentId.set(parentId, children);
  }

  return childrenByParentId;
}

function collectSubtreeIds(
  rootIds: readonly string[],
  childrenByParentId: Map<string, string[]>,
): Set<string> {
  const subtreeIds = new Set<string>();
  const stack = [...rootIds];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || subtreeIds.has(currentId)) {
      continue;
    }

    subtreeIds.add(currentId);
    for (const childId of childrenByParentId.get(currentId) ?? []) {
      stack.push(childId);
    }
  }

  return subtreeIds;
}

function resolveOutdentParentId(
  taskId: string,
  parentIds: Map<string, string | null>,
): string | null {
  const parentId = parentIds.get(taskId) ?? null;
  if (!parentId) {
    return null;
  }

  const grandparentId = parentIds.get(parentId) ?? null;
  if (!grandparentId || grandparentId === taskId) {
    return null;
  }

  return grandparentId;
}

export function buildIndentTaskUpdates(
  tasks: TaskHierarchyNode[],
  selectedTaskIds: ReadonlySet<string>,
): TaskHierarchyBatchUpdate[] {
  if (tasks.length === 0 || selectedTaskIds.size === 0) {
    return [];
  }

  const orderedTasks = [...tasks].sort(compareTasksBySortOrder);
  const parentIds = buildParentMap(orderedTasks);
  const selectedRootIds = getSelectedRootIds(
    orderedTasks,
    selectedTaskIds,
    parentIds,
  );

  if (selectedRootIds.length === 0) {
    return [];
  }

  const childrenByParentId = buildChildrenByParentId(parentIds);
  const movingTaskIds = collectSubtreeIds(selectedRootIds, childrenByParentId);
  const orderedTaskIds = orderedTasks.map((task) => task.id);

  return selectedRootIds.flatMap((taskId) => {
    const currentIndex = orderedTaskIds.indexOf(taskId);
    if (currentIndex <= 0) {
      return [];
    }

    for (let candidateIndex = currentIndex - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = orderedTasks[candidateIndex];
      if (!candidate || movingTaskIds.has(candidate.id)) {
        continue;
      }

      if (hasAncestor(candidate.id, taskId, parentIds)) {
        continue;
      }

      return [{ id: taskId, data: { parentId: candidate.id } }];
    }

    return [];
  });
}

export function buildOutdentTaskUpdates(
  tasks: TaskHierarchyNode[],
  selectedTaskIds: ReadonlySet<string>,
): TaskHierarchyBatchUpdate[] {
  if (tasks.length === 0 || selectedTaskIds.size === 0) {
    return [];
  }

  const orderedTasks = [...tasks].sort(compareTasksBySortOrder);
  const parentIds = buildParentMap(orderedTasks);
  const selectedRootIds = getSelectedRootIds(
    orderedTasks,
    selectedTaskIds,
    parentIds,
  );

  return selectedRootIds.flatMap((taskId) => {
    const parentId = parentIds.get(taskId) ?? null;
    if (!parentId) {
      return [];
    }

    return [
      {
        id: taskId,
        data: {
          parentId: resolveOutdentParentId(taskId, parentIds),
        },
      },
    ];
  });
}

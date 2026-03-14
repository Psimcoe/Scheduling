export function isTaskNameManagedByStratus(task: {
  stratusSync?: unknown | null;
  stratusAssemblySync?: unknown | null;
}): boolean {
  return Boolean(task.stratusSync || task.stratusAssemblySync);
}


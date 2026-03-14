import { describe, expect, it } from 'vitest';
import { buildVisibleTaskRows } from './useVisibleTaskRows';
import {
  buildDependencyShells,
  buildTaskShells,
  buildVisibleTaskRowsModel,
  materializeVisibleTaskRows,
} from './visibleTaskRowsModel';
import type { DependencyRow, TaskRow } from '../stores';

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
    start: '2026-03-01T00:00:00.000Z',
    finish: '2026-03-02T00:00:00.000Z',
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

describe('buildVisibleTaskRows', () => {
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

  it('materializes the worker model back to the same visible row result', () => {
    const parent = makeTask({ id: 'parent', name: 'Parent', type: 'summary' });
    const child = makeTask({ id: 'child', name: 'Child', parentId: 'parent', outlineLevel: 1 });
    const dependency = makeDependency({ id: 'dep-1', fromTaskId: 'parent', toTaskId: 'child' });
    const args = {
      tasks: [parent, child],
      dependencies: [dependency],
      selectedTaskIds: new Set(['child']),
      collapsedIds: new Set<string>(),
      filters: [],
      sortCriteria: [],
      groupBy: null,
    };

    const direct = buildVisibleTaskRows(args);
    const materialized = materializeVisibleTaskRows(
      buildVisibleTaskRowsModel({
        ...args,
        tasks: buildTaskShells(args.tasks),
        dependencies: buildDependencyShells(args.dependencies),
      }),
      args.tasks,
      args.dependencies,
    );

    expect(materialized).toEqual(direct);
  });
});

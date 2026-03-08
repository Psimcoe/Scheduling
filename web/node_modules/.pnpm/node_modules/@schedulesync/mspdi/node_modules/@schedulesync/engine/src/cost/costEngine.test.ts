import { describe, it, expect } from 'vitest';
import {
  getApplicableRate,
  calculateAssignmentCost,
  calculateTaskCost,
  rollupProjectCosts,
} from '../cost/costEngine.js';
import type {
  Task,
  Resource,
  Assignment,
  CostRateTable,
  ProjectData,
  ProjectSettings,
} from '../types.js';
import { TaskType, ConstraintType, ResourceType, AccrueAt } from '../types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeTask(partial: Partial<Task>): Task {
  return {
    id: 't1',
    wbsCode: '1',
    outlineLevel: 1,
    parentId: null,
    name: 'Task 1',
    type: TaskType.Task,
    durationMinutes: 480,
    start: '2025-01-06T08:00:00Z',
    finish: '2025-01-06T17:00:00Z',
    constraintType: ConstraintType.ASAP,
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
    notes: '',
    externalKey: null,
    sortOrder: 1,
    ...partial,
  };
}

function makeResource(partial: Partial<Resource>): Resource {
  return {
    id: 'r1',
    name: 'Dev',
    type: ResourceType.Work,
    maxUnits: 1,
    calendarId: null,
    standardRate: 50,
    overtimeRate: 75,
    costPerUse: 0,
    ...partial,
  };
}

function makeAssignment(partial: Partial<Assignment>): Assignment {
  return {
    id: 'a1',
    taskId: 't1',
    resourceId: 'r1',
    units: 1,
    workMinutes: 480,
    start: '2025-01-06T08:00:00Z',
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// getApplicableRate
// ---------------------------------------------------------------------------

describe('getApplicableRate', () => {
  it('returns default entry when no rate tables', () => {
    const entry = getApplicableRate(undefined, 0, '2025-01-01');
    expect(entry.standardRate).toBe(0);
  });

  it('returns default entry for empty tables', () => {
    const entry = getApplicableRate([], 0, '2025-01-01');
    expect(entry.standardRate).toBe(0);
  });

  it('returns the single entry from table A', () => {
    const tables: CostRateTable[] = [
      {
        name: 'A',
        entries: [
          { effectiveDate: '2024-01-01T00:00:00Z', standardRate: 100, overtimeRate: 150, costPerUse: 10 },
        ],
      },
    ];
    const entry = getApplicableRate(tables, 0, '2025-06-01');
    expect(entry.standardRate).toBe(100);
    expect(entry.costPerUse).toBe(10);
  });

  it('selects the correct rate by date', () => {
    const tables: CostRateTable[] = [
      {
        name: 'A',
        entries: [
          { effectiveDate: '2024-01-01T00:00:00Z', standardRate: 80, overtimeRate: 120, costPerUse: 0 },
          { effectiveDate: '2025-01-01T00:00:00Z', standardRate: 100, overtimeRate: 150, costPerUse: 5 },
        ],
      },
    ];
    expect(getApplicableRate(tables, 0, '2024-06-01').standardRate).toBe(80);
    expect(getApplicableRate(tables, 0, '2025-06-01').standardRate).toBe(100);
  });

  it('uses table B when tableIndex=1', () => {
    const tables: CostRateTable[] = [
      { name: 'A', entries: [{ effectiveDate: '2024-01-01', standardRate: 50, overtimeRate: 75, costPerUse: 0 }] },
      { name: 'B', entries: [{ effectiveDate: '2024-01-01', standardRate: 80, overtimeRate: 120, costPerUse: 0 }] },
    ];
    expect(getApplicableRate(tables, 1, '2024-06-01').standardRate).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// calculateAssignmentCost
// ---------------------------------------------------------------------------

describe('calculateAssignmentCost', () => {
  it('calculates work resource cost', () => {
    const assignment = makeAssignment({ workMinutes: 480 });
    const resource = makeResource({
      costRateTable: [
        { name: 'A', entries: [{ effectiveDate: '2024-01-01', standardRate: 50, overtimeRate: 75, costPerUse: 10 }] },
      ],
    });
    const result = calculateAssignmentCost(assignment, resource);

    // 480 / 60 = 8 hours × $50 + $10 costPerUse = $410
    expect(result.cost).toBe(410);
  });

  it('calculates material resource cost', () => {
    const assignment = makeAssignment({ units: 5, workMinutes: 1 });
    const resource = makeResource({
      type: ResourceType.Material,
      standardRate: 20,
      costPerUse: 5,
    });
    const result = calculateAssignmentCost(assignment, resource);

    // 20 × 5 + 5 = 105
    expect(result.cost).toBe(105);
  });

  it('calculates cost resource — uses assignment cost fields', () => {
    const assignment = makeAssignment({
      actualCost: 500,
      remainingCost: 200,
    });
    const resource = makeResource({ type: ResourceType.Cost });
    const result = calculateAssignmentCost(assignment, resource);

    expect(result.cost).toBe(700);
    expect(result.actualCost).toBe(500);
    expect(result.remainingCost).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// calculateTaskCost
// ---------------------------------------------------------------------------

describe('calculateTaskCost', () => {
  it('sums assignment costs plus fixed cost', () => {
    const task = makeTask({ fixedCost: 100, percentComplete: 50 });
    const a1 = makeAssignment({ workMinutes: 480 });
    const r1 = makeResource({
      costRateTable: [
        { name: 'A', entries: [{ effectiveDate: '2024-01-01', standardRate: 50, overtimeRate: 75, costPerUse: 0 }] },
      ],
    });

    const result = calculateTaskCost(task, [a1], [r1]);

    // 8h × $50 = $400 + $100 fixed = $500
    expect(result.cost).toBe(500);
  });

  it('applies prorated fixed cost accrual', () => {
    const task = makeTask({
      fixedCost: 200,
      fixedCostAccrual: AccrueAt.Prorated,
      percentComplete: 50,
    });
    const result = calculateTaskCost(task, [], []);

    expect(result.cost).toBe(200);
    expect(result.actualCost).toBe(100); // 50% of 200
    expect(result.remainingCost).toBe(100);
  });

  it('applies start fixed cost accrual', () => {
    const task = makeTask({
      fixedCost: 200,
      fixedCostAccrual: AccrueAt.Start,
      percentComplete: 10,
    });
    const result = calculateTaskCost(task, [], []);

    expect(result.actualCost).toBe(200); // fully accrued at start
    expect(result.remainingCost).toBe(0);
  });

  it('applies end fixed cost accrual', () => {
    const task = makeTask({
      fixedCost: 200,
      fixedCostAccrual: AccrueAt.End,
      percentComplete: 99,
    });
    const result = calculateTaskCost(task, [], []);

    expect(result.actualCost).toBe(0); // not yet complete
    expect(result.remainingCost).toBe(200);
  });

  it('fully accrues fixed cost at end when 100% complete', () => {
    const task = makeTask({
      fixedCost: 200,
      fixedCostAccrual: AccrueAt.End,
      percentComplete: 100,
    });
    const result = calculateTaskCost(task, [], []);

    expect(result.actualCost).toBe(200);
    expect(result.remainingCost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// rollupProjectCosts
// ---------------------------------------------------------------------------

describe('rollupProjectCosts', () => {
  it('rolls up child costs to summary task', () => {
    const summary = makeTask({
      id: 'summary',
      type: TaskType.Summary,
      parentId: null,
    });
    const child1 = makeTask({
      id: 'child1',
      parentId: 'summary',
      fixedCost: 100,
    });
    const child2 = makeTask({
      id: 'child2',
      parentId: 'summary',
      fixedCost: 200,
    });

    const project: ProjectData = {
      settings: {
        id: 'proj1',
        name: 'Test',
        startDate: '2025-01-01',
        finishDate: null,
        defaultCalendarId: 'cal1',
        scheduleFrom: 'start' as any,
        statusDate: null,
      } as ProjectSettings,
      tasks: [summary, child1, child2],
      dependencies: [],
      calendars: [],
      resources: [],
      assignments: [],
      baselines: [],
    };

    rollupProjectCosts(project);

    expect(summary.cost).toBe(300); // 100 + 200
  });
});

import { describe, it, expect } from 'vitest';
import { recalculateEffortDriven } from '../cost/effortDriven.js';
import type { Task, Assignment } from '../types.js';
import { TaskType, ConstraintType, TaskMode } from '../types.js';

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
    work: 480,
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
    ...partial,
  };
}

describe('recalculateEffortDriven', () => {
  describe('fixedWork mode', () => {
    it('halves duration when adding second resource at same units', () => {
      const task = makeTask({ taskMode: TaskMode.FixedWork, durationMinutes: 480, work: 480 });
      const assignments = [
        makeAssignment({ id: 'a1', units: 1 }),
        makeAssignment({ id: 'a2', resourceId: 'r2', units: 1 }),
      ];

      const result = recalculateEffortDriven(task, assignments, 1);

      expect(result.durationMinutes).toBe(240); // 480 / 2
      expect(result.assignments).toHaveLength(2);
      expect(result.assignments[0].workMinutes).toBe(240);
      expect(result.assignments[1].workMinutes).toBe(240);
    });
  });

  describe('fixedDuration mode', () => {
    it('increases total work when adding resource', () => {
      const task = makeTask({
        taskMode: TaskMode.FixedDuration,
        durationMinutes: 480,
        work: 480,
      });
      const assignments = [
        makeAssignment({ id: 'a1', units: 1 }),
        makeAssignment({ id: 'a2', resourceId: 'r2', units: 1 }),
      ];

      const result = recalculateEffortDriven(task, assignments, 1);

      expect(result.durationMinutes).toBe(480); // unchanged
      const totalWork = result.assignments.reduce((s, a) => s + a.workMinutes, 0);
      expect(totalWork).toBe(960); // 480 × 2
    });
  });

  describe('fixedUnits mode', () => {
    it('halves duration when doubling total units', () => {
      const task = makeTask({
        taskMode: TaskMode.FixedUnits,
        durationMinutes: 480,
        work: 480,
      });
      const assignments = [
        makeAssignment({ id: 'a1', units: 1 }),
        makeAssignment({ id: 'a2', resourceId: 'r2', units: 1 }),
      ];

      const result = recalculateEffortDriven(task, assignments, 1);

      expect(result.durationMinutes).toBe(240); // work/totalUnits = 480/2
    });
  });

  it('returns original duration with empty assignments', () => {
    const task = makeTask({ durationMinutes: 480 });
    const result = recalculateEffortDriven(task, [], 1);

    expect(result.durationMinutes).toBe(480);
    expect(result.assignments).toHaveLength(0);
  });

  it('distributes work proportionally based on units', () => {
    const task = makeTask({
      taskMode: TaskMode.FixedWork,
      durationMinutes: 480,
      work: 480,
    });
    const assignments = [
      makeAssignment({ id: 'a1', units: 0.5 }),
      makeAssignment({ id: 'a2', resourceId: 'r2', units: 1.5 }),
    ];

    const result = recalculateEffortDriven(task, assignments, 1);

    // r1: 0.5/2 = 25% → 120 min work
    // r2: 1.5/2 = 75% → 360 min work
    expect(result.assignments[0].workMinutes).toBe(120);
    expect(result.assignments[1].workMinutes).toBe(360);
  });
});

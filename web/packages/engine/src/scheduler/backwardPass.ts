/**
 * Backward pass — computes late start / late finish for each task.
 *
 * Walk tasks in reverse topological order, propagating constraints
 * from successors back to predecessors.
 */

import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import {
  DependencyType,
  TaskType,
  type Calendar,
  type Dependency,
  type Task,
} from '../types.js';
import { addWorkingMinutes, subtractWorkingMinutes } from '../calendar/workingTime.js';
import { applyConstraintBackwardPass } from './constraints.js';

dayjs.extend(utc);

export interface BackwardPassResult {
  lateDates: Map<string, { lateStart: Dayjs; lateFinish: Dayjs }>;
}

/**
 * Run the backward pass.
 *
 * @param sortedTaskIds Task IDs in topological order (will be reversed internally).
 * @param taskMap Map of task ID to Task.
 * @param depsByPredecessor Map of predecessor task ID to its outgoing dependencies.
 * @param earlyDates Map from forward pass.
 * @param calendarMap Calendar lookup.
 * @param defaultCalendar Fallback calendar.
 * @param projectFinish Latest early finish across all tasks (or project finish date).
 */
export function backwardPass(
  sortedTaskIds: string[],
  taskMap: Map<string, Task>,
  depsByPredecessor: Map<string, Dependency[]>,
  _earlyDates: Map<string, { earlyStart: Dayjs; earlyFinish: Dayjs }>,
  calendarMap: Map<string, Calendar>,
  defaultCalendar: Calendar,
  projectFinish: Dayjs,
): BackwardPassResult {
  const lateDates = new Map<string, { lateStart: Dayjs; lateFinish: Dayjs }>();

  // Process in reverse topological order
  const reversed = [...sortedTaskIds].reverse();

  for (const taskId of reversed) {
    const task = taskMap.get(taskId);
    if (!task || task.type === TaskType.Summary) continue;

    const cal = (task.calendarId && calendarMap.get(task.calendarId)) || defaultCalendar;
    const addWM = (d: Dayjs, m: number) => addWorkingMinutes(d, m, cal);
    const subWM = (d: Dayjs, m: number) => subtractWorkingMinutes(d, m, cal);

    let lateFinish = projectFinish;

    // Process all successor constraints
    const outgoingDeps = depsByPredecessor.get(taskId) ?? [];
    for (const dep of outgoingDeps) {
      const succLate = lateDates.get(dep.toTaskId);
      if (!succLate) continue;

      const succCal =
        (taskMap.get(dep.toTaskId)?.calendarId &&
          calendarMap.get(taskMap.get(dep.toTaskId)!.calendarId!)) ||
        defaultCalendar;

      let depDate: Dayjs;

      switch (dep.type) {
        case DependencyType.FS:
          // Predecessor must finish before successor late start - lag
          depDate =
            dep.lagMinutes !== 0
              ? subtractWorkingMinutes(succLate.lateStart, dep.lagMinutes, succCal)
              : succLate.lateStart;
          if (depDate.isBefore(lateFinish)) lateFinish = depDate;
          break;

        case DependencyType.SS:
          // Predecessor must start before successor late start - lag
          depDate =
            dep.lagMinutes !== 0
              ? subtractWorkingMinutes(succLate.lateStart, dep.lagMinutes, succCal)
              : succLate.lateStart;
          // This constrains predecessor's late start, not late finish
          // We'll handle via lateStart below, but need to constrain lateFinish
          // lateStart ≤ depDate → lateFinish ≤ depDate + duration
          const ssLF = addWM(depDate, task.durationMinutes);
          if (ssLF.isBefore(lateFinish)) lateFinish = ssLF;
          break;

        case DependencyType.FF:
          // Predecessor finish <= successor late finish - lag
          depDate =
            dep.lagMinutes !== 0
              ? subtractWorkingMinutes(succLate.lateFinish, dep.lagMinutes, succCal)
              : succLate.lateFinish;
          if (depDate.isBefore(lateFinish)) lateFinish = depDate;
          break;

        case DependencyType.SF:
          // Predecessor start <= successor late finish - lag
          depDate =
            dep.lagMinutes !== 0
              ? subtractWorkingMinutes(succLate.lateFinish, dep.lagMinutes, succCal)
              : succLate.lateFinish;
          // Constrains late start → late finish = late start + duration
          const sfLF = addWM(depDate, task.durationMinutes);
          if (sfLF.isBefore(lateFinish)) lateFinish = sfLF;
          break;
      }
    }

    // Compute late start from late finish
    let lateStart =
      task.type === TaskType.Milestone
        ? lateFinish
        : subWM(lateFinish, task.durationMinutes);

    // Apply constraints on backward pass
    const constrained = applyConstraintBackwardPass(
      task.constraintType,
      task.constraintDate,
      lateStart,
      lateFinish,
      task.durationMinutes,
      addWM,
      subWM,
    );
    lateStart = constrained.lateStart;
    lateFinish = constrained.lateFinish;

    // For manually scheduled tasks, use their own dates
    if (task.isManuallyScheduled) {
      lateStart = dayjs.utc(task.start);
      lateFinish = dayjs.utc(task.finish);
    }

    lateDates.set(taskId, { lateStart, lateFinish });
  }

  return { lateDates };
}

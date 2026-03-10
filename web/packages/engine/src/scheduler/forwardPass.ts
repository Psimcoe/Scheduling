/**
 * Forward pass — computes early start / early finish for each task.
 *
 * Respects all four dependency types (FS, SS, FF, SF), lag,
 * calendar working time, and constraints.
 */

import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import {
  DependencyType,
  TaskType,
  type Calendar,
  type Dependency,
  type ScheduleWarning,
  type Task,
} from '../types.js';
import { addWorkingMinutes, subtractWorkingMinutes } from '../calendar/workingTime.js';
import { applyConstraintForwardPass } from './constraints.js';

dayjs.extend(utc);

export interface ForwardPassResult {
  earlyDates: Map<string, { earlyStart: Dayjs; earlyFinish: Dayjs }>;
  warnings: ScheduleWarning[];
}

/**
 * Run the forward pass on tasks in topological order.
 *
 * @param sortedTaskIds Task IDs in topological order.
 * @param taskMap Map of task ID to Task.
 * @param depsBySuccessor Map of successor task ID to its incoming dependencies.
 * @param calendarMap Map of calendar ID to Calendar.
 * @param defaultCalendar Calendar to use when task has no specific calendar.
 * @param projectStart Project start date.
 */
export function forwardPass(
  sortedTaskIds: string[],
  taskMap: Map<string, Task>,
  depsBySuccessor: Map<string, Dependency[]>,
  calendarMap: Map<string, Calendar>,
  defaultCalendar: Calendar,
  projectStart: Dayjs,
): ForwardPassResult {
  const earlyDates = new Map<string, { earlyStart: Dayjs; earlyFinish: Dayjs }>();
  const warnings: ScheduleWarning[] = [];

  for (const taskId of sortedTaskIds) {
    const task = taskMap.get(taskId);
    if (!task || task.type === TaskType.Summary) continue;

    const cal = (task.calendarId && calendarMap.get(task.calendarId)) || defaultCalendar;
    const addWM = (d: Dayjs, m: number) => addWorkingMinutes(d, m, cal);
    const subWM = (d: Dayjs, m: number) => subtractWorkingMinutes(d, m, cal);

    let earlyStart = projectStart;

    // Process all predecessor constraints
    const incomingDeps = depsBySuccessor.get(taskId) ?? [];
    for (const dep of incomingDeps) {
      const predDates = earlyDates.get(dep.fromTaskId);
      if (!predDates) continue;

      const predCal =
        (taskMap.get(dep.fromTaskId)?.calendarId &&
          calendarMap.get(taskMap.get(dep.fromTaskId)!.calendarId!)) ||
        defaultCalendar;

      let depDate: Dayjs;

      switch (dep.type) {
        case DependencyType.FS:
          // Successor can start after predecessor finishes + lag
          depDate =
            dep.lagMinutes !== 0
              ? addWorkingMinutes(predDates.earlyFinish, dep.lagMinutes, predCal)
              : predDates.earlyFinish;
          if (depDate.isAfter(earlyStart)) earlyStart = depDate;
          break;

        case DependencyType.SS:
          // Successor can start after predecessor starts + lag
          depDate =
            dep.lagMinutes !== 0
              ? addWorkingMinutes(predDates.earlyStart, dep.lagMinutes, predCal)
              : predDates.earlyStart;
          if (depDate.isAfter(earlyStart)) earlyStart = depDate;
          break;

        case DependencyType.FF:
          // Successor finish >= predecessor finish + lag
          // So successor earlyStart = predecessorEarlyFinish + lag - duration
          depDate =
            dep.lagMinutes !== 0
              ? addWorkingMinutes(predDates.earlyFinish, dep.lagMinutes, predCal)
              : predDates.earlyFinish;
          const ffStart = subWM(depDate, task.durationMinutes);
          if (ffStart.isAfter(earlyStart)) earlyStart = ffStart;
          break;

        case DependencyType.SF:
          // Successor finish >= predecessor start + lag
          depDate =
            dep.lagMinutes !== 0
              ? addWorkingMinutes(predDates.earlyStart, dep.lagMinutes, predCal)
              : predDates.earlyStart;
          const sfStart = subWM(depDate, task.durationMinutes);
          if (sfStart.isAfter(earlyStart)) earlyStart = sfStart;
          break;
      }
    }

    // Compute early finish from early start + duration
    let earlyFinish =
      task.type === TaskType.Milestone
        ? earlyStart
        : addWM(earlyStart, task.durationMinutes);

    // Apply constraints
    const constraintResult = applyConstraintForwardPass(
      taskId,
      task.constraintType,
      task.constraintDate,
      earlyStart,
      earlyFinish,
      task.durationMinutes,
      addWM,
      subWM,
    );

    earlyStart = constraintResult.earlyStart;
    earlyFinish = constraintResult.earlyFinish;
    warnings.push(...constraintResult.warnings);

    // For manually scheduled tasks, honour the task's own dates
    if (task.isManuallyScheduled) {
      earlyStart = dayjs.utc(task.start);
      earlyFinish = dayjs.utc(task.finish);
    }

    earlyDates.set(taskId, { earlyStart, earlyFinish });
  }

  return { earlyDates, warnings };
}

/**
 * Summary task rollup.
 *
 * Summary tasks derive their dates from their children (bottom-up):
 * - start = min(children.start)
 * - finish = max(children.finish)
 * - duration = working minutes between start and finish
 * - percentComplete = weighted average by child duration
 */

import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { TaskType, type Calendar, type Task } from '../types.js';
import { getWorkingMinutesBetween } from '../calendar/workingTime.js';

dayjs.extend(utc);

/**
 * Perform bottom-up summary rollup on all tasks.
 * Mutates the tasks array in place.
 *
 * @param tasks All tasks (including summaries).
 * @param calendarMap Calendar lookup.
 * @param defaultCalendar Fallback calendar.
 */
export function rollupSummaryTasks(
  tasks: Task[],
  calendarMap: Map<string, Calendar>,
  defaultCalendar: Calendar,
): void {
  // Build parent → children map
  const childrenMap = new Map<string, Task[]>();
  const taskById = new Map<string, Task>();

  for (const t of tasks) {
    taskById.set(t.id, t);
    if (t.parentId) {
      const children = childrenMap.get(t.parentId) ?? [];
      children.push(t);
      childrenMap.set(t.parentId, children);
    }
  }

  // Process bottom-up: sort by outline level descending so deepest summaries first
  const summaries = tasks
    .filter((t) => t.type === TaskType.Summary)
    .sort((a, b) => b.outlineLevel - a.outlineLevel);

  for (const summary of summaries) {
    const children = childrenMap.get(summary.id);
    if (!children || children.length === 0) continue;

    const cal =
      (summary.calendarId && calendarMap.get(summary.calendarId)) ||
      defaultCalendar;

    let minStart: Dayjs | null = null;
    let maxFinish: Dayjs | null = null;
    let totalWeightedPercent = 0;
    let totalDuration = 0;

    for (const child of children) {
      const childStart = dayjs.utc(child.start);
      const childFinish = dayjs.utc(child.finish);

      if (!minStart || childStart.isBefore(minStart)) minStart = childStart;
      if (!maxFinish || childFinish.isAfter(maxFinish)) maxFinish = childFinish;

      totalWeightedPercent += child.percentComplete * child.durationMinutes;
      totalDuration += child.durationMinutes;
    }

    if (minStart && maxFinish) {
      summary.start = minStart.toISOString();
      summary.finish = maxFinish.toISOString();
      summary.durationMinutes = getWorkingMinutesBetween(
        minStart,
        maxFinish,
        cal,
      );
      summary.earlyStart = minStart.toISOString();
      summary.earlyFinish = maxFinish.toISOString();
    }

    summary.percentComplete =
      totalDuration > 0
        ? Math.round(totalWeightedPercent / totalDuration)
        : 0;
  }
}

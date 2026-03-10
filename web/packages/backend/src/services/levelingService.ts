/**
 * Resource leveling service — resolves over-allocation by delaying tasks.
 *
 * Uses a priority-based serial leveling algorithm:
 * 1. Build a time-phased resource usage profile
 * 2. Find periods where a resource is over-allocated
 * 3. Delay lower-priority tasks to remove over-allocations
 * 4. Persist leveling delays back to assignments
 * 5. Trigger a recalculation
 *
 * Priority: Total Slack (ascending), then sort order.
 */

import { prisma } from '../db.js';
import { recalculateProject } from './schedulingService.js';

interface LevelingResult {
  delayedTasks: { taskId: string; taskName: string; delayMinutes: number }[];
  overAllocatedResources: string[];
}

/**
 * Level resources for a project by delaying over-allocated tasks.
 */
export async function levelResources(projectId: string): Promise<LevelingResult> {
  const [tasks, assignments, resources] = await Promise.all([
    prisma.task.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.assignment.findMany({
      where: { task: { projectId } },
      include: { task: true, resource: true },
    }),
    prisma.resource.findMany({
      where: { projectId, type: 'work' },
    }),
  ]);

  const result: LevelingResult = {
    delayedTasks: [],
    overAllocatedResources: [],
  };

  // Group assignments by resource
  const assignmentsByResource = new Map<string, typeof assignments>();
  for (const a of assignments) {
    if (!a.resource || a.resource.type !== 'work') continue;
    const list = assignmentsByResource.get(a.resourceId) ?? [];
    list.push(a);
    assignmentsByResource.set(a.resourceId, list);
  }

  const MINUTES_PER_DAY = 480; // 8 hours

  for (const resource of resources) {
    const resAssignments = assignmentsByResource.get(resource.id);
    if (!resAssignments || resAssignments.length <= 1) continue;

    const maxUnits = resource.maxUnits / 100; // Convert from % to decimal

    // Sort by priority: tasks with less slack should be scheduled first (higher priority)
    // Lower slack = higher priority = remains in place
    const sorted = [...resAssignments].sort((a, b) => {
      const slackA = a.task.totalSlackMinutes;
      const slackB = b.task.totalSlackMinutes;
      if (slackA !== slackB) return slackA - slackB; // less slack = higher priority
      return a.task.sortOrder - b.task.sortOrder;
    });

    // Track occupied time slots per resource (simplified day-level)
    // Each entry: { start: dayIndex, end: dayIndex, units: number }
    const projectStart = Math.min(
      ...sorted.map((a) => a.task.start.getTime()),
    );

    interface TimeSlot {
      taskId: string;
      startDay: number;
      endDay: number;
      units: number;
    }

    const scheduledSlots: TimeSlot[] = [];
    // Pre-computed daily usage map for O(1) lookups
    const dailyUsage = new Map<number, number>();
    let overAllocated = false;

    const addSlotUsage = (slot: TimeSlot) => {
      for (let d = slot.startDay; d < slot.endDay; d++) {
        dailyUsage.set(d, (dailyUsage.get(d) ?? 0) + slot.units);
      }
    };

    const removeSlotUsage = (slot: TimeSlot) => {
      for (let d = slot.startDay; d < slot.endDay; d++) {
        const val = (dailyUsage.get(d) ?? 0) - slot.units;
        if (val <= 0) dailyUsage.delete(d);
        else dailyUsage.set(d, val);
      }
    };

    for (const assignment of sorted) {
      const taskStartDay = Math.floor(
        (assignment.task.start.getTime() - projectStart) / (MINUTES_PER_DAY * 60000),
      );
      const taskDurationDays = Math.max(
        1,
        Math.ceil(assignment.task.durationMinutes / MINUTES_PER_DAY),
      );
      const taskEndDay = taskStartDay + taskDurationDays;
      const units = assignment.units;

      // Check for over-allocation on each day
      let needsDelay = false;
      for (let day = taskStartDay; day < taskEndDay; day++) {
        const dayUse = dailyUsage.get(day) ?? 0;

        if (dayUse + units > maxUnits) {
          needsDelay = true;
          overAllocated = true;
          break;
        }
      }

      if (needsDelay) {
        // Find the earliest day we can schedule this task without over-allocation
        let candidate = taskStartDay;
        let found = false;

        for (let attempt = 0; attempt < 365; attempt++) {
          let fits = true;
          for (let day = candidate; day < candidate + taskDurationDays; day++) {
            const dayUse = dailyUsage.get(day) ?? 0;

            if (dayUse + units > maxUnits) {
              fits = false;
              candidate = day + 1; // Try starting after this conflicting day
              break;
            }
          }
          if (fits) {
            found = true;
            break;
          }
        }

        if (found && candidate > taskStartDay) {
          const delayDays = candidate - taskStartDay;
          const delayMinutes = delayDays * MINUTES_PER_DAY;

          // Record the delay
          result.delayedTasks.push({
            taskId: assignment.taskId,
            taskName: assignment.task.name,
            delayMinutes,
          });

          // Update the assignment's leveling delay
          await prisma.assignment.update({
            where: { id: assignment.id },
            data: { delay: delayMinutes },
          });

          // Also shift the task start/finish by the delay
          const newStart = new Date(
            assignment.task.start.getTime() + delayMinutes * 60000,
          );
          const newFinish = new Date(
            assignment.task.finish.getTime() + delayMinutes * 60000,
          );
          await prisma.task.update({
            where: { id: assignment.taskId },
            data: { start: newStart, finish: newFinish },
          });

          // Slot with the delay applied
          const delayedSlot: TimeSlot = {
            taskId: assignment.taskId,
            startDay: candidate,
            endDay: candidate + taskDurationDays,
            units,
          };
          scheduledSlots.push(delayedSlot);
          addSlotUsage(delayedSlot);
        } else {
          // Couldn't resolve — schedule as-is
          const asIsSlot: TimeSlot = {
            taskId: assignment.taskId,
            startDay: taskStartDay,
            endDay: taskEndDay,
            units,
          };
          scheduledSlots.push(asIsSlot);
          addSlotUsage(asIsSlot);
        }
      } else {
        const normalSlot: TimeSlot = {
          taskId: assignment.taskId,
          startDay: taskStartDay,
          endDay: taskEndDay,
          units,
        };
        scheduledSlots.push(normalSlot);
        addSlotUsage(normalSlot);
      }
    }

    if (overAllocated) {
      result.overAllocatedResources.push(resource.name);
    }
  }

  // Recalculate to propagate delays through the schedule
  if (result.delayedTasks.length > 0) {
    await recalculateProject(projectId);
  }

  return result;
}

/**
 * Clear all leveling delays for a project.
 */
export async function clearLeveling(projectId: string): Promise<void> {
  await prisma.assignment.updateMany({
    where: { task: { projectId } },
    data: { delay: 0 },
  });
  await recalculateProject(projectId);
}

/**
 * MSPDI XML exporter.
 *
 * Serializes internal ProjectData to valid MSPDI XML
 * compatible with Microsoft Project 2010+.
 */

import { XMLBuilder } from 'fast-xml-parser';
import type {
  Assignment,
  Baseline,
  Calendar,
  Dependency,
  ProjectData,
  Resource,
  Task,
} from '@schedulesync/engine';
import { TaskType, ScheduleFrom } from '@schedulesync/engine';
import { minutesToDuration, lagToMspdi } from './durationConverter.js';
import {
  constraintTypeToMspdi,
  dayOfWeekToMspdi,
  dependencyTypeToMspdi,
  resourceTypeToMspdi,
} from './fieldMapping.js';

/** Extract UID integer from our string IDs like "task-123". */
function extractUid(id: string): number {
  const match = id.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Export ProjectData to MSPDI XML string.
 */
export function exportMspdi(project: ProjectData): string {
  const xmlObj: Record<string, unknown> = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8', '@_standalone': 'yes' },
    Project: {
      '@_xmlns': 'http://schemas.microsoft.com/project',
      SaveVersion: 14,
      Name: project.settings.name,
      StartDate: project.settings.startDate,
      FinishDate: project.settings.finishDate ?? project.settings.startDate,
      ScheduleFromStart: project.settings.scheduleFrom === ScheduleFrom.Start ? 1 : 0,
      CalendarUID: project.settings.defaultCalendarId,
      StatusDate: project.settings.statusDate ?? '',
      Calendars: {
        Calendar: project.calendars.map(buildCalendarXml),
      },
      Tasks: {
        Task: buildTasksXml(project.tasks, project.dependencies, project.baselines),
      },
      Resources: {
        Resource: project.resources.map(buildResourceXml),
      },
      Assignments: {
        Assignment: project.assignments.map(buildAssignmentXml),
      },
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    suppressEmptyNode: true,
  });

  return builder.build(xmlObj);
}

function buildCalendarXml(cal: Calendar): Record<string, unknown> {
  const weekDays: Record<string, unknown>[] = [];
  for (let i = 0; i < 7; i++) {
    weekDays.push({
      DayType: dayOfWeekToMspdi(i),
      DayWorking: cal.workingDaysOfWeek[i] ? 1 : 0,
    });
  }

  const exceptions: Record<string, unknown>[] = cal.exceptions.map((ex) => ({
    TimePeriod: {
      FromDate: ex.startDate,
      ToDate: ex.endDate,
    },
    DayWorking: ex.isWorking ? 1 : 0,
    WorkingTimes: ex.workingHours
      ? {
          WorkingTime: ex.workingHours.map((wh) => ({
            FromTime: `1900-01-01T${wh.startTime}:00`,
            ToTime: `1900-01-01T${wh.endTime}:00`,
          })),
        }
      : undefined,
  }));

  return {
    UID: cal.id,
    Name: cal.name,
    WeekDays: { WeekDay: weekDays },
    Exceptions: exceptions.length > 0 ? { Exception: exceptions } : undefined,
  };
}

function buildTasksXml(
  tasks: Task[],
  dependencies: Dependency[],
  baselines: Baseline[],
): Record<string, unknown>[] {
  // Group dependencies by successor task
  const depsBySuccessor = new Map<string, Dependency[]>();
  for (const dep of dependencies) {
    const arr = depsBySuccessor.get(dep.toTaskId) ?? [];
    arr.push(dep);
    depsBySuccessor.set(dep.toTaskId, arr);
  }

  // Group baselines by task
  const baselinesByTask = new Map<string, Baseline[]>();
  for (const bl of baselines) {
    const arr = baselinesByTask.get(bl.taskId) ?? [];
    arr.push(bl);
    baselinesByTask.set(bl.taskId, arr);
  }

  // Add the project summary task (UID 0)
  const result: Record<string, unknown>[] = [
    {
      UID: 0,
      ID: 0,
      Name: 'Project Summary',
      OutlineLevel: 0,
      Summary: 1,
    },
  ];

  for (const task of tasks) {
    const uid = extractUid(task.id);
    const taskXml: Record<string, unknown> = {
      UID: uid,
      ID: task.sortOrder,
      Name: task.name,
      WBS: task.wbsCode,
      OutlineLevel: task.outlineLevel,
      Start: task.start,
      Finish: task.finish,
      Duration: minutesToDuration(task.durationMinutes),
      PercentComplete: task.percentComplete,
      Summary: task.type === TaskType.Summary ? 1 : 0,
      Milestone: task.type === TaskType.Milestone ? 1 : 0,
      Manual: task.isManuallyScheduled ? 1 : 0,
      Critical: task.isCritical ? 1 : 0,
      ConstraintType: constraintTypeToMspdi(task.constraintType),
      ConstraintDate: task.constraintDate ?? '',
      Deadline: task.deadline ?? '',
      Notes: task.notes || undefined,
      CalendarUID: task.calendarId ?? undefined,
      EarlyStart: task.earlyStart ?? '',
      EarlyFinish: task.earlyFinish ?? '',
      LateStart: task.lateStart ?? '',
      LateFinish: task.lateFinish ?? '',
    };

    // Predecessor links
    const deps = depsBySuccessor.get(task.id) ?? [];
    if (deps.length > 0) {
      taskXml.PredecessorLink = deps.map((dep) => ({
        PredecessorUID: extractUid(dep.fromTaskId),
        Type: dependencyTypeToMspdi(dep.type),
        LinkLag: lagToMspdi(dep.lagMinutes),
        LagFormat: 7, // 7 = elapsed minutes
      }));
    }

    // Baselines
    const bls = baselinesByTask.get(task.id) ?? [];
    if (bls.length > 0) {
      taskXml.Baseline = bls.map((bl) => ({
        Number: bl.baselineIndex,
        Start: bl.baselineStart,
        Finish: bl.baselineFinish,
        Duration: minutesToDuration(bl.baselineDurationMinutes),
      }));
    }

    result.push(taskXml);
  }

  return result;
}

function buildResourceXml(res: Resource): Record<string, unknown> {
  return {
    UID: extractUid(res.id),
    Name: res.name,
    Type: resourceTypeToMspdi(res.type),
    MaxUnits: res.maxUnits,
    CalendarUID: res.calendarId ?? undefined,
  };
}

function buildAssignmentXml(asgn: Assignment): Record<string, unknown> {
  return {
    UID: extractUid(asgn.id),
    TaskUID: extractUid(asgn.taskId),
    ResourceUID: extractUid(asgn.resourceId),
    Units: asgn.units,
    Work: minutesToDuration(asgn.workMinutes),
  };
}

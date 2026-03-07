/**
 * MSPDI XML importer.
 *
 * Parses Microsoft Project XML Data Interchange (MSPDI) files
 * and maps them to the internal ProjectData model.
 */

import { XMLParser } from 'fast-xml-parser';
import type {
  Assignment,
  Baseline,
  Calendar,
  CalendarException,
  Dependency,
  ProjectData,
  ProjectSettings,
  Resource,
  Task,
  WorkingHourRange,
} from '@schedulesync/engine';
import {
  ScheduleFrom,
} from '@schedulesync/engine';
import { durationToMinutes, lagFromMspdi } from './durationConverter.js';
import {
  determineTaskType,
  mspdiConstraintType,
  mspdiDayOfWeek,
  mspdiDependencyType,
  mspdiResourceType,
} from './fieldMapping.js';

/** Ensure value is always an array. */
function ensureArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function str(val: unknown): string {
  if (val == null) return '';
  return String(val);
}

function num(val: unknown, fallback = 0): number {
  if (val == null) return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function bool(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === 'boolean') return val;
  return val === 1 || val === '1' || val === 'true';
}

function dateStr(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Import an MSPDI XML string into a ProjectData structure.
 */
export function importMspdi(xml: string): ProjectData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: true,
    isArray: (tagName: string) => {
      // Force these to always be arrays
      return [
        'Task', 'Resource', 'Assignment', 'Calendar',
        'WeekDay', 'Exception', 'TimePeriod', 'WorkingTime',
        'PredecessorLink', 'Baseline',
      ].includes(tagName);
    },
  });

  const doc = parser.parse(xml);
  const project = doc.Project ?? doc;

  // -- Project settings ---------------------------------------------------
  const settings: ProjectSettings = {
    id: str(project.UID ?? `proj-${Date.now().toString(36)}`),
    name: str(project.Name ?? 'Imported Project'),
    startDate: dateStr(project.StartDate) ?? new Date().toISOString(),
    finishDate: dateStr(project.FinishDate),
    defaultCalendarId: str(project.CalendarUID ?? '__default__'),
    scheduleFrom:
      num(project.ScheduleFromStart, 1) === 1
        ? ScheduleFrom.Start
        : ScheduleFrom.Finish,
    statusDate: dateStr(project.StatusDate),
  };

  // -- Calendars ----------------------------------------------------------
  const calendars: Calendar[] = [];
  const rawCalendars = ensureArray(project.Calendars?.Calendar);

  for (const rawCal of rawCalendars) {
    const workingDays = [false, false, false, false, false, false, false];
    const defaultHours: WorkingHourRange[] = [
      { startTime: '08:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ];

    const weekDays = ensureArray(rawCal.WeekDays?.WeekDay);
    for (const wd of weekDays) {
      const dayType = num(wd.DayType);
      if (dayType >= 1 && dayType <= 7) {
        const dayIndex = mspdiDayOfWeek(dayType);
        workingDays[dayIndex] = bool(wd.DayWorking);
      }
    }

    const exceptions: CalendarException[] = [];
    const rawExceptions = ensureArray(rawCal.Exceptions?.Exception);
    for (const rawEx of rawExceptions) {
      const tp = rawEx.TimePeriod;
      if (tp) {
        const startDate = dateStr(tp.FromDate);
        const endDate = dateStr(tp.ToDate);
        if (startDate && endDate) {
          const workingHrs: WorkingHourRange[] = [];
          const rawTimes = ensureArray(rawEx.WorkingTimes?.WorkingTime);
          for (const wt of rawTimes) {
            if (wt.FromTime && wt.ToTime) {
              workingHrs.push({
                startTime: str(wt.FromTime).substring(11, 16),
                endTime: str(wt.ToTime).substring(11, 16),
              });
            }
          }
          exceptions.push({
            startDate: startDate.substring(0, 10),
            endDate: endDate.substring(0, 10),
            isWorking: bool(rawEx.DayWorking),
            workingHours: workingHrs.length > 0 ? workingHrs : null,
          });
        }
      }
    }

    calendars.push({
      id: str(rawCal.UID),
      name: str(rawCal.Name ?? `Calendar ${rawCal.UID}`),
      workingDaysOfWeek: workingDays,
      defaultWorkingHours: defaultHours,
      exceptions,
    });
  }

  // -- Tasks --------------------------------------------------------------
  const tasks: Task[] = [];
  const dependencies: Dependency[] = [];
  const baselines: Baseline[] = [];
  const rawTasks = ensureArray(project.Tasks?.Task);

  // Build UID → id mapping for tasks (UID is MSPDI's integer, id is our string)
  const uidToId = new Map<number, string>();

  // First pass: create task objects
  for (const rawTask of rawTasks) {
    const uid = num(rawTask.UID);
    // UID 0 is the project summary — skip
    if (uid === 0) continue;

    const id = `task-${uid}`;
    uidToId.set(uid, id);

    const isSummary = bool(rawTask.Summary);
    const isMilestone = bool(rawTask.Milestone);
    const duration = durationToMinutes(str(rawTask.Duration ?? 'PT0H0M0S'));

    const task: Task = {
      id,
      wbsCode: str(rawTask.WBS ?? ''),
      outlineLevel: num(rawTask.OutlineLevel, 1),
      parentId: null, // set in second pass
      name: str(rawTask.Name ?? ''),
      type: determineTaskType(isSummary, isMilestone),
      durationMinutes: duration,
      start: dateStr(rawTask.Start) ?? settings.startDate,
      finish: dateStr(rawTask.Finish) ?? settings.startDate,
      constraintType: mspdiConstraintType(num(rawTask.ConstraintType, 0)),
      constraintDate: dateStr(rawTask.ConstraintDate),
      calendarId: rawTask.CalendarUID != null ? str(rawTask.CalendarUID) : null,
      percentComplete: num(rawTask.PercentComplete, 0),
      isManuallyScheduled: bool(rawTask.Manual),
      isCritical: bool(rawTask.Critical),
      totalSlackMinutes: 0,
      freeSlackMinutes: 0,
      earlyStart: dateStr(rawTask.EarlyStart),
      earlyFinish: dateStr(rawTask.EarlyFinish),
      lateStart: dateStr(rawTask.LateStart),
      lateFinish: dateStr(rawTask.LateFinish),
      deadline: dateStr(rawTask.Deadline),
      notes: str(rawTask.Notes ?? ''),
      externalKey: null,
      sortOrder: num(rawTask.ID, 0),
    };

    tasks.push(task);

    // Predecessor links → dependencies
    const predLinks = ensureArray(rawTask.PredecessorLink);
    for (const link of predLinks) {
      const predUid = num(link.PredecessorUID);
      dependencies.push({
        id: `dep-${uid}-${predUid}`,
        fromTaskId: `task-${predUid}`,
        toTaskId: id,
        type: mspdiDependencyType(num(link.Type, 1)),
        lagMinutes: lagFromMspdi(num(link.LinkLag, 0)),
      });
    }

    // Baselines
    const rawBaselines = ensureArray(rawTask.Baseline);
    for (const bl of rawBaselines) {
      const bStart = dateStr(bl.Start);
      const bFinish = dateStr(bl.Finish);
      if (bStart && bFinish) {
        baselines.push({
          taskId: id,
          baselineIndex: num(bl.Number, 0),
          baselineStart: bStart,
          baselineFinish: bFinish,
          baselineDurationMinutes: durationToMinutes(str(bl.Duration ?? 'PT0H0M0S')),
        });
      }
    }
  }

  // Second pass: set parentId based on outline level
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (task.outlineLevel <= 1) continue;
    // Walk backwards to find the nearest task with outlineLevel = this.outlineLevel - 1
    for (let j = i - 1; j >= 0; j--) {
      if (tasks[j].outlineLevel === task.outlineLevel - 1) {
        task.parentId = tasks[j].id;
        break;
      }
    }
  }

  // -- Resources ----------------------------------------------------------
  const resources: Resource[] = [];
  const rawResources = ensureArray(project.Resources?.Resource);
  const ruidToId = new Map<number, string>();

  for (const rawRes of rawResources) {
    const uid = num(rawRes.UID);
    if (uid === 0) continue; // UID 0 = unassigned

    const id = `res-${uid}`;
    ruidToId.set(uid, id);

    resources.push({
      id,
      name: str(rawRes.Name ?? ''),
      type: mspdiResourceType(num(rawRes.Type, 1)),
      maxUnits: num(rawRes.MaxUnits, 1),
      calendarId: rawRes.CalendarUID != null ? str(rawRes.CalendarUID) : null,
    });
  }

  // -- Assignments --------------------------------------------------------
  const assignments: Assignment[] = [];
  const rawAssignments = ensureArray(project.Assignments?.Assignment);

  for (const rawAsgn of rawAssignments) {
    const taskUid = num(rawAsgn.TaskUID);
    const resUid = num(rawAsgn.ResourceUID);
    const taskId = uidToId.get(taskUid);
    const resId = ruidToId.get(resUid);
    if (!taskId || !resId) continue;

    assignments.push({
      id: `asgn-${num(rawAsgn.UID)}`,
      taskId,
      resourceId: resId,
      units: num(rawAsgn.Units, 1),
      workMinutes: durationToMinutes(str(rawAsgn.Work ?? 'PT0H0M0S')),
    });
  }

  return {
    settings,
    tasks,
    dependencies,
    calendars,
    resources,
    assignments,
    baselines,
  };
}

/**
 * MSPDI field mapping tables.
 *
 * Maps between MSPDI XML element names and internal model properties.
 */

import { ConstraintType, DependencyType, ResourceType, TaskType } from '@schedulesync/engine';

/**
 * MSPDI dependency type values:
 * 0 = FF, 1 = FS, 2 = SF, 3 = SS
 */
export function mspdiDependencyType(mspdiType: number): DependencyType {
  switch (mspdiType) {
    case 0: return DependencyType.FF;
    case 1: return DependencyType.FS;
    case 2: return DependencyType.SF;
    case 3: return DependencyType.SS;
    default: return DependencyType.FS;
  }
}

export function dependencyTypeToMspdi(type: DependencyType): number {
  switch (type) {
    case DependencyType.FF: return 0;
    case DependencyType.FS: return 1;
    case DependencyType.SF: return 2;
    case DependencyType.SS: return 3;
  }
}

/** MSPDI constraint type int → our ConstraintType enum. Values match directly. */
export function mspdiConstraintType(mspdiType: number): ConstraintType {
  if (mspdiType >= 0 && mspdiType <= 7) return mspdiType as ConstraintType;
  return ConstraintType.ASAP;
}

export function constraintTypeToMspdi(type: ConstraintType): number {
  return type as number;
}

/** MSPDI resource type: 0 = Material, 1 = Work */
export function mspdiResourceType(mspdiType: number): ResourceType {
  return mspdiType === 0 ? ResourceType.Material : ResourceType.Work;
}

export function resourceTypeToMspdi(type: ResourceType): number {
  return type === ResourceType.Material ? 0 : 1;
}

/**
 * Determine task type from MSPDI task element attributes.
 */
export function determineTaskType(
  summary: boolean,
  milestone: boolean,
): TaskType {
  if (summary) return TaskType.Summary;
  if (milestone) return TaskType.Milestone;
  return TaskType.Task;
}

/**
 * Map MSPDI weekday DayType to day-of-week index (0=Sun..6=Sat).
 * MSPDI: 1=Sunday, 2=Monday, ... 7=Saturday
 */
export function mspdiDayOfWeek(dayType: number): number {
  return (dayType - 1) % 7;
}

export function dayOfWeekToMspdi(dayIndex: number): number {
  return dayIndex + 1;
}

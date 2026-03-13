import { describe, expect, it } from "vitest";
import type {
  ProjectSnapshotResponse,
  StratusStatusProgressMapping,
} from "../api/client";
import {
  applyOptimisticStatusRemap,
  diffChangedStatusIds,
} from "./useSaveStratusSettingsMutation";

function createSnapshot(): ProjectSnapshotResponse {
  return {
    detailLevel: "full",
    revision: 4,
    project: {
      id: "project-1",
      name: "Project 1",
      revision: 4,
      startDate: "2026-03-12T00:00:00.000Z",
      finishDate: null,
      defaultCalendarId: "__default__",
      scheduleFrom: "start",
      statusDate: null,
      stratusLocalMetadataVersion: 1,
      projectType: null,
      sector: null,
      region: null,
      stratusProjectId: null,
      stratusModelId: null,
      stratusPackageWhere: null,
      stratusLastPullAt: null,
      stratusLastPushAt: null,
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
    },
    taskBounds: {
      start: "2026-03-12T00:00:00.000Z",
      finish: "2026-03-13T00:00:00.000Z",
    },
    tasks: [
      {
        id: "package-task",
        detailLevel: "full",
        projectId: "project-1",
        wbsCode: "1",
        outlineLevel: 0,
        parentId: null,
        name: "Package Task",
        type: "task",
        durationMinutes: 480,
        start: "2026-03-12T00:00:00.000Z",
        finish: "2026-03-13T00:00:00.000Z",
        constraintType: 0,
        constraintDate: null,
        calendarId: null,
        percentComplete: 25,
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
        sortOrder: 0,
        stratusSync: null,
        stratusStatus: {
          sourceType: "package",
          trackingStatusId: "status-a",
          trackingStatusName: "Ready",
        },
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
      },
      {
        id: "assembly-task",
        detailLevel: "full",
        projectId: "project-1",
        wbsCode: "1.1",
        outlineLevel: 1,
        parentId: "package-task",
        name: "Assembly Task",
        type: "task",
        durationMinutes: 480,
        start: "2026-03-12T00:00:00.000Z",
        finish: "2026-03-13T00:00:00.000Z",
        constraintType: 0,
        constraintDate: null,
        calendarId: null,
        percentComplete: 50,
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
        sortOrder: 1,
        stratusSync: null,
        stratusStatus: {
          sourceType: "assembly",
          trackingStatusId: "status-b",
          trackingStatusName: "Fab",
        },
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
      },
      {
        id: "plain-task",
        detailLevel: "full",
        projectId: "project-1",
        wbsCode: "2",
        outlineLevel: 0,
        parentId: null,
        name: "Plain Task",
        type: "task",
        durationMinutes: 480,
        start: "2026-03-12T00:00:00.000Z",
        finish: "2026-03-13T00:00:00.000Z",
        constraintType: 0,
        constraintDate: null,
        calendarId: null,
        percentComplete: 10,
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
        sortOrder: 2,
        stratusSync: null,
        stratusStatus: null,
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
      },
    ],
    dependencies: [],
    resources: [],
    assignments: [],
  };
}

describe("useSaveStratusSettingsMutation helpers", () => {
  it("treats null and zero status mappings as equivalent when diffing", () => {
    const previousMappings: StratusStatusProgressMapping[] = [
      {
        statusId: "status-a",
        statusName: "Ready",
        percentCompleteShop: null,
      },
    ];
    const nextMappings: StratusStatusProgressMapping[] = [
      {
        statusId: "status-a",
        statusName: "Ready",
        percentCompleteShop: 0,
      },
    ];

    expect(diffChangedStatusIds(previousMappings, nextMappings)).toEqual([]);
  });

  it("optimistically remaps package and assembly tasks by trackingStatusId", () => {
    const nextSnapshot = applyOptimisticStatusRemap(
      createSnapshot(),
      {
        stratusProjectId: "stratus-project-1",
        stratusModelId: "model-9",
        stratusPackageWhere: "Status = 'Ready'",
      },
      ["status-a", "status-b"],
      [
        {
          statusId: "status-a",
          statusName: "Ready",
          percentCompleteShop: 100,
        },
        {
          statusId: "status-b",
          statusName: "Fab",
          percentCompleteShop: null,
        },
      ],
      true,
    );

    expect(nextSnapshot.project.stratusProjectId).toBe("stratus-project-1");
    expect(nextSnapshot.project.stratusModelId).toBe("model-9");
    expect(nextSnapshot.project.stratusPackageWhere).toBe(
      "Status = 'Ready'",
    );
    expect(nextSnapshot.tasks.find((task) => task.id === "package-task"))
      .toMatchObject({ percentComplete: 100 });
    expect(nextSnapshot.tasks.find((task) => task.id === "assembly-task"))
      .toMatchObject({ percentComplete: 0 });
    expect(nextSnapshot.tasks.find((task) => task.id === "plain-task"))
      .toMatchObject({ percentComplete: 10 });
  });

  it("keeps task percent complete unchanged for legacy optimistic saves", () => {
    const snapshot = createSnapshot();
    const nextSnapshot = applyOptimisticStatusRemap(
      snapshot,
      {
        stratusProjectId: "stratus-project-1",
        stratusModelId: null,
        stratusPackageWhere: null,
      },
      ["status-a"],
      [
        {
          statusId: "status-a",
          statusName: "Ready",
          percentCompleteShop: 100,
        },
      ],
      false,
    );

    expect(nextSnapshot.tasks.find((task) => task.id === "package-task"))
      .toMatchObject({ percentComplete: 25 });
  });
});

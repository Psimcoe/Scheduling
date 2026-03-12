import { describe, expect, it } from "vitest";
import {
  buildProjectImportPreviewRows,
  buildPullPreviewRows,
  buildPushPreviewRows,
  buildRefreshFromPrefabPreviewRows,
  buildSyncToPrefabPreviewRows,
} from "./stratusSyncService.js";
import { normalizeStratusConfig } from "./stratusConfig.js";

describe("stratusSyncService", () => {
  it("marks active Stratus projects for create, update, or skip", () => {
    const rows = buildProjectImportPreviewRows(
      [
        {
          id: "stratus-1",
          number: "1001",
          name: "Warehouse Expansion",
          status: "Active",
          category: "Industrial",
          phase: "Prefab",
          description: null,
          city: "Boston",
          state: "MA",
          startDate: "2026-03-01T00:00:00.000Z",
          finishDate: "2026-04-01T00:00:00.000Z",
          rawProject: {},
        },
        {
          id: "stratus-2",
          number: "1002",
          name: "Hospital Tower",
          status: "Active",
          category: "Healthcare",
          phase: "Field",
          description: null,
          city: "Chicago",
          state: "IL",
          startDate: "2026-05-01T00:00:00.000Z",
          finishDate: "2026-07-01T00:00:00.000Z",
          rawProject: {},
        },
      ],
      [
        {
          id: "local-1",
          name: "1001 - Warehouse Expansion",
          startDate: new Date("2026-03-01T00:00:00.000Z"),
          finishDate: new Date("2026-04-01T00:00:00.000Z"),
          minutesPerDay: 480,
          projectType: "Industrial",
          sector: "Prefab",
          region: "Boston, MA",
          stratusProjectId: "stratus-1",
        },
        {
          id: "local-2",
          name: "Old Name",
          startDate: new Date("2026-05-01T00:00:00.000Z"),
          finishDate: new Date("2026-06-01T00:00:00.000Z"),
          minutesPerDay: 480,
          projectType: "Healthcare",
          sector: "Field",
          region: "Chicago, IL",
          stratusProjectId: "stratus-2",
        },
      ],
    );

    expect(rows[0]?.action).toBe("skip");
    expect(rows[1]?.action).toBe("update");
    expect(rows[1]?.mappedProject.name).toBe("1002 - Hospital Tower");
  });

  it("allows manual exclusion of specific Stratus projects from import preview", () => {
    const rows = buildProjectImportPreviewRows(
      [
        {
          id: "stratus-1",
          number: "1001",
          name: "Warehouse Expansion",
          status: "Active",
          category: "Industrial",
          phase: "Prefab",
          description: null,
          city: "Boston",
          state: "MA",
          startDate: "2026-03-01T00:00:00.000Z",
          finishDate: "2026-04-01T00:00:00.000Z",
          rawProject: {},
        },
      ],
      [],
      ["stratus-1"],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("exclude");
    expect(rows[0]?.warnings).toContain(
      "Excluded from import by manual override.",
    );
  });

  it("marks missing local Stratus projects as create in import preview", () => {
    const rows = buildProjectImportPreviewRows(
      [
        {
          id: "stratus-create-1",
          number: "2001",
          name: "New Stratus Project",
          status: "Active",
          category: "Industrial",
          phase: "Prefab",
          description: null,
          city: "Nashville",
          state: "TN",
          startDate: "2026-06-01T00:00:00.000Z",
          finishDate: "2026-07-01T00:00:00.000Z",
          rawProject: {},
        },
      ],
      [],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("create");
    expect(rows[0]?.localProjectId).toBeNull();
    expect(rows[0]?.localProjectName).toBeNull();
  });

  it("skips package pull rows when external key matching is ambiguous and groups assemblies under packages", () => {
    const rows = buildPullPreviewRows(
      [
        {
          package: {
            id: "pkg-1",
            projectId: "stratus-project",
            modelId: "model-1",
            packageNumber: "PKG-1",
            packageName: "Package 1",
            trackingStatusId: "track-1",
            trackingStatusName: "Ready to Ship",
            externalKey: "1001-PKG-1",
            normalizedFields: {
              "STRATUS.Package.Name": "Package 1",
              "STRATUS.Package.Description": "Desc",
              "STRATUS.Package.Notes": "Notes",
              "STRATUS.Package.TrackingStatus": "Ready to Ship",
              "STRATUS.Package.Status": "Ready to Ship",
              "STRATUS.Field.SMC_Overview Days Estimate_Not Editable": "2",
              "STRATUS.Field.SMC_Package Start Date":
                "2026-03-01T00:00:00.000Z",
              "STRATUS.Field.SMC_Package Estimated Finish Date":
                "2026-03-03T00:00:00.000Z",
              "STRATUS.Package.RequiredDT": "2026-03-04T00:00:00.000Z",
            },
            rawPackage: {},
          },
          assemblies: [
            {
              id: "asm-1",
              packageId: "pkg-1",
              projectId: "stratus-project",
              modelId: "model-1",
              name: "Assembly A",
              externalKey: "1001-PKG-1::assembly:asm-1",
              trackingStatusId: "track-1",
              trackingStatusName: "Ready to Ship",
              notes: "Assembly note",
              rawAssembly: {},
            },
          ],
        },
      ],
      [
        {
          id: "task-1",
          name: "Task A",
          externalKey: "1001-PKG-1",
          parentId: null,
          sortOrder: 0,
          stratusSync: null,
        },
        {
          id: "task-2",
          name: "Task B",
          externalKey: "1001-PKG-1",
          parentId: null,
          sortOrder: 1,
          stratusSync: null,
        },
      ],
      480,
      normalizeStratusConfig(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("skip");
    expect(rows[0]?.warnings[0]).toContain("matches multiple tasks");
    expect(rows[0]?.assemblyCount).toBe(1);
    expect(rows[0]?.assemblyRows[0]?.action).toBe("skip");
  });

  it("maps package preview data from configured package name, days-first duration, and seeded shop percent complete", () => {
    const rows = buildPullPreviewRows(
      [
        {
          package: {
            id: "pkg-2",
            projectId: "stratus-project",
            modelId: "model-1",
            packageNumber: "PKG-2",
            packageName: "Package Name From Package",
            trackingStatusId: "da06d2b6-a9fa-45cf-82bc-bcdd83705ac1",
            trackingStatusName: "Fabrication in Progress",
            externalKey: "1001-PKG-2",
            normalizedFields: {
              "STRATUS.Package.Name": "Package Name From Package",
              "STRATUS.Field.Project Name Override": "Override Name",
              "STRATUS.Field.SMC_Overview Days Estimate_Not Editable": "2",
              "STRATUS.Field.PREFAB ESTIMATED BUILD TIME": "5",
              "STRATUS.Field.SMC_Package Start Date":
                "2026-03-10T00:00:00.000Z",
              "STRATUS.Field.SMC_Package Estimated Finish Date":
                "2026-03-12T00:00:00.000Z",
              "STRATUS.Package.RequiredDT": "2026-03-13T00:00:00.000Z",
              "STRATUS.Package.Description": "Desc",
              "STRATUS.Package.Notes": "Notes",
              "STRATUS.Package.TrackingStatus": "Fabrication in Progress",
            },
            rawPackage: {},
          },
          assemblies: [],
        },
      ],
      [],
      480,
      normalizeStratusConfig(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.mappedTask.name).toBe("Package Name From Package");
    expect(rows[0]?.mappedTask.durationMinutes).toBe(960);
    expect(rows[0]?.mappedTask.percentComplete).toBe(50);
  });

  it("resolves aliased finish and duration fields and derives the preview start from them", () => {
    const projectStart = new Date("2026-07-01T18:00:00.000Z");
    const rows = buildPullPreviewRows(
      [
        {
          package: {
            id: "pkg-alias-preview",
            projectId: "stratus-project",
            modelId: "model-1",
            packageNumber: "PKG-ALIAS",
            packageName: "Package Alias",
            trackingStatusId: null,
            trackingStatusName: null,
            externalKey: "1001-PKG-ALIAS",
            normalizedFields: {
              "STRATUS.Package.Name": "Package Alias",
              "STRATUS.Field.SMC_Package Start Date": null,
              "STRATUS.Field.SMC_Package Estimated Finish Date": null,
              "STRATUS.Field.PREFAB ESTIMATED BUILD TIME": null,
              "SMC_Package Estimated Finish Date":
                "2026-03-12T00:00:00.000Z",
              "SMC_Overview Hours Estimate": "16",
            },
            rawPackage: {
              fieldNameToValueMap: {
                "SMC_Package Estimated Finish Date":
                  "2026-03-12T00:00:00.000Z",
                "SMC_Overview Hours Estimate": "16",
              },
            },
          },
          assemblies: [],
        },
      ],
      [],
      480,
      normalizeStratusConfig(),
      projectStart,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.mappedTask.durationMinutes).toBe(960);
    expect(rows[0]?.mappedTask.finish).toBe("2026-03-12T00:00:00.000Z");
    expect(rows[0]?.mappedTask.start).toBe("2026-03-11T08:00:00.000Z");
    expect(rows[0]?.mappedTask.start).not.toBe(projectStart.toISOString());
  });

  it("marks unchanged incremental bundles as skipped without remote assembly updates", () => {
    const rows = buildPullPreviewRows(
      [
        {
          package: {
            id: "pkg-unchanged",
            projectId: "stratus-project",
            modelId: "model-1",
            packageNumber: "PKG-UNCHANGED",
            packageName: "Package Unchanged",
            trackingStatusId: "track-1",
            trackingStatusName: "Ready to Ship",
            externalKey: "1001-PKG-UNCHANGED",
            normalizedFields: {
              "STRATUS.Package.Name": "Package Unchanged",
              "STRATUS.Field.SMC_Package Start Date":
                "2026-03-01T00:00:00.000Z",
              "STRATUS.Field.SMC_Package Estimated Finish Date":
                "2026-03-02T00:00:00.000Z",
            },
            assemblyIds: ["asm-1"],
            rawPackage: {},
          },
          assemblies: [
            {
              id: "asm-1",
              packageId: "pkg-unchanged",
              projectId: "stratus-project",
              modelId: "model-1",
              name: "Assembly Local",
              externalKey: "1001-PKG-UNCHANGED::assembly:asm-1",
              trackingStatusId: null,
              trackingStatusName: null,
              notes: "",
              rawAssembly: {},
            },
          ],
          syncMeta: {
            unchanged: true,
            skippedReason: "Package unchanged since last pull.",
            localHierarchy: {
              packageTask: {
                id: "task-package",
                name: "Package Unchanged",
                externalKey: "1001-PKG-UNCHANGED",
                parentId: null,
                start: new Date("2026-03-01T00:00:00.000Z"),
                finish: new Date("2026-03-02T00:00:00.000Z"),
                deadline: null,
                durationMinutes: 480,
                percentComplete: 99,
                notes: "No changes",
                sortOrder: 0,
                stratusSync: null,
              },
              assemblyTasks: [
                {
                  id: "task-assembly",
                  name: "Assembly Local",
                  externalKey: "1001-PKG-UNCHANGED::assembly:asm-1",
                  parentId: "task-package",
                  start: new Date("2026-03-01T00:00:00.000Z"),
                  finish: new Date("2026-03-02T00:00:00.000Z"),
                  deadline: null,
                  durationMinutes: 480,
                  percentComplete: 99,
                  notes: "No changes",
                  sortOrder: 1,
                  stratusSync: null,
                },
              ],
            },
          },
        },
      ],
      [],
      480,
      normalizeStratusConfig(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("skip");
    expect(rows[0]?.taskId).toBe("task-package");
    expect(rows[0]?.warnings).toContain("Package unchanged since last pull.");
    expect(rows[0]?.assemblyRows[0]?.action).toBe("skip");
    expect(rows[0]?.assemblyRows[0]?.taskId).toBe("task-assembly");
  });

  it("keeps missing local package hierarchies actionable during pull preview", () => {
    const rows = buildPullPreviewRows(
      [
        {
          package: {
            id: "pkg-missing-local",
            projectId: "stratus-project",
            modelId: "model-1",
            packageNumber: "PKG-MISSING",
            packageName: "Missing Local Package",
            trackingStatusId: "track-1",
            trackingStatusName: "Ready to Ship",
            externalKey: "1001-PKG-MISSING",
            normalizedFields: {
              "STRATUS.Package.Name": "Missing Local Package",
              "STRATUS.Field.SMC_Package Start Date":
                "2026-03-01T00:00:00.000Z",
              "STRATUS.Field.SMC_Package Estimated Finish Date":
                "2026-03-02T00:00:00.000Z",
            },
            assemblyIds: ["asm-1"],
            rawPackage: {},
          },
          assemblies: [
            {
              id: "asm-1",
              packageId: "pkg-missing-local",
              projectId: "stratus-project",
              modelId: "model-1",
              name: "Assembly A",
              externalKey: "1001-PKG-MISSING::assembly:asm-1",
              trackingStatusId: null,
              trackingStatusName: null,
              notes: "",
              rawAssembly: {},
            },
          ],
          syncMeta: {
            unchanged: false,
            skippedReason: "Package task does not exist locally yet.",
            localHierarchy: null,
          },
        },
      ],
      [],
      480,
      normalizeStratusConfig(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("create");
    expect(rows[0]?.matchStrategy).toBe("none");
    expect(rows[0]?.assemblyRows[0]?.action).toBe("create");
  });

  it("prefers SQL-native shop percent complete values over seeded status mappings when available", () => {
    const rows = buildPullPreviewRows(
      [
        {
          package: {
            id: "pkg-sql-progress",
            projectId: "stratus-project",
            modelId: "model-1",
            packageNumber: "PKG-SQL",
            packageName: "Package SQL",
            trackingStatusId: "2664fb00-cec1-49d9-b3c1-6c4873a190f7",
            trackingStatusName: "New Item",
            percentCompleteShop: 73,
            externalKey: "1001-PKG-SQL",
            normalizedFields: {
              "STRATUS.Package.Name": "Package SQL",
            },
            rawPackage: {},
          },
          assemblies: [],
        },
      ],
      [],
      480,
      normalizeStratusConfig(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.mappedTask.percentComplete).toBe(73);
  });

  it("uses the configured task name field for package tasks", () => {
    const rows = buildPullPreviewRows(
      [
        {
          package: {
            id: "pkg-project-name",
            projectId: "stratus-project",
            modelId: "model-1",
            packageNumber: "PKG-7",
            packageName: "Package Seven",
            trackingStatusId: null,
            trackingStatusName: null,
            externalKey: "1001-PKG-7",
            normalizedFields: {
              "STRATUS.Package.Name": "Package Seven",
              "STRATUS.Field.Project Name Override": "Warehouse Expansion",
            },
            rawPackage: {},
          },
          assemblies: [],
        },
      ],
      [],
      480,
      normalizeStratusConfig({
        taskNameField: "STRATUS.Field.Project Name Override",
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.mappedTask.name).toBe("Warehouse Expansion");
  });

  it("falls back to the package name when the configured task name field is blank", () => {
    const rows = buildPullPreviewRows(
      [
        {
          package: {
            id: "pkg-task-name-fallback",
            projectId: "stratus-project",
            modelId: "model-1",
            packageNumber: "PKG-8",
            packageName: "Package Eight",
            trackingStatusId: null,
            trackingStatusName: null,
            externalKey: "1001-PKG-8",
            normalizedFields: {
              "STRATUS.Package.Name": "Package Eight",
              "STRATUS.Field.Project Name Override": "   ",
            },
            rawPackage: {},
          },
          assemblies: [],
        },
      ],
      [],
      480,
      normalizeStratusConfig({
        taskNameField: "STRATUS.Field.Project Name Override",
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.mappedTask.name).toBe("Package Eight");
  });

  it("supports an Undefined Package placeholder with only assembly children", () => {
    const rows = buildPullPreviewRows(
      [
        {
          package: {
            id: "stratus-undefined-package:stratus-project-1",
            projectId: "stratus-project-1",
            modelId: null,
            packageNumber: "Undefined Package",
            packageName: "Undefined Package",
            trackingStatusId: null,
            trackingStatusName: null,
            externalKey: "stratus-undefined-package:stratus-project-1",
            normalizedFields: {
              "STRATUS.Package.Name": "Undefined Package",
              "STRATUS.Package.Number": "Undefined Package",
            },
            rawPackage: {},
          },
          assemblies: [
            {
              id: "asm-orphan-1",
              packageId: "stratus-undefined-package:stratus-project-1",
              projectId: "stratus-project-1",
              modelId: "model-1",
              name: "Assembly Without Package",
              externalKey:
                "stratus-undefined-package:stratus-project-1::assembly:asm-orphan-1",
              trackingStatusId: null,
              trackingStatusName: null,
              notes: "",
              rawAssembly: {},
            },
          ],
        },
      ],
      [],
      480,
      normalizeStratusConfig(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.mappedTask.name).toBe("Undefined Package");
    expect(rows[0]?.assemblyCount).toBe(1);
    expect(rows[0]?.assemblyRows[0]?.mappedTask.name).toBe(
      "Assembly Without Package",
    );
  });

  it("keeps push preview actions limited to push or skip", () => {
    const linkedTask = {
      id: "task-1",
      projectId: "project-1",
      parentId: null,
      wbsCode: "",
      outlineLevel: 0,
      name: "Linked package task",
      type: "summary",
      durationMinutes: 960,
      start: new Date("2026-03-05T00:00:00.000Z"),
      finish: new Date("2026-03-07T00:00:00.000Z"),
      constraintType: 0,
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
      deadline: new Date("2026-03-08T00:00:00.000Z"),
      notes: "",
      externalKey: "1001-PKG-1",
      sortOrder: 0,
      actualStart: null,
      actualFinish: null,
      actualDurationMinutes: 0,
      actualWork: 0,
      actualCost: 0,
      remainingDuration: 0,
      remainingWork: 0,
      remainingCost: 0,
      fixedCost: 0,
      fixedCostAccrual: "prorated",
      cost: 0,
      work: 0,
      taskMode: "fixedUnits",
      isEffortDriven: false,
      isActive: true,
      bcws: 0,
      bcwp: 0,
      acwp: 0,
      physicalPercentComplete: 0,
      sv: 0,
      cv: 0,
      spi: 0,
      cpi: 0,
      eac: 0,
      vac: 0,
      isSplit: false,
      isRecurring: false,
      recurringPattern: null,
      hyperlink: "",
      hyperlinkAddress: "",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      stratusSync: {
        id: "sync-1",
        taskId: "task-1",
        localProjectId: "project-1",
        packageId: "pkg-1",
        projectId: "stratus-project-1",
        modelId: "model-1",
        externalKey: "1001-PKG-1",
        packageNumber: "PKG-1",
        packageName: "Package 1",
        trackingStatusId: "track-1",
        trackingStatusName: "Ready to Ship",
        rawPackageJson: "{}",
        lastPulledAt: new Date("2026-03-01T00:00:00.000Z"),
        lastPushedAt: null,
        syncedStartSignature: "2026-03-01",
        syncedFinishSignature: "2026-03-03",
        syncedDeadlineSignature: "2026-03-08",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    };

    const rows = buildPushPreviewRows([
      linkedTask,
      {
        ...linkedTask,
        id: "task-2",
        name: "Local only task",
        externalKey: "local-only-task",
        stratusSync: null,
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.action === "push" || row.action === "skip")).toBe(true);
    expect(rows[0]?.action).toBe("push");
    expect(rows[0]?.changes).toEqual([
      { field: "start", from: "2026-03-01", to: "2026-03-05" },
      { field: "finish", from: "2026-03-03", to: "2026-03-07" },
    ]);
    expect(rows[1]?.action).toBe("skip");
  });

  it("builds sync-to-prefab preview rows for changed package reference tasks only", () => {
    const rows = buildSyncToPrefabPreviewRows(
      [
        {
          id: "source-package",
          projectId: "project-1",
          parentId: null,
          wbsCode: "",
          outlineLevel: 0,
          name: "Package Ref",
          type: "summary",
          durationMinutes: 960,
          start: new Date("2026-03-05T00:00:00.000Z"),
          finish: new Date("2026-03-06T00:00:00.000Z"),
          constraintType: 0,
          constraintDate: null,
          calendarId: null,
          percentComplete: 0,
          isManuallyScheduled: true,
          isCritical: false,
          totalSlackMinutes: 0,
          freeSlackMinutes: 0,
          earlyStart: null,
          earlyFinish: null,
          lateStart: null,
          lateFinish: null,
          deadline: new Date("2026-03-07T00:00:00.000Z"),
          notes: "Reference source: Prefab (PKG-1)",
          externalKey: "PKG-1",
          sortOrder: 0,
          actualStart: null,
          actualFinish: null,
          actualDurationMinutes: 0,
          actualWork: 0,
          actualCost: 0,
          remainingDuration: 0,
          remainingWork: 0,
          remainingCost: 0,
          fixedCost: 0,
          fixedCostAccrual: "prorated",
          cost: 0,
          work: 0,
          taskMode: "fixedUnits",
          isEffortDriven: false,
          isActive: true,
          bcws: 0,
          bcwp: 0,
          acwp: 0,
          physicalPercentComplete: 0,
          sv: 0,
          cv: 0,
          spi: 0,
          cpi: 0,
          eac: 0,
          vac: 0,
          isSplit: false,
          isRecurring: false,
          recurringPattern: null,
          hyperlink: "",
          hyperlinkAddress: "",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          stratusSync: null,
        },
        {
          id: "source-assembly",
          projectId: "project-1",
          parentId: "source-package",
          wbsCode: "",
          outlineLevel: 1,
          name: "Assembly Ref",
          type: "task",
          durationMinutes: 480,
          start: new Date("2026-03-05T00:00:00.000Z"),
          finish: new Date("2026-03-06T00:00:00.000Z"),
          constraintType: 0,
          constraintDate: null,
          calendarId: null,
          percentComplete: 0,
          isManuallyScheduled: true,
          isCritical: false,
          totalSlackMinutes: 0,
          freeSlackMinutes: 0,
          earlyStart: null,
          earlyFinish: null,
          lateStart: null,
          lateFinish: null,
          deadline: null,
          notes: "",
          externalKey: "PKG-1::assembly:asm-1",
          sortOrder: 1,
          actualStart: null,
          actualFinish: null,
          actualDurationMinutes: 0,
          actualWork: 0,
          actualCost: 0,
          remainingDuration: 0,
          remainingWork: 0,
          remainingCost: 0,
          fixedCost: 0,
          fixedCostAccrual: "prorated",
          cost: 0,
          work: 0,
          taskMode: "fixedUnits",
          isEffortDriven: false,
          isActive: true,
          bcws: 0,
          bcwp: 0,
          acwp: 0,
          physicalPercentComplete: 0,
          sv: 0,
          cv: 0,
          spi: 0,
          cpi: 0,
          eac: 0,
          vac: 0,
          isSplit: false,
          isRecurring: false,
          recurringPattern: null,
          hyperlink: "",
          hyperlinkAddress: "",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          stratusSync: null,
        },
      ],
      [
        {
          id: "prefab-package",
          projectId: "prefab",
          parentId: "project-summary",
          wbsCode: "",
          outlineLevel: 1,
          name: "Package Canonical",
          type: "summary",
          durationMinutes: 480,
          start: new Date("2026-03-01T00:00:00.000Z"),
          finish: new Date("2026-03-02T00:00:00.000Z"),
          constraintType: 0,
          constraintDate: null,
          calendarId: null,
          percentComplete: 0,
          isManuallyScheduled: true,
          isCritical: false,
          totalSlackMinutes: 0,
          freeSlackMinutes: 0,
          earlyStart: null,
          earlyFinish: null,
          lateStart: null,
          lateFinish: null,
          deadline: new Date("2026-03-03T00:00:00.000Z"),
          notes: "",
          externalKey: "PKG-1",
          sortOrder: 0,
          actualStart: null,
          actualFinish: null,
          actualDurationMinutes: 0,
          actualWork: 0,
          actualCost: 0,
          remainingDuration: 0,
          remainingWork: 0,
          remainingCost: 0,
          fixedCost: 0,
          fixedCostAccrual: "prorated",
          cost: 0,
          work: 0,
          taskMode: "fixedUnits",
          isEffortDriven: false,
          isActive: true,
          bcws: 0,
          bcwp: 0,
          acwp: 0,
          physicalPercentComplete: 0,
          sv: 0,
          cv: 0,
          spi: 0,
          cpi: 0,
          eac: 0,
          vac: 0,
          isSplit: false,
          isRecurring: false,
          recurringPattern: null,
          hyperlink: "",
          hyperlinkAddress: "",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          stratusSync: {
            id: "sync-1",
            taskId: "prefab-package",
            localProjectId: "prefab",
            packageId: "package-1",
            projectId: "stratus-project-1",
            modelId: "model-1",
            externalKey: "PKG-1",
            packageNumber: "PKG-1",
            packageName: "Package Canonical",
            trackingStatusId: "track-1",
            trackingStatusName: "Active",
            rawPackageJson: "{}",
            lastPulledAt: new Date("2026-03-01T00:00:00.000Z"),
            lastPushedAt: null,
            syncedStartSignature: "2026-03-01",
            syncedFinishSignature: "2026-03-02",
            syncedDeadlineSignature: "2026-03-03",
            createdAt: new Date("2026-03-01T00:00:00.000Z"),
            updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          },
        },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("sync");
    expect(rows[0]?.prefabTaskId).toBe("prefab-package");
    expect(rows[0]?.changes).toEqual([
      {
        field: "start",
        from: "2026-03-01T00:00:00.000Z",
        to: "2026-03-05T00:00:00.000Z",
      },
      {
        field: "finish",
        from: "2026-03-02T00:00:00.000Z",
        to: "2026-03-06T00:00:00.000Z",
      },
      {
        field: "deadline",
        from: "2026-03-03T00:00:00.000Z",
        to: "2026-03-07T00:00:00.000Z",
      },
      {
        field: "duration",
        from: 480,
        to: 960,
      },
    ]);
  });

  it("builds refresh-from-prefab preview rows for changed reference tasks only", () => {
    const rows = buildRefreshFromPrefabPreviewRows(
      [
        {
          id: "source-package",
          projectId: "project-1",
          parentId: null,
          wbsCode: "",
          outlineLevel: 0,
          name: "Package Ref",
          type: "summary",
          durationMinutes: 960,
          start: new Date("2026-03-05T00:00:00.000Z"),
          finish: new Date("2026-03-06T00:00:00.000Z"),
          constraintType: 0,
          constraintDate: null,
          calendarId: null,
          percentComplete: 0,
          isManuallyScheduled: true,
          isCritical: false,
          totalSlackMinutes: 0,
          freeSlackMinutes: 0,
          earlyStart: null,
          earlyFinish: null,
          lateStart: null,
          lateFinish: null,
          deadline: new Date("2026-03-07T00:00:00.000Z"),
          notes: "Reference source: Prefab (PKG-1)",
          externalKey: "PKG-1",
          sortOrder: 0,
          actualStart: null,
          actualFinish: null,
          actualDurationMinutes: 0,
          actualWork: 0,
          actualCost: 0,
          remainingDuration: 0,
          remainingWork: 0,
          remainingCost: 0,
          fixedCost: 0,
          fixedCostAccrual: "prorated",
          cost: 0,
          work: 0,
          taskMode: "fixedUnits",
          isEffortDriven: false,
          isActive: true,
          bcws: 0,
          bcwp: 0,
          acwp: 0,
          physicalPercentComplete: 0,
          sv: 0,
          cv: 0,
          spi: 0,
          cpi: 0,
          eac: 0,
          vac: 0,
          isSplit: false,
          isRecurring: false,
          recurringPattern: null,
          hyperlink: "",
          hyperlinkAddress: "",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          stratusSync: null,
        },
      ],
      [
        {
          id: "prefab-package",
          projectId: "prefab",
          parentId: "project-summary",
          wbsCode: "",
          outlineLevel: 1,
          name: "Package Canonical",
          type: "summary",
          durationMinutes: 480,
          start: new Date("2026-03-01T00:00:00.000Z"),
          finish: new Date("2026-03-02T00:00:00.000Z"),
          constraintType: 0,
          constraintDate: null,
          calendarId: null,
          percentComplete: 0,
          isManuallyScheduled: true,
          isCritical: false,
          totalSlackMinutes: 0,
          freeSlackMinutes: 0,
          earlyStart: null,
          earlyFinish: null,
          lateStart: null,
          lateFinish: null,
          deadline: new Date("2026-03-03T00:00:00.000Z"),
          notes: "",
          externalKey: "PKG-1",
          sortOrder: 0,
          actualStart: null,
          actualFinish: null,
          actualDurationMinutes: 0,
          actualWork: 0,
          actualCost: 0,
          remainingDuration: 0,
          remainingWork: 0,
          remainingCost: 0,
          fixedCost: 0,
          fixedCostAccrual: "prorated",
          cost: 0,
          work: 0,
          taskMode: "fixedUnits",
          isEffortDriven: false,
          isActive: true,
          bcws: 0,
          bcwp: 0,
          acwp: 0,
          physicalPercentComplete: 0,
          sv: 0,
          cv: 0,
          spi: 0,
          cpi: 0,
          eac: 0,
          vac: 0,
          isSplit: false,
          isRecurring: false,
          recurringPattern: null,
          hyperlink: "",
          hyperlinkAddress: "",
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          stratusSync: {
            id: "sync-1",
            taskId: "prefab-package",
            localProjectId: "prefab",
            packageId: "package-1",
            projectId: "stratus-project-1",
            modelId: "model-1",
            externalKey: "PKG-1",
            packageNumber: "PKG-1",
            packageName: "Package Canonical",
            trackingStatusId: "track-1",
            trackingStatusName: "Active",
            rawPackageJson: "{}",
            lastPulledAt: new Date("2026-03-01T00:00:00.000Z"),
            lastPushedAt: null,
            syncedStartSignature: "2026-03-01",
            syncedFinishSignature: "2026-03-02",
            syncedDeadlineSignature: "2026-03-03",
            createdAt: new Date("2026-03-01T00:00:00.000Z"),
            updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          },
        },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("refresh");
    expect(rows[0]?.prefabTaskId).toBe("prefab-package");
    expect(rows[0]?.changes).toEqual([
      {
        field: "start",
        from: "2026-03-05T00:00:00.000Z",
        to: "2026-03-01T00:00:00.000Z",
      },
      {
        field: "finish",
        from: "2026-03-06T00:00:00.000Z",
        to: "2026-03-02T00:00:00.000Z",
      },
      {
        field: "deadline",
        from: "2026-03-07T00:00:00.000Z",
        to: "2026-03-03T00:00:00.000Z",
      },
      {
        field: "duration",
        from: 960,
        to: 480,
      },
    ]);
  });
});

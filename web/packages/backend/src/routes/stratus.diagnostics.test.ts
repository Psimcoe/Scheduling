import { afterEach, describe, expect, it, vi } from "vitest";
import { runSeedUpgradePull } from "./stratus.js";
import {
  clearDevDiagnosticsEntriesForTests,
  listDevDiagnosticsEntries,
} from "../services/devDiagnosticsService.js";

describe("stratus diagnostics", () => {
  afterEach(() => {
    clearDevDiagnosticsEntriesForTests();
    vi.restoreAllMocks();
  });

  it("records legacy seed-upgrade start and success entries", async () => {
    const reportProgress = vi.fn();
    const pullResult = {
      rows: [],
      sourceInfo: {
        source: "stratusApi" as const,
        fallbackUsed: false,
        message: null,
        warnings: [],
        freshness: null,
        trackingStart: null,
        packageReportName: null,
        assemblyReportName: null,
        isFullRebuild: null,
      },
      summary: {
        processed: 2,
        created: 1,
        updated: 1,
        skipped: 0,
        failed: 0,
        totalAssemblies: 1,
        createdAssemblies: 1,
        updatedAssemblies: 0,
        skippedAssemblies: 0,
        failedAssemblies: 0,
      },
      meta: {
        skippedUnchangedPackages: 0,
        undefinedPackageCount: 0,
        orphanAssemblyCount: 0,
        durationMs: 42,
      },
    };

    const applyStratusPull = vi.fn(async (_projectId, _config, options) => {
      options?.progress?.({
        phase: "loadingPackages",
        message: "Loading Stratus packages.",
        processedPackages: 0,
        totalPackages: 2,
        processedAssemblies: 0,
        totalAssemblies: 0,
        skippedUnchangedPackages: 0,
        source: "stratusApi",
      });
      return pullResult;
    });

    await expect(
      runSeedUpgradePull("project-1", "job-1", reportProgress, {
        captureUndo: vi.fn(async () => undefined),
        applyStratusPull,
        finalizePullApplyLogging: vi.fn(async () => undefined),
        notifyCurrentProjectRevision: vi.fn(async () => 1),
        getStratusConfig: vi.fn(() => ({} as never)),
      }),
    ).resolves.toEqual(pullResult);

    expect(reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Legacy seed upgrade. Loading Stratus packages.",
      }),
    );

    const logs = listDevDiagnosticsEntries({
      projectId: "project-1",
      limit: 10,
    }).filter((entry) => entry.type === "seedUpgrade");
    expect(logs.map((entry) => entry.message)).toEqual([
      "Legacy seed upgrade completed.",
      "Legacy seed upgrade started.",
    ]);
    expect(logs[0]?.details).toMatchObject({
      jobId: "job-1",
      summary: pullResult.summary,
    });
  });

  it("records legacy seed-upgrade failures", async () => {
    const reportProgress = vi.fn();

    await expect(
      runSeedUpgradePull("project-2", "job-2", reportProgress, {
        captureUndo: vi.fn(async () => undefined),
        applyStratusPull: vi.fn(async () => {
          throw new Error("seed failed");
        }),
        finalizePullApplyLogging: vi.fn(async () => undefined),
        notifyCurrentProjectRevision: vi.fn(async () => 1),
        getStratusConfig: vi.fn(() => ({} as never)),
      }),
    ).rejects.toThrow("seed failed");

    const logs = listDevDiagnosticsEntries({
      projectId: "project-2",
      limit: 10,
    }).filter((entry) => entry.type === "seedUpgrade");
    expect(logs.map((entry) => entry.message)).toEqual([
      "Legacy seed upgrade failed.",
      "Legacy seed upgrade started.",
    ]);
    expect(logs[0]?.details).toMatchObject({
      jobId: "job-2",
      error: "seed failed",
    });
  });
});

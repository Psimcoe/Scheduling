import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDevDiagnosticsEntriesForTests,
  listDevDiagnosticsEntries,
} from "./devDiagnosticsService.js";
import {
  clearStratusJobsForTests,
  createStratusJob,
  getStratusJob,
} from "./stratusJobService.js";

describe("stratusJobService", () => {
  afterEach(() => {
    clearStratusJobsForTests();
    clearDevDiagnosticsEntriesForTests();
  });

  it("creates, updates, and completes a Stratus job", async () => {
    const job = createStratusJob("pullPreview", async (reportProgress) => {
      reportProgress({
        phase: "loadingPackages",
        processedPackages: 2,
        totalPackages: 4,
        source: "stratusApi",
      });
      return { ok: true };
    });

    await vi.waitFor(() => {
      expect(getStratusJob(job.id)?.status).toBe("succeeded");
    });

    const storedJob = getStratusJob(job.id);
    expect(storedJob?.progress.phase).toBe("loadingPackages");
    expect(storedJob?.progress.processedPackages).toBe(2);
    expect(storedJob?.progress.source).toBe("stratusApi");
    expect(storedJob?.result).toEqual({ ok: true });

    const logs = listDevDiagnosticsEntries({ limit: 10 });
    expect(logs.filter((entry) => entry.type === "job")).toHaveLength(3);
    expect(logs.find((entry) => entry.type === "progress")).toMatchObject({
      message: "Stratus job pullPreview entered loadingPackages.",
      details: expect.objectContaining({
        jobId: job.id,
        phase: "loadingPackages",
      }),
    });
  });

  it("captures job failures", async () => {
    const job = createStratusJob("pullApply", async () => {
      throw new Error("boom");
    });

    await vi.waitFor(() => {
      expect(getStratusJob(job.id)?.status).toBe("failed");
    });

    expect(getStratusJob(job.id)?.error).toBe("boom");
    expect(
      listDevDiagnosticsEntries({ limit: 10 }).find(
        (entry) => entry.type === "job" && entry.level === "error",
      ),
    ).toMatchObject({
      message: "Stratus job failed: pullApply.",
      details: expect.objectContaining({
        jobId: job.id,
        error: "boom",
      }),
    });
  });

  it("reuses the active single-flight job for the same key", async () => {
    let releaseRunner: () => void = () => undefined;
    const runner = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          releaseRunner = () => resolve({ ok: true });
        }),
    );

    const firstJob = createStratusJob("pullApply", runner, {
      singleFlightKey: "pull:project-1:full",
    });
    const secondJob = createStratusJob("pullApply", runner, {
      singleFlightKey: "pull:project-1:full",
    });

    expect(secondJob.id).toBe(firstJob.id);
    await vi.waitFor(() => {
      expect(runner).toHaveBeenCalledTimes(1);
    });

    releaseRunner();
    await vi.waitFor(() => {
      expect(getStratusJob(firstJob.id)?.status).toBe("succeeded");
    });

    const thirdJob = createStratusJob(
      "pullApply",
      async () => ({ ok: true }),
      {
        singleFlightKey: "pull:project-1:full",
      },
    );

    expect(thirdJob.id).not.toBe(firstJob.id);
  });

  it("records progress entries only when phase or message changes", async () => {
    const job = createStratusJob("pullApply", async (reportProgress) => {
      reportProgress({
        phase: "loadingPackages",
        message: "Loading packages.",
        processedPackages: 1,
      });
      reportProgress({
        phase: "loadingPackages",
        message: "Loading packages.",
        processedPackages: 2,
      });
      reportProgress({
        phase: "loadingAssemblies",
        message: "Loading assemblies.",
        processedAssemblies: 1,
      });
      return { ok: true };
    });

    await vi.waitFor(() => {
      expect(getStratusJob(job.id)?.status).toBe("succeeded");
    });

    const progressLogs = listDevDiagnosticsEntries({ limit: 10 }).filter(
      (entry) => entry.type === "progress",
    );
    expect(progressLogs).toHaveLength(2);
    expect(progressLogs.map((entry) => entry.message)).toEqual([
      "Loading assemblies.",
      "Loading packages.",
    ]);
  });
});

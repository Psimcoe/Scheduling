import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearStratusJobsForTests,
  createStratusJob,
  getStratusJob,
} from "./stratusJobService.js";

describe("stratusJobService", () => {
  afterEach(() => {
    clearStratusJobsForTests();
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
  });

  it("captures job failures", async () => {
    const job = createStratusJob("pullApply", async () => {
      throw new Error("boom");
    });

    await vi.waitFor(() => {
      expect(getStratusJob(job.id)?.status).toBe("failed");
    });

    expect(getStratusJob(job.id)?.error).toBe("boom");
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
});

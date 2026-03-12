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
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../stores/useAuthStore";
import { projectsApi, stratusApi } from "./client";

describe("API client request headers", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.getState().reset();
    useAuthStore.getState().setCsrfToken("csrf-token-1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().reset();
  });

  it.each<readonly [string, () => Promise<unknown>]>([
    ["testConnection", () => stratusApi.testConnection()],
    ["testBigDataConnection", () => stratusApi.testBigDataConnection()],
    ["previewProjectImport", () => stratusApi.previewProjectImport()],
  ])(
    "omits Content-Type for no-body POST requests (%s)",
    async (_name, action) => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, message: "ok", rows: [], summary: {} }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      await action();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = new Headers(init?.headers);
      expect(init?.method).toBe("POST");
      expect(headers.has("Content-Type")).toBe(false);
      expect(headers.get("X-CSRF-Token")).toBe("csrf-token-1");
      expect(init?.credentials).toBe("include");
    },
  );

  it("keeps Content-Type for JSON-body requests", async () => {
    const payload = { baseUrl: "https://api.gtpstratus.com/v1" };
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          baseUrl: payload.baseUrl,
          appKeySet: false,
          companyId: "",
          importReadSource: "apiOnly",
          bigDataServer: "",
          bigDataDatabase: "",
          bigDataUsername: "",
          bigDataPasswordSet: false,
          bigDataEncrypt: false,
          bigDataTrustServerCertificate: true,
          bigDataTaskNameColumn: "",
          bigDataDurationDaysColumn: "",
          bigDataDurationHoursColumn: "",
          bigDataStartDateColumn: "",
          bigDataFinishDateColumn: "",
          bigDataDeadlineColumn: "",
          taskNameField: "STRATUS.Package.Name",
          durationDaysField:
            "STRATUS.Field.SMC_Overview Days Estimate_Not Editable",
          durationHoursField: "STRATUS.Field.PREFAB ESTIMATED BUILD TIME",
          startDateField: "STRATUS.Field.SMC_Package Start Date",
          finishDateField: "STRATUS.Field.SMC_Package Estimated Finish Date",
          deadlineField: "STRATUS.Package.RequiredDT",
          startDateFieldIdOverride: "",
          finishDateFieldIdOverride: "",
          deadlineFieldIdOverride: "",
          cachedStartDateFieldId: "",
          cachedFinishDateFieldId: "",
          cachedDeadlineFieldId: "",
          statusProgressMappings: [],
          excludedProjectIds: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await stratusApi.updateConfig(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify(payload));
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-token-1");
    expect(init?.credentials).toBe("include");
  });

  it("sends JSON bodies for Stratus job requests", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "job-1",
          kind: "pullApply",
          status: "queued",
          progress: {
            phase: "idle",
            message: null,
            processedPackages: 0,
            totalPackages: 0,
            processedAssemblies: 0,
            totalAssemblies: 0,
            skippedUnchangedPackages: 0,
            source: null,
          },
          createdAt: "2026-03-11T00:00:00.000Z",
          startedAt: null,
          finishedAt: null,
          error: null,
          result: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await stratusApi.createPullJob("project-1", {
      mode: "apply",
      refreshMode: "incremental",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(
      JSON.stringify({ mode: "apply", refreshMode: "incremental" }),
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-token-1");
  });

  it("prefers backend message over generic error field", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Stratus request failed (401): invalid app key",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(stratusApi.previewProjectImport()).rejects.toThrow(
      "Stratus request failed (401): invalid app key",
    );
  });

  it("normalizes 401 responses into ApiError and publishes the auth event", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "AUTH_REQUIRED",
          error: "Authentication is required.",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(projectsApi.list()).rejects.toMatchObject({
      status: 401,
      code: "AUTH_REQUIRED",
    });

    expect(useAuthStore.getState().lastAuthEvent).toMatchObject({
      code: "AUTH_REQUIRED",
      path: "/api/projects",
      method: "GET",
    });
    expect(useAuthStore.getState().csrfToken).toBeNull();
  });
});

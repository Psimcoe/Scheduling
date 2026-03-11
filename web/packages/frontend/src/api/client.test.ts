import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stratusApi } from "./client";

describe("API client request headers", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each<readonly [string, () => Promise<unknown>]>([
    ["testConnection", () => stratusApi.testConnection()],
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
  });
});

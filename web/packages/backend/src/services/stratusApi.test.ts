import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compute429RetryDelayMs,
  getConfiguredPackageFieldValue,
  getRequestedStratusFieldKeys,
  isImportableStratusAssemblyRecord,
  isImportableStratusPackageRecord,
  normalizeStratusAssembly,
  normalizeStratusPackage,
  normalizeStratusProject,
  resolveFieldIdsFromDefinitions,
  stratusRequestJson,
} from "./stratusApi.js";
import { normalizeStratusConfig } from "./stratusConfig.js";

describe("stratusApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("resolves company field ids from exact Stratus field names", () => {
    const config = normalizeStratusConfig();
    const result = resolveFieldIdsFromDefinitions(
      [
        {
          id: "field-start",
          name: "STRATUS.Field.SMC_Package Start Date",
          displayName: null,
        },
        {
          id: "field-finish",
          name: "STRATUS.Field.SMC_Package Estimated Finish Date",
          displayName: null,
        },
      ],
      config,
    );

    expect(result.canPush).toBe(true);
    expect(result.startFieldId).toBe("field-start");
    expect(result.finishFieldId).toBe("field-finish");
    expect(result.deadlineMode).toBe("property");
  });

  it("resolves company field ids when the STRATUS.Field prefix is omitted", () => {
    const config = normalizeStratusConfig();
    const result = resolveFieldIdsFromDefinitions(
      [
        {
          id: "field-start",
          name: "SMC_Package Start Date",
          displayName: null,
        },
        {
          id: "field-finish",
          name: "SMC_Package Estimated Finish Date",
          displayName: "Estimated Finish Date",
        },
      ],
      config,
    );

    expect(result.canPush).toBe(true);
    expect(result.startFieldId).toBe("field-start");
    expect(result.finishFieldId).toBe("field-finish");
  });

  it("resolves a custom deadline company field when configured", () => {
    const config = normalizeStratusConfig({
      deadlineField: "STRATUS.Field.Custom Deadline",
    });
    const result = resolveFieldIdsFromDefinitions(
      [
        {
          id: "field-start",
          name: "STRATUS.Field.SMC_Package Start Date",
          displayName: null,
        },
        {
          id: "field-finish",
          name: "STRATUS.Field.SMC_Package Estimated Finish Date",
          displayName: null,
        },
        {
          id: "field-deadline",
          name: "STRATUS.Field.Custom Deadline",
          displayName: null,
        },
      ],
      config,
    );

    expect(result.canPush).toBe(true);
    expect(result.deadlineMode).toBe("field");
    expect(result.deadlineFieldId).toBe("field-deadline");
  });

  it("includes configured task mapping fields in the requested field list", () => {
    const config = normalizeStratusConfig({
      durationDaysField: "STRATUS.Field.Custom Days",
      deadlineField: "STRATUS.Field.Custom Deadline",
    });

    const requested = getRequestedStratusFieldKeys(config);

    expect(requested).toContain("STRATUS.Field.Custom Days");
    expect(requested).toContain("STRATUS.Field.Custom Deadline");
    expect(requested).toContain("STRATUS.Package.Name");
  });

  it("normalizes requested Stratus package fields from top-level data and fieldNameToValueMap", () => {
    const config = normalizeStratusConfig();
    const normalized = normalizeStratusPackage(
      {
        id: "pkg-1",
        projectId: "stratus-project-1",
        modelId: "model-1",
        assemblyIds: ["asm-1", "asm-2"],
        number: "P-100",
        name: "Package 100",
        qrCodeUrl: "https://example.test/qr",
        requiredDT: "2026-03-10T00:00:00.000Z",
        startDT: "2026-03-01T00:00:00.000Z",
        statusName: "Fabrication Complete",
        currentTrackingStatusId: "track-1",
        fieldNameToValueMap: {
          "STRATUS.Field.Project Number": "1001",
          "STRATUS.Field.Project Name Override": "Override Package Name",
          "Work Days (Reference)": "4.5",
          "STRATUS.Field.SMC_Package Start Date": "2026-03-03T00:00:00.000Z",
          "STRATUS.Field.SMC_Package Estimated Finish Date":
            "2026-03-07T00:00:00.000Z",
          "STRATUS.Package.Notes": "Shop ready",
        },
      },
      config,
    );

    expect(normalized.externalKey).toBe("1001-P-100");
    expect(normalized.normalizedFields["STRATUS.Field.Project Number"]).toBe(
      "1001",
    );
    expect(normalized.normalizedFields["STRATUS.Package.QRCode"]).toContain(
      "/qr",
    );
    expect(normalized.normalizedFields["STRATUS.Package.RequiredDT"]).toBe(
      "2026-03-10T00:00:00.000Z",
    );
    expect(
      normalized.normalizedFields["STRATUS.Field.SMC_Package Start Date"],
    ).toBe("2026-03-03T00:00:00.000Z");
    expect(normalized.assemblyIds).toEqual(["asm-1", "asm-2"]);
    expect(normalized.trackingStatusId).toBe("track-1");
    expect(normalized.trackingStatusName).toBe("Fabrication Complete");
  });

  it("falls back to the Stratus project id in package external keys when project number is missing", () => {
    const config = normalizeStratusConfig();
    const normalized = normalizeStratusPackage(
      {
        id: "pkg-2",
        projectId: "stratus-project-2",
        modelId: "model-2",
        number: "1252",
        name: "Package 1252",
        fieldNameToValueMap: {},
      },
      config,
    );

    expect(normalized.externalKey).toBe("stratus-project-2-1252");
  });

  it("resolves configured package fields from equivalent Stratus aliases when exact keys are blank", () => {
    const config = normalizeStratusConfig();
    const normalized = normalizeStratusPackage(
      {
        id: "pkg-alias",
        projectId: "stratus-project-3",
        modelId: "model-3",
        number: "P-300",
        name: "Package Alias",
        fieldNameToValueMap: {
          "SMC_Package Estimated Finish Date": "2026-03-07T00:00:00.000Z",
          "SMC_Overview Hours Estimate": "55.28",
          "Work Days (Calculated)": "4",
        },
      },
      config,
    );

    expect(getConfiguredPackageFieldValue(normalized, config.finishDateField)).toBe(
      "2026-03-07T00:00:00.000Z",
    );
    expect(
      getConfiguredPackageFieldValue(normalized, config.durationHoursField),
    ).toBe("55.28");
    expect(getConfiguredPackageFieldValue(normalized, config.durationDaysField)).toBe(
      "4",
    );
    expect(normalized.normalizedFields[config.finishDateField]).toBe(
      "2026-03-07T00:00:00.000Z",
    );
    expect(normalized.normalizedFields[config.durationHoursField]).toBe("55.28");
    expect(normalized.normalizedFields[config.durationDaysField]).toBe("4");
  });

  it("normalizes Stratus project and assembly records for import and grouping", () => {
    const project = normalizeStratusProject({
      id: "proj-1",
      number: "1001",
      name: "Warehouse Expansion",
      statusName: "Active",
      category: "Industrial",
      phase: "Prefab",
      city: "Boston",
      state: "MA",
      targetStartDate: "2026-03-01T00:00:00.000Z",
      targetEndDate: "2026-04-01T00:00:00.000Z",
    });
    const assembly = normalizeStratusAssembly("pkg-1", "1001-PKG-1", {
      id: "asm-1",
      projectId: "proj-1",
      modelId: "model-1",
      nameLabel: "Assembly A",
      currentTrackingStatusId: "track-1",
      currentTrackingStatusName: "Ready to Ship",
      qrCodeUrl: "https://example.test/asm-1",
      notes: [{ text: "Assembly note" }],
    });

    expect(project.startDate).toBe("2026-03-01T00:00:00.000Z");
    expect(project.finishDate).toBe("2026-04-01T00:00:00.000Z");
    expect(assembly.externalKey).toBe("1001-PKG-1::assembly:asm-1");
    expect(assembly.trackingStatusName).toBe("Ready to Ship");
    expect(assembly.notes).toContain("Assembly note");
  });

  it("treats only active package lifecycle rows as importable", () => {
    expect(
      isImportableStratusPackageRecord({
        id: "pkg-active",
        statusName: "Active",
      }),
    ).toBe(true);
    expect(
      isImportableStratusPackageRecord({
        id: "pkg-archived",
        statusName: "Archived",
      }),
    ).toBe(false);
    expect(
      isImportableStratusPackageRecord({
        id: "pkg-fallback",
        fieldNameToValueMap: {
          "STRATUS.Package.Status": "Archived",
        },
      }),
    ).toBe(false);
  });

  it("keeps assemblies importable when lifecycle status is absent but rejects archived rows when present", () => {
    expect(
      isImportableStratusAssemblyRecord({
        id: "asm-unknown",
      }),
    ).toBe(true);
    expect(
      isImportableStratusAssemblyRecord({
        id: "asm-archived",
        fieldNameToValueMap: {
          "STRATUS.Assembly.Status": "Archived",
        },
      }),
    ).toBe(false);
  });

  it("computes capped 429 retry delays with exponential backoff and jitter", () => {
    expect(compute429RetryDelayMs(0, 1_000, 0)).toBe(2_000);
    expect(compute429RetryDelayMs(2, 10_000, 0.5)).toBe(10_125);
    expect(compute429RetryDelayMs(10, 0, 1)).toBe(30_000);
  });

  it("retries 429 responses with exponential backoff and succeeds", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(
        new Response("Rate limit exceeded.", {
          status: 429,
          headers: { "retry-after": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const config = normalizeStratusConfig({
      baseUrl: "https://api.example.test/v1",
      appKey: "app-key",
    });
    const responsePromise = stratusRequestJson<{ ok: boolean }>(
      config,
      "/v1/packages",
    );

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);

    await expect(responsePromise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces a final 429 failure after the retry cap", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response("Rate limit exceeded.", {
        status: 429,
        headers: { "retry-after": "1" },
      }),
    );

    const config = normalizeStratusConfig({
      baseUrl: "https://api.example.test/v1",
      appKey: "app-key",
    });
    const responsePromise = stratusRequestJson(config, "/v1/packages");
    const rejectionExpectation = expect(responsePromise).rejects.toThrow(
      "Stratus request failed (429): Rate limit exceeded.",
    );

    await vi.runAllTimersAsync();

    await rejectionExpectation;
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { runtimeConfig } from "../runtimeConfig.js";

export const DEFAULT_STRATUS_BASE_URL = "https://api.gtpstratus.com/v1";
export const STRATUS_TASK_NAME_FIELD_NAME = "STRATUS.Package.Name";
export const STRATUS_DURATION_DAYS_FIELD_NAME =
  "STRATUS.Field.SMC_Overview Days Estimate_Not Editable";
export const STRATUS_DURATION_HOURS_FIELD_NAME =
  "STRATUS.Field.PREFAB ESTIMATED BUILD TIME";
export const STRATUS_START_DATE_FIELD_NAME =
  "STRATUS.Field.SMC_Package Start Date";
export const STRATUS_FINISH_DATE_FIELD_NAME =
  "STRATUS.Field.SMC_Package Estimated Finish Date";
export const STRATUS_DEADLINE_FIELD_NAME = "STRATUS.Package.RequiredDT";
export const DEFAULT_STRATUS_IMPORT_READ_SOURCE = "apiOnly";

export type StratusImportReadSource = "sqlPreferred" | "apiOnly";

export interface StratusStatusProgressMapping {
  statusId: string;
  statusName: string;
  percentCompleteShop: number | null;
}

export interface StratusConfig {
  baseUrl: string;
  appKey: string;
  companyId: string;
  importReadSource: StratusImportReadSource;
  bigDataServer: string;
  bigDataDatabase: string;
  bigDataUsername: string;
  bigDataPassword: string;
  bigDataEncrypt: boolean;
  bigDataTrustServerCertificate: boolean;
  bigDataTaskNameColumn: string;
  bigDataDurationDaysColumn: string;
  bigDataDurationHoursColumn: string;
  bigDataStartDateColumn: string;
  bigDataFinishDateColumn: string;
  bigDataDeadlineColumn: string;
  taskNameField: string;
  durationDaysField: string;
  durationHoursField: string;
  startDateField: string;
  finishDateField: string;
  deadlineField: string;
  startDateFieldIdOverride: string;
  finishDateFieldIdOverride: string;
  deadlineFieldIdOverride: string;
  cachedStartDateFieldId: string;
  cachedFinishDateFieldId: string;
  cachedDeadlineFieldId: string;
  statusProgressMappings: StratusStatusProgressMapping[];
  excludedProjectIds: string[];
}

export interface SafeStratusConfig {
  baseUrl: string;
  appKeySet: boolean;
  companyId: string;
  importReadSource: StratusImportReadSource;
  bigDataServer: string;
  bigDataDatabase: string;
  bigDataUsername: string;
  bigDataPasswordSet: boolean;
  bigDataEncrypt: boolean;
  bigDataTrustServerCertificate: boolean;
  bigDataTaskNameColumn: string;
  bigDataDurationDaysColumn: string;
  bigDataDurationHoursColumn: string;
  bigDataStartDateColumn: string;
  bigDataFinishDateColumn: string;
  bigDataDeadlineColumn: string;
  taskNameField: string;
  durationDaysField: string;
  durationHoursField: string;
  startDateField: string;
  finishDateField: string;
  deadlineField: string;
  startDateFieldIdOverride: string;
  finishDateFieldIdOverride: string;
  deadlineFieldIdOverride: string;
  cachedStartDateFieldId: string;
  cachedFinishDateFieldId: string;
  cachedDeadlineFieldId: string;
  statusProgressMappings: StratusStatusProgressMapping[];
  excludedProjectIds: string[];
}

export const DEFAULT_STATUS_PROGRESS_MAPPINGS: StratusStatusProgressMapping[] =
  [
    {
      statusId: "00000000-0000-0000-0000-000000000000",
      statusName: "[Undefined]",
      percentCompleteShop: 0,
    },
    {
      statusId: "2664fb00-cec1-49d9-b3c1-6c4873a190f7",
      statusName: "New Item",
      percentCompleteShop: 0,
    },
    {
      statusId: "5a47a2e3-1ac7-4c28-84ce-552fcdc7af64",
      statusName: "Design Stage",
      percentCompleteShop: 0,
    },
    {
      statusId: "94d5bd75-57ea-401f-98f0-a82a2d285d85",
      statusName: "Design Stage-Prefab Early Planning",
      percentCompleteShop: 0,
    },
    {
      statusId: "9d98ad2d-bb4c-43ff-92b5-1f6e37a3c1a1",
      statusName: "CLASH",
      percentCompleteShop: 0,
    },
    {
      statusId: "8f37dd5f-ff5d-4b80-94da-352da827483d",
      statusName: "BIM/VDC Released to Prefab",
      percentCompleteShop: 0,
    },
    {
      statusId: "c3c1c8cd-7831-4264-acf3-baa00da8ae1d",
      statusName: "Prefab Confirmed Received From BIM/VDC",
      percentCompleteShop: 0,
    },
    {
      statusId: "65ba2108-106d-41ae-8319-08a3832150d1",
      statusName: "Spool QA/QC Complete-Ready for Assembly",
      percentCompleteShop: 0,
    },
    {
      statusId: "ceb706b9-6d58-424f-ac02-4d7d1c06906f",
      statusName: "Assembly (Spool) Confirmed",
      percentCompleteShop: 0,
    },
    {
      statusId: "7b1e2038-51a5-4167-91c5-7c88ac98537f",
      statusName: "Packages (FAB) Confirmed",
      percentCompleteShop: 0,
    },
    {
      statusId: "f2cec0dd-176d-43cf-8e31-b1cec00bb5bc",
      statusName: "Package-BOM Generated",
      percentCompleteShop: 0,
    },
    {
      statusId: "1aa68b4f-42e0-4c44-96f3-963602dac1a6",
      statusName: "Package-BOM Released for Purchasing",
      percentCompleteShop: 0,
    },
    {
      statusId: "1b70441e-2767-4c81-9142-1dc0fbf66253",
      statusName: "Package-BOM Purchased",
      percentCompleteShop: 0,
    },
    {
      statusId: "544f11e1-7e8a-429b-a14c-3a45879da3fa",
      statusName: "Package-BOM Received w/ Back Orders",
      percentCompleteShop: 0,
    },
    {
      statusId: "303103ee-5f7d-424e-ae68-651382db228d",
      statusName: "Assembly-BOM Received",
      percentCompleteShop: 0,
    },
    {
      statusId: "52ac33c1-c0cc-4f2f-926d-1c00ef764ce1",
      statusName: "Package-BOM Received No Backorders",
      percentCompleteShop: 0,
    },
    {
      statusId: "74c5223e-bdc9-4a66-9041-fe83de65e738",
      statusName: "Ready for Fab Release to Shop",
      percentCompleteShop: 0,
    },
    {
      statusId: "783eb9ea-0985-4b33-afbf-2f9ca65b6403",
      statusName: "Issued for Fabrication",
      percentCompleteShop: 10,
    },
    {
      statusId: "da06d2b6-a9fa-45cf-82bc-bcdd83705ac1",
      statusName: "Fabrication in Progress",
      percentCompleteShop: 50,
    },
    {
      statusId: "639c9b44-4211-4613-b84d-82ebb4154a1b",
      statusName: "Fabrication Complete",
      percentCompleteShop: 80,
    },
    {
      statusId: "cf339166-927e-408b-a235-53c57efd816a",
      statusName: "QA QC Inspection",
      percentCompleteShop: 85,
    },
    {
      statusId: "e2421754-9933-4185-ac4e-3642f5d3c9de",
      statusName: "Packaged for Shipment",
      percentCompleteShop: 95,
    },
    {
      statusId: "fcebb720-efdf-4aab-a4c0-aeacbcd7e61f",
      statusName: "Waiting to Ship",
      percentCompleteShop: 98,
    },
    {
      statusId: "1ba0d975-3487-40b0-b1e3-50fbfe1b7054",
      statusName: "Shipped to Jobsite",
      percentCompleteShop: 99,
    },
    {
      statusId: "493d0932-ee31-461e-97cf-c55c14dc0fbf",
      statusName: "Received on Jobsite",
      percentCompleteShop: 0,
    },
    {
      statusId: "401b58e1-3b0c-4b97-92dd-8e2acc831553",
      statusName: "Issued for Installation",
      percentCompleteShop: 0,
    },
    {
      statusId: "c151d272-4b8d-4b96-b24a-060df8c3dbfa",
      statusName: "Installed",
      percentCompleteShop: 0,
    },
    {
      statusId: "4be76997-8460-45e1-9f26-447856add454",
      statusName: "Wire Pulled",
      percentCompleteShop: 0,
    },
    {
      statusId: "b5cd7c47-cbe6-4f47-b088-b6af75013c74",
      statusName: "Trim and Terminations Complete",
      percentCompleteShop: 0,
    },
    {
      statusId: "20176b46-34d7-4090-b4a8-f920146b03b1",
      statusName: "Hold",
      percentCompleteShop: 0,
    },
    {
      statusId: "56abd7da-9c22-4225-bec6-ad2a5c5f7469",
      statusName: "Point List Ready",
      percentCompleteShop: 0,
    },
    {
      statusId: "0aaddec6-a2e3-4638-bdaa-e9fc5d92de6e",
      statusName: "FAB CANCELLED",
      percentCompleteShop: 0,
    },
    {
      statusId: "61a3d021-4a62-425d-b2a7-4bf758703516",
      statusName: "NO PREFAB (FIELD INSTALL)",
      percentCompleteShop: 0,
    },
    {
      statusId: "6edbfc37-c332-47ce-8991-62f51578d6ec",
      statusName: "TESTING",
      percentCompleteShop: 0,
    },
  ];

const DEFAULT_CONFIG: StratusConfig = {
  baseUrl: DEFAULT_STRATUS_BASE_URL,
  appKey: "",
  companyId: "",
  importReadSource: DEFAULT_STRATUS_IMPORT_READ_SOURCE,
  bigDataServer: "",
  bigDataDatabase: "",
  bigDataUsername: "",
  bigDataPassword: "",
  bigDataEncrypt: false,
  bigDataTrustServerCertificate: true,
  bigDataTaskNameColumn: "",
  bigDataDurationDaysColumn: "",
  bigDataDurationHoursColumn: "",
  bigDataStartDateColumn: "",
  bigDataFinishDateColumn: "",
  bigDataDeadlineColumn: "",
  taskNameField: STRATUS_TASK_NAME_FIELD_NAME,
  durationDaysField: STRATUS_DURATION_DAYS_FIELD_NAME,
  durationHoursField: STRATUS_DURATION_HOURS_FIELD_NAME,
  startDateField: STRATUS_START_DATE_FIELD_NAME,
  finishDateField: STRATUS_FINISH_DATE_FIELD_NAME,
  deadlineField: STRATUS_DEADLINE_FIELD_NAME,
  startDateFieldIdOverride: "",
  finishDateFieldIdOverride: "",
  deadlineFieldIdOverride: "",
  cachedStartDateFieldId: "",
  cachedFinishDateFieldId: "",
  cachedDeadlineFieldId: "",
  statusProgressMappings: DEFAULT_STATUS_PROGRESS_MAPPINGS,
  excludedProjectIds: [],
};

const CONFIG_PATH = runtimeConfig.stratusConfigPath;

let cachedConfig: StratusConfig | null = null;

export function getStratusConfig(): StratusConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    if (existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(
        readFileSync(CONFIG_PATH, "utf8"),
      ) as Partial<StratusConfig>;
      cachedConfig = normalizeStratusConfig(parsed);
      return cachedConfig;
    }
  } catch {
    // Ignore config parse failures and fall back to defaults.
  }

  cachedConfig = normalizeStratusConfig();
  return cachedConfig;
}

export function resolveNextStratusConfig(
  partial: Partial<StratusConfig>,
  current = getStratusConfig(),
): StratusConfig {
  const merged = {
    ...current,
    ...partial,
  };

  if (
    partial.startDateField !== undefined &&
    normalizeOptionalString(partial.startDateField) !==
      current.startDateField &&
    partial.cachedStartDateFieldId === undefined
  ) {
    merged.cachedStartDateFieldId = "";
  }
  if (
    partial.finishDateField !== undefined &&
    normalizeOptionalString(partial.finishDateField) !==
      current.finishDateField &&
    partial.cachedFinishDateFieldId === undefined
  ) {
    merged.cachedFinishDateFieldId = "";
  }
  if (
    partial.deadlineField !== undefined &&
    normalizeOptionalString(partial.deadlineField) !== current.deadlineField &&
    partial.cachedDeadlineFieldId === undefined
  ) {
    merged.cachedDeadlineFieldId = "";
  }

  return normalizeStratusConfig({
    ...merged,
  });
}

export async function writeStratusConfig(
  config: StratusConfig,
): Promise<StratusConfig> {
  cachedConfig = config;
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  return config;
}

export async function setStratusConfig(
  partial: Partial<StratusConfig>,
): Promise<StratusConfig> {
  const nextConfig = resolveNextStratusConfig(partial);
  return writeStratusConfig(nextConfig);
}

export function toSafeStratusConfig(config: StratusConfig): SafeStratusConfig {
  return {
    baseUrl: config.baseUrl,
    appKeySet: config.appKey.length > 0,
    companyId: config.companyId,
    importReadSource: config.importReadSource,
    bigDataServer: config.bigDataServer,
    bigDataDatabase: config.bigDataDatabase,
    bigDataUsername: config.bigDataUsername,
    bigDataPasswordSet: config.bigDataPassword.length > 0,
    bigDataEncrypt: config.bigDataEncrypt,
    bigDataTrustServerCertificate: config.bigDataTrustServerCertificate,
    bigDataTaskNameColumn: config.bigDataTaskNameColumn,
    bigDataDurationDaysColumn: config.bigDataDurationDaysColumn,
    bigDataDurationHoursColumn: config.bigDataDurationHoursColumn,
    bigDataStartDateColumn: config.bigDataStartDateColumn,
    bigDataFinishDateColumn: config.bigDataFinishDateColumn,
    bigDataDeadlineColumn: config.bigDataDeadlineColumn,
    taskNameField: config.taskNameField,
    durationDaysField: config.durationDaysField,
    durationHoursField: config.durationHoursField,
    startDateField: config.startDateField,
    finishDateField: config.finishDateField,
    deadlineField: config.deadlineField,
    startDateFieldIdOverride: config.startDateFieldIdOverride,
    finishDateFieldIdOverride: config.finishDateFieldIdOverride,
    deadlineFieldIdOverride: config.deadlineFieldIdOverride,
    cachedStartDateFieldId: config.cachedStartDateFieldId,
    cachedFinishDateFieldId: config.cachedFinishDateFieldId,
    cachedDeadlineFieldId: config.cachedDeadlineFieldId,
    statusProgressMappings: config.statusProgressMappings.map((row) => ({
      ...row,
    })),
    excludedProjectIds: config.excludedProjectIds,
  };
}

export function getSafeStratusConfig(): SafeStratusConfig {
  return toSafeStratusConfig(getStratusConfig());
}

export function normalizeStratusConfig(
  raw?: Partial<StratusConfig> | null,
): StratusConfig {
  const hasBigDataCredentials = hasStratusBigDataCredentials(raw);
  return {
    baseUrl: normalizeBaseUrl(raw?.baseUrl),
    appKey: normalizeOptionalString(raw?.appKey) ?? "",
    companyId: normalizeOptionalString(raw?.companyId) ?? "",
    importReadSource: normalizeImportReadSource(
      raw?.importReadSource,
      hasBigDataCredentials,
    ),
    bigDataServer: normalizeOptionalString(raw?.bigDataServer) ?? "",
    bigDataDatabase: normalizeOptionalString(raw?.bigDataDatabase) ?? "",
    bigDataUsername: normalizeOptionalString(raw?.bigDataUsername) ?? "",
    bigDataPassword: normalizeOptionalString(raw?.bigDataPassword) ?? "",
    bigDataEncrypt: normalizeBoolean(raw?.bigDataEncrypt, false),
    bigDataTrustServerCertificate: normalizeBoolean(
      raw?.bigDataTrustServerCertificate,
      true,
    ),
    bigDataTaskNameColumn:
      normalizeOptionalString(raw?.bigDataTaskNameColumn) ?? "",
    bigDataDurationDaysColumn:
      normalizeOptionalString(raw?.bigDataDurationDaysColumn) ?? "",
    bigDataDurationHoursColumn:
      normalizeOptionalString(raw?.bigDataDurationHoursColumn) ?? "",
    bigDataStartDateColumn:
      normalizeOptionalString(raw?.bigDataStartDateColumn) ?? "",
    bigDataFinishDateColumn:
      normalizeOptionalString(raw?.bigDataFinishDateColumn) ?? "",
    bigDataDeadlineColumn:
      normalizeOptionalString(raw?.bigDataDeadlineColumn) ?? "",
    taskNameField:
      normalizeOptionalString(raw?.taskNameField) ??
      STRATUS_TASK_NAME_FIELD_NAME,
    durationDaysField:
      normalizeOptionalString(raw?.durationDaysField) ??
      STRATUS_DURATION_DAYS_FIELD_NAME,
    durationHoursField:
      normalizeOptionalString(raw?.durationHoursField) ??
      STRATUS_DURATION_HOURS_FIELD_NAME,
    startDateField:
      normalizeOptionalString(raw?.startDateField) ??
      STRATUS_START_DATE_FIELD_NAME,
    finishDateField:
      normalizeOptionalString(raw?.finishDateField) ??
      STRATUS_FINISH_DATE_FIELD_NAME,
    deadlineField:
      normalizeOptionalString(raw?.deadlineField) ??
      STRATUS_DEADLINE_FIELD_NAME,
    startDateFieldIdOverride:
      normalizeOptionalString(raw?.startDateFieldIdOverride) ?? "",
    finishDateFieldIdOverride:
      normalizeOptionalString(raw?.finishDateFieldIdOverride) ?? "",
    deadlineFieldIdOverride:
      normalizeOptionalString(raw?.deadlineFieldIdOverride) ?? "",
    cachedStartDateFieldId:
      normalizeOptionalString(raw?.cachedStartDateFieldId) ?? "",
    cachedFinishDateFieldId:
      normalizeOptionalString(raw?.cachedFinishDateFieldId) ?? "",
    cachedDeadlineFieldId:
      normalizeOptionalString(raw?.cachedDeadlineFieldId) ?? "",
    statusProgressMappings: normalizeStatusProgressMappings(
      raw?.statusProgressMappings,
    ),
    excludedProjectIds: normalizeOptionalStringArray(raw?.excludedProjectIds),
  };
}

export function normalizeBaseUrl(baseUrl?: string | null): string {
  const trimmed = normalizeOptionalString(baseUrl);
  return (trimmed ?? DEFAULT_STRATUS_BASE_URL).replace(/\/+$/, "");
}

export function normalizeOptionalString(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hasStratusBigDataCredentials(raw?: Partial<StratusConfig> | null) {
  return Boolean(
    normalizeOptionalString(raw?.bigDataServer) &&
      normalizeOptionalString(raw?.bigDataDatabase) &&
      normalizeOptionalString(raw?.bigDataUsername) &&
      normalizeOptionalString(raw?.bigDataPassword),
  );
}

function normalizeImportReadSource(
  value: StratusImportReadSource | string | null | undefined,
  hasBigDataCredentials: boolean,
): StratusImportReadSource {
  return value === "sqlPreferred" || value === "apiOnly"
    ? value
    : hasBigDataCredentials
      ? "sqlPreferred"
      : DEFAULT_STRATUS_IMPORT_READ_SOURCE;
}

function normalizeBoolean(
  value: boolean | string | null | undefined,
  fallback: boolean,
): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return fallback;
  }

  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
}

function normalizeOptionalStringArray(values?: string[] | null): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = normalizeOptionalString(value);
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function normalizeStatusProgressMappings(
  values?: StratusStatusProgressMapping[] | null,
): StratusStatusProgressMapping[] {
  if (!Array.isArray(values)) {
    return DEFAULT_STATUS_PROGRESS_MAPPINGS.map((row) => ({ ...row }));
  }

  const normalized: StratusStatusProgressMapping[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const statusId = normalizeOptionalString(value.statusId) ?? "";
    const statusName = normalizeOptionalString(value.statusName) ?? "";
    if (!statusId && !statusName) {
      continue;
    }

    const key = `${statusId.toLowerCase()}::${statusName.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({
      statusId,
      statusName,
      percentCompleteShop: normalizePercentCompleteValue(
        value.percentCompleteShop,
      ),
    });
  }

  return normalized;
}

function normalizePercentCompleteValue(
  value: number | string | null | undefined,
): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return clampPercent(value);
  }

  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  if (normalized.toLowerCase() === "n/a") {
    return null;
  }

  const parsed = Number(normalized.replace(/%/g, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return clampPercent(parsed);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function ensureStratusConfigured(config: StratusConfig): void {
  if (!config.appKey) {
    throw new Error("Stratus app key is not configured.");
  }
}

export function isStratusBigDataConfigured(
  config: Pick<
    StratusConfig,
    | "bigDataServer"
    | "bigDataDatabase"
    | "bigDataUsername"
    | "bigDataPassword"
  >,
): boolean {
  return Boolean(
    normalizeOptionalString(config.bigDataServer) &&
      normalizeOptionalString(config.bigDataDatabase) &&
      normalizeOptionalString(config.bigDataUsername) &&
      normalizeOptionalString(config.bigDataPassword),
  );
}

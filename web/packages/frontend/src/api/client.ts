/**
 * API client — thin wrapper around fetch for the backend REST API.
 */

import {
  clearCsrfTokenCache,
  ensureCsrfToken,
  notifyAuthEvent,
} from "../auth/clientAuth";
import type { AuthSessionResponse } from "../auth/types";

const API_BASE = "/api";

interface RequestOptions {
  base?: string;
  authHandling?: "notify" | "ignore";
  csrf?: "auto" | "skip";
  responseType?: "json" | "blob";
}

interface ErrorBody {
  code?: string;
  message?: string;
  error?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isMutatingMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const base = options.base ?? API_BASE;
  const authHandling = options.authHandling ?? "notify";
  const csrfMode = options.csrf ?? "auto";
  const responseType = options.responseType ?? "json";
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const isFormDataBody =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body != null && !isFormDataBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (csrfMode !== "skip" && isMutatingMethod(method)) {
    const csrfToken = await ensureCsrfToken(() =>
      request<{ csrfToken: string }>(
        "/auth/csrf",
        { method: "GET" },
        { base: "", authHandling, csrf: "skip" },
      ),
    );
    headers.set("X-CSRF-Token", csrfToken);
  }

  const res = await fetch(`${base}${path}`, {
    ...init,
    method,
    credentials: "include",
    headers,
  });

  if (res.status === 204) return undefined as unknown as T;

  if (!res.ok) {
    if (res.status === 401) {
      clearCsrfTokenCache();
    }

    const body = (await res
      .json()
      .catch(() => ({ message: res.statusText, error: res.statusText }))) as ErrorBody;
    const message =
      typeof body?.message === "string" && body.message.trim().length > 0
        ? body.message
        : typeof body?.error === "string" && body.error.trim().length > 0
          ? body.error
          : `Request failed: ${res.status}`;
    const code = typeof body?.code === "string" ? body.code : null;
    const error = new ApiError(res.status, code, message);

    if (
      authHandling === "notify" &&
      (error.code === "AUTH_REQUIRED" || error.code === "FORBIDDEN")
    ) {
      notifyAuthEvent({
        status: error.status as 401 | 403,
        code: error.code,
        method,
        path: `${base}${path}`,
        message: error.message,
      });
    }

    throw error;
  }

  if (responseType === "blob") {
    return (await res.blob()) as T;
  }

  return res.json();
}

export interface AuthCsrfResponse {
  csrfToken: string;
}

export type AuthSessionStateResponse = AuthSessionResponse;

export const authApi = {
  session: () =>
    request<AuthSessionStateResponse>("/auth/session", undefined, {
      base: "",
      authHandling: "ignore",
      csrf: "skip",
    }),
  csrf: () =>
    request<AuthCsrfResponse>("/auth/csrf", undefined, {
      base: "",
      csrf: "skip",
    }),
  logout: () =>
    request<{ ok: true }>(
      "/auth/logout",
      {
        method: "POST",
      },
      { base: "" },
    ),
};

// ---------- Projects ----------

export interface ProjectSummaryResponse {
  id: string;
  name: string;
  revision: number;
  startDate: string;
  finishDate: string | null;
  projectType: string | null;
  sector: string | null;
  region: string | null;
  stratusProjectId: string | null;
  stratusModelId: string | null;
  stratusPackageWhere: string | null;
  stratusLastPullAt: string | null;
  stratusLastPushAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetailResponse extends ProjectSummaryResponse {
  defaultCalendarId: string;
  scheduleFrom: string;
  statusDate: string | null;
  stratusLocalMetadataVersion: number;
  _count?: {
    tasks: number;
    calendars: number;
    resources: number;
  };
}

export interface StratusStatusSummaryResponse {
  sourceType: "package" | "assembly";
  trackingStatusId: string | null;
  trackingStatusName: string | null;
}

export type SnapshotDetailLevel = "shell" | "full";

export interface TaskResponse {
  id: string;
  detailLevel: SnapshotDetailLevel;
  projectId: string;
  wbsCode: string;
  outlineLevel: number;
  parentId: string | null;
  name: string;
  type: string;
  durationMinutes: number;
  start: string;
  finish: string;
  constraintType: number;
  constraintDate: string | null;
  calendarId: string | null;
  percentComplete: number;
  isManuallyScheduled: boolean;
  isCritical: boolean;
  totalSlackMinutes: number;
  freeSlackMinutes: number;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  deadline: string | null;
  notes?: string | null;
  externalKey: string | null;
  isNameManagedByStratus: boolean;
  sortOrder: number;
  stratusSync: StratusSyncSummary | null;
  stratusStatus?: StratusStatusSummaryResponse | null;
  fixedCost?: number | null;
  fixedCostAccrual?: string | null;
  cost?: number | null;
  actualCost?: number | null;
  remainingCost?: number | null;
  work?: number | null;
  actualWork?: number | null;
  remainingWork?: number | null;
  actualStart?: string | null;
  actualFinish?: string | null;
  actualDurationMinutes?: number | null;
  remainingDuration?: number | null;
  bcws?: number | null;
  bcwp?: number | null;
  acwp?: number | null;
}

export interface DependencyResponse {
  id: string;
  projectId: string;
  fromTaskId: string;
  toTaskId: string;
  type: string;
  lagMinutes: number;
}

export interface ResourceResponse {
  id: string;
  projectId: string;
  name: string;
  type: string;
  maxUnits: number;
  calendarId: string | null;
  standardRate: number | null;
  overtimeRate: number | null;
  costPerUse: number | null;
  accrueAt: string | null;
  budgetCost: number | null;
  budgetWork: number | null;
  isBudget: boolean;
  isGeneric: boolean;
}

export interface AssignmentResponse {
  id: string;
  taskId: string;
  resourceId: string;
  units: number;
  workMinutes: number;
  actualWork: number | null;
  actualCost: number | null;
  remainingWork: number | null;
  remainingCost: number | null;
  task?: { id: string; name: string };
  resource?: { id: string; name: string };
}

export interface ProjectSnapshotResponse {
  detailLevel: SnapshotDetailLevel;
  revision: number;
  project: ProjectDetailResponse;
  taskBounds: {
    start: string | null;
    finish: string | null;
  };
  tasks: TaskResponse[];
  dependencies: DependencyResponse[];
  resources: ResourceResponse[];
  assignments: AssignmentResponse[];
}

export interface TaskMutationResponse {
  revision: number;
  snapshot: ProjectSnapshotResponse;
  task: TaskResponse;
  recalculation?: MutationRecalculationResponse;
}

export interface TaskUpdateResponse {
  revision: number;
  task: TaskResponse;
  snapshot?: ProjectSnapshotResponse;
  recalculation?: MutationRecalculationResponse;
}

export interface TaskBatchUpdateResponse {
  updated: number;
  revision: number;
  snapshot: ProjectSnapshotResponse;
  recalculation?: MutationRecalculationResponse;
}

export interface TaskDeleteResponse {
  deletedTaskIds: string[];
  revision: number;
  snapshot: ProjectSnapshotResponse;
  recalculation?: MutationRecalculationResponse;
}

export interface DependencyMutationResponse {
  revision: number;
  snapshot: ProjectSnapshotResponse;
  dependency: DependencyResponse;
  recalculation?: MutationRecalculationResponse;
}

export interface DependencyBatchResponse {
  createdDependencies: DependencyResponse[];
  deletedDependencyIds: string[];
  revision: number;
  snapshot: ProjectSnapshotResponse;
  recalculation?: MutationRecalculationResponse;
}

export interface ImportMspdiResponse {
  imported: {
    tasks: number;
    dependencies: number;
    calendars: number;
    resources: number;
    assignments: number;
  };
}

export interface ImportPreviewResponse {
  diffs: unknown[];
  totalUpdates: number;
}

export interface ImportApplyResponse {
  totalProcessed: number;
  applied: number;
  skipped: number;
  failed: number;
  details: unknown[];
  created?: number;
  updated?: number;
}

export interface TaskRecalculateResponse {
  ok: boolean;
  revision: number;
  snapshot: ProjectSnapshotResponse;
  recalculation?: MutationRecalculationResponse;
}

export interface MutationRecalculationResponse {
  status: "notNeeded" | "queued" | "running" | "completed";
  jobId?: string;
}

export const projectsApi = {
  list: () => request<ProjectSummaryResponse[]>("/projects"),
  snapshot: (id: string, detailLevel: SnapshotDetailLevel = "full") =>
    request<ProjectSnapshotResponse>(
      `/projects/${id}/snapshot?detailLevel=${detailLevel}`,
    ),
  get: (id: string) => request<ProjectDetailResponse>(`/projects/${id}`),
  create: (data: {
    name: string;
    startDate: string;
    projectType?: string | null;
    sector?: string | null;
    region?: string | null;
  }) =>
    request<ProjectDetailResponse>("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Record<string, unknown>) =>
    request<ProjectDetailResponse>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),
};

// ---------- Tasks ----------

export const tasksApi = {
  list: (projectId: string) => request<TaskResponse[]>(`/projects/${projectId}/tasks`),
  get: (projectId: string, taskId: string) =>
    request<TaskResponse>(`/projects/${projectId}/tasks/${taskId}`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<TaskMutationResponse>(`/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (projectId: string, taskId: string, data: Record<string, unknown>) =>
    request<TaskUpdateResponse>(`/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  batchUpdate: (
    projectId: string,
    updates: { id: string; data: Record<string, unknown> }[],
    recalc = true,
  ) =>
    request<TaskBatchUpdateResponse>(`/projects/${projectId}/tasks/batch`, {
      method: "POST",
      body: JSON.stringify({ updates, recalculate: recalc }),
    }),
  deleteBatch: (projectId: string, taskIds: string[]) =>
    request<TaskDeleteResponse>(`/projects/${projectId}/tasks/delete-batch`, {
      method: "POST",
      body: JSON.stringify({ taskIds }),
    }),
  delete: (projectId: string, taskId: string) =>
    request<TaskDeleteResponse>(`/projects/${projectId}/tasks/${taskId}`, {
      method: "DELETE",
    }),
  recalculate: (projectId: string) =>
    request<TaskRecalculateResponse>(`/projects/${projectId}/tasks/recalculate`, {
      method: "POST",
    }),
};

// ---------- Dependencies ----------

export const dependenciesApi = {
  list: (projectId: string) =>
    request<DependencyResponse[]>(`/projects/${projectId}/dependencies`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<DependencyMutationResponse>(`/projects/${projectId}/dependencies`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (projectId: string, depId: string, data: Record<string, unknown>) =>
    request<DependencyMutationResponse>(`/projects/${projectId}/dependencies/${depId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  batch: (
    projectId: string,
    data: {
      create?: { fromTaskId: string; toTaskId: string; type?: string; lagMinutes?: number }[];
      deleteDependencyIds?: string[];
    },
  ) =>
    request<DependencyBatchResponse>(`/projects/${projectId}/dependencies/batch`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, depId: string) =>
    request<{ deletedDependencyIds: string[]; revision: number; snapshot: ProjectSnapshotResponse; recalculation?: MutationRecalculationResponse }>(`/projects/${projectId}/dependencies/${depId}`, {
      method: "DELETE",
    }),
};

// ---------- Calendars ----------

export const calendarsApi = {
  list: (projectId: string) =>
    request<any[]>(`/projects/${projectId}/calendars`),
  get: (projectId: string, calId: string) =>
    request<any>(`/projects/${projectId}/calendars/${calId}`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/calendars`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (projectId: string, calId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/calendars/${calId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, calId: string) =>
    request<void>(`/projects/${projectId}/calendars/${calId}`, {
      method: "DELETE",
    }),
  addException: (
    projectId: string,
    calId: string,
    data: Record<string, unknown>,
  ) =>
    request<any>(`/projects/${projectId}/calendars/${calId}/exceptions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteException: (projectId: string, calId: string, excId: string) =>
    request<void>(
      `/projects/${projectId}/calendars/${calId}/exceptions/${excId}`,
      { method: "DELETE" },
    ),
};

// ---------- Resources ----------

export const resourcesApi = {
  list: (projectId: string) =>
    request<ResourceResponse[]>(`/projects/${projectId}/resources`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/resources`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (projectId: string, resId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/resources/${resId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, resId: string) =>
    request<void>(`/projects/${projectId}/resources/${resId}`, {
      method: "DELETE",
    }),
};

// ---------- Assignments ----------

export const assignmentsApi = {
  list: (projectId: string) =>
    request<AssignmentResponse[]>(`/projects/${projectId}/assignments`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/assignments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (
    projectId: string,
    assignId: string,
    data: Record<string, unknown>,
  ) =>
    request<any>(`/projects/${projectId}/assignments/${assignId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, assignId: string) =>
    request<void>(`/projects/${projectId}/assignments/${assignId}`, {
      method: "DELETE",
    }),
};

// ---------- Baselines ----------

export const baselinesApi = {
  list: (projectId: string) =>
    request<Record<number, any[]>>(`/projects/${projectId}/baselines`),
  capture: (projectId: string, baselineIndex: number) =>
    request<{ baselineIndex: number; taskCount: number }>(
      `/projects/${projectId}/baselines`,
      { method: "POST", body: JSON.stringify({ baselineIndex }) },
    ),
  clear: (projectId: string, index: number) =>
    request<void>(`/projects/${projectId}/baselines/${index}`, {
      method: "DELETE",
    }),
};

// ---------- Import / Export ----------

export const importExportApi = {
  importMspdi: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImportMspdiResponse>(`/projects/${projectId}/import-export/import/mspdi`, {
      method: "POST",
      body: form,
    });
  },

  exportMspdi: (projectId: string) =>
    request<Blob>(
      `/projects/${projectId}/import-export/export/mspdi`,
      undefined,
      { responseType: "blob" },
    ),

  previewUpdates: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImportPreviewResponse>(`/projects/${projectId}/import-export/import/preview`, {
      method: "POST",
      body: form,
    });
  },

  applyUpdates: async (
    projectId: string,
    file: File,
    options?: Record<string, unknown>,
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (options) form.append("options", JSON.stringify(options));
    return request<ImportApplyResponse>(`/projects/${projectId}/import-export/import/apply`, {
      method: "POST",
      body: form,
    });
  },

  undo: (projectId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/import-export/undo`, {
      method: "POST",
    }),
  redo: (projectId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/import-export/redo`, {
      method: "POST",
    }),

  undoHistory: (projectId: string) =>
    request<{
      entries: {
        id: string;
        description: string;
        position: number;
        createdAt: string;
      }[];
      currentPointer: number | null;
    }>(`/projects/${projectId}/import-export/undo-history`),

  exportCsv: (projectId: string) =>
    request<Blob>(
      `/projects/${projectId}/import-export/export/csv`,
      undefined,
      { responseType: "blob" },
    ),

  exportJson: (projectId: string) =>
    request<Blob>(
      `/projects/${projectId}/import-export/export/json`,
      undefined,
      { responseType: "blob" },
    ),

  exportExcel: (projectId: string) =>
    request<Blob>(
      `/projects/${projectId}/import-export/export/excel`,
      undefined,
      { responseType: "blob" },
    ),

  bulkCsvImport: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{
      created: number;
      updated: number;
      errors: string[];
    }>(`/projects/${projectId}/import-export/import/bulk-csv`, {
      method: "POST",
      body: form,
    });
  },
};

// ---------- Stratus ----------

export interface StratusSyncSummary {
  packageId: string;
  packageNumber: string | null;
  packageName: string | null;
  trackingStatusId: string | null;
  trackingStatusName: string | null;
  lastPulledAt: string;
  lastPushedAt: string | null;
  pulledStart?: string | null;
  pulledFinish?: string | null;
  pulledDeadline?: string | null;
}

export interface StratusStatusProgressMapping {
  statusId: string;
  statusName: string;
  percentCompleteShop: number | null;
}

export interface SafeStratusConfigResponse {
  baseUrl: string;
  appKeySet: boolean;
  companyId: string;
  importReadSource: "sqlPreferred" | "apiOnly";
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

export interface StratusReadSourceInfoResponse {
  source: "sqlBigData" | "stratusApi";
  fallbackUsed: boolean;
  message: string | null;
  warnings: string[];
  freshness: string | null;
  trackingStart: string | null;
  packageReportName: string | null;
  assemblyReportName: string | null;
  isFullRebuild: boolean | null;
}

export interface StratusResultMetaResponse {
  skippedUnchangedPackages: number;
  undefinedPackageCount: number;
  orphanAssemblyCount: number;
  durationMs: number;
}

export type StratusJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type StratusJobKind =
  | "projectImportPreview"
  | "projectImportApply"
  | "pullPreview"
  | "pullApply";

export type StratusJobPhase =
  | "idle"
  | "loadingProjects"
  | "loadingPackages"
  | "loadingAssemblies"
  | "comparingLocal"
  | "applyingPackages"
  | "applyingAssemblies"
  | "finalizing";

export interface StratusJobProgressResponse {
  phase: StratusJobPhase;
  message: string | null;
  processedPackages: number;
  totalPackages: number;
  processedAssemblies: number;
  totalAssemblies: number;
  skippedUnchangedPackages: number;
  source: "sqlBigData" | "stratusApi" | null;
}

export interface StratusBigDataFieldValidationResponse {
  mappingKey:
    | "taskName"
    | "durationDays"
    | "durationHours"
    | "startDate"
    | "finishDate"
    | "deadline";
  label: string;
  configuredField: string;
  overrideColumn: string | null;
  resolvedColumn: string | null;
  warning: string | null;
}

export interface StratusBigDataConnectionTestResponse
  extends StratusReadSourceInfoResponse {
  ok: boolean;
  configured: boolean;
  fieldMappings: StratusBigDataFieldValidationResponse[];
}

export interface StratusProjectTargetPayload {
  stratusProjectId: string | null;
  stratusModelId: string | null;
  stratusPackageWhere: string | null;
}

export interface StratusStatusMappingsSaveRequest {
  config: Record<string, unknown>;
  project: StratusProjectTargetPayload;
}

export interface StratusStatusMappingsSaveResponse {
  mode: "saved" | "localRemap" | "seedRequired";
  revision: number;
  snapshot: ProjectSnapshotResponse;
  affectedPackages: number;
  affectedAssemblies: number;
  jobId?: string;
}

export interface StratusProjectImportPreviewRow {
  action: "create" | "update" | "skip" | "exclude";
  stratusProjectId: string;
  projectNumber: string | null;
  projectName: string | null;
  localProjectId: string | null;
  localProjectName: string | null;
  warnings: string[];
  mappedProject: {
    name: string;
    startDate: string;
    finishDate: string | null;
    projectType: string | null;
    sector: string | null;
    region: string | null;
  };
}

export interface StratusProjectImportPreviewResponse {
  rows: StratusProjectImportPreviewRow[];
  sourceInfo: StratusReadSourceInfoResponse;
  summary: {
    totalProjects: number;
    createCount: number;
    updateCount: number;
    skipCount: number;
    excludedCount: number;
  };
  meta: StratusResultMetaResponse;
}

export interface StratusProjectImportApplyResponse {
  rows: Array<{
    action: "created" | "updated" | "skipped" | "excluded" | "failed";
    stratusProjectId: string;
    projectNumber: string | null;
    projectName: string | null;
    localProjectId: string | null;
    localProjectName: string | null;
    message: string | null;
  }>;
  sourceInfo: StratusReadSourceInfoResponse;
  summary: {
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    excluded: number;
    failed: number;
  };
  meta: StratusResultMetaResponse;
}

export interface StratusStatusResponse {
  appKeySet: boolean;
  configured: boolean;
  projectConfigured: boolean;
  canPull: boolean;
  canPush: boolean;
  linkedTaskCount: number;
  changedTaskCount: number;
  stratusProjectId: string | null;
  stratusModelId: string | null;
  stratusPackageWhere: string | null;
  lastPullAt: string | null;
  lastPushAt: string | null;
  warnings: string[];
}

export interface StratusPullPreviewRow {
  action: "create" | "update" | "skip";
  matchStrategy: "packageId" | "externalKey" | "none";
  packageId: string;
  packageNumber: string | null;
  packageName: string | null;
  externalKey: string | null;
  taskId: string | null;
  taskName: string | null;
  warnings: string[];
  assemblyCount: number;
  createAssemblyCount: number;
  updateAssemblyCount: number;
  skipAssemblyCount: number;
  assemblyRows: Array<{
    action: "create" | "update" | "skip";
    assemblyId: string;
    assemblyName: string | null;
    externalKey: string;
    taskId: string | null;
    taskName: string | null;
    warnings: string[];
    mappedTask: {
      name: string;
      start: string | null;
      finish: string | null;
      deadline: string | null;
      durationMinutes: number | null;
      percentComplete: number;
      notes: string;
      externalKey: string;
    };
  }>;
  mappedTask: {
    name: string;
    start: string | null;
    finish: string | null;
    deadline: string | null;
    durationMinutes: number | null;
    percentComplete: number;
    notes: string;
    externalKey: string | null;
  };
}

export interface StratusPullPreviewResponse {
  rows: StratusPullPreviewRow[];
  sourceInfo: StratusReadSourceInfoResponse;
  summary: {
    totalPackages: number;
    createCount: number;
    updateCount: number;
    skipCount: number;
    totalAssemblies: number;
    createAssemblyCount: number;
    updateAssemblyCount: number;
    skipAssemblyCount: number;
  };
  meta: StratusResultMetaResponse;
}

export interface StratusPullApplyResponse {
  rows: Array<{
    action: "created" | "updated" | "skipped" | "failed";
    packageId: string;
    packageNumber: string | null;
    packageName: string | null;
    taskId: string | null;
    taskName: string | null;
    createdAssemblies: number;
    updatedAssemblies: number;
    skippedAssemblies: number;
    failedAssemblies: number;
    message: string | null;
  }>;
  sourceInfo: StratusReadSourceInfoResponse;
  summary: {
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    totalAssemblies: number;
    createdAssemblies: number;
    updatedAssemblies: number;
    skippedAssemblies: number;
    failedAssemblies: number;
  };
  meta: StratusResultMetaResponse;
}

export type StratusJobResult =
  | StratusProjectImportPreviewResponse
  | StratusProjectImportApplyResponse
  | StratusPullPreviewResponse
  | StratusPullApplyResponse;

export interface StratusJobResponse<TResult = StratusJobResult> {
  id: string;
  kind: StratusJobKind;
  status: StratusJobStatus;
  progress: StratusJobProgressResponse;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: TResult | null;
}

export interface StratusPushPreviewResponse {
  rows: Array<{
    action: "push" | "skip";
    taskId: string;
    taskName: string;
    packageId: string;
    packageNumber: string | null;
    packageName: string | null;
    changes: Array<{
      field: "start" | "finish" | "deadline";
      from: string | null;
      to: string | null;
    }>;
    warnings: string[];
  }>;
  summary: {
    linkedTaskCount: number;
    pushCount: number;
    skipCount: number;
  };
  fieldResolution: {
    startFieldId: string | null;
    finishFieldId: string | null;
    deadlineFieldId: string | null;
    deadlineMode: "property" | "field";
    canPush: boolean;
    message: string | null;
  };
}

export interface StratusPushApplyResponse {
  rows: Array<{
    action: "pushed" | "skipped" | "failed";
    taskId: string;
    taskName: string;
    packageId: string;
    packageNumber: string | null;
    packageName: string | null;
    message: string | null;
  }>;
  summary: {
    processed: number;
    pushed: number;
    skipped: number;
    failed: number;
  };
}

export interface StratusSyncToPrefabPreviewResponse {
  sourceProjectId: string;
  sourceProjectName: string;
  prefabProjectId: string;
  prefabProjectName: string;
  rows: Array<{
    action: "sync" | "skip";
    sourceTaskId: string;
    sourceTaskName: string;
    prefabTaskId: string | null;
    prefabTaskName: string | null;
    externalKey: string;
    changes: Array<{
      field: "start" | "finish" | "deadline";
      from: string | null;
      to: string | null;
    }>;
    warnings: string[];
  }>;
  summary: {
    candidateTaskCount: number;
    syncCount: number;
    skipCount: number;
  };
}

export interface StratusSyncToPrefabApplyResponse {
  sourceProjectId: string;
  sourceProjectName: string;
  prefabProjectId: string;
  prefabProjectName: string;
  rows: Array<{
    action: "synced" | "skipped" | "failed";
    sourceTaskId: string;
    sourceTaskName: string;
    prefabTaskId: string | null;
    prefabTaskName: string | null;
    externalKey: string;
    message: string | null;
  }>;
  summary: {
    processed: number;
    synced: number;
    skipped: number;
    failed: number;
  };
}

export interface StratusRefreshFromPrefabPreviewResponse {
  sourceProjectId: string;
  sourceProjectName: string;
  prefabProjectId: string;
  prefabProjectName: string;
  rows: Array<{
    action: "refresh" | "skip";
    sourceTaskId: string;
    sourceTaskName: string;
    prefabTaskId: string | null;
    prefabTaskName: string | null;
    externalKey: string;
    changes: Array<{
      field: "start" | "finish" | "deadline";
      from: string | null;
      to: string | null;
    }>;
    warnings: string[];
  }>;
  summary: {
    candidateTaskCount: number;
    refreshCount: number;
    skipCount: number;
  };
}

export interface StratusRefreshFromPrefabApplyResponse {
  sourceProjectId: string;
  sourceProjectName: string;
  prefabProjectId: string;
  prefabProjectName: string;
  rows: Array<{
    action: "refreshed" | "skipped" | "failed";
    sourceTaskId: string;
    sourceTaskName: string;
    prefabTaskId: string | null;
    prefabTaskName: string | null;
    externalKey: string;
    message: string | null;
  }>;
  summary: {
    processed: number;
    refreshed: number;
    skipped: number;
    failed: number;
  };
}

export const stratusApi = {
  getConfig: () => request<SafeStratusConfigResponse>("/stratus/config"),
  updateConfig: (data: Record<string, unknown>) =>
    request<SafeStratusConfigResponse>("/stratus/config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  testConnection: () =>
    request<{ ok: boolean; message: string }>("/stratus/test", {
      method: "POST",
    }),
  testBigDataConnection: () =>
    request<StratusBigDataConnectionTestResponse>("/stratus/big-data/test", {
      method: "POST",
    }),
  previewProjectImport: () =>
    request<StratusProjectImportPreviewResponse>("/stratus/projects/preview", {
      method: "POST",
    }),
  applyProjectImport: () =>
    request<StratusProjectImportApplyResponse>("/stratus/projects/apply", {
      method: "POST",
    }),
  createProjectImportJob: (mode: "preview" | "apply") =>
    request<StratusJobResponse>("/stratus/projects/import/jobs", {
      method: "POST",
      body: JSON.stringify({ mode }),
    }),
  getJob: (jobId: string) =>
    request<StratusJobResponse>(`/stratus/jobs/${jobId}`),
  getStatus: (projectId: string) =>
    request<StratusStatusResponse>(`/projects/${projectId}/stratus/status`),
  saveStatusMappings: (
    projectId: string,
    data: StratusStatusMappingsSaveRequest,
  ) =>
    request<StratusStatusMappingsSaveResponse>(
      `/projects/${projectId}/stratus/status-mappings/save`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  previewPull: (projectId: string) =>
    request<StratusPullPreviewResponse>(
      `/projects/${projectId}/stratus/pull/preview`,
      {
        method: "POST",
      },
    ),
  applyPull: (projectId: string) =>
    request<StratusPullApplyResponse>(
      `/projects/${projectId}/stratus/pull/apply`,
      {
        method: "POST",
      },
    ),
  createPullJob: (
    projectId: string,
    data: {
      mode: "preview" | "apply";
      refreshMode?: "incremental" | "full";
    },
  ) =>
    request<StratusJobResponse>(`/projects/${projectId}/stratus/pull/jobs`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  previewPush: (projectId: string) =>
    request<StratusPushPreviewResponse>(
      `/projects/${projectId}/stratus/push/preview`,
      {
        method: "POST",
      },
    ),
  previewSyncToPrefab: (projectId: string) =>
    request<StratusSyncToPrefabPreviewResponse>(
      `/projects/${projectId}/stratus/sync-to-prefab/preview`,
      {
        method: "POST",
      },
    ),
  previewRefreshFromPrefab: (projectId: string) =>
    request<StratusRefreshFromPrefabPreviewResponse>(
      `/projects/${projectId}/stratus/refresh-from-prefab/preview`,
      {
        method: "POST",
      },
    ),
  applySyncToPrefab: (projectId: string) =>
    request<StratusSyncToPrefabApplyResponse>(
      `/projects/${projectId}/stratus/sync-to-prefab/apply`,
      {
        method: "POST",
      },
    ),
  applyRefreshFromPrefab: (projectId: string) =>
    request<StratusRefreshFromPrefabApplyResponse>(
      `/projects/${projectId}/stratus/refresh-from-prefab/apply`,
      {
        method: "POST",
      },
    ),
  applyPush: (projectId: string) =>
    request<StratusPushApplyResponse>(
      `/projects/${projectId}/stratus/push/apply`,
      {
        method: "POST",
      },
    ),
};

// ---------- AI ----------

export type AiProvider = "local" | "openai" | "gemini" | "groq" | "openrouter";
export type LocalModelId = "qwen3-14b" | "phi-3.5-mini";

export interface AiCitation {
  chunkId: string;
  projectId: string;
  projectName: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface AiChatResponse {
  conversationId: string;
  response: string;
  citations?: AiCitation[];
}

export interface AiSuggestionResponse {
  suggestion: string;
  citations?: AiCitation[];
}

export interface AiHealthResponse {
  available: boolean;
  provider: string;
  models: string[];
  localModelStatus?: ModelStatus;
}

export interface ModelStatus {
  state:
    | "not-downloaded"
    | "downloading"
    | "ready"
    | "loading"
    | "loaded"
    | "error";
  progress?: number;
  modelId: LocalModelId;
  modelName: string;
  modelPath: string;
  description: string;
  downloadSizeGb: number;
  recommended: boolean;
  error?: string;
}

export interface LocalModelPreset {
  id: LocalModelId;
  label: string;
  description: string;
  downloadSizeGb: number;
  fileName: string;
  recommended: boolean;
}

export interface AiConfigResponse {
  provider: AiProvider;
  localModelId: LocalModelId;
  localModels: LocalModelPreset[];
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKeySet: boolean;
  geminiModel: string;
  geminiApiKeySet: boolean;
  groqModel: string;
  groqApiKeySet: boolean;
  openrouterModel: string;
  openrouterApiKeySet: boolean;
  temperature: number;
  maxTokens: number;
  localModelStatus: ModelStatus;
}

export interface AiConversationSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiPatternEntry {
  id: string;
  patternType: string;
  pattern: string;
  confidence: number;
  occurrenceCount: number;
}

export interface AiPreset {
  provider: AiProvider;
  model: string;
  label: string;
}

export interface AiMemoryEntry {
  id: string;
  projectId: string | null;
  category: string;
  key: string;
  value: string;
  source: string;
  importance: number;
  uses: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiMemoryStats {
  total: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  avgImportance: number;
}

export const aiApi = {
  health: () => request<AiHealthResponse>("/ai/health"),

  modelStatus: () => request<ModelStatus>("/ai/model-status"),

  chat: (projectId: string, message: string, conversationId?: string) =>
    request<AiChatResponse>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ projectId, message, conversationId }),
    }),

  suggest: (
    projectId: string,
    type: "duration" | "dependency" | "name" | "resource" | "general",
    context: Record<string, unknown>,
  ) =>
    request<AiSuggestionResponse>("/ai/suggest", {
      method: "POST",
      body: JSON.stringify({ projectId, type, context }),
    }),

  feedback: (
    projectId: string,
    suggestionType: string,
    suggestion: Record<string, unknown>,
    accepted: boolean,
    correctedValue?: string,
  ) =>
    request<void>("/ai/feedback", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        suggestionType,
        suggestion,
        accepted,
        correctedValue,
      }),
    }),

  listConversations: (projectId: string) =>
    request<AiConversationSummary[]>(
      `/ai/conversations?projectId=${encodeURIComponent(projectId)}`,
    ),

  getConversation: (id: string) =>
    request<{
      id: string;
      projectId: string;
      messages: { role: string; content: string; citations?: AiCitation[] }[];
    }>(`/ai/conversations/${id}`),

  deleteConversation: (id: string) =>
    request<void>(`/ai/conversations/${id}`, { method: "DELETE" }),

  getPatterns: () => request<AiPatternEntry[]>("/ai/patterns"),

  getFeedbackStats: () =>
    request<{ total: number; accepted: number; acceptanceRate: number }>(
      "/ai/feedback/stats",
    ),

  getConfig: () => request<AiConfigResponse>("/ai/config"),

  updateConfig: (config: Record<string, unknown>) =>
    request<AiConfigResponse>("/ai/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  getPresets: () => request<Record<string, AiPreset>>("/ai/presets"),

  // Memory endpoints
  listMemories: (projectId?: string) =>
    request<AiMemoryEntry[]>(
      `/ai/memories${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`,
    ),

  getMemoryStats: () => request<AiMemoryStats>("/ai/memories/stats"),

  createMemory: (data: {
    projectId?: string | null;
    category: string;
    key: string;
    value: string;
    importance?: number;
  }) =>
    request<AiMemoryEntry>("/ai/memories", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteMemory: (id: string) =>
    request<void>(`/ai/memories/${id}`, { method: "DELETE" }),

  clearMemories: (projectId?: string) =>
    request<{ deleted: number }>(
      `/ai/memories${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`,
      { method: "DELETE" },
    ),
};

// ---------- Advanced (Cost, EV, Splits, Recurring, Auto-link, Statistics) ----------

export const advancedApi = {
  recalculateCosts: (projectId: string) =>
    request<{ tasks: number }>(
      `/projects/${projectId}/advanced/costs/recalculate`,
      {
        method: "POST",
      },
    ),

  computeEarnedValue: (projectId: string) =>
    request<any>(`/projects/${projectId}/advanced/earned-value`, {
      method: "POST",
    }),

  // Interim plans
  captureInterimPlan: (projectId: string, planIndex: number) =>
    request<{ saved: number; planIndex: number }>(
      `/projects/${projectId}/advanced/interim-plans`,
      { method: "POST", body: JSON.stringify({ planIndex }) },
    ),

  getInterimPlans: (projectId: string, planIndex?: number) =>
    request<any[]>(
      `/projects/${projectId}/advanced/interim-plans${planIndex !== undefined ? `?planIndex=${planIndex}` : ""}`,
    ),

  // Task splits
  splitTask: (
    projectId: string,
    taskId: string,
    splitDate: string,
    resumeDate: string,
  ) =>
    request<any[]>(`/projects/${projectId}/advanced/tasks/${taskId}/split`, {
      method: "POST",
      body: JSON.stringify({ splitDate, resumeDate }),
    }),

  getTaskSplits: (projectId: string, taskId: string) =>
    request<any[]>(`/projects/${projectId}/advanced/tasks/${taskId}/splits`),

  // Recurring tasks
  createRecurringTask: (projectId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/advanced/recurring-tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Auto-link
  autoLink: (projectId: string, taskIds?: string[]) =>
    request<{ linked: number }>(`/projects/${projectId}/advanced/auto-link`, {
      method: "POST",
      body: JSON.stringify({ taskIds }),
    }),

  // Project statistics
  getStatistics: (projectId: string) =>
    request<any>(`/projects/${projectId}/advanced/statistics`),
};

// ---------- Leveling ----------

export interface LevelingResult {
  delayedTasks: { taskId: string; taskName: string; delayMinutes: number }[];
  overAllocatedResources: string[];
}

export const levelingApi = {
  level: (projectId: string) =>
    request<LevelingResult>(`/projects/${projectId}/leveling/level`, {
      method: "POST",
    }),
  clear: (projectId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/leveling/clear`, {
      method: "POST",
    }),
};

// ---------- Custom Fields ----------

export interface CustomFieldDef {
  id: string;
  projectId: string;
  fieldName: string;
  displayName: string;
  fieldType: string;
  formula: string | null;
  lookupTableJson: string | null;
  indicatorRules: string | null;
}

export interface CustomFieldValue {
  id: string;
  taskId: string;
  fieldId: string;
  textValue: string | null;
  numberValue: number | null;
  dateValue: string | null;
  flagValue: boolean | null;
}

export const customFieldsApi = {
  list: (projectId: string) =>
    request<CustomFieldDef[]>(`/projects/${projectId}/custom-fields`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<CustomFieldDef>(`/projects/${projectId}/custom-fields`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (projectId: string, fieldId: string, data: Record<string, unknown>) =>
    request<CustomFieldDef>(`/projects/${projectId}/custom-fields/${fieldId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, fieldId: string) =>
    request<void>(`/projects/${projectId}/custom-fields/${fieldId}`, {
      method: "DELETE",
    }),
  getValues: (projectId: string, fieldId: string) =>
    request<CustomFieldValue[]>(
      `/projects/${projectId}/custom-fields/${fieldId}/values`,
    ),
  setValue: (
    projectId: string,
    fieldId: string,
    data: Record<string, unknown>,
  ) =>
    request<CustomFieldValue>(
      `/projects/${projectId}/custom-fields/${fieldId}/values`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),
};

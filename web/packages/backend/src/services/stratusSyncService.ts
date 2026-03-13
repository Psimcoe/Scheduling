import type {
  StratusAssemblySync,
  StratusTaskSync,
  Task,
} from "@prisma/client";
import { prisma } from "../db.js";
import {
  type StratusConfig,
  type StratusStatusProgressMapping,
  isStratusBigDataConfigured,
  setStratusConfig,
} from "./stratusConfig.js";
import {
  type FieldIdResolution,
  type NormalizedStratusAssembly,
  type NormalizedStratusPackage,
  type NormalizedStratusProject,
  type StratusProjectTarget,
  fetchActiveProjectsFromStratus,
  fetchAssembliesForPackage,
  fetchCompanyFields,
  fetchPackagesFromStratus,
  getConfiguredPackageFieldValue,
  getEquivalentFieldNames,
  normalizeStratusAssembly,
  normalizeStratusPackage,
  normalizeStratusProject,
  parseDateValue,
  parseNumberValue,
  resolveFieldIdsFromDefinitions,
  stratusRequestJson,
  toDateSignature,
} from "./stratusApi.js";
import {
  type StratusPackageBundle,
  type StratusProjectBundleGroup,
  type StratusReadSourceInfo,
  loadBigDataPackageBundleSnapshot,
  loadBigDataPrefabProjectGroupSnapshot,
  loadBigDataProjectImportSnapshot,
} from "./stratusBigDataService.js";
import type { StratusJobProgressReporter } from "./stratusJobService.js";

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

export interface StratusStatusSummary {
  sourceType: "package" | "assembly";
  trackingStatusId: string | null;
  trackingStatusName: string | null;
}

export interface ProjectImportPreviewRow {
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

export interface ProjectImportPreviewResult {
  rows: ProjectImportPreviewRow[];
  sourceInfo: StratusReadSourceInfo;
  summary: {
    totalProjects: number;
    createCount: number;
    updateCount: number;
    skipCount: number;
    excludedCount: number;
  };
  meta: StratusResultMeta;
}

export interface ProjectImportApplyResult {
  rows: Array<{
    action: "created" | "updated" | "skipped" | "excluded" | "failed";
    stratusProjectId: string;
    projectNumber: string | null;
    projectName: string | null;
    localProjectId: string | null;
    localProjectName: string | null;
    message: string | null;
  }>;
  sourceInfo: StratusReadSourceInfo;
  summary: {
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    excluded: number;
    failed: number;
  };
  meta: StratusResultMeta;
}

export interface PullPreviewAssemblyRow {
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
}

export interface PullPreviewRow {
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
  assemblyRows: PullPreviewAssemblyRow[];
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

export interface PullPreviewResult {
  rows: PullPreviewRow[];
  sourceInfo: StratusReadSourceInfo;
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
  meta: StratusResultMeta;
}

export interface PullApplyResult {
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
  sourceInfo: StratusReadSourceInfo;
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
  meta: StratusResultMeta;
}

export interface StratusResultMeta {
  skippedUnchangedPackages: number;
  undefinedPackageCount: number;
  orphanAssemblyCount: number;
  durationMs: number;
}

export interface StratusExecutionOptions {
  forceApiRead?: boolean;
  refreshMode?: "incremental" | "full";
  progress?: StratusJobProgressReporter;
  seedUpgrade?: boolean;
}

export interface PushPreviewResult {
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
  fieldResolution: FieldIdResolution;
}

export interface PushApplyResult {
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

export interface SyncToPrefabPreviewResult {
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
    changes: ScheduleMirrorChange[];
    warnings: string[];
  }>;
  summary: {
    candidateTaskCount: number;
    syncCount: number;
    skipCount: number;
  };
}

export interface SyncToPrefabApplyResult {
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

export interface RefreshFromPrefabPreviewResult {
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
    changes: ScheduleMirrorChange[];
    warnings: string[];
  }>;
  summary: {
    candidateTaskCount: number;
    refreshCount: number;
    skipCount: number;
  };
}

export interface RefreshFromPrefabApplyResult {
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

interface LoadedProjectTarget extends StratusProjectTarget {
  startDate: Date;
  stratusLastPullAt: Date | null;
  stratusLastPushAt: Date | null;
}

interface TaskWithSync extends Task {
  stratusSync: StratusTaskSync | null;
  stratusAssemblySync?: StratusAssemblySync | null;
}

type TaskWithAllSync = TaskWithSync & {
  stratusAssemblySync: StratusAssemblySync | null;
};

interface PreviewTaskRecord {
  id: string;
  name: string;
  externalKey: string | null;
  parentId: string | null;
  start?: Date;
  finish?: Date;
  deadline?: Date | null;
  durationMinutes?: number;
  percentComplete?: number;
  notes?: string | null;
  sortOrder: number;
  stratusSync:
    | {
        packageId: string;
        rawPackageJson?: string;
      }
    | null;
  stratusAssemblySync?:
    | {
        assemblyId: string;
        trackingStatusId: string | null;
        trackingStatusName: string | null;
      }
    | null;
}

interface LocalProjectRecord {
  id: string;
  name: string;
  startDate: Date;
  finishDate: Date | null;
  minutesPerDay: number;
  projectType: string | null;
  sector: string | null;
  region: string | null;
  stratusProjectId: string | null;
}

interface SyncProjectTarget {
  id: string;
  name: string;
  startDate: Date;
  minutesPerDay: number;
}

interface AppliedPackageGroup {
  anchorExistingTaskId: string | null;
  packageTaskId: string;
  childTaskIds: string[];
}

interface PreparedPackageBundle extends StratusPackageBundle {
  syncMeta?: IncrementalBundleSyncMeta;
}

interface PreparedProjectBundleGroup extends StratusProjectBundleGroup {
  bundles: PreparedPackageBundle[];
}

interface LocalPackageHierarchy {
  packageTask: PreviewTaskRecord;
  assemblyTasks: PreviewTaskRecord[];
}

interface IncrementalBundleSyncMeta {
  unchanged: boolean;
  skippedReason: string | null;
  localHierarchy: LocalPackageHierarchy | null;
}

interface ScheduleMirrorChange {
  field: "start" | "finish" | "deadline" | "duration";
  from: string | number | null;
  to: string | number | null;
}

const STRATUS_FETCH_CONCURRENCY = 6;
const STRATUS_SEED_FETCH_CONCURRENCY = 1;
const STRATUS_PREVIEW_CACHE_TTL_MS = 15 * 60 * 1_000;
const STRATUS_PREVIEW_CACHE_MAX_ENTRIES = 24;
const UNDEFINED_PACKAGE_PREFIX = "stratus-undefined-package:";

function resolvePackageFetchConcurrency(
  options: StratusExecutionOptions,
): number {
  if (options.seedUpgrade) {
    return STRATUS_SEED_FETCH_CONCURRENCY;
  }

  if (options.forceApiRead) {
    return 2;
  }

  return STRATUS_FETCH_CONCURRENCY;
}

function resolveProjectFetchConcurrency(
  options: StratusExecutionOptions,
): number {
  if (options.seedUpgrade) {
    return 1;
  }

  if (options.forceApiRead) {
    return 1;
  }

  return Math.max(1, Math.min(4, STRATUS_FETCH_CONCURRENCY));
}

function resolveAssemblyPageSize(
  options: StratusExecutionOptions,
): number | undefined {
  if (options.seedUpgrade || options.forceApiRead) {
    return 500;
  }

  return undefined;
}

const projectImportSnapshotCache = new Map<
  string,
  {
    createdAt: number;
    projects: NormalizedStratusProject[];
    sourceInfo: StratusReadSourceInfo;
  }
>();
const packageBundleSnapshotCache = new Map<
  string,
  {
    createdAt: number;
    bundles: PreparedPackageBundle[];
    sourceInfo: StratusReadSourceInfo;
  }
>();
const prefabGroupSnapshotCache = new Map<
  string,
  {
    createdAt: number;
    groups: PreparedProjectBundleGroup[];
    sourceInfo: StratusReadSourceInfo;
  }
>();

async function mapWithConcurrency<T, TResult>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(
        items[currentIndex] as T,
        currentIndex,
      );
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, items.length)) },
      () => worker(),
    ),
  );

  return results;
}

export async function loadProjectStratusTarget(
  projectId: string,
): Promise<LoadedProjectTarget> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      startDate: true,
      minutesPerDay: true,
      stratusProjectId: true,
      stratusModelId: true,
      stratusPackageWhere: true,
      stratusLastPullAt: true,
      stratusLastPushAt: true,
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  return project;
}

async function loadPrefabProjectOrThrow(): Promise<SyncProjectTarget> {
  const prefabProject = await prisma.project.findFirst({
    where: {
      name: {
        equals: "Prefab",
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      minutesPerDay: true,
    },
  });

  if (!prefabProject) {
    throw new Error(
      "Prefab project not found. Pull or import Stratus data first.",
    );
  }

  return prefabProject;
}

export async function getResolvedPushFieldIds(
  config: StratusConfig,
): Promise<FieldIdResolution> {
  const fields = await fetchCompanyFields(config);
  const resolution = resolveFieldIdsFromDefinitions(fields, config, config);
  const patch: Partial<StratusConfig> = {};
  if (
    resolution.startFieldId &&
    config.cachedStartDateFieldId !== resolution.startFieldId
  ) {
    patch.cachedStartDateFieldId = resolution.startFieldId;
  }
  if (
    resolution.finishFieldId &&
    config.cachedFinishDateFieldId !== resolution.finishFieldId
  ) {
    patch.cachedFinishDateFieldId = resolution.finishFieldId;
  }
  if (resolution.deadlineMode === "field") {
    if (
      resolution.deadlineFieldId &&
      config.cachedDeadlineFieldId !== resolution.deadlineFieldId
    ) {
      patch.cachedDeadlineFieldId = resolution.deadlineFieldId;
    }
  } else if (config.cachedDeadlineFieldId) {
    patch.cachedDeadlineFieldId = "";
  }
  if (Object.keys(patch).length > 0) {
    await setStratusConfig(patch);
  }
  return resolution;
}

export async function buildProjectStratusStatus(
  projectId: string,
  config: StratusConfig,
): Promise<{
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
}> {
  const [project, tasks] = await Promise.all([
    loadProjectStratusTarget(projectId),
    prisma.task.findMany({
      where: { projectId, stratusSync: { isNot: null } },
      include: { stratusSync: true },
    }),
  ]);

  const warnings: string[] = [];
  const prefabProject = isPrefabProjectName(project.name);
  const readConfigured = hasConfiguredStratusReadSource(config);
  if (!readConfigured) {
    warnings.push(
      "Set a Stratus app key or configure Stratus Big Data in Stratus Settings.",
    );
  }
  if (!prefabProject && !project.stratusProjectId && !project.stratusModelId) {
    warnings.push("Set a Stratus project id or model id for this project.");
  }
  if (
    config.importReadSource === "sqlPreferred" &&
    !isStratusBigDataConfigured(config)
  ) {
    warnings.push(
      "SQL import is selected, but Stratus Big Data is not fully configured. Reads will fall back to the Stratus API.",
    );
  }
  if (!config.appKey) {
    warnings.push("Set a Stratus app key to enable push to Stratus.");
  }

  const pushPreview = buildPushPreviewRows(tasks);
  const configured = readConfigured;
  const projectConfigured = prefabProject
    ? true
    : !!(project.stratusProjectId || project.stratusModelId);

  if (!prefabProject && tasks.length > 0) {
    warnings.push("Push is only enabled from the Prefab project.");
  }

  return {
    appKeySet: config.appKey.length > 0,
    configured,
    projectConfigured,
    canPull: readConfigured && projectConfigured,
    canPush: config.appKey.length > 0 && prefabProject && tasks.length > 0,
    linkedTaskCount: tasks.length,
    changedTaskCount: pushPreview.filter((row) => row.action === "push").length,
    stratusProjectId: project.stratusProjectId,
    stratusModelId: project.stratusModelId,
    stratusPackageWhere: project.stratusPackageWhere,
    lastPullAt: project.stratusLastPullAt?.toISOString() ?? null,
    lastPushAt: project.stratusLastPushAt?.toISOString() ?? null,
    warnings,
  };
}

export async function previewStratusProjectImport(
  config: StratusConfig,
  options: StratusExecutionOptions = {},
): Promise<ProjectImportPreviewResult> {
  const startedAt = Date.now();
  const effectiveConfig = buildEffectiveStratusConfig(config, options);
  options.progress?.({
    phase: "loadingProjects",
    message: "Loading active Stratus projects.",
  });
  const [sourceSnapshot, localProjects] = await Promise.all([
    loadProjectImportSnapshot(effectiveConfig, false),
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        startDate: true,
        finishDate: true,
        minutesPerDay: true,
        projectType: true,
        sector: true,
        region: true,
        stratusProjectId: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const rows = buildProjectImportPreviewRows(
    sourceSnapshot.projects,
    localProjects,
    config.excludedProjectIds,
  );

  return {
    rows,
    sourceInfo: sourceSnapshot.sourceInfo,
    summary: buildProjectImportPreviewSummary(rows),
    meta: buildStratusResultMeta({
      durationMs: Date.now() - startedAt,
    }),
  };
}

export async function applyStratusProjectImport(
  config: StratusConfig,
  options: StratusExecutionOptions = {},
): Promise<ProjectImportApplyResult> {
  const startedAt = Date.now();
  const effectiveConfig = buildEffectiveStratusConfig(config, options);
  options.progress?.({
    phase: "loadingProjects",
    message: "Loading active Stratus projects.",
  });
  const sourceSnapshot = await loadProjectImportSnapshot(effectiveConfig, true);
  const stratusProjects = sourceSnapshot.projects;
  const localProjects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      startDate: true,
      finishDate: true,
      minutesPerDay: true,
      projectType: true,
      sector: true,
      region: true,
      stratusProjectId: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  const previewRows = buildProjectImportPreviewRows(
    stratusProjects,
    localProjects,
    config.excludedProjectIds,
  );
  const preview = {
    rows: previewRows,
    summary: buildProjectImportPreviewSummary(previewRows),
  };
  const rows: ProjectImportApplyResult["rows"] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let excluded = 0;
  let failed = 0;
  const localProjectTargets = new Map<string, SyncProjectTarget>();
  const excludedProjectIds = new Set(
    preview.rows
      .filter((row) => row.action === "exclude")
      .map((row) => row.stratusProjectId),
  );

  for (const row of preview.rows) {
    if (row.action === "exclude") {
      rows.push({
        action: "excluded",
        stratusProjectId: row.stratusProjectId,
        projectNumber: row.projectNumber,
        projectName: row.projectName,
        localProjectId: row.localProjectId,
        localProjectName: row.localProjectName,
        message:
          row.warnings.join(". ") || "Project excluded by manual override.",
      });
      excluded++;
      continue;
    }

    if (row.action === "skip") {
      rows.push({
        action: "skipped",
        stratusProjectId: row.stratusProjectId,
        projectNumber: row.projectNumber,
        projectName: row.projectName,
        localProjectId: row.localProjectId,
        localProjectName: row.localProjectName,
        message: row.warnings.join(". ") || "Project already matches Stratus.",
      });
      if (row.localProjectId) {
        const existingProject = localProjects.find(
          (project) => project.id === row.localProjectId,
        );
        if (existingProject) {
          localProjectTargets.set(row.stratusProjectId, {
            id: existingProject.id,
            name: existingProject.name,
            startDate: existingProject.startDate,
            minutesPerDay: existingProject.minutesPerDay,
          });
        }
      }
      skipped++;
      continue;
    }

    try {
      if (row.action === "create") {
        const createdProject = await prisma.project.create({
          data: {
            name: row.mappedProject.name,
            startDate: new Date(row.mappedProject.startDate),
            finishDate: row.mappedProject.finishDate
              ? new Date(row.mappedProject.finishDate)
              : null,
            scheduleFrom: "start",
            projectType: row.mappedProject.projectType,
            sector: row.mappedProject.sector,
            region: row.mappedProject.region,
            stratusProjectId: row.stratusProjectId,
            stratusModelId: null,
            stratusPackageWhere: null,
          },
        });
        localProjectTargets.set(row.stratusProjectId, {
          id: createdProject.id,
          name: createdProject.name,
          startDate: createdProject.startDate,
          minutesPerDay: createdProject.minutesPerDay,
        });
        rows.push({
          action: "created",
          stratusProjectId: row.stratusProjectId,
          projectNumber: row.projectNumber,
          projectName: row.projectName,
          localProjectId: createdProject.id,
          localProjectName: createdProject.name,
          message: null,
        });
        created++;
      } else if (row.localProjectId) {
        const updatedProject = await prisma.project.update({
          where: { id: row.localProjectId },
          data: {
            name: row.mappedProject.name,
            startDate: new Date(row.mappedProject.startDate),
            finishDate: row.mappedProject.finishDate
              ? new Date(row.mappedProject.finishDate)
              : null,
            projectType: row.mappedProject.projectType,
            sector: row.mappedProject.sector,
            region: row.mappedProject.region,
            stratusProjectId: row.stratusProjectId,
          },
        });
        localProjectTargets.set(row.stratusProjectId, {
          id: updatedProject.id,
          name: updatedProject.name,
          startDate: updatedProject.startDate,
          minutesPerDay: updatedProject.minutesPerDay,
        });
        rows.push({
          action: "updated",
          stratusProjectId: row.stratusProjectId,
          projectNumber: row.projectNumber,
          projectName: row.projectName,
          localProjectId: updatedProject.id,
          localProjectName: updatedProject.name,
          message: null,
        });
        updated++;
      } else {
        rows.push({
          action: "skipped",
          stratusProjectId: row.stratusProjectId,
          projectNumber: row.projectNumber,
          projectName: row.projectName,
          localProjectId: null,
          localProjectName: null,
          message: "Preview row had no matching local project id.",
        });
        skipped++;
      }
    } catch (error) {
      rows.push({
        action: "failed",
        stratusProjectId: row.stratusProjectId,
        projectNumber: row.projectNumber,
        projectName: row.projectName,
        localProjectId: row.localProjectId,
        localProjectName: row.localProjectName,
        message:
          error instanceof Error ? error.message : "Project import failed.",
      });
      failed++;
    }
  }

  const now = new Date();
  const includedStratusProjects = stratusProjects.filter(
    (stratusProject) => !excludedProjectIds.has(stratusProject.id),
  );

  if (includedStratusProjects.length > 0) {
    options.progress?.({
      phase: "loadingPackages",
      message: "Loading project package bundles.",
      totalPackages: includedStratusProjects.length,
      processedPackages: 0,
      source: sourceSnapshot.sourceInfo.source,
    });
    const prefabProject = await ensurePrefabProject(includedStratusProjects);
    const loadedProjectGroups = (
      await mapWithConcurrency(
        includedStratusProjects,
        resolveProjectFetchConcurrency(options),
        async (stratusProject) => {
          const targetProject = localProjectTargets.get(stratusProject.id);
          if (!targetProject) {
            return null;
          }

          const syncTarget: LoadedProjectTarget = {
            id: targetProject.id,
            name: targetProject.name,
            startDate: targetProject.startDate,
            minutesPerDay: targetProject.minutesPerDay,
            stratusProjectId: stratusProject.id,
            stratusModelId: null,
            stratusPackageWhere: null,
            stratusLastPullAt: null,
            stratusLastPushAt: null,
          };
          const bundles = (
            await loadStratusPackageBundleSnapshot(syncTarget, effectiveConfig, true)
          ).bundles;
          options.progress?.({
            phase: "loadingPackages",
            message: `Loaded packages for ${stratusProject.name ?? stratusProject.id}.`,
          });
          return {
            stratusProject,
            targetProject,
            bundles,
          };
        },
      )
    ).filter(
      (
        value,
      ): value is {
        stratusProject: NormalizedStratusProject;
        targetProject: SyncProjectTarget;
        bundles: StratusPackageBundle[];
      } => value !== null,
    );

    const prefabGroups: StratusProjectBundleGroup[] = [];
    for (const loadedProjectGroup of loadedProjectGroups) {
      options.progress?.({
        phase: "applyingPackages",
        message: `Syncing ${loadedProjectGroup.stratusProject.name ?? loadedProjectGroup.stratusProject.id}.`,
      });
      prefabGroups.push({
        stratusProject: loadedProjectGroup.stratusProject,
        bundles: loadedProjectGroup.bundles,
      });

      await syncStratusProjectGroupsToProject(
        loadedProjectGroup.targetProject,
        [
          {
            stratusProject: loadedProjectGroup.stratusProject,
            bundles: loadedProjectGroup.bundles,
          },
        ],
        effectiveConfig,
        {
          includeProjectSummaries: false,
          canonicalPackageSync: false,
          referenceSourceProjectName: "Prefab",
        },
      );
      await prisma.project.update({
        where: { id: loadedProjectGroup.targetProject.id },
        data: { stratusLastPullAt: now },
      });
    }

    await syncStratusProjectGroupsToProject(
      prefabProject,
      prefabGroups,
      effectiveConfig,
      {
        includeProjectSummaries: false,
        canonicalPackageSync: true,
      },
    );
    await prisma.project.update({
      where: { id: prefabProject.id },
      data: { stratusLastPullAt: now },
    });
  }

  return {
    rows,
    sourceInfo: sourceSnapshot.sourceInfo,
    summary: {
      processed: preview.rows.length,
      created,
      updated,
      skipped,
      excluded,
      failed,
    },
    meta: buildStratusResultMeta({
      durationMs: Date.now() - startedAt,
    }),
  };
}

export async function previewStratusPull(
  projectId: string,
  config: StratusConfig,
  options: StratusExecutionOptions = {},
): Promise<PullPreviewResult> {
  const startedAt = Date.now();
  const effectiveConfig = buildEffectiveStratusConfig(config, options);
  const project = await loadProjectStratusTarget(projectId);
  options.progress?.({
    phase: "loadingPackages",
    message: isPrefabProjectName(project.name)
      ? "Loading active Stratus project groups."
      : "Loading Stratus packages.",
  });
  const tasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      externalKey: true,
      parentId: true,
      start: true,
      finish: true,
      deadline: true,
      durationMinutes: true,
      percentComplete: true,
      notes: true,
      sortOrder: true,
      stratusSync: {
        select: {
          packageId: true,
          rawPackageJson: true,
        },
      },
      stratusAssemblySync: {
        select: {
          assemblyId: true,
          trackingStatusId: true,
          trackingStatusName: true,
        },
      },
    },
  });

  const sourceSnapshot = isPrefabProjectName(project.name)
    ? await loadActiveStratusProjectGroupSnapshot(
        project,
        effectiveConfig,
        false,
        options,
      )
    : await loadStratusPackageBundleSnapshot(
        project,
        effectiveConfig,
        false,
        options,
      );
  options.progress?.({
    phase: "comparingLocal",
    message: "Comparing remote packages against local task hierarchy.",
    source: sourceSnapshot.sourceInfo.source,
  });
  const bundles =
    "groups" in sourceSnapshot
      ? sourceSnapshot.groups.flatMap((group) => group.bundles)
      : sourceSnapshot.bundles;
  const rows = buildPullPreviewRows(
    bundles,
    tasks,
    project.minutesPerDay,
    config,
    project.startDate,
  );
  return {
    rows,
    sourceInfo: sourceSnapshot.sourceInfo,
    summary: {
      totalPackages: rows.length,
      createCount: rows.filter((row) => row.action === "create").length,
      updateCount: rows.filter((row) => row.action === "update").length,
      skipCount: rows.filter((row) => row.action === "skip").length,
      totalAssemblies: rows.reduce((sum, row) => sum + row.assemblyCount, 0),
      createAssemblyCount: rows.reduce(
        (sum, row) => sum + row.createAssemblyCount,
        0,
      ),
      updateAssemblyCount: rows.reduce(
        (sum, row) => sum + row.updateAssemblyCount,
        0,
      ),
      skipAssemblyCount: rows.reduce(
        (sum, row) => sum + row.skipAssemblyCount,
        0,
      ),
    },
    meta: buildPullResultMeta(bundles, Date.now() - startedAt),
  };
}

export async function applyStratusPull(
  projectId: string,
  config: StratusConfig,
  options: StratusExecutionOptions = {},
): Promise<PullApplyResult> {
  const startedAt = Date.now();
  const effectiveConfig = buildEffectiveStratusConfig(config, options);
  const project = await loadProjectStratusTarget(projectId);
  if (isPrefabProjectName(project.name)) {
    options.progress?.({
      phase: "loadingPackages",
      message: "Loading active Stratus project groups.",
    });
    const sourceSnapshot = await loadActiveStratusProjectGroupSnapshot(
      project,
      effectiveConfig,
      true,
      { ...options, refreshMode: "full" },
    );
    const groups = sourceSnapshot.groups;
    const existingTasks = await prisma.task.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
      include: { stratusSync: true },
    });
    options.progress?.({
      phase: "comparingLocal",
      message: "Comparing remote packages against local Prefab hierarchy.",
      source: sourceSnapshot.sourceInfo.source,
    });
    const previewRows = buildPullPreviewRows(
      groups.flatMap((group) => group.bundles),
      existingTasks,
      project.minutesPerDay,
      effectiveConfig,
      project.startDate,
    );
    const previewRowByPackageId = new Map(
      previewRows.map((row) => [row.packageId, row]),
    );
    const actionableGroups = filterProjectGroupsForApply(
      groups,
      (bundle) =>
        (previewRowByPackageId.get(bundle.package.id)?.action ?? "create") !==
        "skip",
    );
    options.progress?.({
      phase: "applyingPackages",
      message: "Applying Stratus packages to Prefab.",
      totalPackages: previewRows.length,
      processedPackages: 0,
      totalAssemblies: previewRows.reduce(
        (sum, row) => sum + row.assemblyCount,
        0,
      ),
      processedAssemblies: 0,
      skippedUnchangedPackages: previewRows.filter(
        (row) => row.action === "skip",
      ).length,
    });
    if (actionableGroups.length > 0) {
      await syncStratusProjectGroupsToProject(
        {
          id: project.id,
          name: project.name,
          startDate: project.startDate,
          minutesPerDay: project.minutesPerDay,
        },
        actionableGroups,
        effectiveConfig,
        {
          includeProjectSummaries: false,
          canonicalPackageSync: true,
        },
      );
    }
    const now = new Date();
    await prisma.project.update({
      where: { id: projectId },
      data: { stratusLastPullAt: now },
    });

    return {
      rows: previewRows.map((row) => ({
        action:
          row.action === "skip"
            ? "skipped"
            : row.action === "create"
              ? "created"
              : "updated",
        packageId: row.packageId,
        packageNumber: row.packageNumber,
        packageName: row.packageName,
        taskId: row.taskId,
        taskName: row.taskName,
        createdAssemblies: row.createAssemblyCount,
        updatedAssemblies: row.updateAssemblyCount,
        skippedAssemblies: row.skipAssemblyCount,
        failedAssemblies: 0,
        message:
          row.action === "skip" ? row.warnings.join(". ") || "Skipped." : null,
      })),
      sourceInfo: sourceSnapshot.sourceInfo,
      summary: {
        processed: previewRows.length,
        created: previewRows.filter((row) => row.action === "create").length,
        updated: previewRows.filter((row) => row.action === "update").length,
        skipped: previewRows.filter((row) => row.action === "skip").length,
        failed: 0,
        totalAssemblies: previewRows.reduce(
          (sum, row) => sum + row.assemblyCount,
          0,
        ),
        createdAssemblies: previewRows.reduce(
          (sum, row) => sum + row.createAssemblyCount,
          0,
        ),
        updatedAssemblies: previewRows.reduce(
          (sum, row) => sum + row.updateAssemblyCount,
          0,
        ),
        skippedAssemblies: previewRows.reduce(
          (sum, row) => sum + row.skipAssemblyCount,
          0,
        ),
        failedAssemblies: 0,
      },
      meta: buildPullResultMeta(
        groups.flatMap((group) => group.bundles),
        Date.now() - startedAt,
      ),
    };
  }

  options.progress?.({
    phase: "loadingPackages",
    message: "Loading Stratus packages.",
  });
  const sourceSnapshot = await loadStratusPackageBundleSnapshot(
    project,
    effectiveConfig,
    true,
    options,
  );
  const bundles = sourceSnapshot.bundles;
  const existingTasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: { stratusSync: true },
  });
  options.progress?.({
    phase: "comparingLocal",
    message: "Comparing remote packages against local task hierarchy.",
    source: sourceSnapshot.sourceInfo.source,
  });
  const previewRows = buildPullPreviewRows(
    bundles,
    existingTasks,
    project.minutesPerDay,
    effectiveConfig,
    project.startDate,
  );
  const previewRowByPackageId = new Map(
    previewRows.map((row) => [row.packageId, row]),
  );
  const activeProjectBundles = bundles.filter(
    (bundle) =>
      (previewRowByPackageId.get(bundle.package.id)?.action ?? "create") !==
      "skip",
  );
  const prefabBundles = bundles.filter((bundle) => !bundle.syncMeta?.unchanged);
  const projectGroup: StratusProjectBundleGroup = {
    stratusProject: {
      id: project.stratusProjectId ?? project.id,
      number: null,
      name: project.name,
      status: null,
      category: null,
      phase: null,
      description: null,
      city: null,
      state: null,
      startDate: project.startDate.toISOString(),
      finishDate: null,
      rawProject: {},
    },
    bundles: activeProjectBundles,
  };
  options.progress?.({
    phase: "applyingPackages",
    message: "Applying Stratus packages to the active project.",
    totalPackages: previewRows.length,
    processedPackages: 0,
    totalAssemblies: previewRows.reduce((sum, row) => sum + row.assemblyCount, 0),
    processedAssemblies: 0,
    skippedUnchangedPackages: bundles.filter((bundle) => bundle.syncMeta?.unchanged)
      .length,
  });
  if (activeProjectBundles.length > 0) {
    await syncStratusProjectGroupsToProject(
      {
        id: project.id,
        name: project.name,
        startDate: project.startDate,
        minutesPerDay: project.minutesPerDay,
      },
      [projectGroup],
      effectiveConfig,
      {
        includeProjectSummaries: false,
        canonicalPackageSync: false,
        referenceSourceProjectName: "Prefab",
      },
    );
  }

  const prefabProject = await ensurePrefabProject([
    projectGroup.stratusProject,
  ]);
  if (prefabBundles.length > 0) {
    await syncStratusProjectGroupsToProject(
      prefabProject,
      [
        {
          stratusProject: projectGroup.stratusProject,
          bundles: prefabBundles,
        },
      ],
      effectiveConfig,
      {
        includeProjectSummaries: false,
        canonicalPackageSync: true,
      },
    );
  }

  const now = new Date();
  await prisma.project.updateMany({
    where: { id: { in: [projectId, prefabProject.id] } },
    data: { stratusLastPullAt: now },
  });

  return {
    rows: previewRows.map((row) => ({
      action:
        row.action === "skip"
          ? "skipped"
          : row.action === "create"
            ? "created"
            : "updated",
      packageId: row.packageId,
      packageNumber: row.packageNumber,
      packageName: row.packageName,
      taskId: row.taskId,
      taskName: row.taskName,
      createdAssemblies: row.createAssemblyCount,
      updatedAssemblies: row.updateAssemblyCount,
      skippedAssemblies: row.skipAssemblyCount,
      failedAssemblies: 0,
      message:
        row.action === "skip" ? row.warnings.join(". ") || "Skipped." : null,
    })),
    sourceInfo: sourceSnapshot.sourceInfo,
    summary: {
      processed: previewRows.length,
      created: previewRows.filter((row) => row.action === "create").length,
      updated: previewRows.filter((row) => row.action === "update").length,
      skipped: previewRows.filter((row) => row.action === "skip").length,
      failed: 0,
      totalAssemblies: previewRows.reduce(
        (sum, row) => sum + row.assemblyCount,
        0,
      ),
      createdAssemblies: previewRows.reduce(
        (sum, row) => sum + row.createAssemblyCount,
        0,
      ),
      updatedAssemblies: previewRows.reduce(
        (sum, row) => sum + row.updateAssemblyCount,
        0,
      ),
      skippedAssemblies: previewRows.reduce(
        (sum, row) => sum + row.skipAssemblyCount,
        0,
      ),
      failedAssemblies: 0,
    },
    meta: buildPullResultMeta(bundles, Date.now() - startedAt),
  };
}

export async function previewStratusPush(
  projectId: string,
  config: StratusConfig,
): Promise<PushPreviewResult> {
  const project = await loadProjectStratusTarget(projectId);
  if (!isPrefabProjectName(project.name)) {
    throw new Error("Push is only available from the Prefab project.");
  }

  const tasks = await prisma.task.findMany({
    where: { projectId, stratusSync: { isNot: null } },
    orderBy: { sortOrder: "asc" },
    include: { stratusSync: true },
  });
  const fieldResolution = await getResolvedPushFieldIds(config);
  const rows = buildPushPreviewRows(tasks);
  return {
    rows,
    summary: {
      linkedTaskCount: rows.length,
      pushCount: rows.filter((row) => row.action === "push").length,
      skipCount: rows.filter((row) => row.action === "skip").length,
    },
    fieldResolution,
  };
}

export async function applyStratusPush(
  projectId: string,
  config: StratusConfig,
): Promise<PushApplyResult> {
  const project = await loadProjectStratusTarget(projectId);
  if (!isPrefabProjectName(project.name)) {
    throw new Error("Push is only available from the Prefab project.");
  }

  const preview = await previewStratusPush(projectId, config);
  if (
    !preview.fieldResolution.canPush ||
    !preview.fieldResolution.startFieldId ||
    !preview.fieldResolution.finishFieldId ||
    (preview.fieldResolution.deadlineMode === "field" &&
      !preview.fieldResolution.deadlineFieldId)
  ) {
    throw new Error(
      preview.fieldResolution.message ??
        "Unable to resolve Stratus package date field ids.",
    );
  }

  const tasks = await prisma.task.findMany({
    where: { projectId, stratusSync: { isNot: null } },
    include: { stratusSync: true },
  });
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const now = new Date();

  const rows: PushApplyResult["rows"] = [];
  let pushed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of preview.rows) {
    const task = taskById.get(row.taskId);
    if (!task?.stratusSync) {
      rows.push({
        ...pushRowResultBase(row),
        action: "skipped",
        message: "Task is not linked to a Stratus package.",
      });
      skipped++;
      continue;
    }

    if (row.action === "skip" || row.changes.length === 0) {
      rows.push({
        ...pushRowResultBase(row),
        action: "skipped",
        message: row.warnings.join(". ") || "No changes to push.",
      });
      skipped++;
      continue;
    }

    try {
      const fieldUpdates: Array<{ key: string; value: string | null }> = [];
      if (row.changes.some((change) => change.field === "start")) {
        fieldUpdates.push({
          key: preview.fieldResolution.startFieldId,
          value: task.start.toISOString(),
        });
      }
      if (row.changes.some((change) => change.field === "finish")) {
        fieldUpdates.push({
          key: preview.fieldResolution.finishFieldId,
          value: task.finish.toISOString(),
        });
      }
      if (row.changes.some((change) => change.field === "deadline")) {
        if (preview.fieldResolution.deadlineMode === "property") {
          await patchPackageProperties(config, task.stratusSync.packageId, {
            requiredDT: task.deadline ? task.deadline.toISOString() : null,
          });
        } else if (preview.fieldResolution.deadlineFieldId) {
          fieldUpdates.push({
            key: preview.fieldResolution.deadlineFieldId,
            value: task.deadline ? task.deadline.toISOString() : null,
          });
        }
      }
      if (fieldUpdates.length > 0) {
        await patchPackageFields(
          config,
          task.stratusSync.packageId,
          fieldUpdates,
        );
      }

      await prisma.stratusTaskSync.update({
        where: { taskId: task.id },
        data: {
          lastPushedAt: now,
          syncedStartSignature: toDateSignature(task.start),
          syncedFinishSignature: toDateSignature(task.finish),
          syncedDeadlineSignature: toDateSignature(task.deadline),
        },
      });
      rows.push({ ...pushRowResultBase(row), action: "pushed", message: null });
      pushed++;
    } catch (error) {
      rows.push({
        ...pushRowResultBase(row),
        action: "failed",
        message: error instanceof Error ? error.message : "Push failed.",
      });
      failed++;
    }
  }

  if (pushed > 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: { stratusLastPushAt: now },
    });
  }

  return {
    rows,
    summary: {
      processed: preview.rows.length,
      pushed,
      skipped,
      failed,
    },
  };
}

export async function previewStratusSyncToPrefab(
  projectId: string,
): Promise<SyncToPrefabPreviewResult> {
  const sourceProject = await loadProjectStratusTarget(projectId);
  if (isPrefabProjectName(sourceProject.name)) {
    throw new Error(
      "Sync to Prefab is only available from project-specific Stratus references.",
    );
  }

  const prefabProject = await loadPrefabProjectOrThrow();
  const [sourceTasks, prefabTasks] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, externalKey: { not: null } },
      orderBy: { sortOrder: "asc" },
      include: { stratusSync: true },
    }),
    prisma.task.findMany({
      where: { projectId: prefabProject.id, externalKey: { not: null } },
      orderBy: { sortOrder: "asc" },
      include: { stratusSync: true },
    }),
  ]);

  const rows = buildSyncToPrefabPreviewRows(sourceTasks, prefabTasks);
  return {
    sourceProjectId: sourceProject.id,
    sourceProjectName: sourceProject.name,
    prefabProjectId: prefabProject.id,
    prefabProjectName: prefabProject.name,
    rows,
    summary: {
      candidateTaskCount: rows.length,
      syncCount: rows.filter((row) => row.action === "sync").length,
      skipCount: rows.filter((row) => row.action === "skip").length,
    },
  };
}

export async function applyStratusSyncToPrefab(
  projectId: string,
): Promise<SyncToPrefabApplyResult> {
  const preview = await previewStratusSyncToPrefab(projectId);
  const sourceTasks = await prisma.task.findMany({
    where: {
      id: {
        in: preview.rows.map((row) => row.sourceTaskId),
      },
    },
    include: { stratusSync: true },
  });
  const sourceTaskById = new Map(sourceTasks.map((task) => [task.id, task]));

  const rows: SyncToPrefabApplyResult["rows"] = [];
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of preview.rows) {
    if (row.action === "skip" || !row.prefabTaskId) {
      rows.push({
        action: "skipped",
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: row.warnings.join(". ") || "No Prefab sync changes to apply.",
      });
      skipped++;
      continue;
    }

    const sourceTask = sourceTaskById.get(row.sourceTaskId);
    if (!sourceTask) {
      rows.push({
        action: "failed",
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: "Source task could not be loaded.",
      });
      failed++;
      continue;
    }

    try {
      await prisma.task.update({
        where: { id: row.prefabTaskId },
        data: {
          start: sourceTask.start,
          finish: sourceTask.finish,
          deadline: sourceTask.deadline,
          durationMinutes: sourceTask.durationMinutes,
          isManuallyScheduled: true,
        },
      });
      rows.push({
        action: "synced",
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: null,
      });
      synced++;
    } catch (error) {
      rows.push({
        action: "failed",
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message:
          error instanceof Error ? error.message : "Sync to Prefab failed.",
      });
      failed++;
    }
  }

  return {
    sourceProjectId: preview.sourceProjectId,
    sourceProjectName: preview.sourceProjectName,
    prefabProjectId: preview.prefabProjectId,
    prefabProjectName: preview.prefabProjectName,
    rows,
    summary: {
      processed: preview.rows.length,
      synced,
      skipped,
      failed,
    },
  };
}

export async function previewStratusRefreshFromPrefab(
  projectId: string,
): Promise<RefreshFromPrefabPreviewResult> {
  const sourceProject = await loadProjectStratusTarget(projectId);
  if (isPrefabProjectName(sourceProject.name)) {
    throw new Error(
      "Refresh from Prefab is only available from project-specific Stratus references.",
    );
  }

  const prefabProject = await loadPrefabProjectOrThrow();
  const [sourceTasks, prefabTasks] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, externalKey: { not: null } },
      orderBy: { sortOrder: "asc" },
      include: { stratusSync: true },
    }),
    prisma.task.findMany({
      where: { projectId: prefabProject.id, externalKey: { not: null } },
      orderBy: { sortOrder: "asc" },
      include: { stratusSync: true },
    }),
  ]);

  const rows = buildRefreshFromPrefabPreviewRows(sourceTasks, prefabTasks);
  return {
    sourceProjectId: sourceProject.id,
    sourceProjectName: sourceProject.name,
    prefabProjectId: prefabProject.id,
    prefabProjectName: prefabProject.name,
    rows,
    summary: {
      candidateTaskCount: rows.length,
      refreshCount: rows.filter((row) => row.action === "refresh").length,
      skipCount: rows.filter((row) => row.action === "skip").length,
    },
  };
}

export async function applyStratusRefreshFromPrefab(
  projectId: string,
): Promise<RefreshFromPrefabApplyResult> {
  const preview = await previewStratusRefreshFromPrefab(projectId);
  const prefabTasks = await prisma.task.findMany({
    where: {
      id: {
        in: preview.rows
          .map((row) => row.prefabTaskId)
          .filter((taskId): taskId is string => typeof taskId === "string"),
      },
    },
    include: { stratusSync: true },
  });
  const prefabTaskById = new Map(prefabTasks.map((task) => [task.id, task]));

  const rows: RefreshFromPrefabApplyResult["rows"] = [];
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of preview.rows) {
    if (row.action === "skip" || !row.prefabTaskId) {
      rows.push({
        action: "skipped",
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: row.warnings.join(". ") || "No Prefab changes to refresh.",
      });
      skipped++;
      continue;
    }

    const prefabTask = prefabTaskById.get(row.prefabTaskId);
    if (!prefabTask) {
      rows.push({
        action: "failed",
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: "Prefab task could not be loaded.",
      });
      failed++;
      continue;
    }

    try {
      await prisma.task.update({
        where: { id: row.sourceTaskId },
        data: {
          start: prefabTask.start,
          finish: prefabTask.finish,
          deadline: prefabTask.deadline,
          durationMinutes: prefabTask.durationMinutes,
          isManuallyScheduled: true,
        },
      });
      rows.push({
        action: "refreshed",
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: null,
      });
      refreshed++;
    } catch (error) {
      rows.push({
        action: "failed",
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message:
          error instanceof Error
            ? error.message
            : "Refresh from Prefab failed.",
      });
      failed++;
    }
  }

  return {
    sourceProjectId: preview.sourceProjectId,
    sourceProjectName: preview.sourceProjectName,
    prefabProjectId: preview.prefabProjectId,
    prefabProjectName: preview.prefabProjectName,
    rows,
    summary: {
      processed: preview.rows.length,
      refreshed,
      skipped,
      failed,
    },
  };
}

export function buildProjectImportPreviewRows(
  stratusProjects: NormalizedStratusProject[],
  localProjects: LocalProjectRecord[],
  excludedProjectIds: readonly string[] = [],
): ProjectImportPreviewRow[] {
  const localProjectsByStratusId = new Map<string, LocalProjectRecord[]>();
  const excludedProjectIdSet = new Set(excludedProjectIds);

  for (const project of localProjects) {
    if (!project.stratusProjectId) {
      continue;
    }
    const bucket = localProjectsByStratusId.get(project.stratusProjectId) ?? [];
    bucket.push(project);
    localProjectsByStratusId.set(project.stratusProjectId, bucket);
  }

  return stratusProjects.map((stratusProject) => {
    const warnings: string[] = [];
    const mappedProject = mapStratusProjectToLocalProjectData(stratusProject);
    const matches = stratusProject.id
      ? (localProjectsByStratusId.get(stratusProject.id) ?? [])
      : [];
    const localProject = matches[0] ?? null;
    let action: ProjectImportPreviewRow["action"] = "create";

    if (!stratusProject.id) {
      action = "skip";
      warnings.push("Stratus project id is missing.");
    } else if (excludedProjectIdSet.has(stratusProject.id)) {
      action = "exclude";
      warnings.push("Excluded from import by manual override.");
    } else if (matches.length > 1) {
      action = "skip";
      warnings.push(
        `Stratus project ${stratusProject.id} matches multiple local projects.`,
      );
    } else if (localProject) {
      action = areProjectsEquivalent(localProject, mappedProject)
        ? "skip"
        : "update";
    }

    if (!stratusProject.number) {
      warnings.push("Stratus project number is missing.");
    }
    if (!stratusProject.name) {
      warnings.push("Stratus project name is missing.");
    }

    return {
      action,
      stratusProjectId: stratusProject.id,
      projectNumber: stratusProject.number,
      projectName: stratusProject.name,
      localProjectId: localProject?.id ?? null,
      localProjectName: localProject?.name ?? null,
      warnings,
      mappedProject,
    };
  });
}

function buildProjectImportPreviewSummary(
  rows: ProjectImportPreviewRow[],
): ProjectImportPreviewResult["summary"] {
  return {
    totalProjects: rows.length,
    createCount: rows.filter((row) => row.action === "create").length,
    updateCount: rows.filter((row) => row.action === "update").length,
    skipCount: rows.filter((row) => row.action === "skip").length,
    excludedCount: rows.filter((row) => row.action === "exclude").length,
  };
}

type StratusTaskMappingConfig = Pick<
  StratusConfig,
  | "taskNameField"
  | "durationDaysField"
  | "durationHoursField"
  | "startDateField"
  | "finishDateField"
  | "deadlineField"
  | "statusProgressMappings"
>;

interface StatusProgressLookup {
  byId: Map<string, number | null>;
  byName: Map<string, number | null>;
}

function buildStatusProgressLookup(
  mappings: StratusStatusProgressMapping[],
): StatusProgressLookup {
  const byId = new Map<string, number | null>();
  const byName = new Map<string, number | null>();

  for (const mapping of mappings) {
    const statusId = normalizeLookupKey(mapping.statusId);
    const statusName = normalizeLookupKey(mapping.statusName);
    if (statusId) {
      byId.set(statusId, mapping.percentCompleteShop);
    }
    if (statusName) {
      byName.set(statusName, mapping.percentCompleteShop);
    }
  }

  return { byId, byName };
}

function normalizeLookupKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function buildPullPreviewRows(
  bundles: PreparedPackageBundle[],
  tasks: PreviewTaskRecord[],
  minutesPerDay: number,
  config: StratusTaskMappingConfig,
  projectStartDate: Date | null = null,
): PullPreviewRow[] {
  const syncByPackageId = new Map<string, PreviewTaskRecord>();
  const tasksByExternalKey = new Map<string, PreviewTaskRecord[]>();
  const statusLookup = buildStatusProgressLookup(config.statusProgressMappings);

  for (const task of tasks) {
    if (task.stratusSync?.packageId) {
      syncByPackageId.set(task.stratusSync.packageId, task);
    }
    if (task.externalKey) {
      const bucket = tasksByExternalKey.get(task.externalKey) ?? [];
      bucket.push(task);
      tasksByExternalKey.set(task.externalKey, bucket);
    }
  }

  return bundles.map((bundle) => {
    const pkg = bundle.package;
    const mappedPackage = createMappedPackagePreviewData(
      pkg,
      minutesPerDay,
      config,
      statusLookup,
      projectStartDate,
    );
    const byPackage = syncByPackageId.get(pkg.id) ?? null;
    const byExternalKey = pkg.externalKey
      ? (tasksByExternalKey.get(pkg.externalKey) ?? [])
      : [];
    const warnings: string[] = [];
    let action: PullPreviewRow["action"] = "create";
    let matchStrategy: PullPreviewRow["matchStrategy"] = "none";
    let taskId: string | null = null;
    let taskName: string | null = null;

    if (bundle.syncMeta?.unchanged && bundle.syncMeta.localHierarchy) {
      const localPackageTask = bundle.syncMeta.localHierarchy.packageTask;
      const localAssemblyTasks = bundle.syncMeta.localHierarchy.assemblyTasks;
      const localPackageMapped = createLocalTaskPreviewData(
        localPackageTask,
        pkg.externalKey ?? pkg.id,
      );

      if (localPackageTask.stratusSync?.packageId === pkg.id) {
        matchStrategy = "packageId";
      } else if (
        localPackageTask.externalKey &&
        localPackageTask.externalKey === pkg.externalKey
      ) {
        matchStrategy = "externalKey";
      }

      taskId = localPackageTask.id;
      taskName = localPackageTask.name;
      warnings.push(
        bundle.syncMeta.skippedReason ?? "Package unchanged since last pull.",
      );

      const assemblyRows = localAssemblyTasks.map((assemblyTask) => ({
        action: "skip" as const,
        assemblyId:
          extractAssemblyIdFromExternalKey(assemblyTask.externalKey) ??
          assemblyTask.id,
        assemblyName: assemblyTask.name,
        externalKey: assemblyTask.externalKey ?? assemblyTask.id,
        taskId: assemblyTask.id,
        taskName: assemblyTask.name,
        warnings: [
          "Assembly unchanged since last pull.",
        ],
        mappedTask: createLocalTaskPreviewData(
          assemblyTask,
          assemblyTask.externalKey ?? assemblyTask.id,
        ),
      }));

      return {
        action: "skip",
        matchStrategy,
        packageId: pkg.id,
        packageNumber: pkg.packageNumber,
        packageName: pkg.packageName,
        externalKey: pkg.externalKey,
        taskId,
        taskName,
        warnings,
        assemblyCount: assemblyRows.length,
        createAssemblyCount: 0,
        updateAssemblyCount: 0,
        skipAssemblyCount: assemblyRows.length,
        assemblyRows,
        mappedTask: localPackageMapped,
      };
    }

    if (byPackage) {
      action = "update";
      matchStrategy = "packageId";
      taskId = byPackage.id;
      taskName = byPackage.name;
    } else if (byExternalKey.length === 1) {
      action = "update";
      matchStrategy = "externalKey";
      taskId = byExternalKey[0]?.id ?? null;
      taskName = byExternalKey[0]?.name ?? null;
    } else if (byExternalKey.length > 1) {
      action = "skip";
      warnings.push(`External key ${pkg.externalKey} matches multiple tasks`);
    }

    if (!pkg.packageNumber) {
      warnings.push("Package number is missing");
    }
    if (!pkg.externalKey) {
      warnings.push("External key could not be derived");
    }

    const assemblyRows = bundle.assemblies.map((assembly) => {
      const assemblyMapped = createMappedAssemblyPreviewData(
        minutesPerDay,
        pkg,
        assembly,
        config,
        statusLookup,
        projectStartDate,
      );
      const assemblyWarnings: string[] = [];
      const matches = tasksByExternalKey.get(assembly.externalKey) ?? [];
      let assemblyAction: PullPreviewAssemblyRow["action"] = "create";
      let assemblyTaskId: string | null = null;
      let assemblyTaskName: string | null = null;

      if (action === "skip") {
        assemblyAction = "skip";
        assemblyWarnings.push("Package row will be skipped.");
      } else if (matches.length === 1) {
        assemblyAction = "update";
        assemblyTaskId = matches[0]?.id ?? null;
        assemblyTaskName = matches[0]?.name ?? null;
      } else if (matches.length > 1) {
        assemblyAction = "skip";
        assemblyWarnings.push(
          `Assembly external key ${assembly.externalKey} matches multiple tasks`,
        );
      }

      if (!assembly.name) {
        assemblyWarnings.push("Assembly name is missing");
      }

      return {
        action: assemblyAction,
        assemblyId: assembly.id,
        assemblyName: assembly.name,
        externalKey: assembly.externalKey,
        taskId: assemblyTaskId,
        taskName: assemblyTaskName,
        warnings: assemblyWarnings,
        mappedTask: assemblyMapped,
      };
    });

    return {
      action,
      matchStrategy,
      packageId: pkg.id,
      packageNumber: pkg.packageNumber,
      packageName: pkg.packageName,
      externalKey: pkg.externalKey,
      taskId,
      taskName,
      warnings,
      assemblyCount: assemblyRows.length,
      createAssemblyCount: assemblyRows.filter((row) => row.action === "create")
        .length,
      updateAssemblyCount: assemblyRows.filter((row) => row.action === "update")
        .length,
      skipAssemblyCount: assemblyRows.filter((row) => row.action === "skip")
        .length,
      assemblyRows,
      mappedTask: mappedPackage,
    };
  });
}

export function buildPushPreviewRows(tasks: TaskWithSync[]) {
  return tasks.map((task) => {
    if (!task.stratusSync) {
      return {
        action: "skip" as const,
        taskId: task.id,
        taskName: task.name,
        packageId: "",
        packageNumber: null,
        packageName: null,
        changes: [],
        warnings: ["Task is not linked to a Stratus package"],
      };
    }

    const changes: Array<{
      field: "start" | "finish" | "deadline";
      from: string | null;
      to: string | null;
    }> = [];
    const currentStart = toDateSignature(task.start);
    const currentFinish = toDateSignature(task.finish);
    const currentDeadline = toDateSignature(task.deadline);

    if (currentStart !== task.stratusSync.syncedStartSignature) {
      changes.push({
        field: "start",
        from: task.stratusSync.syncedStartSignature,
        to: currentStart,
      });
    }
    if (currentFinish !== task.stratusSync.syncedFinishSignature) {
      changes.push({
        field: "finish",
        from: task.stratusSync.syncedFinishSignature,
        to: currentFinish,
      });
    }
    if (currentDeadline !== task.stratusSync.syncedDeadlineSignature) {
      changes.push({
        field: "deadline",
        from: task.stratusSync.syncedDeadlineSignature,
        to: currentDeadline,
      });
    }

    return {
      action: changes.length > 0 ? ("push" as const) : ("skip" as const),
      taskId: task.id,
      taskName: task.name,
      packageId: task.stratusSync.packageId,
      packageNumber: task.stratusSync.packageNumber,
      packageName: task.stratusSync.packageName,
      changes,
      warnings: changes.length === 0 ? ["No date changes to push"] : [],
    };
  });
}

export function buildSyncToPrefabPreviewRows(
  sourceTasks: TaskWithSync[],
  prefabTasks: TaskWithSync[],
) {
  const prefabTasksByExternalKey = new Map<string, TaskWithSync[]>();
  for (const task of prefabTasks) {
    if (!task.externalKey || !isPrefabSyncCandidate(task)) {
      continue;
    }
    const bucket = prefabTasksByExternalKey.get(task.externalKey) ?? [];
    bucket.push(task);
    prefabTasksByExternalKey.set(task.externalKey, bucket);
  }

  return sourceTasks
    .filter(isProjectReferenceSyncCandidate)
    .map((sourceTask) => {
      const warnings: string[] = [];
      const matches =
        prefabTasksByExternalKey.get(sourceTask.externalKey) ?? [];
      const prefabTask = matches.length === 1 ? (matches[0] ?? null) : null;

      if (matches.length === 0) {
        warnings.push("No matching Prefab package task was found.");
      } else if (matches.length > 1) {
        warnings.push(
          `External key ${sourceTask.externalKey} matches multiple Prefab tasks.`,
        );
      }

      const changes: ScheduleMirrorChange[] = [];
      if (prefabTask) {
        const prefabStart = toIsoSignature(prefabTask.start);
        const sourceStart = toIsoSignature(sourceTask.start);
        const prefabFinish = toIsoSignature(prefabTask.finish);
        const sourceFinish = toIsoSignature(sourceTask.finish);
        const prefabDeadline = toIsoSignature(prefabTask.deadline);
        const sourceDeadline = toIsoSignature(sourceTask.deadline);
        const prefabDuration = prefabTask.durationMinutes;
        const sourceDuration = sourceTask.durationMinutes;

        if (prefabStart !== sourceStart) {
          changes.push({ field: "start", from: prefabStart, to: sourceStart });
        }
        if (prefabFinish !== sourceFinish) {
          changes.push({
            field: "finish",
            from: prefabFinish,
            to: sourceFinish,
          });
        }
        if (prefabDeadline !== sourceDeadline) {
          changes.push({
            field: "deadline",
            from: prefabDeadline,
            to: sourceDeadline,
          });
        }
        if (prefabDuration !== sourceDuration) {
          changes.push({
            field: "duration",
            from: prefabDuration,
            to: sourceDuration,
          });
        }
      }

      return {
        action:
          warnings.length === 0 && changes.length > 0
            ? ("sync" as const)
            : ("skip" as const),
        sourceTaskId: sourceTask.id,
        sourceTaskName: sourceTask.name,
        prefabTaskId: prefabTask?.id ?? null,
        prefabTaskName: prefabTask?.name ?? null,
        externalKey: sourceTask.externalKey ?? sourceTask.id,
        changes,
        warnings:
          warnings.length === 0 && changes.length === 0
            ? ["No schedule changes to sync"]
            : warnings,
      };
    });
}

export function buildRefreshFromPrefabPreviewRows(
  sourceTasks: TaskWithSync[],
  prefabTasks: TaskWithSync[],
) {
  const prefabTasksByExternalKey = new Map<string, TaskWithSync[]>();
  for (const task of prefabTasks) {
    if (!task.externalKey || !isPrefabRefreshCandidate(task)) {
      continue;
    }
    const bucket = prefabTasksByExternalKey.get(task.externalKey) ?? [];
    bucket.push(task);
    prefabTasksByExternalKey.set(task.externalKey, bucket);
  }

  return sourceTasks
    .filter(isProjectReferenceRefreshCandidate)
    .map((sourceTask) => {
      const warnings: string[] = [];
      const matches =
        prefabTasksByExternalKey.get(sourceTask.externalKey) ?? [];
      const prefabTask = matches.length === 1 ? (matches[0] ?? null) : null;

      if (matches.length === 0) {
        warnings.push("No matching Prefab reference was found.");
      } else if (matches.length > 1) {
        warnings.push(
          `External key ${sourceTask.externalKey} matches multiple Prefab tasks.`,
        );
      }

      const changes: ScheduleMirrorChange[] = [];
      if (prefabTask) {
        const sourceStart = toIsoSignature(sourceTask.start);
        const prefabStart = toIsoSignature(prefabTask.start);
        const sourceFinish = toIsoSignature(sourceTask.finish);
        const prefabFinish = toIsoSignature(prefabTask.finish);
        const sourceDeadline = toIsoSignature(sourceTask.deadline);
        const prefabDeadline = toIsoSignature(prefabTask.deadline);
        const sourceDuration = sourceTask.durationMinutes;
        const prefabDuration = prefabTask.durationMinutes;

        if (sourceStart !== prefabStart) {
          changes.push({ field: "start", from: sourceStart, to: prefabStart });
        }
        if (sourceFinish !== prefabFinish) {
          changes.push({
            field: "finish",
            from: sourceFinish,
            to: prefabFinish,
          });
        }
        if (sourceDeadline !== prefabDeadline) {
          changes.push({
            field: "deadline",
            from: sourceDeadline,
            to: prefabDeadline,
          });
        }
        if (sourceDuration !== prefabDuration) {
          changes.push({
            field: "duration",
            from: sourceDuration,
            to: prefabDuration,
          });
        }
      }

      return {
        action:
          warnings.length === 0 && changes.length > 0
            ? ("refresh" as const)
            : ("skip" as const),
        sourceTaskId: sourceTask.id,
        sourceTaskName: sourceTask.name,
        prefabTaskId: prefabTask?.id ?? null,
        prefabTaskName: prefabTask?.name ?? null,
        externalKey: sourceTask.externalKey ?? sourceTask.id,
        changes,
        warnings:
          warnings.length === 0 && changes.length === 0
            ? ["No Prefab schedule changes to refresh"]
            : warnings,
      };
    });
}

export function toStratusSyncSummary(
  sync: StratusTaskSync | null,
  includePulledSignatures = true,
): StratusSyncSummary | null {
  if (!sync) {
    return null;
  }

  const summary: StratusSyncSummary = {
    packageId: sync.packageId,
    packageNumber: sync.packageNumber,
    packageName: sync.packageName,
    trackingStatusId: sync.trackingStatusId,
    trackingStatusName: sync.trackingStatusName,
    lastPulledAt: sync.lastPulledAt.toISOString(),
    lastPushedAt: sync.lastPushedAt?.toISOString() ?? null,
  };

  if (includePulledSignatures) {
    summary.pulledStart = sync.syncedStartSignature;
    summary.pulledFinish = sync.syncedFinishSignature;
    summary.pulledDeadline = sync.syncedDeadlineSignature;
  }

  return summary;
}

export function toStratusStatusSummary(
  sync: StratusTaskSync | null,
  assemblySync: StratusAssemblySync | null | undefined,
): StratusStatusSummary | null {
  if (sync) {
    return {
      sourceType: "package",
      trackingStatusId: sync.trackingStatusId,
      trackingStatusName: sync.trackingStatusName,
    };
  }

  if (assemblySync) {
    return {
      sourceType: "assembly",
      trackingStatusId: assemblySync.trackingStatusId,
      trackingStatusName: assemblySync.trackingStatusName,
    };
  }

  return null;
}

function isProjectReferenceSyncCandidate(
  task: TaskWithSync,
): task is TaskWithSync & { externalKey: string } {
  return (
    typeof task.externalKey === "string" &&
    task.externalKey.length > 0 &&
    !task.externalKey.startsWith("stratus-project:") &&
    !task.externalKey.includes("::assembly:")
  );
}

function isPrefabSyncCandidate(task: TaskWithSync) {
  return isProjectReferenceSyncCandidate(task) && task.stratusSync !== null;
}

function isProjectReferenceRefreshCandidate(
  task: TaskWithSync,
): task is TaskWithSync & { externalKey: string } {
  return (
    typeof task.externalKey === "string" &&
    task.externalKey.length > 0 &&
    !task.externalKey.startsWith("stratus-project:")
  );
}

function isPrefabRefreshCandidate(
  task: TaskWithSync,
): task is TaskWithSync & { externalKey: string } {
  return (
    typeof task.externalKey === "string" &&
    task.externalKey.length > 0 &&
    !task.externalKey.startsWith("stratus-project:")
  );
}

function toIsoSignature(date: Date | null) {
  return date ? date.toISOString() : null;
}

function isTaskDataEquivalent(
  existingTask: TaskWithSync,
  data: Pick<
    Task,
    | "name"
    | "parentId"
    | "outlineLevel"
    | "type"
    | "start"
    | "finish"
    | "deadline"
    | "durationMinutes"
    | "percentComplete"
    | "isManuallyScheduled"
    | "notes"
    | "externalKey"
    | "sortOrder"
  >,
) {
  return (
    existingTask.name === data.name &&
    existingTask.parentId === data.parentId &&
    existingTask.outlineLevel === data.outlineLevel &&
    existingTask.type === data.type &&
    toIsoSignature(existingTask.start) === toIsoSignature(data.start) &&
    toIsoSignature(existingTask.finish) === toIsoSignature(data.finish) &&
    toIsoSignature(existingTask.deadline) === toIsoSignature(data.deadline) &&
    existingTask.durationMinutes === data.durationMinutes &&
    existingTask.percentComplete === data.percentComplete &&
    existingTask.isManuallyScheduled === data.isManuallyScheduled &&
    existingTask.notes === data.notes &&
    existingTask.externalKey === data.externalKey &&
    existingTask.sortOrder === data.sortOrder
  );
}

function isStratusTaskSyncEquivalent(
  existingSync: StratusTaskSync,
  taskId: string,
  data: Pick<
    StratusTaskSync,
    | "localProjectId"
    | "packageId"
    | "projectId"
    | "modelId"
    | "externalKey"
    | "packageNumber"
    | "packageName"
    | "trackingStatusId"
    | "trackingStatusName"
    | "rawPackageJson"
    | "syncedStartSignature"
    | "syncedFinishSignature"
    | "syncedDeadlineSignature"
  >,
) {
  return (
    existingSync.taskId === taskId &&
    existingSync.localProjectId === data.localProjectId &&
    existingSync.packageId === data.packageId &&
    existingSync.projectId === data.projectId &&
    existingSync.modelId === data.modelId &&
    existingSync.externalKey === data.externalKey &&
    existingSync.packageNumber === data.packageNumber &&
    existingSync.packageName === data.packageName &&
    existingSync.trackingStatusId === data.trackingStatusId &&
    existingSync.trackingStatusName === data.trackingStatusName &&
    existingSync.rawPackageJson === data.rawPackageJson &&
    existingSync.syncedStartSignature === data.syncedStartSignature &&
    existingSync.syncedFinishSignature === data.syncedFinishSignature &&
    existingSync.syncedDeadlineSignature === data.syncedDeadlineSignature
  );
}

function isStratusAssemblySyncEquivalent(
  existingSync: StratusAssemblySync,
  taskId: string,
  data: Pick<
    StratusAssemblySync,
    | "localProjectId"
    | "packageId"
    | "assemblyId"
    | "externalKey"
    | "trackingStatusId"
    | "trackingStatusName"
  >,
) {
  return (
    existingSync.taskId === taskId &&
    existingSync.localProjectId === data.localProjectId &&
    existingSync.packageId === data.packageId &&
    existingSync.assemblyId === data.assemblyId &&
    existingSync.externalKey === data.externalKey &&
    existingSync.trackingStatusId === data.trackingStatusId &&
    existingSync.trackingStatusName === data.trackingStatusName
  );
}

async function loadProjectImportSnapshot(
  config: StratusConfig,
  preferCached: boolean,
  _options: StratusExecutionOptions = {},
): Promise<{
  projects: NormalizedStratusProject[];
  sourceInfo: StratusReadSourceInfo;
}> {
  const cacheKey = buildProjectImportSnapshotKey(config);
  if (preferCached) {
    const cached = getCachedSnapshot(projectImportSnapshotCache, cacheKey);
    if (cached) {
      return cached;
    }
  }

  const snapshot = await loadProjectImportSnapshotFromSource(config);
  setCachedSnapshot(projectImportSnapshotCache, cacheKey, snapshot);
  return snapshot;
}

async function loadProjectImportSnapshotFromSource(config: StratusConfig) {
  if (shouldPreferSqlBigData(config)) {
    try {
      return await loadBigDataProjectImportSnapshot(config);
    } catch (error) {
      return loadApiProjectImportSnapshot(
        config,
        buildApiFallbackSourceInfo(error, "Big Data import failed"),
      );
    }
  }

  return loadApiProjectImportSnapshot(config, buildApiSourceInfo());
}

async function loadApiProjectImportSnapshot(
  config: StratusConfig,
  sourceInfo: StratusReadSourceInfo,
) {
  const rawProjects = await fetchActiveProjectsFromStratus(config);
  return {
    projects: rawProjects
      .map((rawProject) => normalizeStratusProject(rawProject))
      .sort(compareStratusProjects),
    sourceInfo,
  };
}

async function loadStratusPackageBundleSnapshot(
  project: LoadedProjectTarget,
  config: StratusConfig,
  preferCached: boolean,
  options: StratusExecutionOptions = {},
): Promise<{
  bundles: PreparedPackageBundle[];
  sourceInfo: StratusReadSourceInfo;
}> {
  const cacheKey = buildPackageBundleSnapshotKey(project, config, options);
  if (preferCached) {
    const cached = getCachedSnapshot(packageBundleSnapshotCache, cacheKey);
    if (cached) {
      return cached;
    }
  }

  const snapshot = await loadPackageBundleSnapshotFromSource(
    project,
    config,
    options,
  );
  setCachedSnapshot(packageBundleSnapshotCache, cacheKey, snapshot);
  return snapshot;
}

async function loadPackageBundleSnapshotFromSource(
  project: LoadedProjectTarget,
  config: StratusConfig,
  options: StratusExecutionOptions = {},
) {
  if (shouldPreferSqlBigData(config)) {
    try {
      return await loadBigDataPackageBundleSnapshot(config, project);
    } catch (error) {
      return {
        bundles: await loadApiStratusPackageBundles(project, config, options),
        sourceInfo: buildApiFallbackSourceInfo(error, "Big Data import failed"),
      };
    }
  }

  return {
    bundles: await loadApiStratusPackageBundles(project, config, options),
    sourceInfo: buildApiSourceInfo(),
  };
}

async function loadActiveStratusProjectGroupSnapshot(
  prefabProject: LoadedProjectTarget,
  config: StratusConfig,
  preferCached: boolean,
  options: StratusExecutionOptions = {},
): Promise<{
  groups: PreparedProjectBundleGroup[];
  sourceInfo: StratusReadSourceInfo;
}> {
  const cacheKey = buildPrefabGroupSnapshotKey(config);
  if (preferCached) {
    const cached = getCachedSnapshot(prefabGroupSnapshotCache, cacheKey);
    if (cached) {
      return cached;
    }
  }

  const snapshot = await loadActiveProjectGroupSnapshotFromSource(
    prefabProject,
    config,
    options,
  );
  setCachedSnapshot(prefabGroupSnapshotCache, cacheKey, snapshot);
  return snapshot;
}

async function loadActiveProjectGroupSnapshotFromSource(
  prefabProject: LoadedProjectTarget,
  config: StratusConfig,
  options: StratusExecutionOptions = {},
) {
  if (shouldPreferSqlBigData(config)) {
    try {
      return await loadBigDataPrefabProjectGroupSnapshot(config);
    } catch (error) {
      return {
        groups: await loadApiActiveStratusProjectGroupsForPrefab(
          prefabProject,
          config,
          options,
        ),
        sourceInfo: buildApiFallbackSourceInfo(error, "Big Data import failed"),
      };
    }
  }

  return {
    groups: await loadApiActiveStratusProjectGroupsForPrefab(
      prefabProject,
      config,
      options,
    ),
    sourceInfo: buildApiSourceInfo(),
  };
}

function shouldPreferSqlBigData(config: StratusConfig) {
  return (
    config.importReadSource === "sqlPreferred" &&
    isStratusBigDataConfigured(config)
  );
}

function hasConfiguredStratusReadSource(config: StratusConfig) {
  return config.appKey.length > 0 || shouldPreferSqlBigData(config);
}

function buildApiSourceInfo(
  partial?: Partial<StratusReadSourceInfo>,
): StratusReadSourceInfo {
  return {
    source: "stratusApi",
    fallbackUsed: false,
    message: null,
    warnings: [],
    freshness: null,
    trackingStart: null,
    packageReportName: null,
    assemblyReportName: null,
    isFullRebuild: null,
    ...partial,
  };
}

function buildApiFallbackSourceInfo(
  error: unknown,
  prefix: string,
): StratusReadSourceInfo {
  const detail =
    error instanceof Error ? error.message : "Unknown Big Data error.";
  const message = `${prefix}. Falling back to the Stratus API. ${detail}`;
  return buildApiSourceInfo({
    fallbackUsed: true,
    message,
    warnings: [message],
  });
}

function buildProjectImportSnapshotKey(config: StratusConfig) {
  return JSON.stringify({
    kind: "project-import",
    readSource: config.importReadSource,
    baseUrl: config.baseUrl,
    appKey: config.appKey,
    companyId: config.companyId,
    bigDataServer: config.bigDataServer,
    bigDataDatabase: config.bigDataDatabase,
    bigDataUsername: config.bigDataUsername,
  });
}

function buildPackageBundleSnapshotKey(
  project: LoadedProjectTarget,
  config: StratusConfig,
  options: StratusExecutionOptions = {},
) {
  return JSON.stringify({
    kind: "package-bundles",
    projectId: project.id,
    stratusProjectId: project.stratusProjectId,
    stratusModelId: project.stratusModelId,
    stratusPackageWhere: project.stratusPackageWhere,
    readSource: config.importReadSource,
    baseUrl: config.baseUrl,
    appKey: config.appKey,
    companyId: config.companyId,
    taskNameField: config.taskNameField,
    durationDaysField: config.durationDaysField,
    durationHoursField: config.durationHoursField,
    startDateField: config.startDateField,
    finishDateField: config.finishDateField,
    deadlineField: config.deadlineField,
    refreshMode: options.refreshMode ?? "full",
    bigDataServer: config.bigDataServer,
    bigDataDatabase: config.bigDataDatabase,
    bigDataUsername: config.bigDataUsername,
    bigDataTaskNameColumn: config.bigDataTaskNameColumn,
    bigDataDurationDaysColumn: config.bigDataDurationDaysColumn,
    bigDataDurationHoursColumn: config.bigDataDurationHoursColumn,
    bigDataStartDateColumn: config.bigDataStartDateColumn,
    bigDataFinishDateColumn: config.bigDataFinishDateColumn,
    bigDataDeadlineColumn: config.bigDataDeadlineColumn,
  });
}

function buildPrefabGroupSnapshotKey(config: StratusConfig) {
  return JSON.stringify({
    kind: "prefab-groups",
    readSource: config.importReadSource,
    baseUrl: config.baseUrl,
    appKey: config.appKey,
    companyId: config.companyId,
    taskNameField: config.taskNameField,
    durationDaysField: config.durationDaysField,
    durationHoursField: config.durationHoursField,
    startDateField: config.startDateField,
    finishDateField: config.finishDateField,
    deadlineField: config.deadlineField,
    bigDataServer: config.bigDataServer,
    bigDataDatabase: config.bigDataDatabase,
    bigDataUsername: config.bigDataUsername,
    bigDataTaskNameColumn: config.bigDataTaskNameColumn,
    bigDataDurationDaysColumn: config.bigDataDurationDaysColumn,
    bigDataDurationHoursColumn: config.bigDataDurationHoursColumn,
    bigDataStartDateColumn: config.bigDataStartDateColumn,
    bigDataFinishDateColumn: config.bigDataFinishDateColumn,
    bigDataDeadlineColumn: config.bigDataDeadlineColumn,
  });
}

function getCachedSnapshot<T extends { createdAt: number }>(
  cache: Map<string, T>,
  key: string,
): Omit<T, "createdAt"> | null {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt > STRATUS_PREVIEW_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  const { createdAt: _createdAt, ...snapshot } = cached;
  return snapshot;
}

function setCachedSnapshot<T extends object>(
  cache: Map<string, T & { createdAt: number }>,
  key: string,
  snapshot: T,
) {
  if (!cache.has(key) && cache.size >= STRATUS_PREVIEW_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === "string") {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, {
    ...snapshot,
    createdAt: Date.now(),
  });
}

interface TaskLookup {
  byExternalKey: Map<string, PreviewTaskRecord[]>;
  byPackageId: Map<string, PreviewTaskRecord>;
  byParentId: Map<string, PreviewTaskRecord[]>;
}

function buildEffectiveStratusConfig(
  config: StratusConfig,
  options: StratusExecutionOptions,
): StratusConfig {
  if (!options.forceApiRead) {
    return config;
  }

  return {
    ...config,
    importReadSource: "apiOnly",
  };
}

function buildStratusResultMeta(
  params: Partial<StratusResultMeta> & Pick<StratusResultMeta, "durationMs">,
): StratusResultMeta {
  return {
    skippedUnchangedPackages: params.skippedUnchangedPackages ?? 0,
    undefinedPackageCount: params.undefinedPackageCount ?? 0,
    orphanAssemblyCount: params.orphanAssemblyCount ?? 0,
    durationMs: params.durationMs,
  };
}

function buildPullResultMeta(
  bundles: PreparedPackageBundle[],
  durationMs: number,
): StratusResultMeta {
  return buildStratusResultMeta({
    skippedUnchangedPackages: bundles.filter((bundle) => bundle.syncMeta?.unchanged)
      .length,
    undefinedPackageCount: bundles.filter((bundle) =>
      isUndefinedPackage(bundle.package),
    ).length,
    orphanAssemblyCount: bundles
      .filter((bundle) => isUndefinedPackage(bundle.package))
      .reduce((sum, bundle) => sum + bundle.assemblies.length, 0),
    durationMs,
  });
}

function filterProjectGroupsForApply(
  groups: PreparedProjectBundleGroup[],
  includeBundle: (bundle: PreparedPackageBundle) => boolean,
): PreparedProjectBundleGroup[] {
  return groups
    .map((group) => ({
      ...group,
      bundles: group.bundles.filter(includeBundle),
    }))
    .filter((group) => group.bundles.length > 0);
}

async function findExistingPrefabProject(): Promise<LoadedProjectTarget | null> {
  const prefab = await prisma.project.findFirst({
    where: {
      name: {
        equals: "Prefab",
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      minutesPerDay: true,
      stratusProjectId: true,
      stratusModelId: true,
      stratusPackageWhere: true,
      stratusLastPullAt: true,
      stratusLastPushAt: true,
    },
  });

  return prefab ?? null;
}

async function loadPreviewTasksForProject(
  projectId: string,
): Promise<PreviewTaskRecord[]> {
  if (!projectId) {
    return [];
  }

  return prisma.task.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      externalKey: true,
      parentId: true,
      start: true,
      finish: true,
      deadline: true,
      durationMinutes: true,
      percentComplete: true,
      notes: true,
      sortOrder: true,
      stratusSync: {
        select: {
          packageId: true,
          rawPackageJson: true,
        },
      },
      stratusAssemblySync: {
        select: {
          assemblyId: true,
          trackingStatusId: true,
          trackingStatusName: true,
        },
      },
    },
  });
}

function buildTaskLookup(tasks: PreviewTaskRecord[]): TaskLookup {
  const byExternalKey = new Map<string, PreviewTaskRecord[]>();
  const byPackageId = new Map<string, PreviewTaskRecord>();
  const byParentId = new Map<string, PreviewTaskRecord[]>();

  for (const task of tasks) {
    if (task.externalKey) {
      const bucket = byExternalKey.get(task.externalKey) ?? [];
      bucket.push(task);
      byExternalKey.set(task.externalKey, bucket);
    }
    if (task.stratusSync?.packageId) {
      byPackageId.set(task.stratusSync.packageId, task);
    }
    if (task.parentId) {
      const children = byParentId.get(task.parentId) ?? [];
      children.push(task);
      byParentId.set(task.parentId, children);
    }
  }

  return {
    byExternalKey,
    byPackageId,
    byParentId,
  };
}

function resolveIncrementalBundleSyncMeta(
  project: LoadedProjectTarget,
  pkg: NormalizedStratusPackage,
  config: StratusTaskMappingConfig,
  localLookup: TaskLookup,
  prefabLookup: TaskLookup,
): IncrementalBundleSyncMeta {
  const localHierarchy = findLocalPackageHierarchy(pkg, localLookup);
  const canonicalHierarchy = isPrefabProjectName(project.name)
    ? localHierarchy
    : findLocalPackageHierarchy(pkg, prefabLookup);
  const expectedAssemblyKeys = computeExpectedAssemblyExternalKeys(pkg);
  const currentSignature = buildPackageSourceSignature(pkg, config);
  const storedSignature = canonicalHierarchy
    ? extractStoredPackageSignature(canonicalHierarchy.packageTask, config)
    : null;

  if (!expectedAssemblyKeys) {
    return {
      unchanged: false,
      skippedReason: "Package is missing assembly ids and requires a full refresh.",
      localHierarchy,
    };
  }

  if (!localHierarchy) {
    return {
      unchanged: false,
      skippedReason: "Package task does not exist locally yet.",
      localHierarchy: null,
    };
  }

  if (!canonicalHierarchy) {
    return {
      unchanged: false,
      skippedReason: "Prefab sync state is missing for this package.",
      localHierarchy,
    };
  }

  if (!storedSignature || storedSignature !== currentSignature) {
    return {
      unchanged: false,
      skippedReason: "Package changed since the last canonical pull.",
      localHierarchy,
    };
  }

  if (!hasExactAssemblyHierarchy(localHierarchy, expectedAssemblyKeys)) {
    return {
      unchanged: false,
      skippedReason: "Active project assembly hierarchy is incomplete.",
      localHierarchy,
    };
  }

  if (!hasExactAssemblyHierarchy(canonicalHierarchy, expectedAssemblyKeys)) {
    return {
      unchanged: false,
      skippedReason: "Prefab assembly hierarchy is incomplete.",
      localHierarchy,
    };
  }

  return {
    unchanged: true,
    skippedReason: "Package unchanged since last pull.",
    localHierarchy,
  };
}

function findLocalPackageHierarchy(
  pkg: NormalizedStratusPackage,
  lookup: TaskLookup,
): LocalPackageHierarchy | null {
  const bySync = lookup.byPackageId.get(pkg.id) ?? null;
  const byExternalKey = pkg.externalKey
    ? (lookup.byExternalKey.get(pkg.externalKey) ?? [])
    : [];
  const packageTask =
    bySync ?? (byExternalKey.length === 1 ? (byExternalKey[0] ?? null) : null);

  if (!packageTask) {
    return null;
  }

  const assemblyTasks = [...(lookup.byParentId.get(packageTask.id) ?? [])].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  return {
    packageTask,
    assemblyTasks,
  };
}

function hasExactAssemblyHierarchy(
  hierarchy: LocalPackageHierarchy | null,
  expectedAssemblyKeys: string[] | null,
) {
  if (!hierarchy || !expectedAssemblyKeys) {
    return false;
  }

  const actualAssemblyKeys = hierarchy.assemblyTasks
    .map((task) => normalizeNullableString(task.externalKey))
    .filter((value): value is string => Boolean(value));

  if (
    actualAssemblyKeys.length !== hierarchy.assemblyTasks.length ||
    hierarchy.assemblyTasks.some(
      (task) =>
        !task.externalKey || !task.externalKey.includes("::assembly:"),
    )
  ) {
    return false;
  }

  const sortedActual = [...actualAssemblyKeys].sort();
  const sortedExpected = [...expectedAssemblyKeys].sort();
  return sortedActual.join("\n") === sortedExpected.join("\n");
}

function computeExpectedAssemblyExternalKeys(
  pkg: NormalizedStratusPackage,
): string[] | null {
  if (!Array.isArray(pkg.assemblyIds)) {
    return null;
  }

  const packageExternalKey = pkg.externalKey ?? pkg.id;
  return [...pkg.assemblyIds]
    .map((assemblyId) => `${packageExternalKey}::assembly:${assemblyId}`)
    .sort();
}

function buildPackageSourceSignature(
  pkg: Pick<
    NormalizedStratusPackage,
    | "id"
    | "externalKey"
    | "trackingStatusId"
    | "trackingStatusName"
    | "normalizedFields"
    | "assemblyIds"
  >,
  config: Pick<
    StratusConfig,
    | "taskNameField"
    | "durationDaysField"
    | "durationHoursField"
    | "startDateField"
    | "finishDateField"
    | "deadlineField"
  >,
) {
  return JSON.stringify({
    packageId: pkg.id,
    externalKey: normalizeNullableString(pkg.externalKey),
    taskName: normalizeNullableString(
      getConfiguredNormalizedFieldValue(
        pkg.normalizedFields,
        config.taskNameField,
      ),
    ),
    durationDays: normalizeNullableString(
      getConfiguredNormalizedFieldValue(
        pkg.normalizedFields,
        config.durationDaysField,
      ),
    ),
    durationHours: normalizeNullableString(
      getConfiguredNormalizedFieldValue(
        pkg.normalizedFields,
        config.durationHoursField,
      ),
    ),
    start: normalizeNullableString(
      getConfiguredNormalizedFieldValue(
        pkg.normalizedFields,
        config.startDateField,
      ),
    ),
    finish: normalizeNullableString(
      getConfiguredNormalizedFieldValue(
        pkg.normalizedFields,
        config.finishDateField,
      ),
    ),
    deadline: normalizeNullableString(
      getConfiguredNormalizedFieldValue(
        pkg.normalizedFields,
        config.deadlineField,
      ),
    ),
    trackingStatusId: normalizeNullableString(pkg.trackingStatusId),
    trackingStatusName: normalizeNullableString(pkg.trackingStatusName),
    modifiedDt: normalizeNullableString(
      pkg.normalizedFields["STRATUS.Package.ModifiedDT"],
    ),
    assemblyIds: Array.isArray(pkg.assemblyIds)
      ? [...pkg.assemblyIds].sort()
      : null,
  });
}

function getConfiguredNormalizedFieldValue(
  normalizedFields: Record<string, string | null>,
  fieldName: string | null | undefined,
) {
  const normalized = normalizeNullableString(fieldName);
  if (!normalized) {
    return null;
  }

  for (const equivalent of getEquivalentFieldNames(normalized)) {
    const value = normalizeNullableString(normalizedFields[equivalent]);
    if (value) {
      return value;
    }
  }

  return null;
}

function extractStoredPackageSignature(
  task: PreviewTaskRecord,
  config: StratusTaskMappingConfig,
) {
  const rawPackageJson = task.stratusSync?.rawPackageJson;
  if (!rawPackageJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPackageJson) as unknown;
    if (!isObjectRecord(parsed)) {
      return null;
    }
    if (typeof parsed.packageSignature === "string") {
      return parsed.packageSignature;
    }

    const normalizedFields = extractNormalizedFieldRecord(parsed.normalizedFields);
    return buildPackageSourceSignature(
      {
        id:
          stringOrNull(parsed.packageId) ??
          stringOrNull(parsed.id) ??
          task.stratusSync?.packageId ??
          "",
        externalKey: stringOrNull(parsed.externalKey) ?? task.externalKey,
        trackingStatusId: stringOrNull(parsed.trackingStatusId),
        trackingStatusName: stringOrNull(parsed.trackingStatusName),
        normalizedFields,
        assemblyIds: stringArrayOrNull(parsed.assemblyIds) ?? undefined,
      },
      config,
    );
  } catch {
    return null;
  }
}

function extractNormalizedFieldRecord(
  value: unknown,
): Record<string, string | null> {
  if (!isObjectRecord(value)) {
    return {};
  }

  const result: Record<string, string | null> = {};
  for (const [key, candidate] of Object.entries(value)) {
    result[key] = stringOrNull(candidate);
  }
  return result;
}

function buildSyntheticAssembliesFromLocalHierarchy(
  pkg: NormalizedStratusPackage,
  hierarchy: LocalPackageHierarchy,
): NormalizedStratusAssembly[] {
  return hierarchy.assemblyTasks.map((task) => ({
    id:
      task.stratusAssemblySync?.assemblyId ??
      extractAssemblyIdFromExternalKey(task.externalKey) ??
      task.id,
    packageId: pkg.id,
    projectId: pkg.projectId,
    modelId: pkg.modelId,
    name: task.name,
    externalKey:
      task.externalKey ??
      `${pkg.externalKey ?? pkg.id}::assembly:${task.id}`,
    trackingStatusId: task.stratusAssemblySync?.trackingStatusId ?? null,
    trackingStatusName: task.stratusAssemblySync?.trackingStatusName ?? null,
    percentCompleteShop: task.percentComplete ?? 0,
    notes: task.notes ?? "",
    rawAssembly: {},
  }));
}

function createLocalTaskPreviewData(
  task: PreviewTaskRecord,
  fallbackExternalKey: string,
) {
  return {
    name: task.name,
    start: toIsoSignature(task.start ?? null),
    finish: toIsoSignature(task.finish ?? null),
    deadline: toIsoSignature(task.deadline ?? null),
    durationMinutes: task.durationMinutes ?? null,
    percentComplete: task.percentComplete ?? 0,
    notes: task.notes ?? "",
    externalKey: task.externalKey ?? fallbackExternalKey,
  };
}

function extractAssemblyIdFromExternalKey(externalKey: string | null) {
  const normalized = normalizeNullableString(externalKey);
  if (!normalized) {
    return null;
  }

  const marker = "::assembly:";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  return normalized.slice(markerIndex + marker.length) || null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? normalizeNullableString(value) : null;
}

function stringArrayOrNull(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

async function loadApiStratusPackageBundles(
  project: LoadedProjectTarget,
  config: StratusConfig,
  options: StratusExecutionOptions = {},
): Promise<PreparedPackageBundle[]> {
  const packages = (await fetchPackagesFromStratus(config, project))
    .map((pkg) => normalizeStratusPackage(pkg, config))
    .sort(compareStratusPackages);
  options.progress?.({
    phase: "loadingAssemblies",
    message: "Loading Stratus assemblies.",
    totalPackages: packages.length,
    totalAssemblies: 0,
    processedPackages: 0,
    processedAssemblies: 0,
    source: "stratusApi",
  });

  const shouldUseIncremental =
    (options.refreshMode ?? "full") === "incremental" &&
    !isPrefabProjectName(project.name);
  const localTasks = shouldUseIncremental
    ? await loadPreviewTasksForProject(project.id)
    : [];
  const prefabTasks = shouldUseIncremental
    ? await loadPreviewTasksForProject((await findExistingPrefabProject())?.id ?? "")
    : [];
  const localLookup = buildTaskLookup(localTasks);
  const prefabLookup = buildTaskLookup(prefabTasks);

  let processedPackages = 0;
  let processedAssemblies = 0;
  let skippedUnchangedPackages = 0;
  const fetchConcurrency = resolvePackageFetchConcurrency(options);

  const bundles = await mapWithConcurrency(
    packages,
    fetchConcurrency,
    async (pkg) => {
      const syncMeta = shouldUseIncremental
        ? resolveIncrementalBundleSyncMeta(
            project,
            pkg,
            config,
            localLookup,
            prefabLookup,
          )
        : undefined;
      if (syncMeta?.unchanged && syncMeta.localHierarchy) {
        processedPackages += 1;
        skippedUnchangedPackages += 1;
        processedAssemblies += syncMeta.localHierarchy.assemblyTasks.length;
        options.progress?.({
          phase: "loadingAssemblies",
          message: `Skipping unchanged package ${pkg.packageNumber ?? pkg.id}.`,
          processedPackages,
          processedAssemblies,
          skippedUnchangedPackages,
        });
        return {
          package: pkg,
          assemblies: buildSyntheticAssembliesFromLocalHierarchy(
            pkg,
            syncMeta.localHierarchy,
          ),
          syncMeta,
        };
      }

      const rawAssemblies = pkg.id
        ? await fetchAssembliesForPackage(config, pkg.id, {
            pageSize: resolveAssemblyPageSize(options),
          })
        : [];
      const assemblies = rawAssemblies
        .map((rawAssembly) =>
          normalizeStratusAssembly(pkg.id, pkg.externalKey, rawAssembly),
        )
        .sort(compareStratusAssemblies);
      processedPackages += 1;
      processedAssemblies += assemblies.length;
      options.progress?.({
        phase: "loadingAssemblies",
        message: options.seedUpgrade
          ? `Seed upgrade loaded ${assemblies.length} assemblies for ${pkg.packageNumber ?? pkg.id}.`
          : `Loaded ${assemblies.length} assemblies for ${pkg.packageNumber ?? pkg.id}.`,
        processedPackages,
        processedAssemblies,
        skippedUnchangedPackages,
      });
      return { package: pkg, assemblies, syncMeta };
    },
  );

  return bundles.sort((left, right) =>
    compareStratusPackages(left.package, right.package),
  );
}

function isUndefinedPackage(pkg: NormalizedStratusPackage) {
  return pkg.externalKey?.startsWith(UNDEFINED_PACKAGE_PREFIX) ?? false;
}

async function loadApiActiveStratusProjectGroupsForPrefab(
  prefabProject: LoadedProjectTarget,
  config: StratusConfig,
  options: StratusExecutionOptions = {},
): Promise<PreparedProjectBundleGroup[]> {
  const rawProjects = await fetchActiveProjectsFromStratus(config);
  const stratusProjects = rawProjects
    .map((rawProject) => normalizeStratusProject(rawProject))
    .sort(compareStratusProjects);

  return mapWithConcurrency(
    stratusProjects,
    resolveProjectFetchConcurrency(options),
    async (stratusProject) => {
      const bundles = await loadApiStratusPackageBundles(
        {
          id: prefabProject.id,
          name: prefabProject.name,
          startDate: prefabProject.startDate,
          minutesPerDay: prefabProject.minutesPerDay,
          stratusProjectId: stratusProject.id,
          stratusModelId: null,
          stratusPackageWhere: null,
          stratusLastPullAt: prefabProject.stratusLastPullAt,
          stratusLastPushAt: prefabProject.stratusLastPushAt,
        },
        config,
        {
          ...options,
          refreshMode: "full",
        },
      );
      return { stratusProject, bundles };
    },
  );
}

async function upsertStratusTaskSync(
  taskId: string,
  localProjectId: string,
  pkg: NormalizedStratusPackage,
  config: Pick<
    StratusConfig,
    | "taskNameField"
    | "durationDaysField"
    | "durationHoursField"
    | "startDateField"
    | "finishDateField"
    | "deadlineField"
  >,
  now: Date,
  scheduledDates?: {
    start: Date;
    finish: Date;
    deadline: Date | null;
  },
  existing?: {
    byPackage: StratusTaskSync | null;
    byTask: StratusTaskSync | null;
  },
): Promise<StratusTaskSync> {
  const pulledStartSignature = toDateSignature(
    getConfiguredPackageFieldValue(pkg, config.startDateField),
  );
  const pulledFinishSignature = toDateSignature(
    getConfiguredPackageFieldValue(pkg, config.finishDateField),
  );
  const pulledDeadlineSignature = toDateSignature(
    getConfiguredPackageFieldValue(pkg, config.deadlineField),
  );
  const data = {
    localProjectId,
    packageId: pkg.id,
    projectId: pkg.projectId,
    modelId: pkg.modelId,
    externalKey: pkg.externalKey,
    packageNumber: pkg.packageNumber,
    packageName: pkg.packageName,
    trackingStatusId: pkg.trackingStatusId,
    trackingStatusName: pkg.trackingStatusName,
    rawPackageJson: JSON.stringify({
      packageSignature: buildPackageSourceSignature(pkg, config),
      normalizedFields: pkg.normalizedFields,
      packageId: pkg.id,
      projectId: pkg.projectId,
      modelId: pkg.modelId,
      packageNumber: pkg.packageNumber,
      packageName: pkg.packageName,
      externalKey: pkg.externalKey,
      trackingStatusId: pkg.trackingStatusId,
      trackingStatusName: pkg.trackingStatusName,
      rawPackage: pkg.rawPackage,
    }),
    lastPulledAt: now,
    syncedStartSignature:
      pulledStartSignature ?? toDateSignature(scheduledDates?.start),
    syncedFinishSignature:
      pulledFinishSignature ?? toDateSignature(scheduledDates?.finish),
    syncedDeadlineSignature:
      pulledDeadlineSignature ?? toDateSignature(scheduledDates?.deadline),
  };

  const existingByPackage =
    existing?.byPackage ??
    (await prisma.stratusTaskSync.findUnique({
      where: {
        localProjectId_packageId: {
          localProjectId,
          packageId: pkg.id,
        },
      },
    }));
  const existingByTask =
    existing?.byTask ??
    (await prisma.stratusTaskSync.findUnique({
      where: { taskId },
    }));

  if (existingByPackage) {
    if (existingByTask && existingByTask.id !== existingByPackage.id) {
      await prisma.stratusTaskSync.delete({
        where: { taskId },
      });
    }

    if (isStratusTaskSyncEquivalent(existingByPackage, taskId, data)) {
      return existingByPackage;
    }

    return prisma.stratusTaskSync.update({
      where: { id: existingByPackage.id },
      data: {
        taskId,
        ...data,
      },
    });
  }

  if (existingByTask) {
    if (isStratusTaskSyncEquivalent(existingByTask, taskId, data)) {
      return existingByTask;
    }

    return prisma.stratusTaskSync.update({
      where: { taskId },
      data,
    });
  }

  return prisma.stratusTaskSync.create({
    data: { taskId, ...data },
  });
}

async function upsertStratusAssemblySync(
  taskId: string,
  localProjectId: string,
  packageId: string,
  assembly: NormalizedStratusAssembly,
  now: Date,
  existing?: {
    byAssembly: StratusAssemblySync | null;
    byTask: StratusAssemblySync | null;
  },
): Promise<StratusAssemblySync> {
  const data = {
    localProjectId,
    packageId,
    assemblyId: assembly.id,
    externalKey: assembly.externalKey,
    trackingStatusId: assembly.trackingStatusId,
    trackingStatusName: assembly.trackingStatusName,
    lastPulledAt: now,
  };

  const existingByAssembly =
    existing?.byAssembly ??
    (await prisma.stratusAssemblySync.findUnique({
      where: {
        localProjectId_assemblyId: {
          localProjectId,
          assemblyId: assembly.id,
        },
      },
    }));
  const existingByTask =
    existing?.byTask ??
    (await prisma.stratusAssemblySync.findUnique({
      where: { taskId },
    }));

  if (existingByAssembly) {
    if (existingByTask && existingByTask.id !== existingByAssembly.id) {
      await prisma.stratusAssemblySync.delete({
        where: { taskId },
      });
    }

    if (isStratusAssemblySyncEquivalent(existingByAssembly, taskId, data)) {
      return existingByAssembly;
    }

    return prisma.stratusAssemblySync.update({
      where: { id: existingByAssembly.id },
      data: {
        taskId,
        ...data,
      },
    });
  }

  if (existingByTask) {
    if (isStratusAssemblySyncEquivalent(existingByTask, taskId, data)) {
      return existingByTask;
    }

    return prisma.stratusAssemblySync.update({
      where: { taskId },
      data,
    });
  }

  return prisma.stratusAssemblySync.create({
    data: {
      taskId,
      ...data,
    },
  });
}

function resolveMappedTaskName(
  pkg: NormalizedStratusPackage,
  config: Pick<StratusConfig, "taskNameField">,
): string {
  return (
    normalizeNullableString(
      getConfiguredPackageFieldValue(pkg, config.taskNameField),
    ) ??
    normalizeNullableString(pkg.packageName) ??
    normalizeNullableString(pkg.packageNumber) ??
    `Package ${pkg.id}`
  );
}

function resolveMappedDurationMinutes(
  minutesPerDay: number,
  config: StratusTaskMappingConfig,
  pkg: NormalizedStratusPackage,
): number {
  const durationDays = parseNumberValue(
    getConfiguredPackageFieldValue(pkg, config.durationDaysField),
  );
  if (durationDays !== null) {
    return durationDays * minutesPerDay;
  }

  const durationHours = parseNumberValue(
    getConfiguredPackageFieldValue(pkg, config.durationHoursField),
  );
  if (durationHours !== null) {
    return durationHours * 60;
  }

  return minutesPerDay;
}

interface ResolvedMappedPackageSchedule {
  start: Date | null;
  finish: Date | null;
  deadline: Date | null;
  durationMinutes: number;
}

function resolveMappedPackageSchedule(
  minutesPerDay: number,
  projectStartDate: Date | null,
  config: StratusTaskMappingConfig,
  pkg: NormalizedStratusPackage,
): ResolvedMappedPackageSchedule {
  const durationMinutes = resolveMappedDurationMinutes(
    minutesPerDay,
    config,
    pkg,
  );
  let start = parseDateValue(
    getConfiguredPackageFieldValue(pkg, config.startDateField),
  );
  let finish = parseDateValue(
    getConfiguredPackageFieldValue(pkg, config.finishDateField),
  );

  if (!start && finish) {
    start = new Date(finish.getTime() - durationMinutes * 60_000);
  }

  if (!finish && start) {
    finish = new Date(start.getTime() + durationMinutes * 60_000);
  }

  if (!start && projectStartDate) {
    start = new Date(projectStartDate.getTime());
  }

  if (!finish && start) {
    finish = new Date(start.getTime() + durationMinutes * 60_000);
  }

  return {
    start,
    finish,
    deadline: parseDateValue(
      getConfiguredPackageFieldValue(pkg, config.deadlineField),
    ),
    durationMinutes,
  };
}

function resolveMappedProgress(
  lookup: StatusProgressLookup,
  status: {
    trackingStatusId: string | null;
    trackingStatusName: string | null;
    percentCompleteShop?: number | null;
  },
  fallback = 0,
): number {
  if (
    typeof status.percentCompleteShop === "number" &&
    Number.isFinite(status.percentCompleteShop)
  ) {
    return Math.max(0, Math.min(100, Math.round(status.percentCompleteShop)));
  }

  const byId = normalizeLookupKey(status.trackingStatusId);
  if (byId && lookup.byId.has(byId)) {
    return lookup.byId.get(byId) ?? fallback;
  }

  const byName = normalizeLookupKey(status.trackingStatusName);
  if (byName && lookup.byName.has(byName)) {
    return lookup.byName.get(byName) ?? fallback;
  }

  return fallback;
}

function createMappedPackageTaskData(
  project: LoadedProjectTarget,
  pkg: NormalizedStratusPackage,
  config: StratusTaskMappingConfig,
  statusLookup: StatusProgressLookup,
) {
  const schedule = resolveMappedPackageSchedule(
    project.minutesPerDay,
    project.startDate,
    config,
    pkg,
  );
  const start = schedule.start ?? project.startDate;
  const finish =
    schedule.finish ?? new Date(start.getTime() + schedule.durationMinutes * 60_000);

  return {
    name: resolveMappedTaskName(pkg, config),
    start,
    finish,
    deadline: schedule.deadline,
    durationMinutes: schedule.durationMinutes,
    percentComplete: resolveMappedProgress(statusLookup, pkg),
    notes: [
      pkg.normalizedFields["STRATUS.Package.Description"],
      pkg.normalizedFields["STRATUS.Package.Notes"],
    ]
      .filter(
        (part): part is string =>
          typeof part === "string" && part.trim().length > 0,
      )
      .join("\n"),
    externalKey: pkg.externalKey,
  };
}

function createMappedPackagePreviewData(
  pkg: NormalizedStratusPackage,
  minutesPerDay: number,
  config: StratusTaskMappingConfig,
  statusLookup: StatusProgressLookup,
  projectStartDate: Date | null = null,
): PullPreviewRow["mappedTask"] {
  const schedule = resolveMappedPackageSchedule(
    minutesPerDay,
    projectStartDate,
    config,
    pkg,
  );
  return {
    name: resolveMappedTaskName(pkg, config),
    start: schedule.start?.toISOString() ?? null,
    finish: schedule.finish?.toISOString() ?? null,
    deadline: schedule.deadline?.toISOString() ?? null,
    durationMinutes: schedule.durationMinutes,
    percentComplete: resolveMappedProgress(statusLookup, pkg),
    notes: [
      pkg.normalizedFields["STRATUS.Package.Description"],
      pkg.normalizedFields["STRATUS.Package.Notes"],
    ]
      .filter(
        (part): part is string =>
          typeof part === "string" && part.trim().length > 0,
      )
      .join("\n"),
    externalKey: pkg.externalKey,
  };
}

function createMappedAssemblyTaskData(
  project: LoadedProjectTarget,
  pkg: NormalizedStratusPackage,
  assembly: NormalizedStratusAssembly,
  config: StratusTaskMappingConfig,
  statusLookup: StatusProgressLookup,
) {
  const packageTask = createMappedPackageTaskData(
    project,
    pkg,
    config,
    statusLookup,
  );
  const start = packageTask.start;
  const finish =
    packageTask.finish ??
    new Date(start.getTime() + project.minutesPerDay * 60_000);

  return {
    name: assembly.name ?? `Assembly ${assembly.id}`,
    start,
    finish,
    deadline: packageTask.deadline,
    durationMinutes: project.minutesPerDay,
    percentComplete: resolveMappedProgress(
      statusLookup,
      assembly,
      packageTask.percentComplete,
    ),
    notes: buildAssemblyNotes(assembly),
    externalKey: assembly.externalKey,
  };
}

function createMappedAssemblyPreviewData(
  minutesPerDay: number,
  pkg: NormalizedStratusPackage,
  assembly: NormalizedStratusAssembly,
  config: StratusTaskMappingConfig,
  statusLookup: StatusProgressLookup,
  projectStartDate: Date | null = null,
): PullPreviewAssemblyRow["mappedTask"] {
  const packagePreview = createMappedPackagePreviewData(
    pkg,
    minutesPerDay,
    config,
    statusLookup,
    projectStartDate,
  );
  return {
    name: assembly.name ?? `Assembly ${assembly.id}`,
    start: packagePreview.start,
    finish: packagePreview.finish,
    deadline: packagePreview.deadline,
    durationMinutes: minutesPerDay,
    percentComplete: resolveMappedProgress(
      statusLookup,
      assembly,
      packagePreview.percentComplete,
    ),
    notes: buildAssemblyNotes(assembly),
    externalKey: assembly.externalKey,
  };
}

async function patchPackageProperties(
  config: StratusConfig,
  packageId: string,
  data: { requiredDT: string | null },
) {
  await stratusRequestJson(config, "/v2/package/properties", {
    method: "PATCH",
    body: JSON.stringify({ id: packageId, requiredDT: data.requiredDT }),
  });
}

async function patchPackageFields(
  config: StratusConfig,
  packageId: string,
  fieldUpdates: Array<{ key: string; value: string | null }>,
) {
  await stratusRequestJson(
    config,
    `/v2/package/${encodeURIComponent(packageId)}/fields`,
    {
      method: "PATCH",
      body: JSON.stringify(fieldUpdates),
    },
  );
}

async function reorderTasksAfterStratusPull(
  existingTasks: TaskWithSync[],
  groups: AppliedPackageGroup[],
) {
  const groupedTaskIds = new Set<string>();
  const groupsByAnchorTaskId = new Map<string, AppliedPackageGroup>();
  for (const group of groups) {
    groupedTaskIds.add(group.packageTaskId);
    for (const childTaskId of group.childTaskIds) {
      groupedTaskIds.add(childTaskId);
    }
    if (group.anchorExistingTaskId) {
      groupsByAnchorTaskId.set(group.anchorExistingTaskId, group);
    }
  }

  const orderedTaskIds: string[] = [];
  const emittedTaskIds = new Set<string>();

  const emitGroup = (group: AppliedPackageGroup) => {
    for (const taskId of [group.packageTaskId, ...group.childTaskIds]) {
      if (!emittedTaskIds.has(taskId)) {
        orderedTaskIds.push(taskId);
        emittedTaskIds.add(taskId);
      }
    }
  };

  for (const task of existingTasks) {
    const anchoredGroup = groupsByAnchorTaskId.get(task.id);
    if (anchoredGroup && !emittedTaskIds.has(anchoredGroup.packageTaskId)) {
      emitGroup(anchoredGroup);
      continue;
    }
    if (groupedTaskIds.has(task.id)) {
      continue;
    }
    orderedTaskIds.push(task.id);
    emittedTaskIds.add(task.id);
  }

  for (const group of groups) {
    if (!emittedTaskIds.has(group.packageTaskId)) {
      emitGroup(group);
    }
  }

  await prisma.$transaction(
    orderedTaskIds.map((taskId, index) =>
      prisma.task.update({
        where: { id: taskId },
        data: { sortOrder: index },
      }),
    ),
  );
}

async function ensurePrefabProject(
  stratusProjects: NormalizedStratusProject[],
): Promise<SyncProjectTarget> {
  const existingPrefab = await prisma.project.findFirst({
    where: {
      name: {
        equals: "Prefab",
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      minutesPerDay: true,
    },
  });

  const earliestStart =
    stratusProjects
      .map((project) => parseDateValue(project.startDate))
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? new Date();

  if (existingPrefab) {
    const desiredStart =
      existingPrefab.startDate.getTime() <= earliestStart.getTime()
        ? existingPrefab.startDate
        : earliestStart;
    if (
      toDateSignature(existingPrefab.startDate) !==
      toDateSignature(desiredStart)
    ) {
      const updatedPrefab = await prisma.project.update({
        where: { id: existingPrefab.id },
        data: { startDate: desiredStart },
        select: {
          id: true,
          name: true,
          startDate: true,
          minutesPerDay: true,
        },
      });
      return updatedPrefab;
    }
    return existingPrefab;
  }

  return prisma.project.create({
    data: {
      name: "Prefab",
      startDate: earliestStart,
      scheduleFrom: "start",
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      minutesPerDay: true,
    },
  });
}

async function syncStratusProjectGroupsToProject(
  targetProject: SyncProjectTarget,
  groups: StratusProjectBundleGroup[],
  config: StratusTaskMappingConfig,
  options: {
    includeProjectSummaries: boolean;
    canonicalPackageSync: boolean;
    referenceSourceProjectName?: string;
  },
) {
  const existingTasks: TaskWithAllSync[] = await prisma.task.findMany({
    where: { projectId: targetProject.id },
    orderBy: { sortOrder: "asc" },
    include: { stratusSync: true, stratusAssemblySync: true },
  });

  const taskById = new Map<string, TaskWithAllSync>(
    existingTasks.map((task) => [task.id, task]),
  );
  const tasksByExternalKey = new Map<string, TaskWithAllSync[]>();
  const syncByPackageId = new Map<string, TaskWithAllSync>();
  const syncByAssemblyId = new Map<string, TaskWithAllSync>();

  for (const task of existingTasks) {
    if (task.externalKey) {
      const bucket = tasksByExternalKey.get(task.externalKey) ?? [];
      bucket.push(task);
      tasksByExternalKey.set(task.externalKey, bucket);
    }
    if (task.stratusSync?.packageId) {
      syncByPackageId.set(task.stratusSync.packageId, task);
    }
    if (task.stratusAssemblySync?.assemblyId) {
      syncByAssemblyId.set(task.stratusAssemblySync.assemblyId, task);
    }
  }

  const managedTaskIds = new Set<string>();
  const statusLookup = buildStatusProgressLookup(config.statusProgressMappings);
  let nextSortOrder = 0;

  const upsertTask = async (params: {
    externalKey: string;
    packageId?: string;
    assemblyId?: string;
    name: string;
    parentId: string | null;
    outlineLevel: number;
    type: "summary" | "task";
    start: Date;
    finish: Date;
    deadline: Date | null;
    durationMinutes: number;
    percentComplete: number;
    notes: string;
    syncPackage?: NormalizedStratusPackage;
    syncAssembly?: NormalizedStratusAssembly;
  }) => {
    const bySync = params.packageId
      ? (syncByPackageId.get(params.packageId) ?? null)
      : null;
    const byAssembly = params.assemblyId
      ? (syncByAssemblyId.get(params.assemblyId) ?? null)
      : null;
    const byExternalKey = tasksByExternalKey.get(params.externalKey) ?? [];
    const existingTask =
      bySync ??
      byAssembly ??
      (byExternalKey.length > 0 ? (byExternalKey[0] ?? null) : null);

    const data = {
      name: params.name,
      parentId: params.parentId,
      outlineLevel: params.outlineLevel,
      type: params.type,
      start: params.start,
      finish: params.finish,
      deadline: params.deadline,
      durationMinutes: params.durationMinutes,
      percentComplete: params.percentComplete,
      isManuallyScheduled: true,
      notes: params.notes,
      externalKey: params.externalKey,
      sortOrder: nextSortOrder++,
    };

    let task: TaskWithAllSync;
    if (existingTask) {
      task = isTaskDataEquivalent(existingTask, data)
        ? existingTask
        : await prisma.task.update({
            where: { id: existingTask.id },
            data,
            include: { stratusSync: true, stratusAssemblySync: true },
          });
    } else {
      task = await prisma.task.create({
        data: {
          projectId: targetProject.id,
          wbsCode: "",
          constraintType: 0,
          ...data,
        },
        include: { stratusSync: true, stratusAssemblySync: true },
      });
    }

    if (params.syncPackage) {
      if (existingTask?.stratusAssemblySync) {
        syncByAssemblyId.delete(existingTask.stratusAssemblySync.assemblyId);
        await prisma.stratusAssemblySync.delete({
          where: { taskId: task.id },
        });
      }
      if (
        existingTask?.stratusSync?.packageId &&
        existingTask.stratusSync.packageId !== params.syncPackage.id
      ) {
        syncByPackageId.delete(existingTask.stratusSync.packageId);
      }
      const syncRecord = await upsertStratusTaskSync(
        task.id,
        targetProject.id,
        params.syncPackage,
        config,
        new Date(),
        {
          start: params.start,
          finish: params.finish,
          deadline: params.deadline,
        },
        {
          byPackage:
            bySync?.stratusSync?.packageId === params.syncPackage.id
              ? bySync.stratusSync
              : null,
          byTask: existingTask?.stratusSync ?? null,
        },
      );
      task = {
        ...task,
        stratusSync: syncRecord,
        stratusAssemblySync: null,
      };
      syncByPackageId.set(params.syncPackage.id, task);
    } else if (params.syncAssembly) {
      if (existingTask?.stratusSync) {
        syncByPackageId.delete(existingTask.stratusSync.packageId);
        await prisma.stratusTaskSync.delete({ where: { taskId: task.id } });
      }
      if (
        existingTask?.stratusAssemblySync?.assemblyId &&
        existingTask.stratusAssemblySync.assemblyId !== params.syncAssembly.id
      ) {
        syncByAssemblyId.delete(existingTask.stratusAssemblySync.assemblyId);
      }
      const syncRecord = await upsertStratusAssemblySync(
        task.id,
        targetProject.id,
        params.packageId ?? "",
        params.syncAssembly,
        new Date(),
        {
          byAssembly:
            byAssembly?.stratusAssemblySync?.assemblyId === params.syncAssembly.id
              ? byAssembly.stratusAssemblySync
              : null,
          byTask: existingTask?.stratusAssemblySync ?? null,
        },
      );
      task = {
        ...task,
        stratusSync: null,
        stratusAssemblySync: syncRecord,
      };
      syncByAssemblyId.set(params.syncAssembly.id, task);
    } else if (task.stratusSync) {
      syncByPackageId.delete(task.stratusSync.packageId);
      await prisma.stratusTaskSync.delete({ where: { taskId: task.id } });
      task = {
        ...task,
        stratusSync: null,
      };
      if (task.stratusAssemblySync) {
        syncByAssemblyId.delete(task.stratusAssemblySync.assemblyId);
        await prisma.stratusAssemblySync.delete({ where: { taskId: task.id } });
        task = {
          ...task,
          stratusAssemblySync: null,
        };
      }
    } else if (task.stratusAssemblySync) {
      syncByAssemblyId.delete(task.stratusAssemblySync.assemblyId);
      await prisma.stratusAssemblySync.delete({ where: { taskId: task.id } });
      task = {
        ...task,
        stratusAssemblySync: null,
      };
    }

    if (
      existingTask?.externalKey &&
      existingTask.externalKey !== params.externalKey &&
      tasksByExternalKey.has(existingTask.externalKey)
    ) {
      tasksByExternalKey.set(
        existingTask.externalKey,
        (tasksByExternalKey.get(existingTask.externalKey) ?? []).filter(
          (candidate) => candidate.id !== task.id,
        ),
      );
    }
    taskById.set(task.id, task);
    const updatedBucket = tasksByExternalKey.get(params.externalKey) ?? [];
    if (!updatedBucket.some((candidate) => candidate.id === task.id)) {
      updatedBucket.push(task);
      tasksByExternalKey.set(params.externalKey, updatedBucket);
    } else {
      tasksByExternalKey.set(
        params.externalKey,
        updatedBucket.map((candidate) =>
          candidate.id === task.id ? task : candidate,
        ),
      );
    }
    managedTaskIds.add(task.id);
    return task;
  };

  for (const group of groups) {
    let projectSummaryTaskId: string | null = null;
    let packageOutlineLevel = 0;
    const fallbackProjectStart =
      parseDateValue(group.stratusProject.startDate) ??
      parseDateValue(group.stratusProject.finishDate) ??
      targetProject.startDate;
    const mappedProjectContext = {
      id: targetProject.id,
      name: targetProject.name,
      startDate: fallbackProjectStart,
      minutesPerDay: targetProject.minutesPerDay,
      stratusProjectId: group.stratusProject.id,
      stratusModelId: null,
      stratusPackageWhere: null,
      stratusLastPullAt: null,
      stratusLastPushAt: null,
    } satisfies LoadedProjectTarget;

    if (options.includeProjectSummaries) {
      const projectStart = fallbackProjectStart;
      const projectFinish =
        parseDateValue(group.stratusProject.finishDate) ??
        group.bundles
          .map((bundle) =>
            parseDateValue(
              getConfiguredPackageFieldValue(
                bundle.package,
                config.finishDateField,
              ),
            ),
          )
          .filter((value): value is Date => value instanceof Date)
          .sort((left, right) => right.getTime() - left.getTime())[0] ??
        projectStart;
      const projectSummary = await upsertTask({
        externalKey: `stratus-project:${group.stratusProject.id}`,
        name: buildImportedProjectName(
          group.stratusProject.number,
          group.stratusProject.name,
          group.stratusProject.id,
        ),
        parentId: null,
        outlineLevel: 0,
        type: "summary",
        start: projectStart,
        finish: projectFinish,
        deadline: null,
        durationMinutes: Math.max(
          targetProject.minutesPerDay,
          (projectFinish.getTime() - projectStart.getTime()) / 60_000,
        ),
        percentComplete: 0,
        notes: group.stratusProject.description ?? "",
      });
      projectSummaryTaskId = projectSummary.id;
      packageOutlineLevel = 1;
    }

    for (const bundle of group.bundles) {
      const mappedPackage = createMappedPackageTaskData(
        mappedProjectContext,
        bundle.package,
        config,
        statusLookup,
      );

      const packageTask = await upsertTask({
        externalKey: bundle.package.externalKey ?? bundle.package.id,
        packageId:
          options.canonicalPackageSync && !isUndefinedPackage(bundle.package)
            ? bundle.package.id
            : undefined,
        name: mappedPackage.name,
        parentId: projectSummaryTaskId,
        outlineLevel: packageOutlineLevel,
        type: "summary",
        start: mappedPackage.start,
        finish: mappedPackage.finish,
        deadline: mappedPackage.deadline,
        durationMinutes: mappedPackage.durationMinutes,
        percentComplete: mappedPackage.percentComplete,
        notes: appendReferenceNote(
          mappedPackage.notes,
          options.referenceSourceProjectName,
          bundle.package.externalKey,
        ),
        syncPackage:
          options.canonicalPackageSync && !isUndefinedPackage(bundle.package)
            ? bundle.package
            : undefined,
      });

      for (const assembly of bundle.assemblies) {
        const mappedAssembly = createMappedAssemblyTaskData(
          mappedProjectContext,
          bundle.package,
          assembly,
          config,
          statusLookup,
        );

        await upsertTask({
          externalKey: assembly.externalKey,
          packageId: bundle.package.id,
          assemblyId: assembly.id,
          name: mappedAssembly.name,
          parentId: packageTask.id,
          outlineLevel: packageOutlineLevel + 1,
          type: "task",
          start: mappedAssembly.start,
          finish: mappedAssembly.finish,
          deadline: mappedAssembly.deadline,
          durationMinutes: mappedAssembly.durationMinutes,
          percentComplete: mappedAssembly.percentComplete,
          notes: appendReferenceNote(
            mappedAssembly.notes,
            options.referenceSourceProjectName,
            assembly.externalKey,
          ),
          syncAssembly: assembly,
        });
      }
    }
  }

  const managedExternalKeys = new Set(
    [...managedTaskIds]
      .map((taskId) =>
        normalizeNullableString(taskById.get(taskId)?.externalKey),
      )
      .filter((externalKey): externalKey is string => Boolean(externalKey)),
  );

  const obsoleteTaskIds: string[] = [];
  for (const task of existingTasks) {
    if (managedTaskIds.has(task.id)) {
      continue;
    }

    if (
      shouldDeleteObsoleteStratusTask(
        task,
        managedExternalKeys,
        options.includeProjectSummaries,
      )
    ) {
      obsoleteTaskIds.push(task.id);
      continue;
    }

    const sortOrder = nextSortOrder++;
    if (task.sortOrder !== sortOrder) {
      await prisma.task.update({
        where: { id: task.id },
        data: { sortOrder },
      });
    }
  }

  if (obsoleteTaskIds.length > 0) {
    await prisma.task.deleteMany({
      where: {
        id: {
          in: obsoleteTaskIds,
        },
      },
    });
  }

  await prisma.project.update({
    where: { id: targetProject.id },
    data: { stratusLocalMetadataVersion: 1 },
  });
}

function mapStratusProjectToLocalProjectData(
  stratusProject: NormalizedStratusProject,
) {
  return {
    name: buildImportedProjectName(
      stratusProject.number,
      stratusProject.name,
      stratusProject.id,
    ),
    startDate:
      stratusProject.startDate ??
      stratusProject.finishDate ??
      new Date().toISOString(),
    finishDate: stratusProject.finishDate,
    projectType: stratusProject.category,
    sector: stratusProject.phase,
    region: buildProjectRegion(stratusProject),
  };
}

function areProjectsEquivalent(
  localProject: LocalProjectRecord,
  mappedProject: ProjectImportPreviewRow["mappedProject"],
) {
  return (
    localProject.name === mappedProject.name &&
    toDateSignature(localProject.startDate) ===
      toDateSignature(mappedProject.startDate) &&
    toDateSignature(localProject.finishDate) ===
      toDateSignature(mappedProject.finishDate) &&
    normalizeNullableString(localProject.projectType) ===
      normalizeNullableString(mappedProject.projectType) &&
    normalizeNullableString(localProject.sector) ===
      normalizeNullableString(mappedProject.sector) &&
    normalizeNullableString(localProject.region) ===
      normalizeNullableString(mappedProject.region)
  );
}

function buildImportedProjectName(
  number: string | null,
  name: string | null,
  projectId: string,
) {
  const trimmedNumber = normalizeNullableString(number);
  const trimmedName = normalizeNullableString(name);
  if (trimmedNumber && trimmedName) {
    return `${trimmedNumber} - ${trimmedName}`;
  }
  return trimmedNumber ?? trimmedName ?? `Stratus Project ${projectId}`;
}

function shouldDeleteObsoleteStratusTask(
  task: TaskWithSync,
  managedExternalKeys: ReadonlySet<string>,
  includeProjectSummaries: boolean,
) {
  const externalKey = normalizeNullableString(task.externalKey);
  if (!externalKey) {
    return false;
  }

  if (!includeProjectSummaries && externalKey.startsWith("stratus-project:")) {
    return true;
  }

  return managedExternalKeys.has(externalKey);
}

function buildProjectRegion(stratusProject: NormalizedStratusProject) {
  const city = normalizeNullableString(stratusProject.city);
  const state = normalizeNullableString(stratusProject.state);
  if (city && state) {
    return `${city}, ${state}`;
  }
  return city ?? state;
}

function buildAssemblyNotes(assembly: NormalizedStratusAssembly) {
  const rawQrCodeUrl =
    typeof assembly.rawAssembly.qrCodeUrl === "string"
      ? assembly.rawAssembly.qrCodeUrl
      : null;
  const rawCadId =
    typeof assembly.rawAssembly.cadId === "string"
      ? assembly.rawAssembly.cadId
      : null;

  return [
    assembly.notes,
    assembly.trackingStatusName
      ? `Tracking Status: ${assembly.trackingStatusName}`
      : null,
    rawCadId ? `CAD Id: ${rawCadId}` : null,
    rawQrCodeUrl ? `QR Code: ${rawQrCodeUrl}` : null,
    assembly.id ? `Stratus Assembly Id: ${assembly.id}` : null,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .join("\n");
}

function appendReferenceNote(
  notes: string,
  referenceSourceProjectName?: string,
  referenceKey?: string | null,
) {
  if (!referenceSourceProjectName) {
    return notes;
  }

  const referenceLine = `Reference source: ${referenceSourceProjectName}${referenceKey ? ` (${referenceKey})` : ""}`;
  return [notes, referenceLine]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .join("\n");
}

function isPrefabProjectName(name: string) {
  return name.trim().toLowerCase() === "prefab";
}

function compareStratusProjects(
  left: NormalizedStratusProject,
  right: NormalizedStratusProject,
) {
  return (
    compareNullableStrings(left.number, right.number) ||
    compareNullableStrings(left.name, right.name)
  );
}

function compareStratusPackages(
  left: NormalizedStratusPackage,
  right: NormalizedStratusPackage,
) {
  const leftUndefined = isUndefinedPackage(left);
  const rightUndefined = isUndefinedPackage(right);
  if (leftUndefined !== rightUndefined) {
    return leftUndefined ? 1 : -1;
  }

  return (
    compareNullableStrings(left.packageNumber, right.packageNumber) ||
    compareNullableStrings(left.packageName, right.packageName) ||
    compareNullableStrings(left.id, right.id)
  );
}

function compareStratusAssemblies(
  left: NormalizedStratusAssembly,
  right: NormalizedStratusAssembly,
) {
  return (
    compareNullableStrings(left.name, right.name) ||
    compareNullableStrings(left.id, right.id)
  );
}

function compareNullableStrings(left: string | null, right: string | null) {
  return (left ?? "").localeCompare(right ?? "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function normalizeNullableString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function rowResultBase(row: PullPreviewRow) {
  return {
    packageId: row.packageId,
    packageNumber: row.packageNumber,
    packageName: row.packageName,
    taskId: row.taskId,
    taskName: row.taskName,
  };
}

function pushRowResultBase(row: PushPreviewResult["rows"][number]) {
  return {
    taskId: row.taskId,
    taskName: row.taskName,
    packageId: row.packageId,
    packageNumber: row.packageNumber,
    packageName: row.packageName,
  };
}

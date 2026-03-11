import type { StratusTaskSync, Task } from '@prisma/client';
import { resolveStatus } from '@schedulesync/engine';
import { prisma } from '../db.js';
import {
  type StratusConfig,
  STRATUS_FINISH_DATE_FIELD_NAME,
  STRATUS_START_DATE_FIELD_NAME,
  setStratusConfig,
} from './stratusConfig.js';
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
  normalizeStratusAssembly,
  normalizeStratusPackage,
  normalizeStratusProject,
  parseDateValue,
  parseNumberValue,
  resolveFieldIdsFromDefinitions,
  stratusRequestJson,
  toDateSignature,
} from './stratusApi.js';

export interface StratusSyncSummary {
  packageId: string;
  packageNumber: string | null;
  packageName: string | null;
  trackingStatusId: string | null;
  trackingStatusName: string | null;
  lastPulledAt: string;
  lastPushedAt: string | null;
  pulledStart: string | null;
  pulledFinish: string | null;
  pulledDeadline: string | null;
}

export interface ProjectImportPreviewRow {
  action: 'create' | 'update' | 'skip';
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
  summary: {
    totalProjects: number;
    createCount: number;
    updateCount: number;
    skipCount: number;
  };
}

export interface ProjectImportApplyResult {
  rows: Array<{
    action: 'created' | 'updated' | 'skipped' | 'failed';
    stratusProjectId: string;
    projectNumber: string | null;
    projectName: string | null;
    localProjectId: string | null;
    localProjectName: string | null;
    message: string | null;
  }>;
  summary: {
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
}

export interface PullPreviewAssemblyRow {
  action: 'create' | 'update' | 'skip';
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
  action: 'create' | 'update' | 'skip';
  matchStrategy: 'packageId' | 'externalKey' | 'none';
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
}

export interface PullApplyResult {
  rows: Array<{
    action: 'created' | 'updated' | 'skipped' | 'failed';
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
}

export interface PushPreviewResult {
  rows: Array<{
    action: 'push' | 'skip';
    taskId: string;
    taskName: string;
    packageId: string;
    packageNumber: string | null;
    packageName: string | null;
    changes: Array<{ field: 'start' | 'finish' | 'deadline'; from: string | null; to: string | null }>;
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
    action: 'pushed' | 'skipped' | 'failed';
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
    action: 'sync' | 'skip';
    sourceTaskId: string;
    sourceTaskName: string;
    prefabTaskId: string | null;
    prefabTaskName: string | null;
    externalKey: string;
    changes: Array<{ field: 'start' | 'finish' | 'deadline'; from: string | null; to: string | null }>;
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
    action: 'synced' | 'skipped' | 'failed';
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
    action: 'refresh' | 'skip';
    sourceTaskId: string;
    sourceTaskName: string;
    prefabTaskId: string | null;
    prefabTaskName: string | null;
    externalKey: string;
    changes: Array<{ field: 'start' | 'finish' | 'deadline'; from: string | null; to: string | null }>;
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
    action: 'refreshed' | 'skipped' | 'failed';
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
}

interface PreviewTaskRecord {
  id: string;
  name: string;
  externalKey: string | null;
  parentId: string | null;
  sortOrder: number;
  stratusSync: Pick<StratusTaskSync, 'packageId'> | null;
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

interface StratusPackageBundle {
  package: NormalizedStratusPackage;
  assemblies: NormalizedStratusAssembly[];
}

interface SyncProjectTarget {
  id: string;
  name: string;
  startDate: Date;
  minutesPerDay: number;
}

interface StratusProjectBundleGroup {
  stratusProject: NormalizedStratusProject;
  bundles: StratusPackageBundle[];
}

interface AppliedPackageGroup {
  anchorExistingTaskId: string | null;
  packageTaskId: string;
  childTaskIds: string[];
}

export async function loadProjectStratusTarget(projectId: string): Promise<LoadedProjectTarget> {
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
    throw new Error('Project not found.');
  }

  return project;
}

async function loadPrefabProjectOrThrow(): Promise<SyncProjectTarget> {
  const prefabProject = await prisma.project.findFirst({
    where: {
      name: {
        equals: 'Prefab',
      },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      startDate: true,
      minutesPerDay: true,
    },
  });

  if (!prefabProject) {
    throw new Error('Prefab project not found. Pull or import Stratus data first.');
  }

  return prefabProject;
}

export async function getResolvedPushFieldIds(config: StratusConfig): Promise<FieldIdResolution> {
  const fields = await fetchCompanyFields(config);
  const resolution = resolveFieldIdsFromDefinitions(fields, config, config);
  if (resolution.canPush && resolution.startFieldId && resolution.finishFieldId) {
    const patch: Partial<StratusConfig> = {};
    if (config.cachedStartDateFieldId !== resolution.startFieldId) {
      patch.cachedStartDateFieldId = resolution.startFieldId;
    }
    if (config.cachedFinishDateFieldId !== resolution.finishFieldId) {
      patch.cachedFinishDateFieldId = resolution.finishFieldId;
    }
    if (Object.keys(patch).length > 0) {
      setStratusConfig(patch);
    }
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
  if (!config.appKey) {
    warnings.push('Set a Stratus app key in Stratus Settings.');
  }
  if (!prefabProject && !project.stratusProjectId && !project.stratusModelId) {
    warnings.push('Set a Stratus project id or model id for this project.');
  }

  const pushPreview = buildPushPreviewRows(tasks);
  const configured = config.appKey.length > 0;
  const projectConfigured = prefabProject ? true : !!(project.stratusProjectId || project.stratusModelId);

  if (!prefabProject && tasks.length > 0) {
    warnings.push('Push is only enabled from the Prefab project.');
  }

  return {
    appKeySet: configured,
    configured,
    projectConfigured,
    canPull: configured && projectConfigured,
    canPush: configured && prefabProject && tasks.length > 0,
    linkedTaskCount: tasks.length,
    changedTaskCount: pushPreview.filter((row) => row.action === 'push').length,
    stratusProjectId: project.stratusProjectId,
    stratusModelId: project.stratusModelId,
    stratusPackageWhere: project.stratusPackageWhere,
    lastPullAt: project.stratusLastPullAt?.toISOString() ?? null,
    lastPushAt: project.stratusLastPushAt?.toISOString() ?? null,
    warnings,
  };
}

export async function previewStratusProjectImport(config: StratusConfig): Promise<ProjectImportPreviewResult> {
  const [rawProjects, localProjects] = await Promise.all([
    fetchActiveProjectsFromStratus(config),
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
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const rows = buildProjectImportPreviewRows(
    rawProjects.map((rawProject) => normalizeStratusProject(rawProject)).sort(compareStratusProjects),
    localProjects,
  );

  return {
    rows,
    summary: {
      totalProjects: rows.length,
      createCount: rows.filter((row) => row.action === 'create').length,
      updateCount: rows.filter((row) => row.action === 'update').length,
      skipCount: rows.filter((row) => row.action === 'skip').length,
    },
  };
}

export async function applyStratusProjectImport(config: StratusConfig): Promise<ProjectImportApplyResult> {
  const rawProjects = await fetchActiveProjectsFromStratus(config);
  const stratusProjects = rawProjects
    .map((rawProject) => normalizeStratusProject(rawProject))
    .sort(compareStratusProjects);
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
    orderBy: { updatedAt: 'desc' },
  });
  const preview = {
    rows: buildProjectImportPreviewRows(stratusProjects, localProjects),
    summary: {
      totalProjects: stratusProjects.length,
      createCount: 0,
      updateCount: 0,
      skipCount: 0,
    },
  };
  const rows: ProjectImportApplyResult['rows'] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const localProjectTargets = new Map<string, SyncProjectTarget>();

  for (const row of preview.rows) {
    if (row.action === 'skip') {
      rows.push({
        action: 'skipped',
        stratusProjectId: row.stratusProjectId,
        projectNumber: row.projectNumber,
        projectName: row.projectName,
        localProjectId: row.localProjectId,
        localProjectName: row.localProjectName,
        message: row.warnings.join('. ') || 'Project already matches Stratus.',
      });
      if (row.localProjectId) {
        const existingProject = localProjects.find((project) => project.id === row.localProjectId);
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
      if (row.action === 'create') {
        const createdProject = await prisma.project.create({
          data: {
            name: row.mappedProject.name,
            startDate: new Date(row.mappedProject.startDate),
            finishDate: row.mappedProject.finishDate ? new Date(row.mappedProject.finishDate) : null,
            scheduleFrom: 'start',
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
          action: 'created',
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
            finishDate: row.mappedProject.finishDate ? new Date(row.mappedProject.finishDate) : null,
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
          action: 'updated',
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
          action: 'skipped',
          stratusProjectId: row.stratusProjectId,
          projectNumber: row.projectNumber,
          projectName: row.projectName,
          localProjectId: null,
          localProjectName: null,
          message: 'Preview row had no matching local project id.',
        });
        skipped++;
      }
    } catch (error) {
      rows.push({
        action: 'failed',
        stratusProjectId: row.stratusProjectId,
        projectNumber: row.projectNumber,
        projectName: row.projectName,
        localProjectId: row.localProjectId,
        localProjectName: row.localProjectName,
        message: error instanceof Error ? error.message : 'Project import failed.',
      });
      failed++;
    }
  }

  const now = new Date();
  const prefabProject = await ensurePrefabProject(stratusProjects);
  const prefabGroups: StratusProjectBundleGroup[] = [];

  for (const stratusProject of stratusProjects) {
    const targetProject = localProjectTargets.get(stratusProject.id);
    if (!targetProject) {
      continue;
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
    const bundles = await loadStratusPackageBundles(syncTarget, config);
    prefabGroups.push({ stratusProject, bundles });

    await syncStratusProjectGroupsToProject(targetProject, [{ stratusProject, bundles }], {
      includeProjectSummaries: false,
      canonicalPackageSync: false,
      referenceSourceProjectName: 'Prefab',
    });
    await prisma.project.update({
      where: { id: targetProject.id },
      data: { stratusLastPullAt: now },
    });
  }

  await syncStratusProjectGroupsToProject(prefabProject, prefabGroups, {
    includeProjectSummaries: true,
    canonicalPackageSync: true,
  });
  await prisma.project.update({
    where: { id: prefabProject.id },
    data: { stratusLastPullAt: now },
  });

  return {
    rows,
    summary: {
      processed: preview.rows.length,
      created,
      updated,
      skipped,
      failed,
    },
  };
}

export async function previewStratusPull(projectId: string, config: StratusConfig): Promise<PullPreviewResult> {
  const project = await loadProjectStratusTarget(projectId);
  const tasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      externalKey: true,
      parentId: true,
      sortOrder: true,
      stratusSync: {
        select: {
          packageId: true,
        },
      },
    },
  });

  const bundles = isPrefabProjectName(project.name)
    ? (await loadActiveStratusProjectGroupsForPrefab(project, config)).flatMap((group) => group.bundles)
    : await loadStratusPackageBundles(project, config);
  const rows = buildPullPreviewRows(bundles, tasks, project.minutesPerDay);
  return {
    rows,
    summary: {
      totalPackages: rows.length,
      createCount: rows.filter((row) => row.action === 'create').length,
      updateCount: rows.filter((row) => row.action === 'update').length,
      skipCount: rows.filter((row) => row.action === 'skip').length,
      totalAssemblies: rows.reduce((sum, row) => sum + row.assemblyCount, 0),
      createAssemblyCount: rows.reduce((sum, row) => sum + row.createAssemblyCount, 0),
      updateAssemblyCount: rows.reduce((sum, row) => sum + row.updateAssemblyCount, 0),
      skipAssemblyCount: rows.reduce((sum, row) => sum + row.skipAssemblyCount, 0),
    },
  };
}

export async function applyStratusPull(projectId: string, config: StratusConfig): Promise<PullApplyResult> {
  const project = await loadProjectStratusTarget(projectId);
  if (isPrefabProjectName(project.name)) {
    const groups = await loadActiveStratusProjectGroupsForPrefab(project, config);
    const existingTasks = await prisma.task.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      include: { stratusSync: true },
    });
    const previewRows = buildPullPreviewRows(groups.flatMap((group) => group.bundles), existingTasks, project.minutesPerDay);
    await syncStratusProjectGroupsToProject(
      {
        id: project.id,
        name: project.name,
        startDate: project.startDate,
        minutesPerDay: project.minutesPerDay,
      },
      groups,
      {
        includeProjectSummaries: true,
        canonicalPackageSync: true,
      },
    );
    const now = new Date();
    await prisma.project.update({ where: { id: projectId }, data: { stratusLastPullAt: now } });

    return {
      rows: previewRows.map((row) => ({
        action: row.action === 'skip' ? 'skipped' : row.action === 'create' ? 'created' : 'updated',
        packageId: row.packageId,
        packageNumber: row.packageNumber,
        packageName: row.packageName,
        taskId: row.taskId,
        taskName: row.taskName,
        createdAssemblies: row.createAssemblyCount,
        updatedAssemblies: row.updateAssemblyCount,
        skippedAssemblies: row.skipAssemblyCount,
        failedAssemblies: 0,
        message: row.action === 'skip' ? row.warnings.join('. ') || 'Skipped.' : null,
      })),
      summary: {
        processed: previewRows.length,
        created: previewRows.filter((row) => row.action === 'create').length,
        updated: previewRows.filter((row) => row.action === 'update').length,
        skipped: previewRows.filter((row) => row.action === 'skip').length,
        failed: 0,
        totalAssemblies: previewRows.reduce((sum, row) => sum + row.assemblyCount, 0),
        createdAssemblies: previewRows.reduce((sum, row) => sum + row.createAssemblyCount, 0),
        updatedAssemblies: previewRows.reduce((sum, row) => sum + row.updateAssemblyCount, 0),
        skippedAssemblies: previewRows.reduce((sum, row) => sum + row.skipAssemblyCount, 0),
        failedAssemblies: 0,
      },
    };
  }

  const bundles = await loadStratusPackageBundles(project, config);
  const existingTasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    include: { stratusSync: true },
  });
  const previewRows = buildPullPreviewRows(bundles, existingTasks, project.minutesPerDay);
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
    bundles,
  };
  await syncStratusProjectGroupsToProject(
    {
      id: project.id,
      name: project.name,
      startDate: project.startDate,
      minutesPerDay: project.minutesPerDay,
    },
    [projectGroup],
    {
      includeProjectSummaries: false,
      canonicalPackageSync: false,
      referenceSourceProjectName: 'Prefab',
    },
  );

  const prefabProject = await ensurePrefabProject([projectGroup.stratusProject]);
  await syncStratusProjectGroupsToProject(
    prefabProject,
    [projectGroup],
    {
      includeProjectSummaries: true,
      canonicalPackageSync: true,
    },
  );

  const now = new Date();
  await prisma.project.updateMany({
    where: { id: { in: [projectId, prefabProject.id] } },
    data: { stratusLastPullAt: now },
  });

  return {
    rows: previewRows.map((row) => ({
      action: row.action === 'skip' ? 'skipped' : row.action === 'create' ? 'created' : 'updated',
      packageId: row.packageId,
      packageNumber: row.packageNumber,
      packageName: row.packageName,
      taskId: row.taskId,
      taskName: row.taskName,
      createdAssemblies: row.createAssemblyCount,
      updatedAssemblies: row.updateAssemblyCount,
      skippedAssemblies: row.skipAssemblyCount,
      failedAssemblies: 0,
      message: row.action === 'skip' ? row.warnings.join('. ') || 'Skipped.' : null,
    })),
    summary: {
      processed: previewRows.length,
      created: previewRows.filter((row) => row.action === 'create').length,
      updated: previewRows.filter((row) => row.action === 'update').length,
      skipped: previewRows.filter((row) => row.action === 'skip').length,
      failed: 0,
      totalAssemblies: previewRows.reduce((sum, row) => sum + row.assemblyCount, 0),
      createdAssemblies: previewRows.reduce((sum, row) => sum + row.createAssemblyCount, 0),
      updatedAssemblies: previewRows.reduce((sum, row) => sum + row.updateAssemblyCount, 0),
      skippedAssemblies: previewRows.reduce((sum, row) => sum + row.skipAssemblyCount, 0),
      failedAssemblies: 0,
    },
  };
}

export async function previewStratusPush(projectId: string, config: StratusConfig): Promise<PushPreviewResult> {
  const project = await loadProjectStratusTarget(projectId);
  if (!isPrefabProjectName(project.name)) {
    throw new Error('Push is only available from the Prefab project.');
  }

  const tasks = await prisma.task.findMany({
    where: { projectId, stratusSync: { isNot: null } },
    orderBy: { sortOrder: 'asc' },
    include: { stratusSync: true },
  });
  const fieldResolution = await getResolvedPushFieldIds(config);
  const rows = buildPushPreviewRows(tasks);
  return {
    rows,
    summary: {
      linkedTaskCount: rows.length,
      pushCount: rows.filter((row) => row.action === 'push').length,
      skipCount: rows.filter((row) => row.action === 'skip').length,
    },
    fieldResolution,
  };
}

export async function applyStratusPush(projectId: string, config: StratusConfig): Promise<PushApplyResult> {
  const project = await loadProjectStratusTarget(projectId);
  if (!isPrefabProjectName(project.name)) {
    throw new Error('Push is only available from the Prefab project.');
  }

  const preview = await previewStratusPush(projectId, config);
  if (!preview.fieldResolution.canPush || !preview.fieldResolution.startFieldId || !preview.fieldResolution.finishFieldId) {
    throw new Error(preview.fieldResolution.message ?? 'Unable to resolve Stratus package date field ids.');
  }

  const tasks = await prisma.task.findMany({
    where: { projectId, stratusSync: { isNot: null } },
    include: { stratusSync: true },
  });
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const now = new Date();

  const rows: PushApplyResult['rows'] = [];
  let pushed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of preview.rows) {
    const task = taskById.get(row.taskId);
    if (!task?.stratusSync) {
      rows.push({ ...pushRowResultBase(row), action: 'skipped', message: 'Task is not linked to a Stratus package.' });
      skipped++;
      continue;
    }

    if (row.action === 'skip' || row.changes.length === 0) {
      rows.push({ ...pushRowResultBase(row), action: 'skipped', message: row.warnings.join('. ') || 'No changes to push.' });
      skipped++;
      continue;
    }

    try {
      const fieldUpdates: Array<{ key: string; value: string | null }> = [];
      if (row.changes.some((change) => change.field === 'start')) {
        fieldUpdates.push({ key: preview.fieldResolution.startFieldId, value: task.start.toISOString() });
      }
      if (row.changes.some((change) => change.field === 'finish')) {
        fieldUpdates.push({ key: preview.fieldResolution.finishFieldId, value: task.finish.toISOString() });
      }
      if (row.changes.some((change) => change.field === 'deadline')) {
        await patchPackageProperties(config, task.stratusSync.packageId, {
          requiredDT: task.deadline ? task.deadline.toISOString() : null,
        });
      }
      if (fieldUpdates.length > 0) {
        await patchPackageFields(config, task.stratusSync.packageId, fieldUpdates);
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
      rows.push({ ...pushRowResultBase(row), action: 'pushed', message: null });
      pushed++;
    } catch (error) {
      rows.push({
        ...pushRowResultBase(row),
        action: 'failed',
        message: error instanceof Error ? error.message : 'Push failed.',
      });
      failed++;
    }
  }

  if (pushed > 0) {
    await prisma.project.update({ where: { id: projectId }, data: { stratusLastPushAt: now } });
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

export async function previewStratusSyncToPrefab(projectId: string): Promise<SyncToPrefabPreviewResult> {
  const sourceProject = await loadProjectStratusTarget(projectId);
  if (isPrefabProjectName(sourceProject.name)) {
    throw new Error('Sync to Prefab is only available from project-specific Stratus references.');
  }

  const prefabProject = await loadPrefabProjectOrThrow();
  const [sourceTasks, prefabTasks] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, externalKey: { not: null } },
      orderBy: { sortOrder: 'asc' },
      include: { stratusSync: true },
    }),
    prisma.task.findMany({
      where: { projectId: prefabProject.id, externalKey: { not: null } },
      orderBy: { sortOrder: 'asc' },
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
      syncCount: rows.filter((row) => row.action === 'sync').length,
      skipCount: rows.filter((row) => row.action === 'skip').length,
    },
  };
}

export async function applyStratusSyncToPrefab(projectId: string): Promise<SyncToPrefabApplyResult> {
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

  const rows: SyncToPrefabApplyResult['rows'] = [];
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of preview.rows) {
    if (row.action === 'skip' || !row.prefabTaskId) {
      rows.push({
        action: 'skipped',
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: row.warnings.join('. ') || 'No Prefab sync changes to apply.',
      });
      skipped++;
      continue;
    }

    const sourceTask = sourceTaskById.get(row.sourceTaskId);
    if (!sourceTask) {
      rows.push({
        action: 'failed',
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: 'Source task could not be loaded.',
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
          isManuallyScheduled: true,
        },
      });
      rows.push({
        action: 'synced',
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
        action: 'failed',
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: error instanceof Error ? error.message : 'Sync to Prefab failed.',
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
    throw new Error('Refresh from Prefab is only available from project-specific Stratus references.');
  }

  const prefabProject = await loadPrefabProjectOrThrow();
  const [sourceTasks, prefabTasks] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, externalKey: { not: null } },
      orderBy: { sortOrder: 'asc' },
      include: { stratusSync: true },
    }),
    prisma.task.findMany({
      where: { projectId: prefabProject.id, externalKey: { not: null } },
      orderBy: { sortOrder: 'asc' },
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
      refreshCount: rows.filter((row) => row.action === 'refresh').length,
      skipCount: rows.filter((row) => row.action === 'skip').length,
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
          .filter((taskId): taskId is string => typeof taskId === 'string'),
      },
    },
    include: { stratusSync: true },
  });
  const prefabTaskById = new Map(prefabTasks.map((task) => [task.id, task]));

  const rows: RefreshFromPrefabApplyResult['rows'] = [];
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of preview.rows) {
    if (row.action === 'skip' || !row.prefabTaskId) {
      rows.push({
        action: 'skipped',
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: row.warnings.join('. ') || 'No Prefab changes to refresh.',
      });
      skipped++;
      continue;
    }

    const prefabTask = prefabTaskById.get(row.prefabTaskId);
    if (!prefabTask) {
      rows.push({
        action: 'failed',
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: 'Prefab task could not be loaded.',
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
          isManuallyScheduled: true,
        },
      });
      rows.push({
        action: 'refreshed',
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
        action: 'failed',
        sourceTaskId: row.sourceTaskId,
        sourceTaskName: row.sourceTaskName,
        prefabTaskId: row.prefabTaskId,
        prefabTaskName: row.prefabTaskName,
        externalKey: row.externalKey,
        message: error instanceof Error ? error.message : 'Refresh from Prefab failed.',
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
): ProjectImportPreviewRow[] {
  const localProjectsByStratusId = new Map<string, LocalProjectRecord[]>();
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
    const matches = stratusProject.id ? (localProjectsByStratusId.get(stratusProject.id) ?? []) : [];
    const localProject = matches[0] ?? null;
    let action: ProjectImportPreviewRow['action'] = 'create';

    if (!stratusProject.id) {
      action = 'skip';
      warnings.push('Stratus project id is missing.');
    } else if (matches.length > 1) {
      action = 'skip';
      warnings.push(`Stratus project ${stratusProject.id} matches multiple local projects.`);
    } else if (localProject) {
      action = areProjectsEquivalent(localProject, mappedProject) ? 'skip' : 'update';
    }

    if (!stratusProject.number) {
      warnings.push('Stratus project number is missing.');
    }
    if (!stratusProject.name) {
      warnings.push('Stratus project name is missing.');
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

export function buildPullPreviewRows(
  bundles: StratusPackageBundle[],
  tasks: PreviewTaskRecord[],
  minutesPerDay: number,
): PullPreviewRow[] {
  const syncByPackageId = new Map<string, { id: string; name: string }>();
  const tasksByExternalKey = new Map<string, Array<{ id: string; name: string }>>();

  for (const task of tasks) {
    if (task.stratusSync?.packageId) {
      syncByPackageId.set(task.stratusSync.packageId, { id: task.id, name: task.name });
    }
    if (task.externalKey) {
      const bucket = tasksByExternalKey.get(task.externalKey) ?? [];
      bucket.push({ id: task.id, name: task.name });
      tasksByExternalKey.set(task.externalKey, bucket);
    }
  }

  return bundles.map((bundle) => {
    const pkg = bundle.package;
    const mappedPackage = createMappedPackagePreviewData(pkg, minutesPerDay);
    const byPackage = syncByPackageId.get(pkg.id) ?? null;
    const byExternalKey = pkg.externalKey ? tasksByExternalKey.get(pkg.externalKey) ?? [] : [];
    const warnings: string[] = [];
    let action: PullPreviewRow['action'] = 'create';
    let matchStrategy: PullPreviewRow['matchStrategy'] = 'none';
    let taskId: string | null = null;
    let taskName: string | null = null;

    if (byPackage) {
      action = 'update';
      matchStrategy = 'packageId';
      taskId = byPackage.id;
      taskName = byPackage.name;
    } else if (byExternalKey.length === 1) {
      action = 'update';
      matchStrategy = 'externalKey';
      taskId = byExternalKey[0]?.id ?? null;
      taskName = byExternalKey[0]?.name ?? null;
    } else if (byExternalKey.length > 1) {
      action = 'skip';
      warnings.push(`External key ${pkg.externalKey} matches multiple tasks`);
    }

    if (!pkg.packageNumber) {
      warnings.push('Package number is missing');
    }
    if (!pkg.externalKey) {
      warnings.push('External key could not be derived');
    }

    const assemblyRows = bundle.assemblies.map((assembly) => {
      const assemblyMapped = createMappedAssemblyPreviewData(minutesPerDay, pkg, assembly);
      const assemblyWarnings: string[] = [];
      const matches = tasksByExternalKey.get(assembly.externalKey) ?? [];
      let assemblyAction: PullPreviewAssemblyRow['action'] = 'create';
      let assemblyTaskId: string | null = null;
      let assemblyTaskName: string | null = null;

      if (action === 'skip') {
        assemblyAction = 'skip';
        assemblyWarnings.push('Package row will be skipped.');
      } else if (matches.length === 1) {
        assemblyAction = 'update';
        assemblyTaskId = matches[0]?.id ?? null;
        assemblyTaskName = matches[0]?.name ?? null;
      } else if (matches.length > 1) {
        assemblyAction = 'skip';
        assemblyWarnings.push(`Assembly external key ${assembly.externalKey} matches multiple tasks`);
      }

      if (!assembly.name) {
        assemblyWarnings.push('Assembly name is missing');
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
      createAssemblyCount: assemblyRows.filter((row) => row.action === 'create').length,
      updateAssemblyCount: assemblyRows.filter((row) => row.action === 'update').length,
      skipAssemblyCount: assemblyRows.filter((row) => row.action === 'skip').length,
      assemblyRows,
      mappedTask: mappedPackage,
    };
  });
}

export function buildPushPreviewRows(tasks: TaskWithSync[]) {
  return tasks.map((task) => {
    if (!task.stratusSync) {
      return {
        action: 'skip' as const,
        taskId: task.id,
        taskName: task.name,
        packageId: '',
        packageNumber: null,
        packageName: null,
        changes: [],
        warnings: ['Task is not linked to a Stratus package'],
      };
    }

    const changes: Array<{ field: 'start' | 'finish' | 'deadline'; from: string | null; to: string | null }> = [];
    const currentStart = toDateSignature(task.start);
    const currentFinish = toDateSignature(task.finish);
    const currentDeadline = toDateSignature(task.deadline);

    if (currentStart !== task.stratusSync.syncedStartSignature) {
      changes.push({ field: 'start', from: task.stratusSync.syncedStartSignature, to: currentStart });
    }
    if (currentFinish !== task.stratusSync.syncedFinishSignature) {
      changes.push({ field: 'finish', from: task.stratusSync.syncedFinishSignature, to: currentFinish });
    }
    if (currentDeadline !== task.stratusSync.syncedDeadlineSignature) {
      changes.push({ field: 'deadline', from: task.stratusSync.syncedDeadlineSignature, to: currentDeadline });
    }

    return {
      action: changes.length > 0 ? 'push' as const : 'skip' as const,
      taskId: task.id,
      taskName: task.name,
      packageId: task.stratusSync.packageId,
      packageNumber: task.stratusSync.packageNumber,
      packageName: task.stratusSync.packageName,
      changes,
      warnings: changes.length === 0 ? ['No date changes to push'] : [],
    };
  });
}

export function buildSyncToPrefabPreviewRows(sourceTasks: TaskWithSync[], prefabTasks: TaskWithSync[]) {
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
      const matches = prefabTasksByExternalKey.get(sourceTask.externalKey) ?? [];
      const prefabTask = matches.length === 1 ? matches[0] ?? null : null;

      if (matches.length === 0) {
        warnings.push('No matching Prefab package task was found.');
      } else if (matches.length > 1) {
        warnings.push(`External key ${sourceTask.externalKey} matches multiple Prefab tasks.`);
      }

      const changes: Array<{ field: 'start' | 'finish' | 'deadline'; from: string | null; to: string | null }> = [];
      if (prefabTask) {
        const prefabStart = toIsoSignature(prefabTask.start);
        const sourceStart = toIsoSignature(sourceTask.start);
        const prefabFinish = toIsoSignature(prefabTask.finish);
        const sourceFinish = toIsoSignature(sourceTask.finish);
        const prefabDeadline = toIsoSignature(prefabTask.deadline);
        const sourceDeadline = toIsoSignature(sourceTask.deadline);

        if (prefabStart !== sourceStart) {
          changes.push({ field: 'start', from: prefabStart, to: sourceStart });
        }
        if (prefabFinish !== sourceFinish) {
          changes.push({ field: 'finish', from: prefabFinish, to: sourceFinish });
        }
        if (prefabDeadline !== sourceDeadline) {
          changes.push({ field: 'deadline', from: prefabDeadline, to: sourceDeadline });
        }
      }

      return {
        action: warnings.length === 0 && changes.length > 0 ? 'sync' as const : 'skip' as const,
        sourceTaskId: sourceTask.id,
        sourceTaskName: sourceTask.name,
        prefabTaskId: prefabTask?.id ?? null,
        prefabTaskName: prefabTask?.name ?? null,
        externalKey: sourceTask.externalKey ?? sourceTask.id,
        changes,
        warnings: warnings.length === 0 && changes.length === 0 ? ['No date changes to sync'] : warnings,
      };
    });
}

export function buildRefreshFromPrefabPreviewRows(sourceTasks: TaskWithSync[], prefabTasks: TaskWithSync[]) {
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
      const matches = prefabTasksByExternalKey.get(sourceTask.externalKey) ?? [];
      const prefabTask = matches.length === 1 ? matches[0] ?? null : null;

      if (matches.length === 0) {
        warnings.push('No matching Prefab reference was found.');
      } else if (matches.length > 1) {
        warnings.push(`External key ${sourceTask.externalKey} matches multiple Prefab tasks.`);
      }

      const changes: Array<{ field: 'start' | 'finish' | 'deadline'; from: string | null; to: string | null }> = [];
      if (prefabTask) {
        const sourceStart = toIsoSignature(sourceTask.start);
        const prefabStart = toIsoSignature(prefabTask.start);
        const sourceFinish = toIsoSignature(sourceTask.finish);
        const prefabFinish = toIsoSignature(prefabTask.finish);
        const sourceDeadline = toIsoSignature(sourceTask.deadline);
        const prefabDeadline = toIsoSignature(prefabTask.deadline);

        if (sourceStart !== prefabStart) {
          changes.push({ field: 'start', from: sourceStart, to: prefabStart });
        }
        if (sourceFinish !== prefabFinish) {
          changes.push({ field: 'finish', from: sourceFinish, to: prefabFinish });
        }
        if (sourceDeadline !== prefabDeadline) {
          changes.push({ field: 'deadline', from: sourceDeadline, to: prefabDeadline });
        }
      }

      return {
        action: warnings.length === 0 && changes.length > 0 ? 'refresh' as const : 'skip' as const,
        sourceTaskId: sourceTask.id,
        sourceTaskName: sourceTask.name,
        prefabTaskId: prefabTask?.id ?? null,
        prefabTaskName: prefabTask?.name ?? null,
        externalKey: sourceTask.externalKey ?? sourceTask.id,
        changes,
        warnings: warnings.length === 0 && changes.length === 0 ? ['No Prefab changes to refresh'] : warnings,
      };
    });
}

export function toStratusSyncSummary(sync: StratusTaskSync | null): StratusSyncSummary | null {
  if (!sync) {
    return null;
  }

  return {
    packageId: sync.packageId,
    packageNumber: sync.packageNumber,
    packageName: sync.packageName,
    trackingStatusId: sync.trackingStatusId,
    trackingStatusName: sync.trackingStatusName,
    lastPulledAt: sync.lastPulledAt.toISOString(),
    lastPushedAt: sync.lastPushedAt?.toISOString() ?? null,
    pulledStart: sync.syncedStartSignature,
    pulledFinish: sync.syncedFinishSignature,
    pulledDeadline: sync.syncedDeadlineSignature,
  };
}

function isProjectReferenceSyncCandidate(
  task: TaskWithSync,
): task is TaskWithSync & { externalKey: string } {
  return (
    typeof task.externalKey === 'string'
    && task.externalKey.length > 0
    && !task.externalKey.startsWith('stratus-project:')
    && !task.externalKey.includes('::assembly:')
  );
}

function isPrefabSyncCandidate(task: TaskWithSync) {
  return isProjectReferenceSyncCandidate(task) && task.stratusSync !== null;
}

function isProjectReferenceRefreshCandidate(
  task: TaskWithSync,
): task is TaskWithSync & { externalKey: string } {
  return (
    typeof task.externalKey === 'string'
    && task.externalKey.length > 0
    && !task.externalKey.startsWith('stratus-project:')
  );
}

function isPrefabRefreshCandidate(
  task: TaskWithSync,
): task is TaskWithSync & { externalKey: string } {
  return (
    typeof task.externalKey === 'string'
    && task.externalKey.length > 0
    && !task.externalKey.startsWith('stratus-project:')
  );
}

function toIsoSignature(date: Date | null) {
  return date ? date.toISOString() : null;
}

async function loadStratusPackageBundles(
  project: LoadedProjectTarget,
  config: StratusConfig,
): Promise<StratusPackageBundle[]> {
  const packages = (await fetchPackagesFromStratus(config, project))
    .map((pkg) => normalizeStratusPackage(pkg, project.minutesPerDay))
    .sort(compareStratusPackages);

  const bundles: StratusPackageBundle[] = [];
  for (const pkg of packages) {
    const rawAssemblies = pkg.id ? await fetchAssembliesForPackage(config, pkg.id) : [];
    const assemblies = rawAssemblies
      .map((rawAssembly) => normalizeStratusAssembly(pkg.id, pkg.externalKey, rawAssembly))
      .sort(compareStratusAssemblies);
    bundles.push({ package: pkg, assemblies });
  }

  return bundles;
}

async function loadActiveStratusProjectGroupsForPrefab(
  prefabProject: LoadedProjectTarget,
  config: StratusConfig,
): Promise<StratusProjectBundleGroup[]> {
  const rawProjects = await fetchActiveProjectsFromStratus(config);
  const stratusProjects = rawProjects
    .map((rawProject) => normalizeStratusProject(rawProject))
    .sort(compareStratusProjects);
  const groups: StratusProjectBundleGroup[] = [];

  for (const stratusProject of stratusProjects) {
    const bundles = await loadStratusPackageBundles(
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
    );
    groups.push({ stratusProject, bundles });
  }

  return groups;
}

async function upsertStratusTaskSync(
  taskId: string,
  localProjectId: string,
  pkg: NormalizedStratusPackage,
  now: Date,
  scheduledDates?: {
    start: Date;
    finish: Date;
    deadline: Date | null;
  },
) {
  const pulledStartSignature = toDateSignature(pkg.normalizedFields[STRATUS_START_DATE_FIELD_NAME]);
  const pulledFinishSignature = toDateSignature(pkg.normalizedFields[STRATUS_FINISH_DATE_FIELD_NAME]);
  const pulledDeadlineSignature = toDateSignature(pkg.normalizedFields['STRATUS.Package.RequiredDT']);
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
    syncedStartSignature: pulledStartSignature ?? toDateSignature(scheduledDates?.start),
    syncedFinishSignature: pulledFinishSignature ?? toDateSignature(scheduledDates?.finish),
    syncedDeadlineSignature: pulledDeadlineSignature ?? toDateSignature(scheduledDates?.deadline),
  };

  await prisma.stratusTaskSync.upsert({
    where: { taskId },
    create: { taskId, ...data },
    update: data,
  });
}

function createMappedPackageTaskData(project: LoadedProjectTarget, pkg: NormalizedStratusPackage) {
  const workDays = parseNumberValue(pkg.normalizedFields['Work Days (Reference)']);
  const durationMinutes = workDays !== null ? workDays * project.minutesPerDay : project.minutesPerDay;
  const start = parseDateValue(pkg.normalizedFields[STRATUS_START_DATE_FIELD_NAME]) ?? project.startDate;
  const finish =
    parseDateValue(pkg.normalizedFields[STRATUS_FINISH_DATE_FIELD_NAME])
    ?? new Date(start.getTime() + durationMinutes * 60_000);

  return {
    name: pkg.normalizedFields['STRATUS.Field.Project Name Override'] ?? pkg.packageName ?? `Package ${pkg.id}`,
    start,
    finish,
    deadline: parseDateValue(pkg.normalizedFields['STRATUS.Package.RequiredDT']),
    durationMinutes,
    percentComplete: resolveStatus(pkg.normalizedFields['STRATUS.Package.TrackingStatus'] ?? pkg.normalizedFields['STRATUS.Package.Status']) ?? 0,
    notes: [pkg.normalizedFields['STRATUS.Package.Description'], pkg.normalizedFields['STRATUS.Package.Notes']]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join('\n'),
    externalKey: pkg.externalKey,
  };
}

function createMappedPackagePreviewData(
  pkg: NormalizedStratusPackage,
  minutesPerDay: number,
): PullPreviewRow['mappedTask'] {
  const workDays = parseNumberValue(pkg.normalizedFields['Work Days (Reference)']);
  return {
    name: pkg.normalizedFields['STRATUS.Field.Project Name Override'] ?? pkg.packageName ?? `Package ${pkg.id}`,
    start: pkg.normalizedFields[STRATUS_START_DATE_FIELD_NAME],
    finish: pkg.normalizedFields[STRATUS_FINISH_DATE_FIELD_NAME],
    deadline: pkg.normalizedFields['STRATUS.Package.RequiredDT'],
    durationMinutes: workDays !== null ? workDays * minutesPerDay : minutesPerDay,
    percentComplete:
      resolveStatus(
        pkg.normalizedFields['STRATUS.Package.TrackingStatus'] ?? pkg.normalizedFields['STRATUS.Package.Status'],
      ) ?? 0,
    notes: [pkg.normalizedFields['STRATUS.Package.Description'], pkg.normalizedFields['STRATUS.Package.Notes']]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join('\n'),
    externalKey: pkg.externalKey,
  };
}

function createMappedAssemblyTaskData(
  project: LoadedProjectTarget,
  pkg: NormalizedStratusPackage,
  assembly: NormalizedStratusAssembly,
) {
  const packageTask = createMappedPackageTaskData(project, pkg);
  const start = packageTask.start;
  const finish = packageTask.finish ?? new Date(start.getTime() + project.minutesPerDay * 60_000);

  return {
    name: assembly.name ?? `Assembly ${assembly.id}`,
    start,
    finish,
    deadline: packageTask.deadline,
    durationMinutes: project.minutesPerDay,
    percentComplete: resolveStatus(assembly.trackingStatusName) ?? packageTask.percentComplete,
    notes: buildAssemblyNotes(assembly),
    externalKey: assembly.externalKey,
  };
}

function createMappedAssemblyPreviewData(
  minutesPerDay: number,
  pkg: NormalizedStratusPackage,
  assembly: NormalizedStratusAssembly,
): PullPreviewAssemblyRow['mappedTask'] {
  const packagePreview = createMappedPackagePreviewData(pkg, minutesPerDay);
  return {
    name: assembly.name ?? `Assembly ${assembly.id}`,
    start: packagePreview.start,
    finish: packagePreview.finish,
    deadline: packagePreview.deadline,
    durationMinutes: minutesPerDay,
    percentComplete: resolveStatus(assembly.trackingStatusName) ?? packagePreview.percentComplete,
    notes: buildAssemblyNotes(assembly),
    externalKey: assembly.externalKey,
  };
}

async function patchPackageProperties(
  config: StratusConfig,
  packageId: string,
  data: { requiredDT: string | null },
) {
  await stratusRequestJson(config, '/v2/package/properties', {
    method: 'PATCH',
    body: JSON.stringify({ id: packageId, requiredDT: data.requiredDT }),
  });
}

async function patchPackageFields(
  config: StratusConfig,
  packageId: string,
  fieldUpdates: Array<{ key: string; value: string | null }>,
) {
  await stratusRequestJson(config, `/v2/package/${encodeURIComponent(packageId)}/fields`, {
    method: 'PATCH',
    body: JSON.stringify(fieldUpdates),
  });
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

async function ensurePrefabProject(stratusProjects: NormalizedStratusProject[]): Promise<SyncProjectTarget> {
  const existingPrefab = await prisma.project.findFirst({
    where: {
      name: {
        equals: 'Prefab',
      },
    },
    orderBy: { updatedAt: 'desc' },
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
      .sort((left, right) => left.getTime() - right.getTime())[0]
    ?? new Date();

  if (existingPrefab) {
    const desiredStart =
      existingPrefab.startDate.getTime() <= earliestStart.getTime()
        ? existingPrefab.startDate
        : earliestStart;
    if (toDateSignature(existingPrefab.startDate) !== toDateSignature(desiredStart)) {
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
      name: 'Prefab',
      startDate: earliestStart,
      scheduleFrom: 'start',
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
  options: {
    includeProjectSummaries: boolean;
    canonicalPackageSync: boolean;
    referenceSourceProjectName?: string;
  },
) {
  const existingTasks = await prisma.task.findMany({
    where: { projectId: targetProject.id },
    orderBy: { sortOrder: 'asc' },
    include: { stratusSync: true },
  });

  const taskById = new Map(existingTasks.map((task) => [task.id, task]));
  const tasksByExternalKey = new Map<string, TaskWithSync[]>();
  const syncByPackageId = new Map<string, TaskWithSync>();

  for (const task of existingTasks) {
    if (task.externalKey) {
      const bucket = tasksByExternalKey.get(task.externalKey) ?? [];
      bucket.push(task);
      tasksByExternalKey.set(task.externalKey, bucket);
    }
    if (task.stratusSync?.packageId) {
      syncByPackageId.set(task.stratusSync.packageId, task);
    }
  }

  const managedTaskIds = new Set<string>();
  let nextSortOrder = 0;

  const upsertTask = async (params: {
    externalKey: string;
    packageId?: string;
    name: string;
    parentId: string | null;
    outlineLevel: number;
    type: 'summary' | 'task';
    start: Date;
    finish: Date;
    deadline: Date | null;
    durationMinutes: number;
    percentComplete: number;
    notes: string;
    syncPackage?: NormalizedStratusPackage;
  }) => {
    const bySync = params.packageId ? syncByPackageId.get(params.packageId) ?? null : null;
    const byExternalKey = tasksByExternalKey.get(params.externalKey) ?? [];
    const existingTask = bySync ?? (byExternalKey.length > 0 ? byExternalKey[0] ?? null : null);

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

    let task: TaskWithSync;
    if (existingTask) {
      task = await prisma.task.update({
        where: { id: existingTask.id },
        data,
        include: { stratusSync: true },
      });
    } else {
      task = await prisma.task.create({
        data: {
          projectId: targetProject.id,
          wbsCode: '',
          constraintType: 0,
          ...data,
        },
        include: { stratusSync: true },
      });
    }

    if (params.syncPackage) {
      await upsertStratusTaskSync(task.id, targetProject.id, params.syncPackage, new Date(), {
        start: params.start,
        finish: params.finish,
        deadline: params.deadline,
      });
      task = await prisma.task.findUniqueOrThrow({
        where: { id: task.id },
        include: { stratusSync: true },
      });
      syncByPackageId.set(params.syncPackage.id, task);
    } else if (task.stratusSync) {
      await prisma.stratusTaskSync.delete({ where: { taskId: task.id } });
      task = {
        ...task,
        stratusSync: null,
      };
    }

    taskById.set(task.id, task);
    const updatedBucket = tasksByExternalKey.get(params.externalKey) ?? [];
    if (!updatedBucket.some((candidate) => candidate.id === task.id)) {
      updatedBucket.push(task);
      tasksByExternalKey.set(params.externalKey, updatedBucket);
    } else {
      tasksByExternalKey.set(
        params.externalKey,
        updatedBucket.map((candidate) => (candidate.id === task.id ? task : candidate)),
      );
    }
    managedTaskIds.add(task.id);
    return task;
  };

  for (const group of groups) {
    let projectSummaryTaskId: string | null = null;
    let packageOutlineLevel = 0;
    const fallbackProjectStart =
      parseDateValue(group.stratusProject.startDate)
      ?? parseDateValue(group.stratusProject.finishDate)
      ?? targetProject.startDate;
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
        parseDateValue(group.stratusProject.finishDate)
        ?? group.bundles
          .map((bundle) => parseDateValue(bundle.package.normalizedFields[STRATUS_FINISH_DATE_FIELD_NAME]))
          .filter((value): value is Date => value instanceof Date)
          .sort((left, right) => right.getTime() - left.getTime())[0]
        ?? projectStart;
      const projectSummary = await upsertTask({
        externalKey: `stratus-project:${group.stratusProject.id}`,
        name: buildImportedProjectName(
          group.stratusProject.number,
          group.stratusProject.name,
          group.stratusProject.id,
        ),
        parentId: null,
        outlineLevel: 0,
        type: 'summary',
        start: projectStart,
        finish: projectFinish,
        deadline: null,
        durationMinutes: Math.max(
          targetProject.minutesPerDay,
          (projectFinish.getTime() - projectStart.getTime()) / 60_000,
        ),
        percentComplete: 0,
        notes: group.stratusProject.description ?? '',
      });
      projectSummaryTaskId = projectSummary.id;
      packageOutlineLevel = 1;
    }

    for (const bundle of group.bundles) {
      const mappedPackage = createMappedPackageTaskData(mappedProjectContext, bundle.package);

      const packageTask = await upsertTask({
        externalKey: bundle.package.externalKey ?? bundle.package.id,
        packageId: options.canonicalPackageSync ? bundle.package.id : undefined,
        name: mappedPackage.name,
        parentId: projectSummaryTaskId,
        outlineLevel: packageOutlineLevel,
        type: 'summary',
        start: mappedPackage.start,
        finish: mappedPackage.finish,
        deadline: mappedPackage.deadline,
        durationMinutes: mappedPackage.durationMinutes,
        percentComplete: mappedPackage.percentComplete,
        notes: appendReferenceNote(mappedPackage.notes, options.referenceSourceProjectName, bundle.package.externalKey),
        syncPackage: options.canonicalPackageSync ? bundle.package : undefined,
      });

      for (const assembly of bundle.assemblies) {
        const mappedAssembly = createMappedAssemblyTaskData(
          mappedProjectContext,
          bundle.package,
          assembly,
        );

        await upsertTask({
          externalKey: assembly.externalKey,
          name: mappedAssembly.name,
          parentId: packageTask.id,
          outlineLevel: packageOutlineLevel + 1,
          type: 'task',
          start: mappedAssembly.start,
          finish: mappedAssembly.finish,
          deadline: mappedAssembly.deadline,
          durationMinutes: mappedAssembly.durationMinutes,
          percentComplete: mappedAssembly.percentComplete,
          notes: appendReferenceNote(mappedAssembly.notes, options.referenceSourceProjectName, assembly.externalKey),
        });
      }
    }
  }

  for (const task of existingTasks) {
    if (managedTaskIds.has(task.id)) {
      continue;
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { sortOrder: nextSortOrder++ },
    });
  }
}

function mapStratusProjectToLocalProjectData(stratusProject: NormalizedStratusProject) {
  return {
    name: buildImportedProjectName(stratusProject.number, stratusProject.name, stratusProject.id),
    startDate: stratusProject.startDate ?? stratusProject.finishDate ?? new Date().toISOString(),
    finishDate: stratusProject.finishDate,
    projectType: stratusProject.category,
    sector: stratusProject.phase,
    region: buildProjectRegion(stratusProject),
  };
}

function areProjectsEquivalent(
  localProject: LocalProjectRecord,
  mappedProject: ProjectImportPreviewRow['mappedProject'],
) {
  return (
    localProject.name === mappedProject.name &&
    toDateSignature(localProject.startDate) === toDateSignature(mappedProject.startDate) &&
    toDateSignature(localProject.finishDate) === toDateSignature(mappedProject.finishDate) &&
    normalizeNullableString(localProject.projectType) === normalizeNullableString(mappedProject.projectType) &&
    normalizeNullableString(localProject.sector) === normalizeNullableString(mappedProject.sector) &&
    normalizeNullableString(localProject.region) === normalizeNullableString(mappedProject.region)
  );
}

function buildImportedProjectName(number: string | null, name: string | null, projectId: string) {
  const trimmedNumber = normalizeNullableString(number);
  const trimmedName = normalizeNullableString(name);
  if (trimmedNumber && trimmedName) {
    return `${trimmedNumber} - ${trimmedName}`;
  }
  return trimmedNumber ?? trimmedName ?? `Stratus Project ${projectId}`;
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
  const rawQrCodeUrl = typeof assembly.rawAssembly.qrCodeUrl === 'string' ? assembly.rawAssembly.qrCodeUrl : null;
  const rawCadId = typeof assembly.rawAssembly.cadId === 'string' ? assembly.rawAssembly.cadId : null;

  return [
    assembly.notes,
    assembly.trackingStatusName ? `Tracking Status: ${assembly.trackingStatusName}` : null,
    rawCadId ? `CAD Id: ${rawCadId}` : null,
    rawQrCodeUrl ? `QR Code: ${rawQrCodeUrl}` : null,
    assembly.id ? `Stratus Assembly Id: ${assembly.id}` : null,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
}

function appendReferenceNote(
  notes: string,
  referenceSourceProjectName?: string,
  referenceKey?: string | null,
) {
  if (!referenceSourceProjectName) {
    return notes;
  }

  const referenceLine = `Reference source: ${referenceSourceProjectName}${referenceKey ? ` (${referenceKey})` : ''}`;
  return [notes, referenceLine]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
}

function isPrefabProjectName(name: string) {
  return name.trim().toLowerCase() === 'prefab';
}

function compareStratusProjects(left: NormalizedStratusProject, right: NormalizedStratusProject) {
  return compareNullableStrings(left.number, right.number) || compareNullableStrings(left.name, right.name);
}

function compareStratusPackages(left: NormalizedStratusPackage, right: NormalizedStratusPackage) {
  return (
    compareNullableStrings(left.packageNumber, right.packageNumber) ||
    compareNullableStrings(left.packageName, right.packageName) ||
    compareNullableStrings(left.id, right.id)
  );
}

function compareStratusAssemblies(left: NormalizedStratusAssembly, right: NormalizedStratusAssembly) {
  return compareNullableStrings(left.name, right.name) || compareNullableStrings(left.id, right.id);
}

function compareNullableStrings(left: string | null, right: string | null) {
  return (left ?? '').localeCompare(right ?? '', undefined, { numeric: true, sensitivity: 'base' });
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

function pushRowResultBase(row: PushPreviewResult['rows'][number]) {
  return {
    taskId: row.taskId,
    taskName: row.taskName,
    packageId: row.packageId,
    packageNumber: row.packageNumber,
    packageName: row.packageName,
  };
}

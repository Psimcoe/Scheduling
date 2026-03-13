import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type {
  StratusConfig,
  StratusStatusProgressMapping,
} from "./stratusConfig.js";
import {
  getStratusConfig,
  resolveNextStratusConfig,
  writeStratusConfig,
} from "./stratusConfig.js";
import {
  loadProjectSnapshot,
  type ProjectSnapshotResponse,
} from "./projectSnapshotService.js";

export interface StratusProjectTargetPatch {
  stratusProjectId: string | null;
  stratusModelId: string | null;
  stratusPackageWhere: string | null;
}

export interface SaveStratusSettingsForProjectInput {
  projectId: string;
  configPatch: Partial<StratusConfig>;
  projectPatch: StratusProjectTargetPatch;
}

export interface SaveStratusSettingsForProjectResult {
  mode: "saved" | "localRemap" | "seedRequired";
  revision: number;
  snapshot: ProjectSnapshotResponse;
  affectedPackages: number;
  affectedAssemblies: number;
}

export class StratusRemapBusyError extends Error {
  readonly code = "STRATUS_REMAP_BUSY";
  readonly statusCode = 409;

  constructor(projectId: string) {
    super(
      `Stratus settings are already being saved for project ${projectId}. Wait for the current save to finish.`,
    );
  }
}

const activeProjectSaves = new Set<string>();

function buildStatusPercentMap(
  mappings: StratusStatusProgressMapping[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const mapping of mappings) {
    const statusId = mapping.statusId.trim();
    if (!statusId) {
      continue;
    }
    result.set(statusId, mapping.percentCompleteShop ?? 0);
  }
  return result;
}

function diffChangedStatusIds(
  previousMappings: StratusStatusProgressMapping[],
  nextMappings: StratusStatusProgressMapping[],
): string[] {
  const previousMap = buildStatusPercentMap(previousMappings);
  const nextMap = buildStatusPercentMap(nextMappings);
  const changedIds = new Set<string>();

  for (const statusId of previousMap.keys()) {
    if ((previousMap.get(statusId) ?? 0) !== (nextMap.get(statusId) ?? 0)) {
      changedIds.add(statusId);
    }
  }
  for (const statusId of nextMap.keys()) {
    if ((previousMap.get(statusId) ?? 0) !== (nextMap.get(statusId) ?? 0)) {
      changedIds.add(statusId);
    }
  }

  return [...changedIds];
}

function groupTaskIdsByPercent(
  rows: Array<{ taskId: string; trackingStatusId: string | null }>,
  nextPercentByStatusId: Map<string, number>,
): Map<number, string[]> {
  const groupedIds = new Map<number, string[]>();

  for (const row of rows) {
    const statusId = row.trackingStatusId;
    if (!statusId) {
      continue;
    }

    const percent = nextPercentByStatusId.get(statusId) ?? 0;
    const bucket = groupedIds.get(percent) ?? [];
    bucket.push(row.taskId);
    groupedIds.set(percent, bucket);
  }

  return groupedIds;
}

async function updateProjectTarget(
  tx: Prisma.TransactionClient,
  projectId: string,
  projectPatch: StratusProjectTargetPatch,
) {
  await tx.project.update({
    where: { id: projectId },
    data: {
      stratusProjectId: projectPatch.stratusProjectId,
      stratusModelId: projectPatch.stratusModelId,
      stratusPackageWhere: projectPatch.stratusPackageWhere,
    },
  });
}

async function applyLocalStatusRemap(
  projectId: string,
  projectPatch: StratusProjectTargetPatch,
  changedStatusIds: string[],
  nextPercentByStatusId: Map<string, number>,
): Promise<{
  affectedPackages: number;
  affectedAssemblies: number;
}> {
  let affectedPackages = 0;
  let affectedAssemblies = 0;

  await prisma.$transaction(async (tx) => {
    await updateProjectTarget(tx, projectId, projectPatch);

    const [packageRows, assemblyRows] = await Promise.all([
      tx.stratusTaskSync.findMany({
        where: {
          localProjectId: projectId,
          trackingStatusId: { in: changedStatusIds },
        },
        select: {
          taskId: true,
          trackingStatusId: true,
        },
      }),
      tx.stratusAssemblySync.findMany({
        where: {
          localProjectId: projectId,
          trackingStatusId: { in: changedStatusIds },
        },
        select: {
          taskId: true,
          trackingStatusId: true,
        },
      }),
    ]);

    affectedPackages = packageRows.length;
    affectedAssemblies = assemblyRows.length;

    const groupedPackageIds = groupTaskIdsByPercent(
      packageRows,
      nextPercentByStatusId,
    );
    const groupedAssemblyIds = groupTaskIdsByPercent(
      assemblyRows,
      nextPercentByStatusId,
    );

    for (const [percentComplete, taskIds] of groupedPackageIds.entries()) {
      await tx.task.updateMany({
        where: {
          projectId,
          id: { in: taskIds },
        },
        data: { percentComplete },
      });
    }

    for (const [percentComplete, taskIds] of groupedAssemblyIds.entries()) {
      await tx.task.updateMany({
        where: {
          projectId,
          id: { in: taskIds },
        },
        data: { percentComplete },
      });
    }

    if (affectedPackages > 0 || affectedAssemblies > 0) {
      await tx.project.update({
        where: { id: projectId },
        data: {
          revision: { increment: 1 },
        },
      });
    }
  });

  return {
    affectedPackages,
    affectedAssemblies,
  };
}

export async function saveStratusSettingsForProject(
  input: SaveStratusSettingsForProjectInput,
): Promise<SaveStratusSettingsForProjectResult> {
  if (activeProjectSaves.has(input.projectId)) {
    throw new StratusRemapBusyError(input.projectId);
  }

  activeProjectSaves.add(input.projectId);

  const previousConfig = getStratusConfig();
  const nextConfig = resolveNextStratusConfig(input.configPatch, previousConfig);
  const changedStatusIds = diffChangedStatusIds(
    previousConfig.statusProgressMappings,
    nextConfig.statusProgressMappings,
  );
  const nextPercentByStatusId = buildStatusPercentMap(
    nextConfig.statusProgressMappings,
  );

  try {
    await writeStratusConfig(nextConfig);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: input.projectId },
      select: {
        id: true,
        revision: true,
        stratusLocalMetadataVersion: true,
      },
    });

    if (changedStatusIds.length === 0) {
      await prisma.$transaction(async (tx) => {
        await updateProjectTarget(tx, input.projectId, input.projectPatch);
      });
      const snapshot = await loadProjectSnapshot(input.projectId);
      return {
        mode: "saved",
        revision: snapshot.revision,
        snapshot,
        affectedPackages: 0,
        affectedAssemblies: 0,
      };
    }

    if (project.stratusLocalMetadataVersion < 1) {
      await prisma.$transaction(async (tx) => {
        await updateProjectTarget(tx, input.projectId, input.projectPatch);
      });
      const snapshot = await loadProjectSnapshot(input.projectId);
      return {
        mode: "seedRequired",
        revision: snapshot.revision,
        snapshot,
        affectedPackages: 0,
        affectedAssemblies: 0,
      };
    }

    const affected = await applyLocalStatusRemap(
      input.projectId,
      input.projectPatch,
      changedStatusIds,
      nextPercentByStatusId,
    );
    const snapshot = await loadProjectSnapshot(input.projectId);
    return {
      mode: "localRemap",
      revision: snapshot.revision,
      snapshot,
      affectedPackages: affected.affectedPackages,
      affectedAssemblies: affected.affectedAssemblies,
    };
  } catch (error) {
    await writeStratusConfig(previousConfig).catch(() => undefined);
    throw error;
  } finally {
    activeProjectSaves.delete(input.projectId);
  }
}

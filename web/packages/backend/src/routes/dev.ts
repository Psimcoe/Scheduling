import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, resolveSqliteDatabasePath } from "../db.js";
import {
  getSqliteDatabaseDiagnostics,
  listDevDiagnosticsEntries,
  type DevDiagnosticsLogEntry,
  type SqliteDatabaseDiagnostics,
} from "../services/devDiagnosticsService.js";
import {
  loadProjectSnapshot,
  type ProjectSnapshotResponse,
} from "../services/projectSnapshotService.js";

export interface DevDiagnosticsResponse {
  database: SqliteDatabaseDiagnostics;
  project: {
    id: string;
    name: string;
    revision: number;
    stratusLocalMetadataVersion: number;
    stratusProjectId: string | null;
    stratusModelId: string | null;
    stratusPackageWhere: string | null;
    stratusLastPullAt: string | null;
    stratusLastPushAt: string | null;
  };
  highlights: {
    rateLimitRetryCount: number;
    seedUpgradeCount: number;
  };
  logs: DevDiagnosticsLogEntry[];
}

export interface ResetLegacyModeResponse {
  projectId: string;
  revision: number;
  stratusLocalMetadataVersion: 0;
  snapshot: ProjectSnapshotResponse;
}

const diagnosticsQuerySchema = z.object({
  projectId: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

async function loadProjectDiagnostics(projectId: string) {
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      revision: true,
      stratusLocalMetadataVersion: true,
      stratusProjectId: true,
      stratusModelId: true,
      stratusPackageWhere: true,
      stratusLastPullAt: true,
      stratusLastPushAt: true,
    },
  });
}

async function resetLegacyModeForProject(
  projectId: string,
): Promise<ResetLegacyModeResponse> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      revision: true,
      stratusLocalMetadataVersion: true,
    },
  });

  if (project.stratusLocalMetadataVersion > 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        stratusLocalMetadataVersion: 0,
        revision: { increment: 1 },
      },
    });
  }

  const snapshot = await loadProjectSnapshot(projectId);
  return {
    projectId,
    revision: snapshot.revision,
    stratusLocalMetadataVersion: 0,
    snapshot,
  };
}

export default async function devRoutes(app: FastifyInstance) {
  app.get("/diagnostics", async (req) => {
      const query = diagnosticsQuerySchema.parse(req.query);
    const [database, project] = await Promise.all([
      getSqliteDatabaseDiagnostics(resolveSqliteDatabasePath()),
      loadProjectDiagnostics(query.projectId),
    ]);

    const logs = listDevDiagnosticsEntries({
      projectId: query.projectId,
      limit: query.limit,
    });

    return {
      database,
      project: {
        ...project,
        stratusLastPullAt: project.stratusLastPullAt?.toISOString() ?? null,
        stratusLastPushAt: project.stratusLastPushAt?.toISOString() ?? null,
      },
      highlights: {
        rateLimitRetryCount: logs.filter(
          (entry) => entry.type === "rateLimitRetry",
        ).length,
        seedUpgradeCount: logs.filter((entry) => entry.type === "seedUpgrade")
          .length,
      },
      logs,
    } satisfies DevDiagnosticsResponse;
  });

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/reset-legacy-mode",
    async (req) => resetLegacyModeForProject(req.params.projectId),
  );
}

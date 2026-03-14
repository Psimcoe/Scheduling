import { FastifyInstance } from "fastify";
import { z } from "zod";
import { logImportEvent } from "../services/aiLearningService.js";
import { recalculateProject } from "../services/schedulingService.js";
import { markProjectKnowledgeDirty } from "../services/scheduleKnowledgeService.js";
import {
  getSafeStratusConfig,
  getStratusConfig,
  setStratusConfig,
} from "../services/stratusConfig.js";
import { testStratusConnection } from "../services/stratusApi.js";
import { testStratusBigDataConnection } from "../services/stratusBigDataService.js";
import {
  createStratusJob,
  getStratusJob,
  type StratusJobProgressReporter,
} from "../services/stratusJobService.js";
import { recordDevDiagnosticsEntry } from "../services/devDiagnosticsService.js";
import { saveStratusSettingsForProject } from "../services/stratusStatusMappingService.js";
import { notifyCurrentProjectRevision } from "../services/scheduleJobService.js";
import {
  applyStratusProjectImport,
  applyStratusPull,
  applyStratusPush,
  applyStratusRefreshFromPrefab,
  applyStratusSyncToPrefab,
  buildProjectStratusStatus,
  previewStratusProjectImport,
  previewStratusPull,
  previewStratusPush,
  previewStratusRefreshFromPrefab,
  previewStratusSyncToPrefab,
} from "../services/stratusSyncService.js";
import { captureUndo } from "../services/undoService.js";

const configSchema = z.object({
  baseUrl: z.string().url().optional(),
  appKey: z.string().optional(),
  companyId: z.string().optional(),
  importReadSource: z.enum(["sqlPreferred", "apiOnly"]).optional(),
  bigDataServer: z.string().optional(),
  bigDataDatabase: z.string().optional(),
  bigDataUsername: z.string().optional(),
  bigDataPassword: z.string().optional(),
  bigDataEncrypt: z.boolean().optional(),
  bigDataTrustServerCertificate: z.boolean().optional(),
  bigDataTaskNameColumn: z.string().optional(),
  bigDataDurationDaysColumn: z.string().optional(),
  bigDataDurationHoursColumn: z.string().optional(),
  bigDataStartDateColumn: z.string().optional(),
  bigDataFinishDateColumn: z.string().optional(),
  bigDataDeadlineColumn: z.string().optional(),
  taskNameField: z.string().optional(),
  durationDaysField: z.string().optional(),
  durationHoursField: z.string().optional(),
  startDateField: z.string().optional(),
  finishDateField: z.string().optional(),
  deadlineField: z.string().optional(),
  startDateFieldIdOverride: z.string().optional(),
  finishDateFieldIdOverride: z.string().optional(),
  deadlineFieldIdOverride: z.string().optional(),
  statusProgressMappings: z
    .array(
      z.object({
        statusId: z.string(),
        statusName: z.string(),
        percentCompleteShop: z.number().int().min(0).max(100).nullable(),
      }),
    )
    .optional(),
  excludedProjectIds: z.array(z.string()).optional(),
});

const importJobSchema = z.object({
  mode: z.enum(["preview", "apply"]).default("apply"),
});

const pullJobSchema = z.object({
  mode: z.enum(["preview", "apply"]).default("apply"),
  refreshMode: z.enum(["incremental", "full"]).optional(),
});

const projectTargetSchema = z.object({
  stratusProjectId: z.string().nullable(),
  stratusModelId: z.string().nullable(),
  stratusPackageWhere: z.string().nullable(),
});

const statusMappingSaveSchema = z.object({
  config: configSchema,
  project: projectTargetSchema,
});

function buildPullSingleFlightKey(
  projectId: string,
  refreshMode: "incremental" | "full",
) {
  return refreshMode === "full"
    ? `stratus-pull:${projectId}:apply:${refreshMode}`
    : undefined;
}

async function finalizePullApplyLogging(
  projectId: string,
  result: Awaited<ReturnType<typeof applyStratusPull>>,
) {
  if (
    result.summary.created > 0 ||
    result.summary.updated > 0 ||
    result.summary.createdAssemblies > 0 ||
    result.summary.updatedAssemblies > 0
  ) {
    await logImportEvent(projectId, "stratus-pull", {
      created: result.summary.created,
      updated: result.summary.updated,
      skipped: result.summary.skipped,
      failed: result.summary.failed,
      createdAssemblies: result.summary.createdAssemblies,
      updatedAssemblies: result.summary.updatedAssemblies,
      skippedAssemblies: result.summary.skippedAssemblies,
      failedAssemblies: result.summary.failedAssemblies,
    });
    markProjectKnowledgeDirty(projectId);
  }
}

interface SeedUpgradePullDependencies {
  captureUndo: typeof captureUndo;
  applyStratusPull: typeof applyStratusPull;
  finalizePullApplyLogging: typeof finalizePullApplyLogging;
  notifyCurrentProjectRevision: typeof notifyCurrentProjectRevision;
  getStratusConfig: typeof getStratusConfig;
}

const defaultSeedUpgradePullDependencies: SeedUpgradePullDependencies = {
  captureUndo,
  applyStratusPull,
  finalizePullApplyLogging,
  notifyCurrentProjectRevision,
  getStratusConfig,
};

export async function runSeedUpgradePull(
  projectId: string,
  jobId: string,
  reportProgress: StratusJobProgressReporter,
  dependencies: SeedUpgradePullDependencies = defaultSeedUpgradePullDependencies,
): Promise<Awaited<ReturnType<typeof applyStratusPull>>> {
  recordDevDiagnosticsEntry({
    level: "info",
    type: "seedUpgrade",
    projectId,
    message: "Legacy seed upgrade started.",
    details: {
      projectId,
      jobId,
    },
  });

  try {
    await dependencies.captureUndo(projectId, "Stratus seed upgrade");
    const pullResult = await dependencies.applyStratusPull(
      projectId,
      dependencies.getStratusConfig(),
      {
        forceApiRead: true,
        refreshMode: "full",
        seedUpgrade: true,
        progress: (update) =>
          reportProgress({
            ...update,
            message: update.message
              ? `Legacy seed upgrade. ${update.message}`
              : "Legacy seed upgrade running.",
          }),
      },
    );
    await dependencies.finalizePullApplyLogging(projectId, pullResult);
    await dependencies.notifyCurrentProjectRevision(projectId);
    recordDevDiagnosticsEntry({
      level: "info",
      type: "seedUpgrade",
      projectId,
      message: "Legacy seed upgrade completed.",
      details: {
        projectId,
        jobId,
        summary: pullResult.summary,
      },
    });
    return pullResult;
  } catch (error) {
    recordDevDiagnosticsEntry({
      level: "error",
      type: "seedUpgrade",
      projectId,
      message: "Legacy seed upgrade failed.",
      details: {
        projectId,
        jobId,
        error: error instanceof Error ? error.message : "Legacy seed upgrade failed.",
      },
    });
    throw error;
  }
}

export default async function stratusRoutes(app: FastifyInstance) {
  app.get("/stratus/config", async () => {
    return getSafeStratusConfig();
  });

  app.put("/stratus/config", async (req) => {
    const body = configSchema.parse(req.body);
    await setStratusConfig(body);
    return getSafeStratusConfig();
  });

  app.post("/stratus/test", async () => {
    return testStratusConnection(getStratusConfig());
  });

  app.post("/stratus/big-data/test", async () => {
    return testStratusBigDataConnection(getStratusConfig());
  });

  app.post("/stratus/projects/preview", async () => {
    return previewStratusProjectImport(getStratusConfig());
  });

  app.post("/stratus/projects/apply", async () => {
    return applyStratusProjectImport(getStratusConfig());
  });

  app.post("/stratus/projects/import/jobs", async (req) => {
    const body = importJobSchema.parse(req.body ?? {});
    const kind =
      body.mode === "apply" ? "projectImportApply" : "projectImportPreview";

    return createStratusJob(kind, async (reportProgress) => {
      const config = getStratusConfig();
      if (body.mode === "apply") {
        return applyStratusProjectImport(config, {
          forceApiRead: true,
          progress: reportProgress,
        });
      }
      return previewStratusProjectImport(config, {
        forceApiRead: true,
        progress: reportProgress,
      });
    }, {
      projectId: null,
    });
  });

  app.get<{ Params: { jobId: string } }>("/stratus/jobs/:jobId", async (req) => {
    const job = getStratusJob(req.params.jobId);
    if (!job) {
      const error = new Error("Stratus job not found.");
      (error as Error & { statusCode?: number }).statusCode = 404;
      throw error;
    }
    return job;
  });

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/status",
    async (req) => {
      return buildProjectStratusStatus(
        req.params.projectId,
        getStratusConfig(),
      );
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/pull/preview",
    async (req) => {
      return previewStratusPull(req.params.projectId, getStratusConfig());
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/pull/jobs",
    async (req) => {
      const body = pullJobSchema.parse(req.body ?? {});
      const { projectId } = req.params;
      const kind = body.mode === "apply" ? "pullApply" : "pullPreview";
      const refreshMode = body.refreshMode ?? "incremental";

      return createStratusJob(kind, async (reportProgress) => {
        const config = getStratusConfig();

        if (body.mode === "apply") {
          await captureUndo(projectId, "Stratus pull");
          const result = await applyStratusPull(projectId, config, {
            forceApiRead: true,
            refreshMode,
            progress: reportProgress,
          });
          await finalizePullApplyLogging(projectId, result);
          await notifyCurrentProjectRevision(projectId);
          return result;
        }

        return previewStratusPull(projectId, config, {
          forceApiRead: true,
          refreshMode,
          progress: reportProgress,
        });
      }, {
        projectId,
        singleFlightKey:
          body.mode === "apply"
            ? buildPullSingleFlightKey(projectId, refreshMode)
            : undefined,
      });
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/pull/apply",
    async (req) => {
      const { projectId } = req.params;
      await captureUndo(projectId, "Stratus pull");
      const result = await applyStratusPull(projectId, getStratusConfig());
      await finalizePullApplyLogging(projectId, result);
      await notifyCurrentProjectRevision(projectId);
      return result;
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/status-mappings/save",
    {
      config: {
        rateLimit: {
          groupId: "stratus-status-mappings-save",
          max: 6,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.auth?.user.id ?? request.ip,
        },
      },
    },
    async (req) => {
      const { projectId } = req.params;
      const body = statusMappingSaveSchema.parse(req.body ?? {});
      const result = await saveStratusSettingsForProject({
        projectId,
        configPatch: body.config,
        projectPatch: body.project,
      });

      if (result.snapshot) {
        await notifyCurrentProjectRevision(projectId);
      }

      if (result.mode !== "seedRequired") {
        return result;
      }

      let seedUpgradeJobId = "";
      const job = createStratusJob(
        "pullApply",
        async (reportProgress) =>
          runSeedUpgradePull(projectId, seedUpgradeJobId, reportProgress),
        {
          projectId,
          singleFlightKey: buildPullSingleFlightKey(projectId, "full"),
        },
      );
      seedUpgradeJobId = job.id;
      recordDevDiagnosticsEntry({
        level: "info",
        type: "seedUpgrade",
        projectId,
        message: "Legacy seed upgrade requested.",
        details: {
          projectId,
          jobId: job.id,
        },
      });

      return {
        ...result,
        jobId: job.id,
      };
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/refresh-from-prefab/preview",
    async (req) => {
      return previewStratusRefreshFromPrefab(req.params.projectId);
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/refresh-from-prefab/apply",
    async (req) => {
      const preview = await previewStratusRefreshFromPrefab(
        req.params.projectId,
      );
      if (preview.summary.refreshCount > 0) {
        await captureUndo(
          preview.sourceProjectId,
          `Refresh Stratus references from ${preview.prefabProjectName}`,
        );
      }

      const result = await applyStratusRefreshFromPrefab(req.params.projectId);
      if (result.summary.refreshed > 0) {
        await logImportEvent(
          result.sourceProjectId,
          "stratus-refresh-from-prefab",
          {
            prefabProjectId: result.prefabProjectId,
            prefabProjectName: result.prefabProjectName,
            refreshed: result.summary.refreshed,
            skipped: result.summary.skipped,
            failed: result.summary.failed,
          },
        );
        markProjectKnowledgeDirty(result.sourceProjectId);
      }
      await notifyCurrentProjectRevision(result.sourceProjectId);
      return result;
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/sync-to-prefab/preview",
    async (req) => {
      return previewStratusSyncToPrefab(req.params.projectId);
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/sync-to-prefab/apply",
    async (req) => {
      const preview = await previewStratusSyncToPrefab(req.params.projectId);
      if (preview.summary.syncCount > 0) {
        await captureUndo(
          preview.prefabProjectId,
          `Sync Stratus dates from ${preview.sourceProjectName}`,
        );
      }

      const result = await applyStratusSyncToPrefab(req.params.projectId);
      if (result.summary.synced > 0) {
        await logImportEvent(result.prefabProjectId, "stratus-sync-to-prefab", {
          sourceProjectId: result.sourceProjectId,
          sourceProjectName: result.sourceProjectName,
          synced: result.summary.synced,
          skipped: result.summary.skipped,
          failed: result.summary.failed,
        });
        markProjectKnowledgeDirty(result.prefabProjectId);
      }
      await notifyCurrentProjectRevision(result.prefabProjectId);
      return result;
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/push/preview",
    async (req) => {
      return previewStratusPush(req.params.projectId, getStratusConfig());
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/push/apply",
    async (req) => {
      const { projectId } = req.params;
      const result = await applyStratusPush(projectId, getStratusConfig());
      if (result.summary.pushed > 0) {
        await logImportEvent(projectId, "stratus-push", {
          pushed: result.summary.pushed,
          skipped: result.summary.skipped,
          failed: result.summary.failed,
        });
        await notifyCurrentProjectRevision(projectId);
      }
      return result;
    },
  );
}

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
} from "../services/stratusJobService.js";
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

export default async function stratusRoutes(app: FastifyInstance) {
  app.get("/stratus/config", async () => {
    return getSafeStratusConfig();
  });

  app.put("/stratus/config", async (req) => {
    const body = configSchema.parse(req.body);
    setStratusConfig(body);
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

      return createStratusJob(kind, async (reportProgress) => {
        const config = getStratusConfig();
        const refreshMode = body.refreshMode ?? "incremental";

        if (body.mode === "apply") {
          await captureUndo(projectId, "Stratus pull");
          const result = await applyStratusPull(projectId, config, {
            forceApiRead: true,
            refreshMode,
            progress: reportProgress,
          });
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
          return result;
        }

        return previewStratusPull(projectId, config, {
          forceApiRead: true,
          refreshMode,
          progress: reportProgress,
        });
      });
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/stratus/pull/apply",
    async (req) => {
      const { projectId } = req.params;
      await captureUndo(projectId, "Stratus pull");
      const result = await applyStratusPull(projectId, getStratusConfig());
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
      return result;
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
      }
      return result;
    },
  );
}

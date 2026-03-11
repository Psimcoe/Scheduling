import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logImportEvent } from '../services/aiLearningService.js';
import { recalculateProject } from '../services/schedulingService.js';
import { markProjectKnowledgeDirty } from '../services/scheduleKnowledgeService.js';
import {
  getSafeStratusConfig,
  getStratusConfig,
  setStratusConfig,
} from '../services/stratusConfig.js';
import { testStratusConnection } from '../services/stratusApi.js';
import {
  applyStratusProjectImport,
  applyStratusPull,
  applyStratusPush,
  buildProjectStratusStatus,
  previewStratusProjectImport,
  previewStratusPull,
  previewStratusPush,
} from '../services/stratusSyncService.js';
import { captureUndo } from '../services/undoService.js';

const configSchema = z.object({
  baseUrl: z.string().url().optional(),
  appKey: z.string().optional(),
  companyId: z.string().optional(),
  startDateFieldIdOverride: z.string().optional(),
  finishDateFieldIdOverride: z.string().optional(),
});

export default async function stratusRoutes(app: FastifyInstance) {
  app.get('/stratus/config', async () => {
    return getSafeStratusConfig();
  });

  app.put('/stratus/config', async (req) => {
    const body = configSchema.parse(req.body);
    setStratusConfig(body);
    return getSafeStratusConfig();
  });

  app.post('/stratus/test', async () => {
    return testStratusConnection(getStratusConfig());
  });

  app.post('/stratus/projects/preview', async () => {
    return previewStratusProjectImport(getStratusConfig());
  });

  app.post('/stratus/projects/apply', async () => {
    return applyStratusProjectImport(getStratusConfig());
  });

  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/stratus/status',
    async (req) => {
      return buildProjectStratusStatus(req.params.projectId, getStratusConfig());
    },
  );

  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/stratus/pull/preview',
    async (req) => {
      return previewStratusPull(req.params.projectId, getStratusConfig());
    },
  );

  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/stratus/pull/apply',
    async (req) => {
      const { projectId } = req.params;
      await captureUndo(projectId, 'Stratus pull');
      const result = await applyStratusPull(projectId, getStratusConfig());
      if (
        result.summary.created > 0
        || result.summary.updated > 0
        || result.summary.createdAssemblies > 0
        || result.summary.updatedAssemblies > 0
      ) {
        await logImportEvent(projectId, 'stratus-pull', {
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
    '/projects/:projectId/stratus/push/preview',
    async (req) => {
      return previewStratusPush(req.params.projectId, getStratusConfig());
    },
  );

  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/stratus/push/apply',
    async (req) => {
      const { projectId } = req.params;
      const result = await applyStratusPush(projectId, getStratusConfig());
      if (result.summary.pushed > 0) {
        await logImportEvent(projectId, 'stratus-push', {
          pushed: result.summary.pushed,
          skipped: result.summary.skipped,
          failed: result.summary.failed,
        });
      }
      return result;
    },
  );
}

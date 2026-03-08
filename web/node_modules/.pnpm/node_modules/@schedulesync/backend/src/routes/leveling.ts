/**
 * /api/projects/:projectId/leveling routes
 */

import { FastifyInstance } from 'fastify';
import { levelResources, clearLeveling } from '../services/levelingService.js';

export default async function levelingRoutes(app: FastifyInstance) {
  // Level resources for a project
  app.post<{ Params: { projectId: string } }>('/level', async (req) => {
    const { projectId } = req.params;
    return levelResources(projectId);
  });

  // Clear all leveling delays
  app.post<{ Params: { projectId: string } }>('/clear', async (req) => {
    const { projectId } = req.params;
    await clearLeveling(projectId);
    return { ok: true };
  });
}

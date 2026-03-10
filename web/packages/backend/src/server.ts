/**
 * Fastify server entry point.
 */

import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import advancedRoutes from './routes/advanced.js';
import aiRoutes from './routes/ai.js';
import assignmentRoutes from './routes/assignments.js';
import baselineRoutes from './routes/baselines.js';
import calendarRoutes from './routes/calendars.js';
import customFieldRoutes from './routes/customFields.js';
import dependencyRoutes from './routes/dependencies.js';
import importExportRoutes from './routes/importExport.js';
import levelingRoutes from './routes/leveling.js';
import projectRoutes from './routes/projects.js';
import resourceRoutes from './routes/resources.js';
import taskRoutes from './routes/tasks.js';
import { runtimeConfig } from './runtimeConfig.js';
import { getAiConfig } from './services/aiService.js';
import { initializeLearningSubsystem } from './services/aiLearningService.js';
import { ensureModel, shutdown as shutdownModel } from './services/localModelManager.js';
import { initializeScheduleKnowledge } from './services/scheduleKnowledgeService.js';

const server = Fastify({
  logger: true,
});

// Global error handler must be set before route registration.
server.setErrorHandler((error, _request, reply) => {
  const err = error as Error & { statusCode?: number; code?: string; issues?: unknown[] };

  if (err.name === 'ZodError' || err.constructor?.name === 'ZodError' || Array.isArray(err.issues)) {
    return reply.status(400).send({ error: 'Validation error', details: err.message });
  }

  server.log.error(err);

  if (err.name === 'NotFoundError' || err.code === 'P2025') {
    return reply.status(404).send({ error: 'Resource not found' });
  }

  reply.status(err.statusCode ?? 500).send({
    error: err.message ?? 'Internal Server Error',
  });
});

await server.register(cors, {
  origin: true,
});

await server.register(multipart);

await server.register(projectRoutes, { prefix: '/api/projects' });
await server.register(taskRoutes, { prefix: '/api/projects/:projectId/tasks' });
await server.register(dependencyRoutes, { prefix: '/api/projects/:projectId/dependencies' });
await server.register(calendarRoutes, { prefix: '/api/projects/:projectId/calendars' });
await server.register(resourceRoutes, { prefix: '/api/projects/:projectId/resources' });
await server.register(assignmentRoutes, { prefix: '/api/projects/:projectId/assignments' });
await server.register(baselineRoutes, { prefix: '/api/projects/:projectId/baselines' });
await server.register(importExportRoutes, { prefix: '/api/projects/:projectId/import-export' });
await server.register(customFieldRoutes, { prefix: '/api/projects/:projectId/custom-fields' });
await server.register(aiRoutes, { prefix: '/api/ai' });
await server.register(levelingRoutes, { prefix: '/api/projects/:projectId/leveling' });
await server.register(advancedRoutes, { prefix: '/api/projects/:projectId/advanced' });

server.get('/api/health', async () => ({ status: 'ok' }));

if (runtimeConfig.staticDir) {
  await server.register(fastifyStatic, {
    root: runtimeConfig.staticDir,
    prefix: '/',
    index: ['index.html'],
  });

  server.setNotFoundHandler(async (request, reply) => {
    const requestPath = request.url.split('?')[0];
    const isApiRequest = requestPath === '/api' || requestPath.startsWith('/api/');
    const isDocumentRequest = request.method === 'GET' || request.method === 'HEAD';
    const hasFileExtension = /\.[A-Za-z0-9]+$/.test(requestPath);

    if (!isApiRequest && isDocumentRequest && !hasFileExtension) {
      return reply.sendFile('index.html');
    }

    return reply.status(404).send({ error: 'Not found' });
  });
}

const start = async () => {
  try {
    await server.listen({ port: runtimeConfig.port, host: runtimeConfig.host });
    server.log.info(`Server running on http://${runtimeConfig.host}:${runtimeConfig.port}`);

    initializeScheduleKnowledge().catch((err) => {
      server.log.error('Schedule knowledge initialization failed: ' + (err instanceof Error ? err.message : String(err)));
    });
    initializeLearningSubsystem().catch((err) => {
      server.log.error('AI learning initialization failed: ' + (err instanceof Error ? err.message : String(err)));
    });

    const cfg = getAiConfig();
    if (cfg.provider === 'local') {
      ensureModel(cfg.localModelId).catch((err) => {
        server.log.error('Local model download failed: ' + (err instanceof Error ? err.message : String(err)));
      });
    }

    let isShuttingDown = false;
    const gracefulShutdown = async () => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;
      server.log.info('Shutting down...');
      await shutdownModel();
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

    if (runtimeConfig.shutdownOnStdinClose) {
      process.stdin.resume();
      process.stdin.on('end', gracefulShutdown);
      process.stdin.on('close', gracefulShutdown);
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

export { server };

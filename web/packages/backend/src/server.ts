/**
 * Fastify server entry point.
 */

import { buildServer } from './buildServer.js';
import { runtimeConfig } from './runtimeConfig.js';
import { getAiConfig } from './services/aiService.js';
import { initializeLearningSubsystem } from './services/aiLearningService.js';
import { synchronizeDatabaseSchemaForDesktop } from './services/databaseSchemaSync.js';
import { ensureModel, shutdown as shutdownModel } from './services/localModelManager.js';
import { initializeScheduleKnowledge } from './services/scheduleKnowledgeService.js';

const server = await buildServer();

async function runStartupTasks() {
  await synchronizeDatabaseSchemaForDesktop(server.log);

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
}

const start = async () => {
  try {
    await runStartupTasks();
    await server.listen({ port: runtimeConfig.port, host: runtimeConfig.host });
    server.log.info(`Server running on http://${runtimeConfig.host}:${runtimeConfig.port}`);

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


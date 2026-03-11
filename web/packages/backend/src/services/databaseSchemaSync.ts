import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { runtimeConfig } from '../runtimeConfig.js';

const DIST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(DIST_DIR, '..', '..');
const PRISMA_CLI_PATH = resolve(PACKAGE_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
const PRISMA_SCHEMA_PATH = resolve(PACKAGE_ROOT, 'prisma', 'schema.prisma');
const SCHEDULE_CHUNK_FTS_TABLE = 'AiScheduleChunkFts';

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch {
    return false;
  }
}

function runPrismaDbPush(): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [PRISMA_CLI_PATH, 'db', 'push', '--skip-generate', '--schema', PRISMA_SCHEMA_PATH],
      {
        cwd: runtimeConfig.dataDir,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const output = `${stdout}\n${stderr}`.trim();
      reject(new Error(output || `Prisma db push exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function dropDerivedScheduleKnowledgeTables(): void {
  const database = new DatabaseSync(runtimeConfig.databasePath);

  try {
    database.exec(`DROP TABLE IF EXISTS "${SCHEDULE_CHUNK_FTS_TABLE}"`);
  } finally {
    database.close();
  }
}

export async function synchronizeDatabaseSchemaForDesktop(logger: { info: (message: string) => void }): Promise<void> {
  if (!runtimeConfig.isDesktopRuntime) {
    return;
  }

  const hasPrismaCli = await pathExists(PRISMA_CLI_PATH);
  const hasSchema = await pathExists(PRISMA_SCHEMA_PATH);

  if (!hasPrismaCli || !hasSchema) {
    logger.info('Skipping desktop database schema sync because the Prisma runtime is not bundled.');
    return;
  }

  logger.info('Synchronizing the desktop database schema...');
  if (await pathExists(runtimeConfig.databasePath)) {
    dropDerivedScheduleKnowledgeTables();
  }
  await runPrismaDbPush();
}

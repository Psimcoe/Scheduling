import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(DIST_DIR, '..');
const DEFAULT_STATIC_DIR = resolve(PACKAGE_ROOT, '..', 'frontend', 'dist');

function getTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function resolveOptionalDirectory(pathValue: string | null): string | null {
  if (!pathValue) {
    return null;
  }

  return resolve(pathValue);
}

function toPrismaSqliteUrl(filePath: string): string {
  return `file:${filePath.replace(/\\/g, '/')}`;
}

const configuredDataDir = resolveOptionalDirectory(getTrimmedEnv('SCHEDULESYNC_DATA_DIR'));
const dataDir = configuredDataDir ?? process.cwd();
const configuredStaticDir = resolveOptionalDirectory(getTrimmedEnv('SCHEDULESYNC_STATIC_DIR'));
const staticDirCandidate = configuredStaticDir ?? DEFAULT_STATIC_DIR;
const staticDir = existsSync(staticDirCandidate) ? staticDirCandidate : null;

if (configuredDataDir) {
  mkdirSync(dataDir, { recursive: true });
}

const databasePath = join(dataDir, 'schedulesync.db');
const packagedDatabaseTemplatePath = resolve(PACKAGE_ROOT, 'prisma', 'dev.db');
if (configuredDataDir && !process.env.DATABASE_URL) {
  if (!existsSync(databasePath) && existsSync(packagedDatabaseTemplatePath)) {
    copyFileSync(packagedDatabaseTemplatePath, databasePath);
  }

  process.env.DATABASE_URL = toPrismaSqliteUrl(databasePath);
}

export const runtimeConfig = {
  host: getTrimmedEnv('HOST') ?? '0.0.0.0',
  port: parseInt(process.env.PORT ?? '3001', 10),
  dataDir,
  staticDir,
  databasePath,
  aiConfigPath: join(dataDir, 'ai-config.json'),
  modelsDir: join(dataDir, 'data', 'models'),
  shutdownOnStdinClose: process.env.SCHEDULESYNC_SHUTDOWN_ON_STDIN_CLOSE === '1',
  isDesktopRuntime: configuredDataDir !== null,
};

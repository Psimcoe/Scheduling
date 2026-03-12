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

function parseCsvEnv(name: string): string[] {
  const value = getTrimmedEnv(name);
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
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

const packagedDatabaseTemplatePath = resolve(PACKAGE_ROOT, 'prisma', 'dev-template.db');
const databasePath = configuredDataDir
  ? join(dataDir, 'schedulesync.db')
  : resolve(PACKAGE_ROOT, 'prisma', 'dev.db');

if (!process.env.DATABASE_URL) {
  if (!existsSync(databasePath) && existsSync(packagedDatabaseTemplatePath)) {
    copyFileSync(packagedDatabaseTemplatePath, databasePath);
  }

  if (!configuredDataDir) {
    process.env.DATABASE_URL = toPrismaSqliteUrl(databasePath);
  }
}

if (configuredDataDir && !getTrimmedEnv('DATABASE_URL')) {
  if (!existsSync(databasePath) && existsSync(packagedDatabaseTemplatePath)) {
    copyFileSync(packagedDatabaseTemplatePath, databasePath);
  }

  process.env.DATABASE_URL = toPrismaSqliteUrl(databasePath);
}

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = parseCsvEnv('SCHEDULESYNC_ALLOWED_ORIGINS');
const defaultAllowedOrigins =
  allowedOrigins.length > 0
    ? allowedOrigins
    : isProduction
      ? []
      : ['http://localhost:5173'];
const oidcScopes = getTrimmedEnv('OIDC_SCOPES') ?? 'openid profile email';
const defaultRedirectUri = !isProduction ? 'http://localhost:5173/auth/callback' : null;
const oidcAdminEmails = parseCsvEnv('OIDC_ADMIN_EMAILS').map((entry) => entry.toLowerCase());

export const runtimeConfig = {
  host: getTrimmedEnv('HOST') ?? '0.0.0.0',
  port: parseInt(process.env.PORT ?? '3001', 10),
  dataDir,
  staticDir,
  databasePath,
  aiConfigPath: join(dataDir, 'ai-config.json'),
  stratusConfigPath: join(dataDir, 'stratus-config.json'),
  modelsDir: join(dataDir, 'data', 'models'),
  shutdownOnStdinClose: process.env.SCHEDULESYNC_SHUTDOWN_ON_STDIN_CLOSE === '1',
  isDesktopRuntime: configuredDataDir !== null,
  isProduction,
  allowedOrigins: defaultAllowedOrigins,
  auth: {
    cookieName: 'schedulesync_session',
    oidcStateCookieName: 'schedulesync_oidc',
    sessionCookieSecret:
      getTrimmedEnv('SESSION_COOKIE_SECRET') ??
      (!isProduction ? 'dev-session-cookie-secret-change-me' : ''),
    oidc: {
      issuerUrl: getTrimmedEnv('OIDC_ISSUER_URL'),
      clientId: getTrimmedEnv('OIDC_CLIENT_ID'),
      clientSecret: getTrimmedEnv('OIDC_CLIENT_SECRET'),
      redirectUri: getTrimmedEnv('OIDC_REDIRECT_URI') ?? defaultRedirectUri,
      scopes: oidcScopes,
      adminEmails: oidcAdminEmails,
    },
  },
};

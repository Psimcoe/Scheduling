import './runtimeConfig.js';
import { DatabaseSync } from 'node:sqlite';
import prismaPackage from '@prisma/client';
import { runtimeConfig } from './runtimeConfig.js';

const { PrismaClient } = prismaPackage;

export const prisma = new PrismaClient();

export function resolveSqliteDatabasePath(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl?.startsWith('file:')) {
    return runtimeConfig.databasePath;
  }

  let resolvedPath = decodeURIComponent(databaseUrl.slice('file:'.length));
  if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(resolvedPath)) {
    resolvedPath = resolvedPath.slice(1);
  }
  return resolvedPath;
}

async function configureSqlitePragmas(): Promise<void> {
  const database = new DatabaseSync(resolveSqliteDatabasePath());

  try {
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA synchronous = NORMAL;');
    database.exec('PRAGMA busy_timeout = 5000;');
  } finally {
    database.close();
  }

  await prisma.$connect();
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
}

await configureSqlitePragmas();

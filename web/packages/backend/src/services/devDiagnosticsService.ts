import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";

export type DevDiagnosticsLogLevel = "info" | "warn" | "error";
export type DevDiagnosticsLogType =
  | "job"
  | "progress"
  | "rateLimitRetry"
  | "seedUpgrade";

export interface DevDiagnosticsLogEntry {
  id: string;
  createdAt: string;
  level: DevDiagnosticsLogLevel;
  type: DevDiagnosticsLogType;
  projectId: string | null;
  message: string;
  details: Record<string, unknown> | null;
}

export interface SqliteDatabaseDiagnostics {
  path: string;
  mainBytes: number;
  walBytes: number;
  shmBytes: number;
  totalBytes: number;
  updatedAt: string | null;
}

interface RecordedFileStat {
  bytes: number;
  updatedAt: Date | null;
}

const DEV_DIAGNOSTICS_MAX_ENTRIES = 200;
const entries: DevDiagnosticsLogEntry[] = [];

function normalizeDetails(
  details: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!details) {
    return null;
  }

  return Object.keys(details).length > 0 ? details : null;
}

async function readFileStat(path: string): Promise<RecordedFileStat> {
  try {
    const fileStat = await stat(path);
    return {
      bytes: fileStat.size,
      updatedAt: fileStat.mtime,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        bytes: 0,
        updatedAt: null,
      };
    }

    throw error;
  }
}

export function recordDevDiagnosticsEntry(input: {
  level: DevDiagnosticsLogLevel;
  type: DevDiagnosticsLogType;
  projectId?: string | null;
  message: string;
  details?: Record<string, unknown> | null;
}): DevDiagnosticsLogEntry {
  const entry: DevDiagnosticsLogEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    level: input.level,
    type: input.type,
    projectId: input.projectId ?? null,
    message: input.message,
    details: normalizeDetails(input.details),
  };

  entries.unshift(entry);
  if (entries.length > DEV_DIAGNOSTICS_MAX_ENTRIES) {
    entries.length = DEV_DIAGNOSTICS_MAX_ENTRIES;
  }

  return entry;
}

export function listDevDiagnosticsEntries(options: {
  projectId?: string | null;
  limit?: number;
} = {}): DevDiagnosticsLogEntry[] {
  const limit = Math.max(1, Math.min(DEV_DIAGNOSTICS_MAX_ENTRIES, options.limit ?? 50));
  const projectId = options.projectId ?? null;
  const filtered = projectId
    ? entries.filter(
        (entry) => entry.projectId === projectId || entry.projectId === null,
      )
    : entries;

  return filtered.slice(0, limit);
}

export async function getSqliteDatabaseDiagnostics(
  databasePath: string,
): Promise<SqliteDatabaseDiagnostics> {
  const [main, wal, shm] = await Promise.all([
    readFileStat(databasePath),
    readFileStat(`${databasePath}-wal`),
    readFileStat(`${databasePath}-shm`),
  ]);

  const updatedAt = [main.updatedAt, wal.updatedAt, shm.updatedAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return {
    path: databasePath,
    mainBytes: main.bytes,
    walBytes: wal.bytes,
    shmBytes: shm.bytes,
    totalBytes: main.bytes + wal.bytes + shm.bytes,
    updatedAt: updatedAt?.toISOString() ?? null,
  };
}

export function clearDevDiagnosticsEntriesForTests(): void {
  entries.length = 0;
}

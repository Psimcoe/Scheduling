import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BuildServer = typeof import('../buildServer.js').buildServer;
type PrismaModule = typeof import('../db.js');

const templateDatabasePath = fileURLToPath(
  new URL('../../prisma/dev-template.db', import.meta.url),
);

function toFileDatabaseUrl(pathValue: string): string {
  return `file:${pathValue.replace(/\\/g, '/')}`;
}

function extractCookie(response: { headers: Record<string, unknown> }, name: string): string {
  const rawHeader = response.headers['set-cookie'];
  const cookies = Array.isArray(rawHeader) ? rawHeader : rawHeader ? [rawHeader] : [];
  const match = cookies
    .map((entry) => String(entry))
    .find((entry) => entry.startsWith(`${name}=`));

  if (!match) {
    throw new Error(`Cookie ${name} was not set.`);
  }

  return match.split(';', 1)[0];
}

async function createHarness() {
  vi.resetModules();

  const tempDir = mkdtempSync(join(tmpdir(), 'schedulesync-tasks-'));
  const tempDatabasePath = join(tempDir, 'test.db');
  copyFileSync(templateDatabasePath, tempDatabasePath);

  process.env.DATABASE_URL = toFileDatabaseUrl(tempDatabasePath);
  process.env.SESSION_COOKIE_SECRET = 'test-cookie-secret';
  process.env.SCHEDULESYNC_DEV_AUTH_BYPASS = '1';
  process.env.SCHEDULESYNC_DEV_AUTH_ROLE = 'admin';

  const [{ buildServer }, { prisma }] = (await Promise.all([
    import('../buildServer.js'),
    import('../db.js'),
  ])) as [{ buildServer: BuildServer }, PrismaModule];

  const app = await buildServer({ logger: false });
  await app.ready();

  const cleanup = async () => {
    await app.close();
    await prisma.$disconnect();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'EPERM' || attempt === 4) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  };

  return { app, prisma, cleanup };
}

async function createAuthHeaders(app: Awaited<ReturnType<typeof createHarness>>['app']) {
  const sessionResponse = await app.inject({
    method: 'GET',
    url: '/auth/session',
  });
  expect(sessionResponse.statusCode).toBe(200);

  const sessionCookie = extractCookie(sessionResponse, 'schedulesync_session');
  const csrfResponse = await app.inject({
    method: 'GET',
    url: '/auth/csrf',
    headers: {
      cookie: sessionCookie,
    },
  });
  expect(csrfResponse.statusCode).toBe(200);

  const { csrfToken } = csrfResponse.json<{ csrfToken: string }>();

  return {
    cookie: sessionCookie,
    'x-csrf-token': csrfToken,
    'content-type': 'application/json',
  };
}

describe('task routes integration', () => {
  let cleanup: (() => Promise<void>) | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }

    delete process.env.DATABASE_URL;
    delete process.env.SESSION_COOKIE_SECRET;
    delete process.env.SCHEDULESYNC_DEV_AUTH_BYPASS;
    delete process.env.SCHEDULESYNC_DEV_AUTH_ROLE;
  });

  it('returns a compact response for single-task PATCH updates', async () => {
    const harness = await createHarness();
    cleanup = harness.cleanup;

    const project = await harness.prisma.project.create({
      data: {
        id: 'project-task-test',
        name: 'Patch Test Project',
        startDate: new Date('2026-03-01T08:00:00.000Z'),
        defaultCalendarId: 'calendar-task-test',
      },
    });
    const calendar = await harness.prisma.calendar.create({
      data: {
        id: 'calendar-task-test',
        projectId: project.id,
        name: 'Standard',
      },
    });

    const task = await harness.prisma.task.create({
      data: {
        projectId: project.id,
        name: 'Original task',
        start: new Date('2026-03-01T08:00:00.000Z'),
        finish: new Date('2026-03-02T08:00:00.000Z'),
        durationMinutes: 480,
        calendarId: calendar.id,
        sortOrder: 0,
      },
    });

    const headers = await createAuthHeaders(harness.app);
    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/tasks/${task.id}`,
      headers,
      payload: {
        name: 'Updated task',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ revision: number; task: { id: string; name: string }; snapshot?: unknown }>();
    expect(body.revision).toBeGreaterThanOrEqual(1);
    expect(body.task).toMatchObject({
      id: task.id,
      name: 'Updated task',
    });
    expect(body).not.toHaveProperty('snapshot');

    const storedTask = await harness.prisma.task.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(storedTask.name).toBe('Updated task');
  }, 15_000);

  it('rejects task name updates for Stratus-managed tasks', async () => {
    const harness = await createHarness();
    cleanup = harness.cleanup;

    const project = await harness.prisma.project.create({
      data: {
        id: 'project-task-lock-test',
        name: 'Lock Test Project',
        startDate: new Date('2026-03-01T08:00:00.000Z'),
        defaultCalendarId: 'calendar-task-lock-test',
      },
    });
    const calendar = await harness.prisma.calendar.create({
      data: {
        id: 'calendar-task-lock-test',
        projectId: project.id,
        name: 'Standard',
      },
    });

    const task = await harness.prisma.task.create({
      data: {
        id: 'task-lock-test',
        projectId: project.id,
        name: 'Imported task',
        start: new Date('2026-03-01T08:00:00.000Z'),
        finish: new Date('2026-03-02T08:00:00.000Z'),
        durationMinutes: 480,
        calendarId: calendar.id,
        sortOrder: 0,
      },
    });

    await harness.prisma.stratusTaskSync.create({
      data: {
        taskId: task.id,
        localProjectId: project.id,
        packageId: 'package-1',
        packageNumber: 'PKG-1',
        packageName: 'Package 1',
        rawPackageJson: '{}',
        lastPulledAt: new Date('2026-03-01T08:00:00.000Z'),
      },
    });

    const headers = await createAuthHeaders(harness.app);
    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/tasks/${task.id}`,
      headers,
      payload: {
        name: 'Should fail',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'STRATUS_NAME_LOCKED',
    });

    const storedTask = await harness.prisma.task.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(storedTask.name).toBe('Imported task');
  }, 15_000);

  it('normalizes hierarchy mutations and returns a snapshot for single-task PATCH updates', async () => {
    const harness = await createHarness();
    cleanup = harness.cleanup;

    const project = await harness.prisma.project.create({
      data: {
        id: 'project-task-hierarchy-test',
        name: 'Hierarchy Patch Project',
        startDate: new Date('2026-03-01T08:00:00.000Z'),
        defaultCalendarId: 'calendar-task-hierarchy-test',
      },
    });
    const calendar = await harness.prisma.calendar.create({
      data: {
        id: 'calendar-task-hierarchy-test',
        projectId: project.id,
        name: 'Standard',
      },
    });

    const task = await harness.prisma.task.create({
      data: {
        id: 'task-hierarchy-test',
        projectId: project.id,
        name: 'Broken task',
        start: new Date('2026-03-01T08:00:00.000Z'),
        finish: new Date('2026-03-02T08:00:00.000Z'),
        durationMinutes: 480,
        outlineLevel: 2,
        calendarId: calendar.id,
        sortOrder: 0,
      },
    });

    const headers = await createAuthHeaders(harness.app);
    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}/tasks/${task.id}`,
      headers,
      payload: {
        parentId: task.id,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      revision: number;
      task: { id: string; parentId: string | null; outlineLevel: number };
      snapshot?: { tasks: Array<{ id: string; parentId: string | null; outlineLevel: number }> };
    }>();
    expect(body.revision).toBeGreaterThanOrEqual(1);
    expect(body.task).toMatchObject({
      id: task.id,
      parentId: null,
      outlineLevel: 0,
    });
    expect(body.snapshot?.tasks.find((candidate) => candidate.id === task.id)).toMatchObject({
      id: task.id,
      parentId: null,
      outlineLevel: 0,
    });

    const storedTask = await harness.prisma.task.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(storedTask.parentId).toBeNull();
    expect(storedTask.outlineLevel).toBe(0);
  }, 15_000);
});

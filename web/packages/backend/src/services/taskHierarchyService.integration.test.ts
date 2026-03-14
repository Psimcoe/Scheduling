import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

type PrismaModule = typeof import('../db.js');
type ProjectSnapshotServiceModule = typeof import('./projectSnapshotService.js');

const templateDatabasePath = fileURLToPath(
  new URL('../../prisma/dev-template.db', import.meta.url),
);

function toFileDatabaseUrl(pathValue: string): string {
  return `file:${pathValue.replace(/\\/g, '/')}`;
}

async function createHarness() {
  vi.resetModules();

  const tempDir = mkdtempSync(join(tmpdir(), 'schedulesync-hierarchy-'));
  const tempDatabasePath = join(tempDir, 'test.db');
  copyFileSync(templateDatabasePath, tempDatabasePath);

  process.env.DATABASE_URL = toFileDatabaseUrl(tempDatabasePath);

  const [{ prisma }, { loadProjectSnapshot }] = (await Promise.all([
    import('../db.js'),
    import('./projectSnapshotService.js'),
  ])) as [PrismaModule, ProjectSnapshotServiceModule];

  const cleanup = async () => {
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  };

  return { prisma, loadProjectSnapshot, cleanup };
}

describe('taskHierarchyService integration', () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }

    delete process.env.DATABASE_URL;
  });

  it('repairs orphaned Stratus assemblies by creating an undefined package placeholder on snapshot load', async () => {
    const harness = await createHarness();
    cleanup = harness.cleanup;

    const project = await harness.prisma.project.create({
      data: {
        id: 'project-hierarchy-snapshot',
        name: 'Hierarchy Snapshot Project',
        startDate: new Date('2026-03-01T08:00:00.000Z'),
        defaultCalendarId: 'calendar-hierarchy-snapshot',
      },
    });

    await harness.prisma.calendar.create({
      data: {
        id: 'calendar-hierarchy-snapshot',
        projectId: project.id,
        name: 'Standard',
      },
    });

    const assemblyTask = await harness.prisma.task.create({
      data: {
        id: 'assembly-temp-stand-1',
        projectId: project.id,
        name: 'TEMP STAND 1',
        parentId: 'assembly-temp-stand-1',
        outlineLevel: 3,
        type: 'task',
        start: new Date('2026-03-02T08:00:00.000Z'),
        finish: new Date('2026-03-03T08:00:00.000Z'),
        durationMinutes: 480,
        sortOrder: 1,
        calendarId: 'calendar-hierarchy-snapshot',
        externalKey: 'FAB-0950::assembly:asm-1',
      },
    });

    await harness.prisma.stratusAssemblySync.create({
      data: {
        taskId: assemblyTask.id,
        localProjectId: project.id,
        packageId: 'pkg-0950',
        assemblyId: 'asm-1',
        externalKey: 'FAB-0950::assembly:asm-1',
        lastPulledAt: new Date('2026-03-02T08:00:00.000Z'),
      },
    });

    const snapshot = await harness.loadProjectSnapshot(project.id, 'full');
    const placeholder = snapshot.tasks.find((task) =>
      task.externalKey === 'stratus-undefined-package:pkg-0950',
    );
    const repairedAssembly = snapshot.tasks.find((task) => task.id === assemblyTask.id);

    expect(snapshot.revision).toBeGreaterThan(0);
    expect(placeholder).toMatchObject({
      type: 'summary',
      outlineLevel: 0,
      parentId: null,
      name: 'Undefined Package - FAB-0950',
    });
    expect(repairedAssembly).toMatchObject({
      id: assemblyTask.id,
      parentId: placeholder?.id,
      outlineLevel: 1,
      type: 'task',
    });

    const storedTasks = await harness.prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(storedTasks).toHaveLength(2);
    expect(storedTasks[0]).toMatchObject({
      id: placeholder?.id,
      type: 'summary',
    });
    expect(storedTasks[0]?.notes).toContain('Auto-created because no true Stratus package row exists yet');
    expect(storedTasks[1]).toMatchObject({
      id: assemblyTask.id,
      parentId: placeholder?.id,
      outlineLevel: 1,
    });
  }, 15_000);
});

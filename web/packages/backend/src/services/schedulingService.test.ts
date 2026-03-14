import type { ProjectData, ScheduleResult } from '@schedulesync/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const schedulingMocks = vi.hoisted(() => {
  const state = {
    revision: 1,
    tasks: new Map<string, Record<string, unknown>>(),
    failureTaskId: null as string | null,
    maxConcurrentWrites: 0,
    concurrentWrites: 0,
    taskUpdateCalls: [] as Array<{ where: { id: string }; data: Record<string, unknown> }>,
    projectUpdateCalls: [] as Array<{ data: { revision: { increment: number } } }>,
    transactionOptions: null as { maxWait: number; timeout: number } | null,
  };

  const transactionMock = vi.fn(
    async (
      callback: (tx: {
        task: {
          update: (args: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => Promise<Record<string, unknown>>;
        };
        project: {
          update: (args: {
            data: { revision: { increment: number } };
          }) => Promise<{ revision: number }>;
        };
      }) => Promise<{ revision: number }>,
      options?: { maxWait: number; timeout: number },
    ) => {
      state.transactionOptions = options ?? null;
      const draftTasks = new Map(
        [...state.tasks.entries()].map(([taskId, task]) => [taskId, { ...task }]),
      );
      let draftRevision = state.revision;

      const tx = {
        task: {
          update: async (args: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            state.concurrentWrites += 1;
            state.maxConcurrentWrites = Math.max(
              state.maxConcurrentWrites,
              state.concurrentWrites,
            );

            try {
              await Promise.resolve();

              if (state.failureTaskId === args.where.id) {
                throw new Error('Simulated task update failure');
              }

              const existingTask = draftTasks.get(args.where.id);
              if (!existingTask) {
                throw new Error(`Task ${args.where.id} not found`);
              }

              const nextTask = { ...existingTask, ...args.data };
              draftTasks.set(args.where.id, nextTask);
              state.taskUpdateCalls.push(args);
              return nextTask;
            } finally {
              state.concurrentWrites -= 1;
            }
          },
        },
        project: {
          update: async (args: {
            data: { revision: { increment: number } };
          }) => {
            state.projectUpdateCalls.push(args);
            draftRevision += args.data.revision.increment;
            return { revision: draftRevision };
          },
        },
      };

      const result = await callback(tx);
      state.tasks = draftTasks;
      state.revision = draftRevision;
      return result;
    },
  );

  return { state, transactionMock };
});

vi.mock('../db.js', () => ({
  prisma: {
    $transaction: schedulingMocks.transactionMock,
  },
}));

vi.mock('./costService.js', () => ({
  loadProjectData: vi.fn(),
}));

import { persistScheduleResult } from './schedulingService.js';

function makeTask(
  id: string,
  overrides: Partial<ProjectData['tasks'][number]> = {},
): ProjectData['tasks'][number] {
  return {
    id,
    wbsCode: id,
    outlineLevel: 0,
    parentId: null,
    name: id,
    type: 'task',
    durationMinutes: 480,
    start: '2026-03-01T08:00:00.000Z',
    finish: '2026-03-01T16:00:00.000Z',
    constraintType: 0,
    constraintDate: null,
    calendarId: null,
    percentComplete: 0,
    isManuallyScheduled: false,
    isCritical: false,
    totalSlackMinutes: 0,
    freeSlackMinutes: 0,
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    deadline: null,
    notes: '',
    externalKey: null,
    sortOrder: 0,
    actualStart: null,
    actualFinish: null,
    actualDurationMinutes: 0,
    actualWork: 0,
    actualCost: 0,
    remainingDuration: 480,
    remainingWork: 0,
    remainingCost: 0,
    fixedCost: 0,
    fixedCostAccrual: 'prorated',
    cost: 0,
    work: 0,
    taskMode: 'autoScheduled',
    isEffortDriven: false,
    isActive: true,
    cpi: null,
    eac: null,
    vac: null,
    physicalPercentComplete: 0,
    isSplit: false,
    ...overrides,
  } as ProjectData['tasks'][number];
}

function makeProjectData(tasks: ProjectData['tasks'][number][]): ProjectData {
  return {
    settings: {
      id: 'project-1',
      name: 'Project 1',
      startDate: '2026-03-01T08:00:00.000Z',
      finishDate: null,
      defaultCalendarId: '__default__',
      scheduleFrom: 'start',
      statusDate: null,
      currencySymbol: '$',
      minutesPerDay: 480,
      minutesPerWeek: 2400,
      daysPerMonth: 20,
      defaultTaskType: 'fixedUnits',
      defaultFixedCostAccrual: 'prorated',
      honorConstraints: true,
      newTasksEffortDriven: false,
      autolink: true,
      criticalSlackLimit: 0,
    },
    tasks,
    dependencies: [],
    calendars: [],
    resources: [],
    assignments: [],
    baselines: [],
  } as ProjectData;
}

function makeScheduleResult(tasks: ProjectData['tasks'][number][]): ScheduleResult {
  return {
    tasks: tasks as unknown as ScheduleResult['tasks'],
    warnings: [],
    calculationTimeMs: 5,
  };
}

describe('schedulingService.persistScheduleResult', () => {
  beforeEach(() => {
    schedulingMocks.transactionMock.mockClear();
    schedulingMocks.state.revision = 1;
    schedulingMocks.state.tasks = new Map();
    schedulingMocks.state.failureTaskId = null;
    schedulingMocks.state.maxConcurrentWrites = 0;
    schedulingMocks.state.concurrentWrites = 0;
    schedulingMocks.state.taskUpdateCalls = [];
    schedulingMocks.state.projectUpdateCalls = [];
    schedulingMocks.state.transactionOptions = null;
  });

  it('persists only changed schedule rows and increments revision once', async () => {
    const originalTasks = [
      makeTask('task-1'),
      makeTask('task-2'),
    ];
    schedulingMocks.state.tasks = new Map(
      originalTasks.map((task) => [task.id, { ...task }]),
    );

    const projectData = makeProjectData(originalTasks);
    const result = makeScheduleResult([
      makeTask('task-1', {
        start: '2026-03-02T08:00:00.000Z',
        finish: '2026-03-02T16:00:00.000Z',
      }),
      makeTask('task-2'),
    ]);

    const revision = await persistScheduleResult('project-1', projectData, result);

    expect(revision).toBe(2);
    expect(schedulingMocks.state.taskUpdateCalls).toHaveLength(1);
    expect(schedulingMocks.state.taskUpdateCalls[0]?.where.id).toBe('task-1');
    expect(schedulingMocks.state.projectUpdateCalls).toHaveLength(1);
    expect(schedulingMocks.state.transactionOptions).toMatchObject({
      maxWait: 10_000,
      timeout: 60_000,
    });
  });

  it('serializes large task update sets without concurrent writes', async () => {
    const originalTasks = Array.from({ length: 250 }, (_, index) =>
      makeTask(`task-${index + 1}`),
    );
    schedulingMocks.state.tasks = new Map(
      originalTasks.map((task) => [task.id, { ...task }]),
    );

    const projectData = makeProjectData(originalTasks);
    const result = makeScheduleResult(
      originalTasks.map((task) =>
        makeTask(task.id, {
          start: '2026-04-01T08:00:00.000Z',
          finish: '2026-04-01T16:00:00.000Z',
        }),
      ),
    );

    await persistScheduleResult('project-1', projectData, result);

    expect(schedulingMocks.state.taskUpdateCalls).toHaveLength(250);
    expect(schedulingMocks.state.maxConcurrentWrites).toBe(1);
  });

  it('rolls back task persistence when one schedule write fails', async () => {
    const originalTasks = [
      makeTask('task-1'),
      makeTask('task-2'),
    ];
    schedulingMocks.state.tasks = new Map(
      originalTasks.map((task) => [task.id, { ...task }]),
    );
    schedulingMocks.state.failureTaskId = 'task-2';

    const projectData = makeProjectData(originalTasks);
    const result = makeScheduleResult([
      makeTask('task-1', {
        start: '2026-03-02T08:00:00.000Z',
      }),
      makeTask('task-2', {
        finish: '2026-03-03T16:00:00.000Z',
      }),
    ]);

    await expect(
      persistScheduleResult('project-1', projectData, result),
    ).rejects.toThrow('Simulated task update failure');

    expect(schedulingMocks.state.revision).toBe(1);
    expect(
      schedulingMocks.state.tasks.get('task-1')?.start,
    ).toBe('2026-03-01T08:00:00.000Z');
    expect(schedulingMocks.state.projectUpdateCalls).toHaveLength(0);
  });
});

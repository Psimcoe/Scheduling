/**
 * /api/projects/:projectId/tasks routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { logTaskMutation } from '../services/aiLearningService.js';
import { recalculateProject } from '../services/schedulingService.js';
import { markProjectKnowledgeDirty } from '../services/scheduleKnowledgeService.js';
import {
  toStratusStatusSummary,
  toStratusSyncSummary,
} from '../services/stratusSyncService.js';
import { captureUndo } from '../services/undoService.js';
import { loadProjectSnapshot } from '../services/projectSnapshotService.js';

const createSchema = z.object({
  name: z.string().min(1),
  durationMinutes: z.number().min(0).default(480),
  start: z.string().datetime().optional(),
  finish: z.string().datetime().optional(),
  parentId: z.string().nullable().optional(),
  type: z.string().default('task'), // "task" | "summary" | "milestone"
  constraintType: z.number().int().default(0),
  constraintDate: z.string().datetime().nullable().optional(),
  isManuallyScheduled: z.boolean().default(false),
  percentComplete: z.number().min(0).max(100).default(0),
  calendarId: z.string().nullable().optional(),
  notes: z.string().optional(),
  externalKey: z.string().optional(),
  sortOrder: z.number().int().optional(),
  outlineLevel: z.number().int().min(0).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  durationMinutes: z.number().min(0).optional(),
  start: z.string().datetime().optional(),
  finish: z.string().datetime().optional(),
  parentId: z.string().nullable().optional(),
  type: z.string().optional(),
  constraintType: z.number().int().optional(),
  constraintDate: z.string().datetime().nullable().optional(),
  isManuallyScheduled: z.boolean().optional(),
  percentComplete: z.number().min(0).max(100).optional(),
  calendarId: z.string().nullable().optional(),
  notes: z.string().optional(),
  externalKey: z.string().optional(),
  sortOrder: z.number().int().optional(),
  outlineLevel: z.number().int().min(0).optional(),
  deadline: z.string().datetime().nullable().optional(),
  actualStart: z.string().datetime().nullable().optional(),
  actualFinish: z.string().datetime().nullable().optional(),
  actualWork: z.number().min(0).optional(),
  actualCost: z.number().min(0).optional(),
  remainingWork: z.number().min(0).optional(),
  remainingCost: z.number().min(0).optional(),
  fixedCost: z.number().min(0).optional(),
});

const batchUpdateSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string(),
      data: updateSchema,
    }),
  ),
  recalculate: z.boolean().default(true),
});

const batchDeleteSchema = z.object({
  taskIds: z.array(z.string()).min(1),
});

async function finalizeTaskMutation(projectId: string) {
  await recalculateProject(projectId);
  return loadProjectSnapshot(projectId);
}

export default async function taskRoutes(app: FastifyInstance) {
  // List tasks for a project (flat, sorted)
  app.get<{ Params: { projectId: string } }>(
    '/',
    async (req) => {
      const { projectId } = req.params;
      const tasks = await prisma.task.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        include: { stratusSync: true, stratusAssemblySync: true },
      });
      return tasks.map(serializeTask);
    },
  );

  // Get single task
  app.get<{ Params: { projectId: string; taskId: string } }>(
    '/:taskId',
    async (req, reply) => {
      const { taskId } = req.params;
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { stratusSync: true, stratusAssemblySync: true },
      });
      if (!task) return reply.code(404).send({ error: 'Task not found' });
      return serializeTask(task);
    },
  );

  // Create task
  app.post<{ Params: { projectId: string } }>(
    '/',
    async (req, reply) => {
      const { projectId } = req.params;
      const body = createSchema.parse(req.body);

      await captureUndo(projectId, `Create task "${body.name}"`);

      // Determine project start date as fallback
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
      });

      const start = body.start ? new Date(body.start) : project.startDate;
      const finish = body.finish
        ? new Date(body.finish)
        : new Date(start.getTime() + body.durationMinutes * 60_000);

      // Auto sort-order: max + 1
      const maxTask = await prisma.task.findFirst({
        where: { projectId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const sortOrder = body.sortOrder ?? (maxTask?.sortOrder ?? -1) + 1;

      const task = await prisma.task.create({
        data: {
          projectId,
          name: body.name,
          wbsCode: '',
          outlineLevel: body.outlineLevel ?? 0,
          type: body.type,
          durationMinutes: body.durationMinutes,
          start,
          finish,
          constraintType: body.constraintType,
          constraintDate: body.constraintDate ? new Date(body.constraintDate) : null,
          isManuallyScheduled: body.isManuallyScheduled,
          percentComplete: body.percentComplete,
          calendarId: body.calendarId ?? null,
          parentId: body.parentId ?? null,
          sortOrder,
          notes: body.notes ?? '',
          externalKey: body.externalKey,
        },
      });

      await logTaskMutation(projectId, 'task_created', null, toTaskMutationSnapshot(task), 'user');
      markProjectKnowledgeDirty(projectId);
      const snapshot = await finalizeTaskMutation(projectId);
      const createdTask = snapshot.tasks.find((candidate) => candidate.id === task.id) ?? serializeTask(task);
      return reply.code(201).send({
        task: createdTask,
        revision: snapshot.revision,
        snapshot,
      });
    },
  );

  // Update single task
  app.patch<{ Params: { projectId: string; taskId: string } }>(
    '/:taskId',
    async (req) => {
      const { projectId, taskId } = req.params;
      const body = updateSchema.parse(req.body);
      const before = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

      await captureUndo(projectId, `Update task`);

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.durationMinutes !== undefined) data.durationMinutes = body.durationMinutes;
      if (body.start !== undefined) data.start = new Date(body.start);
      if (body.finish !== undefined) data.finish = new Date(body.finish);
      if (body.parentId !== undefined) data.parentId = body.parentId;
      if (body.type !== undefined) data.type = body.type;
      if (body.constraintType !== undefined) data.constraintType = body.constraintType;
      if (body.constraintDate !== undefined)
        data.constraintDate = body.constraintDate ? new Date(body.constraintDate) : null;
      if (body.isManuallyScheduled !== undefined)
        data.isManuallyScheduled = body.isManuallyScheduled;
      if (body.percentComplete !== undefined) data.percentComplete = body.percentComplete;
      if (body.calendarId !== undefined) data.calendarId = body.calendarId;
      if (body.notes !== undefined) data.notes = body.notes;
      if (body.externalKey !== undefined) data.externalKey = body.externalKey;
      if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
      if (body.outlineLevel !== undefined) data.outlineLevel = body.outlineLevel;
      if (body.deadline !== undefined)
        data.deadline = body.deadline ? new Date(body.deadline) : null;
      if (body.actualStart !== undefined)
        data.actualStart = body.actualStart ? new Date(body.actualStart) : null;
      if (body.actualFinish !== undefined)
        data.actualFinish = body.actualFinish ? new Date(body.actualFinish) : null;
      if (body.actualWork !== undefined) data.actualWork = body.actualWork;
      if (body.actualCost !== undefined) data.actualCost = body.actualCost;
      if (body.remainingWork !== undefined) data.remainingWork = body.remainingWork;
      if (body.remainingCost !== undefined) data.remainingCost = body.remainingCost;
      if (body.fixedCost !== undefined) data.fixedCost = body.fixedCost;

      const task = await prisma.task.update({ where: { id: taskId }, data });

      await logTaskMutation(
        projectId,
        'task_updated',
        toTaskMutationSnapshot(before),
        toTaskMutationSnapshot(task),
        'user',
      );
      markProjectKnowledgeDirty(projectId);
      const snapshot = await finalizeTaskMutation(projectId);
      const updatedTask = snapshot.tasks.find((candidate) => candidate.id === task.id) ?? serializeTask(task);
      return {
        task: updatedTask,
        revision: snapshot.revision,
        snapshot,
      };
    },
  );

  // Batch update (for drag, indent/outdent, reorder)
  app.post<{ Params: { projectId: string } }>(
    '/batch',
    async (req) => {
      const { projectId } = req.params;
      const body = batchUpdateSchema.parse(req.body);
      const beforeTasks = await prisma.task.findMany({
        where: { id: { in: body.updates.map((update) => update.id) } },
      });
      const beforeTaskMap = new Map(beforeTasks.map((task) => [task.id, task]));

      await captureUndo(projectId, `Batch update ${body.updates.length} tasks`);

      const results = await prisma.$transaction(
        body.updates.map((u) => {
          const data: Record<string, unknown> = {};
          const d = u.data;
          if (d.name !== undefined) data.name = d.name;
          if (d.durationMinutes !== undefined) data.durationMinutes = d.durationMinutes;
          if (d.start !== undefined) data.start = new Date(d.start);
          if (d.finish !== undefined) data.finish = new Date(d.finish);
          if (d.parentId !== undefined) data.parentId = d.parentId;
          if (d.type !== undefined) data.type = d.type;
          if (d.constraintType !== undefined) data.constraintType = d.constraintType;
          if (d.constraintDate !== undefined)
            data.constraintDate = d.constraintDate ? new Date(d.constraintDate) : null;
          if (d.isManuallyScheduled !== undefined)
            data.isManuallyScheduled = d.isManuallyScheduled;
          if (d.percentComplete !== undefined) data.percentComplete = d.percentComplete;
          if (d.sortOrder !== undefined) data.sortOrder = d.sortOrder;
          if (d.outlineLevel !== undefined) data.outlineLevel = d.outlineLevel;

          return prisma.task.update({ where: { id: u.id }, data });
        }),
      );

      if (body.recalculate) {
        await recalculateProject(projectId);
      }

      for (const task of results) {
        const before = beforeTaskMap.get(task.id) ?? null;
        await logTaskMutation(
          projectId,
          'task_updated',
          before ? toTaskMutationSnapshot(before) : null,
          toTaskMutationSnapshot(task),
          'user',
        );
      }
      markProjectKnowledgeDirty(projectId);

      const snapshot = await loadProjectSnapshot(projectId);

      return {
        updated: results.length,
        revision: snapshot.revision,
        snapshot,
      };
    },
  );

  app.post<{ Params: { projectId: string } }>(
    '/delete-batch',
    async (req) => {
      const { projectId } = req.params;
      const body = batchDeleteSchema.parse(req.body);
      const taskIds = [...new Set(body.taskIds)];
      const beforeTasks = await prisma.task.findMany({
        where: { projectId, id: { in: taskIds } },
      });

      if (beforeTasks.length === 0) {
        const snapshot = await loadProjectSnapshot(projectId);
        return {
          deletedTaskIds: [],
          revision: snapshot.revision,
          snapshot,
        };
      }

      await captureUndo(projectId, `Delete ${beforeTasks.length} task${beforeTasks.length === 1 ? '' : 's'}`);

      await prisma.$transaction([
        prisma.dependency.deleteMany({
          where: {
            projectId,
            OR: [
              { fromTaskId: { in: taskIds } },
              { toTaskId: { in: taskIds } },
            ],
          },
        }),
        prisma.assignment.deleteMany({ where: { taskId: { in: taskIds } } }),
        prisma.baseline.deleteMany({ where: { taskId: { in: taskIds } } }),
        prisma.task.deleteMany({ where: { projectId, id: { in: taskIds } } }),
      ]);

      for (const before of beforeTasks) {
        await logTaskMutation(projectId, 'task_deleted', toTaskMutationSnapshot(before), null, 'user');
      }
      markProjectKnowledgeDirty(projectId);

      const snapshot = await finalizeTaskMutation(projectId);
      return {
        deletedTaskIds: beforeTasks.map((task) => task.id),
        revision: snapshot.revision,
        snapshot,
      };
    },
  );

  // Delete task
  app.delete<{ Params: { projectId: string; taskId: string } }>(
    '/:taskId',
    async (req) => {
      const { projectId, taskId } = req.params;
      const before = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

      await captureUndo(projectId, `Delete task`);

      // Remove dependencies, assignments, baselines, and the task atomically
      await prisma.$transaction([
        prisma.dependency.deleteMany({
          where: {
            OR: [{ fromTaskId: taskId }, { toTaskId: taskId }],
          },
        }),
        prisma.assignment.deleteMany({ where: { taskId } }),
        prisma.baseline.deleteMany({ where: { taskId } }),
        prisma.task.delete({ where: { id: taskId } }),
      ]);

      await logTaskMutation(projectId, 'task_deleted', toTaskMutationSnapshot(before), null, 'user');
      markProjectKnowledgeDirty(projectId);
      const snapshot = await finalizeTaskMutation(projectId);
      return {
        deletedTaskIds: [taskId],
        revision: snapshot.revision,
        snapshot,
      };
    },
  );

  // Recalculate on demand
  app.post<{ Params: { projectId: string } }>(
    '/recalculate',
    async (req) => {
      const { projectId } = req.params;
      const snapshot = await finalizeTaskMutation(projectId);
      return {
        ok: true,
        revision: snapshot.revision,
        snapshot,
      };
    },
  );
}

function toTaskMutationSnapshot(task: {
  id: string;
  name: string;
  type: string;
  durationMinutes: number;
  percentComplete?: number | null;
  actualDurationMinutes?: number | null;
  actualFinish?: Date | null;
}) {
  return {
    id: task.id,
    name: task.name,
    type: task.type,
    durationMinutes: task.durationMinutes,
    percentComplete: task.percentComplete ?? null,
    actualDurationMinutes: task.actualDurationMinutes ?? null,
    actualFinish: task.actualFinish ?? null,
  };
}

function serializeTask(
  task: Record<string, unknown> & {
    stratusSync?: Parameters<typeof toStratusSyncSummary>[0] | null;
    stratusAssemblySync?: Parameters<typeof toStratusStatusSummary>[1];
  },
) {
  return {
    ...task,
    stratusSync: toStratusSyncSummary(task.stratusSync ?? null),
    stratusStatus: toStratusStatusSummary(
      task.stratusSync ?? null,
      task.stratusAssemblySync,
    ),
  };
}

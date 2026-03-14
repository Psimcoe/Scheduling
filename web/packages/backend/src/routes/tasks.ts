/**
 * /api/projects/:projectId/tasks routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { logTaskMutation } from '../services/aiLearningService.js';
import { markProjectKnowledgeDirty } from '../services/scheduleKnowledgeService.js';
import {
  enqueueProjectRecalculation,
  notifyProjectRevision,
} from '../services/scheduleJobService.js';
import {
  toStratusStatusSummary,
  toStratusSyncSummary,
} from '../services/stratusSyncService.js';
import { isTaskNameManagedByStratus } from '../services/taskEditabilityService.js';
import { normalizeTaskHierarchyInTransaction } from '../services/taskHierarchyService.js';
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
  notes: z.string().nullable().optional(),
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
  notes: z.string().nullable().optional(),
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
  return loadProjectSnapshot(projectId, 'shell');
}

const METADATA_ONLY_TASK_FIELDS = new Set(['name', 'notes', 'externalKey']);
const HIERARCHY_TASK_FIELDS = new Set(['parentId', 'outlineLevel', 'sortOrder', 'type']);
const TASK_MUTATION_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} as const;

function isMetadataOnlyTaskPatch(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  return keys.length > 0 && keys.every((key) => METADATA_ONLY_TASK_FIELDS.has(key));
}

function isHierarchyTaskPatch(data: Record<string, unknown>): boolean {
  return Object.keys(data).some((key) => HIERARCHY_TASK_FIELDS.has(key));
}

function buildRecalculationResponse(projectId: string, requiresRecalculation: boolean) {
  if (!requiresRecalculation) {
    return {
      status: 'notNeeded' as const,
    };
  }

  return enqueueProjectRecalculation(projectId);
}

function sendStratusNameLocked(
  reply: { code: (statusCode: number) => { send: (body: Record<string, unknown>) => unknown } },
) {
  return reply.code(409).send({
    code: 'STRATUS_NAME_LOCKED',
    error: 'Task name is managed by Stratus and cannot be edited here.',
  });
}

async function loadSerializedTask(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { stratusSync: true, stratusAssemblySync: true },
  });

  return serializeTask(task);
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

      const { task, revision } = await prisma.$transaction(
        async (tx) => {
          const createdTask = await tx.task.create({
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
            include: { stratusSync: true, stratusAssemblySync: true },
          });
          await normalizeTaskHierarchyInTransaction(tx, projectId);
          const updatedProject = await tx.project.update({
            where: { id: projectId },
            data: { revision: { increment: 1 } },
            select: { revision: true },
          });

          return {
            task: createdTask,
            revision: updatedProject.revision,
          };
        },
        TASK_MUTATION_TRANSACTION_OPTIONS,
      );

      const snapshot = await finalizeTaskMutation(projectId);
      const createdTask = snapshot.tasks.find((candidate) => candidate.id === task.id) ?? serializeTask(task);
      const createdTaskForLog = snapshot.tasks.find((candidate) => candidate.id === task.id) ?? task;
      await logTaskMutation(projectId, 'task_created', null, toTaskMutationSnapshot(createdTaskForLog), 'user');
      markProjectKnowledgeDirty(projectId);
      notifyProjectRevision(projectId, revision);
      const recalculation = buildRecalculationResponse(projectId, true);
      return reply.code(201).send({
        task: createdTask,
        revision: snapshot.revision,
        snapshot,
        recalculation,
      });
    },
  );

  // Update single task
  app.patch<{ Params: { projectId: string; taskId: string } }>(
    '/:taskId',
    async (req, reply) => {
      const { projectId, taskId } = req.params;
      const body = updateSchema.parse(req.body);
      const before = await prisma.task.findUniqueOrThrow({
        where: { id: taskId },
        include: { stratusSync: true, stratusAssemblySync: true },
      });

      if (body.name !== undefined && isTaskNameManagedByStratus(before)) {
        return sendStratusNameLocked(reply);
      }

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
      if (body.notes !== undefined) data.notes = body.notes ?? '';
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

      if (Object.keys(data).length === 0) {
        const currentRevision = await prisma.project.findUniqueOrThrow({
          where: { id: projectId },
          select: { revision: true },
        });
        const currentTask = await loadSerializedTask(taskId);
        return {
          task: currentTask,
          revision: currentRevision.revision,
          recalculation: {
            status: 'notNeeded' as const,
          },
        };
      }

      const requiresRecalculation = !isMetadataOnlyTaskPatch(data);
      const hierarchyMutation = isHierarchyTaskPatch(data);
      const { task, revision } = await prisma.$transaction(
        async (tx) => {
          const updatedTask = await tx.task.update({
            where: { id: taskId },
            data,
            include: { stratusSync: true, stratusAssemblySync: true },
          });
          if (hierarchyMutation) {
            await normalizeTaskHierarchyInTransaction(tx, projectId);
          }
          const updatedProject = await tx.project.update({
            where: { id: projectId },
            data: { revision: { increment: 1 } },
            select: { revision: true },
          });

          return {
            task: updatedTask,
            revision: updatedProject.revision,
          };
        },
        TASK_MUTATION_TRANSACTION_OPTIONS,
      );

      const snapshot = hierarchyMutation
        ? await finalizeTaskMutation(projectId)
        : null;
      const updatedTask =
        snapshot?.tasks.find((candidate) => candidate.id === task.id) ?? serializeTask(task);
      const updatedTaskForLog =
        snapshot?.tasks.find((candidate) => candidate.id === task.id) ?? task;

      await logTaskMutation(
        projectId,
        'task_updated',
        toTaskMutationSnapshot(before),
        toTaskMutationSnapshot(updatedTaskForLog),
        'user',
      );
      markProjectKnowledgeDirty(projectId);
      notifyProjectRevision(projectId, revision);
      const recalculation = buildRecalculationResponse(projectId, requiresRecalculation);
      if (snapshot) {
        return {
          task: updatedTask,
          revision: snapshot.revision,
          snapshot,
          recalculation,
        };
      }

      return {
        task: updatedTask,
        revision,
        recalculation,
      };
    },
  );

  // Batch update (for drag, indent/outdent, reorder)
  app.post<{ Params: { projectId: string } }>(
    '/batch',
    async (req, reply) => {
      const { projectId } = req.params;
      const body = batchUpdateSchema.parse(req.body);
      const nameUpdateIds = body.updates
        .filter((update) => update.data.name !== undefined)
        .map((update) => update.id);
      if (nameUpdateIds.length > 0) {
        const renameTargets = await prisma.task.findMany({
          where: { projectId, id: { in: nameUpdateIds } },
          include: { stratusSync: true, stratusAssemblySync: true },
        });
        if (renameTargets.some((task) => isTaskNameManagedByStratus(task))) {
          return sendStratusNameLocked(reply);
        }
      }
      const beforeTasks = await prisma.task.findMany({
        where: { id: { in: body.updates.map((update) => update.id) } },
        include: { stratusSync: true, stratusAssemblySync: true },
      });
      const beforeTaskMap = new Map(beforeTasks.map((task) => [task.id, task]));

      await captureUndo(projectId, `Batch update ${body.updates.length} tasks`);

      const requiresRecalculation =
        body.recalculate &&
        body.updates.some((update) => !isMetadataOnlyTaskPatch(update.data));

      const { tasks: results, revision } = await prisma.$transaction(
        async (tx) => {
          const updatedTasks = [];
          for (const u of body.updates) {
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
            if (d.calendarId !== undefined) data.calendarId = d.calendarId;
            if (d.notes !== undefined) data.notes = d.notes ?? '';
            if (d.externalKey !== undefined) data.externalKey = d.externalKey;
            if (d.sortOrder !== undefined) data.sortOrder = d.sortOrder;
            if (d.outlineLevel !== undefined) data.outlineLevel = d.outlineLevel;
            if (d.deadline !== undefined)
              data.deadline = d.deadline ? new Date(d.deadline) : null;
            if (d.actualStart !== undefined)
              data.actualStart = d.actualStart ? new Date(d.actualStart) : null;
            if (d.actualFinish !== undefined)
              data.actualFinish = d.actualFinish ? new Date(d.actualFinish) : null;
            if (d.actualWork !== undefined) data.actualWork = d.actualWork;
            if (d.actualCost !== undefined) data.actualCost = d.actualCost;
            if (d.remainingWork !== undefined) data.remainingWork = d.remainingWork;
            if (d.remainingCost !== undefined) data.remainingCost = d.remainingCost;
            if (d.fixedCost !== undefined) data.fixedCost = d.fixedCost;

            const updatedTask = await tx.task.update({ where: { id: u.id }, data });
            updatedTasks.push(updatedTask);
          }
          await normalizeTaskHierarchyInTransaction(tx, projectId);
          const updatedProject = await tx.project.update({
            where: { id: projectId },
            data: { revision: { increment: 1 } },
            select: { revision: true },
          });
          return {
            tasks: updatedTasks,
            revision: updatedProject.revision,
          };
        },
        TASK_MUTATION_TRANSACTION_OPTIONS,
      );

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
      notifyProjectRevision(projectId, revision);
      const recalculation = buildRecalculationResponse(projectId, requiresRecalculation);

      const snapshot = await loadProjectSnapshot(projectId, 'shell');

      return {
        updated: results.length,
        revision: snapshot.revision,
        snapshot,
        recalculation,
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
        const snapshot = await loadProjectSnapshot(projectId, 'shell');
        return {
          deletedTaskIds: [],
          revision: snapshot.revision,
          snapshot,
          recalculation: {
            status: 'notNeeded' as const,
          },
        };
      }

      await captureUndo(projectId, `Delete ${beforeTasks.length} task${beforeTasks.length === 1 ? '' : 's'}`);

      const { revision } = await prisma.$transaction(
        async (tx) => {
          await tx.dependency.deleteMany({
            where: {
              projectId,
              OR: [
                { fromTaskId: { in: taskIds } },
                { toTaskId: { in: taskIds } },
              ],
            },
          });
          await tx.assignment.deleteMany({ where: { taskId: { in: taskIds } } });
          await tx.baseline.deleteMany({ where: { taskId: { in: taskIds } } });
          await tx.task.deleteMany({ where: { projectId, id: { in: taskIds } } });
          await normalizeTaskHierarchyInTransaction(tx, projectId);
          const updatedProject = await tx.project.update({
            where: { id: projectId },
            data: { revision: { increment: 1 } },
            select: { revision: true },
          });
          return { revision: updatedProject.revision };
        },
        TASK_MUTATION_TRANSACTION_OPTIONS,
      );

      for (const before of beforeTasks) {
        await logTaskMutation(projectId, 'task_deleted', toTaskMutationSnapshot(before), null, 'user');
      }
      markProjectKnowledgeDirty(projectId);
      notifyProjectRevision(projectId, revision);
      const recalculation = buildRecalculationResponse(projectId, true);

      const snapshot = await finalizeTaskMutation(projectId);
      return {
        deletedTaskIds: beforeTasks.map((task) => task.id),
        revision: snapshot.revision,
        snapshot,
        recalculation,
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
      const { revision } = await prisma.$transaction(
        async (tx) => {
          await tx.dependency.deleteMany({
            where: {
              OR: [{ fromTaskId: taskId }, { toTaskId: taskId }],
            },
          });
          await tx.assignment.deleteMany({ where: { taskId } });
          await tx.baseline.deleteMany({ where: { taskId } });
          await tx.task.delete({ where: { id: taskId } });
          await normalizeTaskHierarchyInTransaction(tx, projectId);
          const updatedProject = await tx.project.update({
            where: { id: projectId },
            data: { revision: { increment: 1 } },
            select: { revision: true },
          });
          return { revision: updatedProject.revision };
        },
        TASK_MUTATION_TRANSACTION_OPTIONS,
      );

      await logTaskMutation(projectId, 'task_deleted', toTaskMutationSnapshot(before), null, 'user');
      markProjectKnowledgeDirty(projectId);
      notifyProjectRevision(projectId, revision);
      const recalculation = buildRecalculationResponse(projectId, true);
      const snapshot = await finalizeTaskMutation(projectId);
      return {
        deletedTaskIds: [taskId],
        revision: snapshot.revision,
        snapshot,
        recalculation,
      };
    },
  );

  // Recalculate on demand
  app.post<{ Params: { projectId: string } }>(
    '/recalculate',
    async (req) => {
      const { projectId } = req.params;
      const recalculation = buildRecalculationResponse(projectId, true);
      const snapshot = await loadProjectSnapshot(projectId, 'shell');
      return {
        ok: true,
        revision: snapshot.revision,
        snapshot,
        recalculation,
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
    detailLevel: 'full' as const,
    isNameManagedByStratus: isTaskNameManagedByStratus(task),
    stratusSync: toStratusSyncSummary(task.stratusSync ?? null),
    stratusStatus: toStratusStatusSummary(
      task.stratusSync ?? null,
      task.stratusAssemblySync,
    ),
  };
}

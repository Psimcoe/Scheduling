/**
 * /api/projects/:projectId/dependencies routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { logDependencyMutation } from '../services/aiLearningService.js';
import { recalculateProject } from '../services/schedulingService.js';
import { markProjectKnowledgeDirty } from '../services/scheduleKnowledgeService.js';
import { captureUndo } from '../services/undoService.js';
import { loadProjectSnapshot } from '../services/projectSnapshotService.js';

const createSchema = z.object({
  fromTaskId: z.string(),
  toTaskId: z.string(),
  type: z.string().default('FS'), // "FS" | "SS" | "FF" | "SF"
  lagMinutes: z.number().default(0),
});

const updateSchema = z.object({
  type: z.string().optional(),
  lagMinutes: z.number().optional(),
});

const batchSchema = z.object({
  create: z.array(createSchema).default([]),
  deleteDependencyIds: z.array(z.string()).default([]),
});

async function finalizeDependencyMutation(projectId: string) {
  await recalculateProject(projectId);
  return loadProjectSnapshot(projectId);
}

export default async function dependencyRoutes(app: FastifyInstance) {
  // List dependencies for a project
  app.get<{ Params: { projectId: string } }>('/', async (req) => {
    const { projectId } = req.params;
    return prisma.dependency.findMany({ where: { projectId } });
  });

  // Create dependency
  app.post<{ Params: { projectId: string } }>('/', async (req, reply) => {
    const { projectId } = req.params;
    const body = createSchema.parse(req.body);

    // Validate both tasks belong to this project
    const [from, to] = await Promise.all([
      prisma.task.findFirst({ where: { id: body.fromTaskId, projectId } }),
      prisma.task.findFirst({ where: { id: body.toTaskId, projectId } }),
    ]);
    if (!from || !to) {
      return reply.code(400).send({ error: 'Both tasks must belong to the project' });
    }

    // Prevent self-link
    if (body.fromTaskId === body.toTaskId) {
      return reply.code(400).send({ error: 'Cannot link a task to itself' });
    }

    // Prevent duplicates
    const existing = await prisma.dependency.findFirst({
      where: { projectId, fromTaskId: body.fromTaskId, toTaskId: body.toTaskId },
    });
    if (existing) {
      return reply.code(409).send({ error: 'Dependency already exists' });
    }

    await captureUndo(projectId, 'Add dependency');

    const dep = await prisma.dependency.create({
      data: {
        projectId,
        fromTaskId: body.fromTaskId,
        toTaskId: body.toTaskId,
        type: body.type,
        lagMinutes: body.lagMinutes,
      },
    });

    await logDependencyMutation(
      projectId,
      'dependency_created',
      {
        id: dep.id,
        fromTaskName: from.name,
        toTaskName: to.name,
        type: dep.type,
        lagMinutes: dep.lagMinutes,
      },
      'user',
    );
    markProjectKnowledgeDirty(projectId);
    const snapshot = await finalizeDependencyMutation(projectId);
    return reply.code(201).send({
      dependency: dep,
      revision: snapshot.revision,
      snapshot,
    });
  });

  // Update dependency
  app.patch<{ Params: { projectId: string; depId: string } }>(
    '/:depId',
    async (req) => {
      const { projectId, depId } = req.params;
      const body = updateSchema.parse(req.body);
      const before = await prisma.dependency.findUniqueOrThrow({ where: { id: depId } });
      const [fromTask, toTask] = await Promise.all([
        prisma.task.findUniqueOrThrow({ where: { id: before.fromTaskId } }),
        prisma.task.findUniqueOrThrow({ where: { id: before.toTaskId } }),
      ]);

      await captureUndo(projectId, 'Update dependency');

      const data: Record<string, unknown> = {};
      if (body.type !== undefined) data.type = body.type;
      if (body.lagMinutes !== undefined) data.lagMinutes = body.lagMinutes;

      const dep = await prisma.dependency.update({ where: { id: depId }, data });
      await logDependencyMutation(
        projectId,
        'dependency_updated',
        {
          id: dep.id,
          fromTaskName: fromTask.name,
          toTaskName: toTask.name,
          type: dep.type,
          lagMinutes: dep.lagMinutes,
        },
        'user',
      );
      markProjectKnowledgeDirty(projectId);
      const snapshot = await finalizeDependencyMutation(projectId);
      return {
        dependency: dep,
        revision: snapshot.revision,
        snapshot,
      };
    },
  );

  app.post<{ Params: { projectId: string } }>(
    '/batch',
    async (req, reply) => {
      const { projectId } = req.params;
      const body = batchSchema.parse(req.body);

      if (body.create.length === 0 && body.deleteDependencyIds.length === 0) {
        const snapshot = await loadProjectSnapshot(projectId);
        return {
          createdDependencies: [],
          deletedDependencyIds: [],
          revision: snapshot.revision,
          snapshot,
        };
      }

      await captureUndo(projectId, 'Batch update dependencies');

      const createdDependencies: Array<Awaited<ReturnType<typeof prisma.dependency.create>>> = [];

      for (const createInput of body.create) {
        const [from, to] = await Promise.all([
          prisma.task.findFirst({ where: { id: createInput.fromTaskId, projectId } }),
          prisma.task.findFirst({ where: { id: createInput.toTaskId, projectId } }),
        ]);

        if (!from || !to) {
          return reply.code(400).send({ error: 'Both tasks must belong to the project' });
        }

        if (createInput.fromTaskId === createInput.toTaskId) {
          return reply.code(400).send({ error: 'Cannot link a task to itself' });
        }

        const existing = await prisma.dependency.findFirst({
          where: {
            projectId,
            fromTaskId: createInput.fromTaskId,
            toTaskId: createInput.toTaskId,
          },
        });
        if (existing) {
          continue;
        }

        const dependency = await prisma.dependency.create({
          data: {
            projectId,
            fromTaskId: createInput.fromTaskId,
            toTaskId: createInput.toTaskId,
            type: createInput.type,
            lagMinutes: createInput.lagMinutes,
          },
        });
        createdDependencies.push(dependency);
        await logDependencyMutation(
          projectId,
          'dependency_created',
          {
            id: dependency.id,
            fromTaskName: from.name,
            toTaskName: to.name,
            type: dependency.type,
            lagMinutes: dependency.lagMinutes,
          },
          'user',
        );
      }

      const deleteTargets = body.deleteDependencyIds.length === 0
        ? []
        : await prisma.dependency.findMany({
            where: { projectId, id: { in: body.deleteDependencyIds } },
          });

      for (const dependency of deleteTargets) {
        const [fromTask, toTask] = await Promise.all([
          prisma.task.findUniqueOrThrow({ where: { id: dependency.fromTaskId } }),
          prisma.task.findUniqueOrThrow({ where: { id: dependency.toTaskId } }),
        ]);
        await prisma.dependency.delete({ where: { id: dependency.id } });
        await logDependencyMutation(
          projectId,
          'dependency_deleted',
          {
            id: dependency.id,
            fromTaskName: fromTask.name,
            toTaskName: toTask.name,
            type: dependency.type,
            lagMinutes: dependency.lagMinutes,
          },
          'user',
        );
      }

      markProjectKnowledgeDirty(projectId);

      const snapshot = await finalizeDependencyMutation(projectId);
      return {
        createdDependencies,
        deletedDependencyIds: deleteTargets.map((dependency) => dependency.id),
        revision: snapshot.revision,
        snapshot,
      };
    },
  );

  // Delete dependency
  app.delete<{ Params: { projectId: string; depId: string } }>(
    '/:depId',
    async (req) => {
      const { projectId, depId } = req.params;
      const before = await prisma.dependency.findUniqueOrThrow({ where: { id: depId } });
      const [fromTask, toTask] = await Promise.all([
        prisma.task.findUniqueOrThrow({ where: { id: before.fromTaskId } }),
        prisma.task.findUniqueOrThrow({ where: { id: before.toTaskId } }),
      ]);

      await captureUndo(projectId, 'Remove dependency');
      await prisma.dependency.delete({ where: { id: depId } });
      await logDependencyMutation(
        projectId,
        'dependency_deleted',
        {
          id: before.id,
          fromTaskName: fromTask.name,
          toTaskName: toTask.name,
          type: before.type,
          lagMinutes: before.lagMinutes,
        },
        'user',
      );
      markProjectKnowledgeDirty(projectId);
      const snapshot = await finalizeDependencyMutation(projectId);
      return {
        deletedDependencyIds: [depId],
        revision: snapshot.revision,
        snapshot,
      };
    },
  );
}

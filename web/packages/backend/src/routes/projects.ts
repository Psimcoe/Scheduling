/**
 * /api/projects routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { logProjectMutation } from '../services/aiLearningService.js';
import {
  markProjectKnowledgeDirty,
  removeProjectKnowledge,
} from '../services/scheduleKnowledgeService.js';
import {
  loadProjectSnapshot,
  type ProjectSnapshotDetailLevel,
} from '../services/projectSnapshotService.js';

const createSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().datetime(),
  scheduleFrom: z.string().default('start'), // "start" | "finish"
  projectType: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  stratusProjectId: z.string().nullable().optional(),
  stratusModelId: z.string().nullable().optional(),
  stratusPackageWhere: z.string().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
  finishDate: z.string().datetime().nullable().optional(),
  defaultCalendarId: z.string().nullable().optional(),
  scheduleFrom: z.string().optional(),
  statusDate: z.string().datetime().nullable().optional(),
  projectType: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  stratusProjectId: z.string().nullable().optional(),
  stratusModelId: z.string().nullable().optional(),
  stratusPackageWhere: z.string().nullable().optional(),
});

const snapshotQuerySchema = z.object({
  detailLevel: z.enum(['shell', 'full']).optional().default('full'),
});

export default async function projectRoutes(app: FastifyInstance) {
  // List all projects
  app.get('/', async () => {
    return prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        revision: true,
        startDate: true,
        finishDate: true,
        projectType: true,
        sector: true,
        region: true,
        stratusProjectId: true,
        stratusModelId: true,
        stratusPackageWhere: true,
        stratusLastPullAt: true,
        stratusLastPushAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  // Get single project with counts
  app.get<{ Params: { id: string }; Querystring: { detailLevel?: ProjectSnapshotDetailLevel } }>(
    '/:id/snapshot',
    async (req) => {
      const { detailLevel } = snapshotQuerySchema.parse(req.query);
      return loadProjectSnapshot(req.params.id, detailLevel);
    },
  );

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { id } = req.params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: { tasks: true, calendars: true, resources: true },
        },
      },
    });
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return project;
  });

  // Create project
  app.post('/', async (req, reply) => {
    const body = createSchema.parse(req.body);
    const project = await prisma.project.create({
      data: {
        name: body.name,
        startDate: new Date(body.startDate),
        scheduleFrom: body.scheduleFrom,
        projectType: body.projectType ?? null,
        sector: body.sector ?? null,
        region: body.region ?? null,
        stratusProjectId: body.stratusProjectId ?? null,
        stratusModelId: body.stratusModelId ?? null,
        stratusPackageWhere: body.stratusPackageWhere ?? null,
      },
    });
    await logProjectMutation(project.id, 'project_created', { after: project }, 'user');
    markProjectKnowledgeDirty(project.id);
    return reply.code(201).send(project);
  });

  // Update project
  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { id } = req.params;
    const body = updateSchema.parse(req.body);
    const before = await prisma.project.findUniqueOrThrow({ where: { id } });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
    if (body.finishDate !== undefined)
      data.finishDate = body.finishDate ? new Date(body.finishDate) : null;
    if (body.defaultCalendarId !== undefined)
      data.defaultCalendarId = body.defaultCalendarId;
    if (body.scheduleFrom !== undefined) data.scheduleFrom = body.scheduleFrom;
    if (body.statusDate !== undefined)
      data.statusDate = body.statusDate ? new Date(body.statusDate) : null;
    if (body.projectType !== undefined) data.projectType = body.projectType;
    if (body.sector !== undefined) data.sector = body.sector;
    if (body.region !== undefined) data.region = body.region;
    if (body.stratusProjectId !== undefined) data.stratusProjectId = body.stratusProjectId;
    if (body.stratusModelId !== undefined) data.stratusModelId = body.stratusModelId;
    if (body.stratusPackageWhere !== undefined) data.stratusPackageWhere = body.stratusPackageWhere;

    const project = await prisma.project.update({ where: { id }, data });
    await logProjectMutation(id, 'project_updated', { before, after: project }, 'user');
    markProjectKnowledgeDirty(id);
    return project;
  });

  // Delete project (cascades to tasks/deps via Prisma)
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { id } = req.params;
    const before = await prisma.project.findUniqueOrThrow({ where: { id } });
    await logProjectMutation(id, 'project_deleted', { before }, 'user');
    await removeProjectKnowledge(id);
    await prisma.project.delete({ where: { id } });
    return reply.code(204).send();
  });
}

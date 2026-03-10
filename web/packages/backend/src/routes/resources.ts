/**
 * /api/projects/:projectId/resources routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const createSchema = z.object({
  name: z.string().min(1),
  type: z.string().default('work'), // "work" | "material" | "cost"
  maxUnits: z.number().min(0).default(1),
  calendarId: z.string().nullable().optional(),
  standardRate: z.number().min(0).optional(),
  overtimeRate: z.number().min(0).optional(),
  costPerUse: z.number().min(0).optional(),
  accrueAt: z.enum(['start', 'end', 'prorated']).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  maxUnits: z.number().min(0).optional(),
  calendarId: z.string().nullable().optional(),
  standardRate: z.number().min(0).optional(),
  overtimeRate: z.number().min(0).optional(),
  costPerUse: z.number().min(0).optional(),
  accrueAt: z.enum(['start', 'end', 'prorated']).optional(),
});

export default async function resourceRoutes(app: FastifyInstance) {
  // List resources
  app.get<{ Params: { projectId: string } }>('/', async (req) => {
    const { projectId } = req.params;
    return prisma.resource.findMany({ where: { projectId } });
  });

  // Get single resource
  app.get<{ Params: { projectId: string; resId: string } }>(
    '/:resId',
    async (req, reply) => {
      const { resId } = req.params;
      const res = await prisma.resource.findUnique({ where: { id: resId } });
      if (!res) return reply.code(404).send({ error: 'Resource not found' });
      return res;
    },
  );

  // Create resource
  app.post<{ Params: { projectId: string } }>('/', async (req, reply) => {
    const { projectId } = req.params;
    const body = createSchema.parse(req.body);

    const resource = await prisma.resource.create({
      data: {
        projectId,
        name: body.name,
        type: body.type,
        maxUnits: body.maxUnits,
        calendarId: body.calendarId ?? null,
        standardRate: body.standardRate ?? 0,
        overtimeRate: body.overtimeRate ?? 0,
        costPerUse: body.costPerUse ?? 0,
        accrueAt: body.accrueAt ?? 'prorated',
      },
    });
    return reply.code(201).send(resource);
  });

  // Update resource
  app.patch<{ Params: { projectId: string; resId: string } }>(
    '/:resId',
    async (req) => {
      const { resId } = req.params;
      const body = updateSchema.parse(req.body);

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.type !== undefined) data.type = body.type;
      if (body.maxUnits !== undefined) data.maxUnits = body.maxUnits;
      if (body.calendarId !== undefined) data.calendarId = body.calendarId;
      if (body.standardRate !== undefined) data.standardRate = body.standardRate;
      if (body.overtimeRate !== undefined) data.overtimeRate = body.overtimeRate;
      if (body.costPerUse !== undefined) data.costPerUse = body.costPerUse;
      if (body.accrueAt !== undefined) data.accrueAt = body.accrueAt;

      return prisma.resource.update({ where: { id: resId }, data });
    },
  );

  // Delete resource (and assignments)
  app.delete<{ Params: { projectId: string; resId: string } }>(
    '/:resId',
    async (req, reply) => {
      const { resId } = req.params;
      await prisma.assignment.deleteMany({ where: { resourceId: resId } });
      await prisma.resource.delete({ where: { id: resId } });
      return reply.code(204).send();
    },
  );
}

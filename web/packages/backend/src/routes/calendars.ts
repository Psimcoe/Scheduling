/**
 * /api/projects/:projectId/calendars routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const workingHourSchema = z.object({
  startHour: z.number().min(0).max(23),
  startMinute: z.number().min(0).max(59),
  endHour: z.number().min(0).max(23),
  endMinute: z.number().min(0).max(59),
});

const createSchema = z.object({
  name: z.string().min(1),
  workingDaysOfWeek: z
    .array(z.boolean())
    .length(7)
    .default([false, true, true, true, true, true, false]),
  defaultWorkingHours: z.array(workingHourSchema).default([
    { startHour: 8, startMinute: 0, endHour: 12, endMinute: 0 },
    { startHour: 13, startMinute: 0, endHour: 17, endMinute: 0 },
  ]),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  workingDaysOfWeek: z.array(z.boolean()).length(7).optional(),
  defaultWorkingHours: z.array(workingHourSchema).optional(),
});

const exceptionSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  isWorking: z.boolean().default(false),
  workingHours: z.array(workingHourSchema).nullable().optional(),
});

export default async function calendarRoutes(app: FastifyInstance) {
  // List calendars
  app.get<{ Params: { projectId: string } }>('/', async (req) => {
    const { projectId } = req.params;
    return prisma.calendar.findMany({
      where: { projectId },
      include: { exceptions: true },
    });
  });

  // Get single calendar
  app.get<{ Params: { projectId: string; calId: string } }>(
    '/:calId',
    async (req, reply) => {
      const { calId } = req.params;
      const cal = await prisma.calendar.findUnique({
        where: { id: calId },
        include: { exceptions: true },
      });
      if (!cal) return reply.code(404).send({ error: 'Calendar not found' });
      return cal;
    },
  );

  // Create calendar
  app.post<{ Params: { projectId: string } }>('/', async (req, reply) => {
    const { projectId } = req.params;
    const body = createSchema.parse(req.body);

    const cal = await prisma.calendar.create({
      data: {
        projectId,
        name: body.name,
        workingDaysOfWeek: JSON.stringify(body.workingDaysOfWeek),
        defaultWorkingHours: JSON.stringify(body.defaultWorkingHours),
      },
    });
    return reply.code(201).send(cal);
  });

  // Update calendar
  app.patch<{ Params: { projectId: string; calId: string } }>(
    '/:calId',
    async (req) => {
      const { calId } = req.params;
      const body = updateSchema.parse(req.body);

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.workingDaysOfWeek !== undefined)
        data.workingDaysOfWeek = JSON.stringify(body.workingDaysOfWeek);
      if (body.defaultWorkingHours !== undefined)
        data.defaultWorkingHours = JSON.stringify(body.defaultWorkingHours);

      return prisma.calendar.update({ where: { id: calId }, data });
    },
  );

  // Delete calendar
  app.delete<{ Params: { projectId: string; calId: string } }>(
    '/:calId',
    async (req, reply) => {
      const { calId } = req.params;
      await prisma.calendarException.deleteMany({ where: { calendarId: calId } });
      await prisma.calendar.delete({ where: { id: calId } });
      return reply.code(204).send();
    },
  );

  // --- Calendar exceptions ---

  // Add exception
  app.post<{ Params: { projectId: string; calId: string } }>(
    '/:calId/exceptions',
    async (req, reply) => {
      const { calId } = req.params;
      const body = exceptionSchema.parse(req.body);

      const exception = await prisma.calendarException.create({
        data: {
          calendarId: calId,
          startDate: body.startDate,
          endDate: body.endDate,
          isWorking: body.isWorking,
          workingHours: body.workingHours ? JSON.stringify(body.workingHours) : null,
        },
      });
      return reply.code(201).send(exception);
    },
  );

  // Delete exception
  app.delete<{ Params: { projectId: string; calId: string; excId: string } }>(
    '/:calId/exceptions/:excId',
    async (req, reply) => {
      const { excId } = req.params;
      await prisma.calendarException.delete({ where: { id: excId } });
      return reply.code(204).send();
    },
  );
}

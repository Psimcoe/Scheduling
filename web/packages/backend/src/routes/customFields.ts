/**
 * /api/projects/:projectId/custom-fields routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const fieldDefSchema = z.object({
  fieldName: z.string().min(1).max(100),
  displayName: z.string().max(200).optional(),
  fieldType: z.enum([
    'text',
    'number',
    'date',
    'flag',
    'cost',
    'duration',
    'outlineCode',
  ]),
  formula: z.string().max(2000).optional(),
  lookupTable: z.array(z.record(z.unknown())).optional(),
  indicatorRules: z.string().max(2000).optional(),
});

const fieldValueSchema = z.object({
  taskId: z.string().uuid(),
  textValue: z.string().optional(),
  numberValue: z.number().optional(),
  dateValue: z.string().datetime().optional(),
  flagValue: z.boolean().optional(),
});

export default async function customFieldRoutes(app: FastifyInstance) {
  // List custom field definitions for a project
  app.get<{ Params: { projectId: string } }>('/', async (req) => {
    const { projectId } = req.params;
    return prisma.customFieldDefinition.findMany({
      where: { projectId },
      orderBy: { fieldName: 'asc' },
    });
  });

  // Create a custom field definition
  app.post<{ Params: { projectId: string } }>('/', async (req, reply) => {
    const { projectId } = req.params;
    const body = fieldDefSchema.parse(req.body);

    const field = await prisma.customFieldDefinition.create({
      data: {
        projectId,
        fieldName: body.fieldName,
        displayName: body.displayName ?? '',
        fieldType: body.fieldType,
        formula: body.formula ?? null,
        lookupTableJson: body.lookupTable
          ? JSON.stringify(body.lookupTable)
          : null,
        indicatorRules: body.indicatorRules ?? null,
      },
    });

    return reply.code(201).send(field);
  });

  // Update a custom field definition
  app.patch<{ Params: { projectId: string; fieldId: string } }>(
    '/:fieldId',
    async (req) => {
      const body = fieldDefSchema.partial().parse(req.body);
      return prisma.customFieldDefinition.update({
        where: { id: req.params.fieldId },
        data: {
          ...(body.fieldName !== undefined && { fieldName: body.fieldName }),
          ...(body.displayName !== undefined && { displayName: body.displayName }),
          ...(body.fieldType !== undefined && { fieldType: body.fieldType }),
          ...(body.formula !== undefined && { formula: body.formula ?? null }),
          ...(body.lookupTable !== undefined && {
            lookupTableJson: body.lookupTable
              ? JSON.stringify(body.lookupTable)
              : null,
          }),
          ...(body.indicatorRules !== undefined && {
            indicatorRules: body.indicatorRules ?? null,
          }),
        },
      });
    },
  );

  // Delete a custom field definition (and all its values)
  app.delete<{ Params: { projectId: string; fieldId: string } }>(
    '/:fieldId',
    async (req, reply) => {
      await prisma.$transaction([
        prisma.customFieldValue.deleteMany({
          where: { fieldId: req.params.fieldId },
        }),
        prisma.customFieldDefinition.delete({
          where: { id: req.params.fieldId },
        }),
      ]);
      return reply.code(204).send();
    },
  );

  // Get all values for a custom field
  app.get<{ Params: { projectId: string; fieldId: string } }>(
    '/:fieldId/values',
    async (req) => {
      return prisma.customFieldValue.findMany({
        where: { fieldId: req.params.fieldId },
      });
    },
  );

  // Set a custom field value for a task
  app.put<{ Params: { projectId: string; fieldId: string } }>(
    '/:fieldId/values',
    async (req, reply) => {
      const body = fieldValueSchema.parse(req.body);

      const value = await prisma.customFieldValue.upsert({
        where: {
          taskId_fieldId: {
            taskId: body.taskId,
            fieldId: req.params.fieldId,
          },
        },
        create: {
          taskId: body.taskId,
          fieldId: req.params.fieldId,
          textValue: body.textValue ?? null,
          numberValue: body.numberValue ?? null,
          dateValue: body.dateValue ? new Date(body.dateValue) : null,
          flagValue: body.flagValue ?? null,
        },
        update: {
          textValue: body.textValue ?? null,
          numberValue: body.numberValue ?? null,
          dateValue: body.dateValue ? new Date(body.dateValue) : null,
          flagValue: body.flagValue ?? null,
        },
      });

      return reply.code(200).send(value);
    },
  );
}

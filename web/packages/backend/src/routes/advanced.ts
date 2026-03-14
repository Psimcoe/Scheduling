/**
 * /api/projects/:projectId/advanced routes — cost, EV, splits, recurring, auto-link
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { computeCosts, computeEarnedValue } from '../services/costService.js';
import { recalculateProject } from '../services/schedulingService.js';
import { normalizeTaskHierarchy } from '../services/taskHierarchyService.js';

export default async function advancedRoutes(app: FastifyInstance) {
  // ─── Cost recalculation ──────────────────────────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/costs/recalculate',
    async (req, reply) => {
      try {
        const tasks = await computeCosts(req.params.projectId);
        return { tasks: tasks.length };
      } catch (e) {
        return reply.code(500).send({ error: 'Cost recalculation failed' });
      }
    },
  );

  // ─── Earned Value computation ────────────────────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/earned-value',
    async (req, reply) => {
      try {
        const body = req.body as Record<string, unknown> | null;
        const statusDate = typeof body?.statusDate === 'string' ? body.statusDate : undefined;
        const result = await computeEarnedValue(req.params.projectId, statusDate);
        return result;
      } catch (e) {
        return reply.code(500).send({ error: 'Earned value computation failed' });
      }
    },
  );

  // ─── Interim Plans ───────────────────────────────────────────────
  app.post<{ Params: { projectId: string }; Body: { planIndex: number } }>(
    '/interim-plans',
    async (req) => {
      const { projectId } = req.params;
      const { planIndex } = req.body as { planIndex: number };
      const tasks = await prisma.task.findMany({ where: { projectId } });

      let saved = 0;
      for (const task of tasks) {
        await prisma.interimPlan.upsert({
          where: { taskId_planIndex: { taskId: task.id, planIndex } },
          update: { start: task.start, finish: task.finish },
          create: { taskId: task.id, planIndex, start: task.start, finish: task.finish },
        });
        saved++;
      }
      return { saved, planIndex };
    },
  );

  app.get<{ Params: { projectId: string }; Querystring: { planIndex?: string } }>(
    '/interim-plans',
    async (req) => {
      const { projectId } = req.params;
      const planIndex = req.query.planIndex ? parseInt(req.query.planIndex) : undefined;
      const where: any = { task: { projectId } };
      if (planIndex !== undefined) where.planIndex = planIndex;
      return prisma.interimPlan.findMany({ where, include: { task: { select: { name: true } } } });
    },
  );

  // ─── Task Splits ─────────────────────────────────────────────────
  app.post<{ Params: { projectId: string; taskId: string } }>(
    '/tasks/:taskId/split',
    async (req, reply) => {
      const { taskId } = req.params;
      const body = z.object({
        splitDate: z.string().datetime(),
        resumeDate: z.string().datetime(),
      }).parse(req.body);

      const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

      // Get existing splits or create initial segment
      const existing = await prisma.taskSplit.findMany({
        where: { taskId },
        orderBy: { segmentIndex: 'asc' },
      });

      if (existing.length === 0) {
        // First split — create two segments
        await prisma.taskSplit.createMany({
          data: [
            {
              taskId,
              segmentIndex: 0,
              start: task.start,
              finish: new Date(body.splitDate),
              durationMinutes: (new Date(body.splitDate).getTime() - task.start.getTime()) / 60000,
            },
            {
              taskId,
              segmentIndex: 1,
              start: new Date(body.resumeDate),
              finish: task.finish,
              durationMinutes: (task.finish.getTime() - new Date(body.resumeDate).getTime()) / 60000,
            },
          ],
        });
      } else {
        // Additional split — find which segment to split
        const splitTime = new Date(body.splitDate).getTime();
        const segIdx = existing.findIndex(
          (s) => splitTime >= s.start.getTime() && splitTime <= s.finish.getTime(),
        );
        if (segIdx === -1) return reply.code(400).send({ error: 'Split date not within any segment' });

        const seg = existing[segIdx];
        // Update existing segment to end at split
        await prisma.taskSplit.update({
          where: { id: seg.id },
          data: { finish: new Date(body.splitDate) },
        });
        // Shift subsequent segments
        for (let i = existing.length - 1; i > segIdx; i--) {
          await prisma.taskSplit.update({
            where: { id: existing[i].id },
            data: { segmentIndex: existing[i].segmentIndex + 1 },
          });
        }
        // Insert new segment
        await prisma.taskSplit.create({
          data: {
            taskId,
            segmentIndex: segIdx + 1,
            start: new Date(body.resumeDate),
            finish: seg.finish,
            durationMinutes: (seg.finish.getTime() - new Date(body.resumeDate).getTime()) / 60000,
          },
        });
      }

      await prisma.task.update({
        where: { id: taskId },
        data: { isSplit: true },
      });

      return prisma.taskSplit.findMany({
        where: { taskId },
        orderBy: { segmentIndex: 'asc' },
      });
    },
  );

  app.get<{ Params: { projectId: string; taskId: string } }>(
    '/tasks/:taskId/splits',
    async (req) => {
      return prisma.taskSplit.findMany({
        where: { taskId: req.params.taskId },
        orderBy: { segmentIndex: 'asc' },
      });
    },
  );

  // ─── Recurring Tasks ─────────────────────────────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/recurring-tasks',
    async (req) => {
      const body = z.object({
        name: z.string().min(1),
        frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
        interval: z.number().int().min(1).default(1),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
        dayOfMonth: z.number().int().min(1).max(31).optional(),
        occurrences: z.number().int().min(1).optional(),
        rangeEnd: z.string().datetime().optional(),
        startDate: z.string().datetime(),
        durationMinutes: z.number().default(480),
        parentId: z.string().nullable().optional(),
      }).parse(req.body);

      const { projectId } = req.params;
      const pattern = {
        frequency: body.frequency,
        interval: body.interval,
        daysOfWeek: body.daysOfWeek,
        dayOfMonth: body.dayOfMonth,
        occurrences: body.occurrences,
        rangeEnd: body.rangeEnd,
      };

      // Generate occurrence dates
      const dates = generateOccurrences(
        body.startDate,
        pattern,
        body.occurrences ?? 10,
      );

      // Create summary task for the recurring series
      const maxSort = await prisma.task.aggregate({
        where: { projectId },
        _max: { sortOrder: true },
      });
      let sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

      const summaryTask = await prisma.task.create({
        data: {
          projectId,
          name: body.name,
          type: 'summary',
          durationMinutes: 0,
          start: new Date(dates[0]),
          finish: new Date(dates[dates.length - 1]),
          sortOrder: sortOrder++,
          parentId: body.parentId ?? null,
          isRecurring: true,
          recurringPattern: JSON.stringify(pattern),
        },
      });

      // Create child tasks for each occurrence
      const children = [];
      for (let i = 0; i < dates.length; i++) {
        const start = new Date(dates[i]);
        const finish = new Date(start.getTime() + body.durationMinutes * 60000);
        const child = await prisma.task.create({
          data: {
            projectId,
            name: `${body.name} (${i + 1})`,
            type: 'task',
            durationMinutes: body.durationMinutes,
            start,
            finish,
            sortOrder: sortOrder++,
            parentId: summaryTask.id,
            outlineLevel: (summaryTask.outlineLevel || 1) + 1,
          },
        });
        children.push(child);
      }

      await normalizeTaskHierarchy(projectId, { incrementRevision: false });
      await recalculateProject(projectId);
      return { summaryTask, children, count: children.length };
    },
  );

  // ─── Auto-Link ───────────────────────────────────────────────────
  app.post<{ Params: { projectId: string } }>(
    '/auto-link',
    async (req) => {
      const { projectId } = req.params;
      const body = z.object({
        taskIds: z.array(z.string()).optional(), // if provided, only auto-link these tasks
      }).parse(req.body ?? {});

      const tasks = await prisma.task.findMany({
        where: {
          projectId,
          type: { not: 'summary' },
          ...(body.taskIds ? { id: { in: body.taskIds } } : {}),
        },
        orderBy: { sortOrder: 'asc' },
      });

      if (tasks.length < 2) return { linked: 0 };

      // Get existing dependencies
      const existing = await prisma.dependency.findMany({ where: { projectId } });
      const existingPairs = new Set(existing.map((d) => `${d.fromTaskId}→${d.toTaskId}`));

      // Batch create dependencies
      const newDeps = [];
      for (let i = 0; i < tasks.length - 1; i++) {
        const fromId = tasks[i].id;
        const toId = tasks[i + 1].id;
        const key = `${fromId}→${toId}`;
        if (!existingPairs.has(key)) {
          newDeps.push({ projectId, fromTaskId: fromId, toTaskId: toId, type: 'FS', lagMinutes: 0 });
        }
      }

      if (newDeps.length > 0) {
        await prisma.dependency.createMany({ data: newDeps });
        await recalculateProject(projectId);
      }
      return { linked: newDeps.length };
    },
  );

  // ─── Project Statistics ──────────────────────────────────────────
  app.get<{ Params: { projectId: string } }>(
    '/statistics',
    async (req) => {
      const { projectId } = req.params;
      const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      const tasks = await prisma.task.findMany({ where: { projectId } });
      const deps = await prisma.dependency.count({ where: { projectId } });
      const resources = await prisma.resource.count({ where: { projectId } });
      const assignments = await prisma.assignment.count({ where: { task: { projectId } } });

      const leafTasks = tasks.filter((t) => t.type !== 'summary');
      const summaryTasks = tasks.filter((t) => t.type === 'summary');
      const milestones = tasks.filter((t) => t.type === 'milestone' || t.durationMinutes === 0);
      const criticalTasks = leafTasks.filter((t) => t.isCritical);
      const completeTasks = leafTasks.filter((t) => t.percentComplete === 100);
      const inProgressTasks = leafTasks.filter((t) => t.percentComplete > 0 && t.percentComplete < 100);
      const notStartedTasks = leafTasks.filter((t) => t.percentComplete === 0);

      const totalCost = tasks.reduce((s, t) => s + t.cost, 0);
      const actualCost = tasks.reduce((s, t) => s + t.actualCost, 0);
      const remainingCost = tasks.reduce((s, t) => s + t.remainingCost, 0);
      const totalWork = tasks.reduce((s, t) => s + t.work, 0);
      const actualWork = tasks.reduce((s, t) => s + t.actualWork, 0);

      return {
        projectName: project.name,
        startDate: project.startDate,
        finishDate: project.finishDate,
        statusDate: project.statusDate,
        duration: project.finishDate
          ? (project.finishDate.getTime() - project.startDate.getTime()) / (60000 * project.minutesPerDay) + ' days'
          : null,
        taskCount: tasks.length,
        leafTaskCount: leafTasks.length,
        summaryTaskCount: summaryTasks.length,
        milestoneCount: milestones.length,
        criticalTaskCount: criticalTasks.length,
        dependencyCount: deps,
        resourceCount: resources,
        assignmentCount: assignments,
        completeTasks: completeTasks.length,
        inProgressTasks: inProgressTasks.length,
        notStartedTasks: notStartedTasks.length,
        percentComplete: leafTasks.length > 0
          ? Math.round(leafTasks.reduce((s, t) => s + t.percentComplete, 0) / leafTasks.length)
          : 0,
        totalCost,
        actualCost,
        remainingCost,
        totalWork,
        actualWork,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Helper: Generate recurring occurrence dates
// ---------------------------------------------------------------------------

function generateOccurrences(
  startDate: string,
  pattern: { frequency: string; interval: number; daysOfWeek?: number[]; dayOfMonth?: number; rangeEnd?: string },
  maxOccurrences: number,
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const rangeEnd = pattern.rangeEnd ? new Date(pattern.rangeEnd).getTime() : Infinity;

  const current = new Date(start);
  let count = 0;

  while (count < maxOccurrences && current.getTime() <= rangeEnd) {
    if (pattern.frequency === 'weekly' && pattern.daysOfWeek?.length) {
      // For weekly, find matching days in the current week
      for (const dow of pattern.daysOfWeek) {
        const dayDiff = dow - current.getDay();
        const candidate = new Date(current);
        candidate.setDate(candidate.getDate() + dayDiff);
        if (candidate.getTime() >= start.getTime() && candidate.getTime() <= rangeEnd) {
          dates.push(candidate.toISOString());
          count++;
          if (count >= maxOccurrences) break;
        }
      }
      current.setDate(current.getDate() + 7 * pattern.interval);
    } else if (pattern.frequency === 'monthly') {
      const day = pattern.dayOfMonth ?? current.getDate();
      current.setDate(day);
      if (current.getTime() >= start.getTime()) {
        dates.push(current.toISOString());
        count++;
      }
      current.setMonth(current.getMonth() + pattern.interval);
    } else if (pattern.frequency === 'yearly') {
      if (current.getTime() >= start.getTime()) {
        dates.push(current.toISOString());
        count++;
      }
      current.setFullYear(current.getFullYear() + pattern.interval);
    } else {
      // daily
      if (current.getTime() >= start.getTime()) {
        dates.push(current.toISOString());
        count++;
      }
      current.setDate(current.getDate() + pattern.interval);
    }
  }

  return dates;
}

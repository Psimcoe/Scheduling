import fastifyCookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyServerOptions } from 'fastify';
import { registerAuthGuard } from './auth/authPlugin.js';
import { AuthHttpError } from './auth/authService.js';
import advancedRoutes from './routes/advanced.js';
import aiRoutes from './routes/ai.js';
import assignmentRoutes from './routes/assignments.js';
import authRoutes from './routes/auth.js';
import baselineRoutes from './routes/baselines.js';
import calendarRoutes from './routes/calendars.js';
import customFieldRoutes from './routes/customFields.js';
import dependencyRoutes from './routes/dependencies.js';
import importExportRoutes from './routes/importExport.js';
import levelingRoutes from './routes/leveling.js';
import projectRoutes from './routes/projects.js';
import resourceRoutes from './routes/resources.js';
import stratusRoutes from './routes/stratus.js';
import taskRoutes from './routes/tasks.js';
import { runtimeConfig } from './runtimeConfig.js';

function buildCorsOriginValidator() {
  const allowedOrigins = new Set(runtimeConfig.allowedOrigins);

  return (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, allowedOrigins.has(origin));
  };
}

function resolveRateLimitMax(request: FastifyRequest): number {
  const routeUrl = request.routeOptions.url ?? '';
  if (routeUrl.startsWith('/auth')) {
    return 10;
  }

  if (routeUrl.startsWith('/api/ai') || routeUrl.includes('/stratus/')) {
    return request.auth?.user.id ? 20 : 60;
  }

  return request.auth?.user.id ? 120 : 300;
}

function resolveRateLimitKey(request: FastifyRequest): string {
  const routeUrl = request.routeOptions.url ?? '';
  if (routeUrl.startsWith('/auth')) {
    return request.ip;
  }

  if (routeUrl.startsWith('/api/ai') || routeUrl.includes('/stratus/')) {
    return request.auth?.user.id ?? request.ip;
  }

  return request.auth?.user.id ?? request.ip;
}

export async function buildServer(
  options: FastifyServerOptions = {},
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.headers.x-csrf-token',
          'res.headers["set-cookie"]',
        ],
      },
    },
    ...options,
  });

  server.setErrorHandler((error, _request, reply) => {
    const err = error as Error & {
      statusCode?: number;
      code?: string;
      issues?: unknown[];
    };

    if (err instanceof AuthHttpError) {
      return reply.status(err.statusCode).send({
        code: err.code,
        error: err.message,
      });
    }

    if (err.name === 'ZodError' || err.constructor?.name === 'ZodError' || Array.isArray(err.issues)) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        error: 'Validation error',
        details: err.message,
      });
    }

    if (err.statusCode === 429 || err.code === 'FST_ERR_RATE_LIMIT' || err.code === 'RATE_LIMITED') {
      return reply.status(429).send({
        code: 'RATE_LIMITED',
        error: err.message && err.message !== 'Internal Server Error'
          ? err.message
          : 'Rate limit exceeded.',
      });
    }

    server.log.error(err);

    if (err.name === 'NotFoundError' || err.code === 'P2025') {
      return reply.status(404).send({
        code: 'NOT_FOUND',
        error: 'Resource not found',
      });
    }

    reply.status(err.statusCode ?? 500).send({
      code: err.code ?? 'INTERNAL_ERROR',
      error: err.message ?? 'Internal Server Error',
    });
  });

  await server.register(fastifyCookie, {
    secret: runtimeConfig.auth.sessionCookieSecret || 'dev-session-cookie-secret-change-me',
  });

  await server.register(cors, {
    origin: buildCorsOriginValidator(),
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await server.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await server.register(multipart);
  await registerAuthGuard(server);

  await server.register(rateLimit, {
    global: true,
    hook: 'preHandler',
    timeWindow: '1 minute',
    max: resolveRateLimitMax,
    keyGenerator: resolveRateLimitKey,
    allowList: (request) => {
      const routeUrl = request.routeOptions.url ?? '';
      return !routeUrl.startsWith('/api') && !routeUrl.startsWith('/auth');
    },
    errorResponseBuilder: (_request, context) => ({
      code: 'RATE_LIMITED',
      error: `Rate limit exceeded. Retry after ${context.after}.`,
    }),
  });

  await server.register(authRoutes, { prefix: '/auth' });

  await server.register(projectRoutes, { prefix: '/api/projects' });
  await server.register(taskRoutes, { prefix: '/api/projects/:projectId/tasks' });
  await server.register(dependencyRoutes, { prefix: '/api/projects/:projectId/dependencies' });
  await server.register(calendarRoutes, { prefix: '/api/projects/:projectId/calendars' });
  await server.register(resourceRoutes, { prefix: '/api/projects/:projectId/resources' });
  await server.register(assignmentRoutes, { prefix: '/api/projects/:projectId/assignments' });
  await server.register(baselineRoutes, { prefix: '/api/projects/:projectId/baselines' });
  await server.register(importExportRoutes, { prefix: '/api/projects/:projectId/import-export' });
  await server.register(customFieldRoutes, { prefix: '/api/projects/:projectId/custom-fields' });
  await server.register(aiRoutes, { prefix: '/api/ai' });
  await server.register(stratusRoutes, { prefix: '/api' });
  await server.register(levelingRoutes, { prefix: '/api/projects/:projectId/leveling' });
  await server.register(advancedRoutes, { prefix: '/api/projects/:projectId/advanced' });

  server.get('/api/health', async () => ({ status: 'ok' }));

  if (runtimeConfig.staticDir) {
    await server.register(fastifyStatic, {
      root: runtimeConfig.staticDir,
      prefix: '/',
      index: ['index.html'],
    });

    server.setNotFoundHandler(async (request, reply) => {
      const requestPath = request.url.split('?')[0];
      const isApiRequest = requestPath === '/api' || requestPath.startsWith('/api/');
      const isAuthRequest = requestPath === '/auth' || requestPath.startsWith('/auth/');
      const isDocumentRequest = request.method === 'GET' || request.method === 'HEAD';
      const hasFileExtension = /\.[A-Za-z0-9]+$/.test(requestPath);

      if (!isApiRequest && !isAuthRequest && isDocumentRequest && !hasFileExtension) {
        return reply.sendFile('index.html');
      }

      return reply.status(404).send({ code: 'NOT_FOUND', error: 'Not found' });
    });
  }

  return server;
}

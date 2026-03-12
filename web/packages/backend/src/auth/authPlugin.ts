import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  AuthHttpError,
  ensureCsrf,
  hasRequiredRole,
  resolveRequestAuth,
} from './authService.js';
import type { AuthRole } from './types.js';

function isReadOnlyMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function isAdminRoute(routeUrl: string): boolean {
  return routeUrl.startsWith('/api/ai') || routeUrl.includes('/stratus/');
}

function isReadOnlyPreviewRoute(routeUrl: string): boolean {
  return routeUrl.includes('/preview');
}

export function getRequiredApiRole(routeUrl: string, method: string): AuthRole | null {
  if (!routeUrl.startsWith('/api')) {
    return null;
  }

  if (routeUrl === '/api/health') {
    return null;
  }

  if (isAdminRoute(routeUrl)) {
    return 'admin';
  }

  if (isReadOnlyMethod(method) || isReadOnlyPreviewRoute(routeUrl)) {
    return 'viewer';
  }

  return 'editor';
}

export const authRateLimitConfig = {
  groupId: 'auth',
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (request: FastifyRequest) => request.ip,
};

export const aiRateLimitConfig = {
  groupId: 'ai',
  max: (request: FastifyRequest) => (request.auth?.user.id ? 20 : 60),
  timeWindow: '1 minute',
  keyGenerator: (request: FastifyRequest) => request.auth?.user.id ?? request.ip,
};

export async function registerAuthGuard(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    request.auth = null;

    const routeUrl = request.routeOptions.url ?? '';
    if (
      request.method === 'OPTIONS' ||
      routeUrl.startsWith('/auth') ||
      !routeUrl.startsWith('/api')
    ) {
      return;
    }

    const requiredRole = getRequiredApiRole(routeUrl, request.method);
    if (!requiredRole) {
      return;
    }

    const auth = await resolveRequestAuth(request, reply);
    if (!auth) {
      throw new AuthHttpError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }

    if (!hasRequiredRole(auth.user.role, requiredRole)) {
      throw new AuthHttpError(
        403,
        'FORBIDDEN',
        'You do not have permission to access this resource.',
      );
    }

    if (!isReadOnlyMethod(request.method)) {
      ensureCsrf(request, auth);
    }
  });
}

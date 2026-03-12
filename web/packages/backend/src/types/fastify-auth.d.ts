import 'fastify';
import type { RequestAuthContext } from '../auth/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: RequestAuthContext | null;
  }
}


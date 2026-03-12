import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AuthHttpError,
  consumeOidcState,
  createSessionFromAuthorizationCode,
  destroyCurrentSession,
  ensureCsrf,
  getOidcLoginUrl,
  requireRequestAuth,
  sanitizeReturnTo,
} from '../auth/authService.js';

const loginQuerySchema = z.object({
  returnTo: z.string().optional(),
  mode: z.enum(['redirect', 'popup']).default('redirect'),
});

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

function renderPopupCallbackHtml(
  status: 'success' | 'error',
  payload: { returnTo: string; error?: string },
): string {
  const safePayload = JSON.stringify({
    type: 'schedulesync:auth-callback',
    status,
    returnTo: payload.returnTo,
    error: payload.error ?? null,
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ScheduleSync Authentication</title>
  </head>
  <body>
    <script>
      const payload = ${safePayload};
      if (window.opener && window.opener !== window) {
        window.opener.postMessage(payload, window.location.origin);
        window.close();
      } else {
        const url = new URL(payload.returnTo || '/', window.location.origin);
        if (payload.status === 'error' && payload.error) {
          url.searchParams.set('authError', payload.error);
        }
        window.location.replace(url.toString());
      }
    </script>
  </body>
</html>`;
}

function redirectWithError(reply: { redirect: (url: string, statusCode?: number) => unknown }, returnTo: string, error: string) {
  const url = new URL(returnTo, 'http://localhost');
  url.searchParams.set('authError', error);
  return reply.redirect(`${url.pathname}${url.search}${url.hash}`, 302);
}

export default async function authRoutes(app: FastifyInstance) {
  app.get('/login', async (request, reply) => {
    const query = loginQuerySchema.parse(request.query);
    const authorizationUrl = await getOidcLoginUrl(reply, {
      mode: query.mode,
      returnTo: sanitizeReturnTo(query.returnTo),
    });

    return reply.redirect(authorizationUrl, 302);
  });

  app.get('/callback', async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);
    const storedState = consumeOidcState(request, reply);
    const mode = storedState?.mode ?? 'redirect';
    const returnTo = storedState?.returnTo ?? '/';

    const handleFailure = (errorCode: string) => {
      if (mode === 'popup') {
        return reply
          .code(200)
          .type('text/html; charset=utf-8')
          .send(renderPopupCallbackHtml('error', { returnTo, error: errorCode }));
      }

      return redirectWithError(reply, returnTo, errorCode);
    };

    if (!storedState || !query.state || storedState.state !== query.state) {
      return handleFailure('state_mismatch');
    }

    if (query.error) {
      return handleFailure(query.error);
    }

    if (!query.code) {
      return handleFailure('missing_code');
    }

    try {
      await createSessionFromAuthorizationCode(
        request,
        reply,
        query.code,
        storedState.codeVerifier,
      );
    } catch (error) {
      request.log.error(error);
      const errorCode = error instanceof AuthHttpError ? error.code : 'callback_failed';
      return handleFailure(errorCode.toLowerCase());
    }

    if (mode === 'popup') {
      return reply
        .code(200)
        .type('text/html; charset=utf-8')
        .send(renderPopupCallbackHtml('success', { returnTo }));
    }

    return reply.redirect(returnTo, 302);
  });

  app.get('/session', async (request, reply) => {
    const auth = await requireRequestAuth(request, reply);
    return {
      user: auth.user,
      expiresAt: auth.session.idleExpiresAt.toISOString(),
      absoluteExpiresAt: auth.session.absoluteExpiresAt.toISOString(),
    };
  });

  app.get('/csrf', async (request, reply) => {
    const auth = await requireRequestAuth(request, reply);
    return {
      csrfToken: auth.session.csrfToken,
    };
  });

  app.post('/logout', async (request, reply) => {
    const auth = await requireRequestAuth(request, reply);
    ensureCsrf(request, auth);
    await destroyCurrentSession(request, reply);
    return reply.code(200).send({ ok: true });
  });
}

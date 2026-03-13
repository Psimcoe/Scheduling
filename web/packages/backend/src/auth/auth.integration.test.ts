import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BuildServer = typeof import('../buildServer.js').buildServer;
type PrismaModule = typeof import('../db.js');

const templateDatabasePath = fileURLToPath(
  new URL('../../prisma/dev-template.db', import.meta.url),
);

function toFileDatabaseUrl(pathValue: string): string {
  return `file:${pathValue.replace(/\\/g, '/')}`;
}

async function createHarness() {
  vi.resetModules();

  const tempDir = mkdtempSync(join(tmpdir(), 'schedulesync-auth-'));
  const tempDatabasePath = join(tempDir, 'test.db');
  copyFileSync(templateDatabasePath, tempDatabasePath);

  process.env.DATABASE_URL = toFileDatabaseUrl(tempDatabasePath);
  process.env.SESSION_COOKIE_SECRET = 'test-cookie-secret';
  process.env.OIDC_ISSUER_URL = 'https://issuer.example.com';
  process.env.OIDC_CLIENT_ID = 'test-client-id';
  process.env.OIDC_REDIRECT_URI = 'http://localhost:5173/auth/callback';
  process.env.SCHEDULESYNC_ALLOWED_ORIGINS = 'http://localhost:5173';

  const [{ buildServer }, { prisma }] = (await Promise.all([
    import('../buildServer.js'),
    import('../db.js'),
  ])) as [{ buildServer: BuildServer }, PrismaModule];

  const app = await buildServer({ logger: false });
  await app.ready();

  const cleanup = async () => {
    await app.close();
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  };

  return { app, prisma, cleanup };
}

function extractCookie(response: { headers: Record<string, unknown> }, name: string): string {
  const rawHeader = response.headers['set-cookie'];
  const cookies = Array.isArray(rawHeader) ? rawHeader : rawHeader ? [rawHeader] : [];
  const match = cookies
    .map((entry) => String(entry))
    .find((entry) => entry.startsWith(`${name}=`));

  if (!match) {
    throw new Error(`Cookie ${name} was not set.`);
  }

  return match.split(';', 1)[0];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

describe('auth integration', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let cleanup: (() => Promise<void>) | null = null;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }
    delete process.env.DATABASE_URL;
    delete process.env.SESSION_COOKIE_SECRET;
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_REDIRECT_URI;
    delete process.env.SCHEDULESYNC_ALLOWED_ORIGINS;
    delete process.env.SCHEDULESYNC_DEV_AUTH_BYPASS;
    delete process.env.SCHEDULESYNC_DEV_AUTH_EMAIL;
    delete process.env.SCHEDULESYNC_DEV_AUTH_NAME;
    delete process.env.SCHEDULESYNC_DEV_AUTH_ROLE;
  });

  it('completes login, callback, session lookup, csrf lookup, and logout', async () => {
    const harness = await createHarness();
    cleanup = harness.cleanup;

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            issuer: 'https://issuer.example.com',
            authorization_endpoint: 'https://issuer.example.com/authorize',
            token_endpoint: 'https://issuer.example.com/token',
            userinfo_endpoint: 'https://issuer.example.com/userinfo',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'access-token-1' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sub: 'user-1',
            email: 'admin@example.com',
            name: 'Admin User',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    const loginResponse = await harness.app.inject({
      method: 'GET',
      url: '/auth/login?returnTo=%2Fprojects%2Falpha',
    });

    expect(loginResponse.statusCode).toBe(302);
    expect(loginResponse.headers.location).toContain('https://issuer.example.com/authorize');
    const oidcCookie = extractCookie(loginResponse, 'schedulesync_oidc');
    const loginLocation = new URL(String(loginResponse.headers.location));
    const state = loginLocation.searchParams.get('state');
    expect(state).toBeTruthy();

    const callbackSuccess = await harness.app.inject({
      method: 'GET',
      url: `/auth/callback?code=test-code-2&state=${state}`,
      headers: {
        cookie: oidcCookie,
      },
    });

    expect(callbackSuccess.statusCode).toBe(302);
    const sessionCookie = extractCookie(callbackSuccess, 'schedulesync_session');

    const sessionResponse = await harness.app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(sessionResponse.statusCode).toBe(200);
    const sessionBody = sessionResponse.json() as {
      user: { role: string; email: string | null };
    };
    expect(sessionBody.user.email).toBe('admin@example.com');
    expect(sessionBody.user.role).toBe('admin');

    const csrfResponse = await harness.app.inject({
      method: 'GET',
      url: '/auth/csrf',
      headers: {
        cookie: sessionCookie,
      },
    });
    expect(csrfResponse.statusCode).toBe(200);
    const csrfToken = (csrfResponse.json() as { csrfToken: string }).csrfToken;

    const logoutResponse = await harness.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
    });

    expect(logoutResponse.statusCode).toBe(200);

    const afterLogout = await harness.app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: {
        cookie: sessionCookie,
      },
    });
    expect(afterLogout.statusCode).toBe(401);
    expect(afterLogout.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('rejects callback requests when state validation fails', async () => {
    const harness = await createHarness();
    cleanup = harness.cleanup;

    const response = await harness.app.inject({
      method: 'GET',
      url: '/auth/callback?code=test-code&state=bad-state',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('authError=state_mismatch');
  });

  it('auto-provisions a local admin session when dev auth bypass is enabled', async () => {
    process.env.SCHEDULESYNC_DEV_AUTH_BYPASS = '1';
    process.env.SCHEDULESYNC_DEV_AUTH_EMAIL = 'owner@example.com';
    process.env.SCHEDULESYNC_DEV_AUTH_NAME = 'Local Owner';
    process.env.SCHEDULESYNC_DEV_AUTH_ROLE = 'admin';

    const harness = await createHarness();
    cleanup = harness.cleanup;

    const sessionResponse = await harness.app.inject({
      method: 'GET',
      url: '/auth/session',
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json()).toMatchObject({
      user: {
        email: 'owner@example.com',
        displayName: 'Local Owner',
        role: 'admin',
      },
    });

    const sessionCookie = extractCookie(sessionResponse, 'schedulesync_session');

    const loginResponse = await harness.app.inject({
      method: 'GET',
      url: '/auth/login?returnTo=%2Fprojects',
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(loginResponse.statusCode).toBe(302);
    expect(loginResponse.headers.location).toBe('/projects');
  });

  it('applies CORS allow and deny behavior for configured origins', async () => {
    const harness = await createHarness();
    cleanup = harness.cleanup;

    const allowed = await harness.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:5173',
      },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const denied = await harness.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        origin: 'https://evil.example.com',
      },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate limits repeated auth requests from the same IP', async () => {
    const harness = await createHarness();
    cleanup = harness.cleanup;

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          issuer: 'https://issuer.example.com',
          authorization_endpoint: 'https://issuer.example.com/authorize',
          token_endpoint: 'https://issuer.example.com/token',
          userinfo_endpoint: 'https://issuer.example.com/userinfo',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/auth/login',
      });
      expect(response.statusCode).toBe(302);
    }

    const limited = await harness.app.inject({
      method: 'GET',
      url: '/auth/login',
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('enforces viewer, editor, and admin roles on protected routes', async () => {
    const harness = await createHarness();
    cleanup = harness.cleanup;

    const appWithCookie = harness.app as typeof harness.app & {
      signCookie: (value: string) => string;
    };

    const createSessionCookie = async (role: 'viewer' | 'editor' | 'admin') => {
      const rawToken = `${role}-session-token`;
      const user = await harness.prisma.user.create({
        data: {
          issuer: 'https://issuer.example.com',
          subject: `${role}-subject`,
          email: `${role}@example.com`,
          emailNormalized: `${role}@example.com`,
          displayName: `${role} user`,
          role,
        },
      });
      await harness.prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          csrfToken: `${role}-csrf-token`,
          idleExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
          absoluteExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      });

      return {
        cookieValue: appWithCookie.signCookie(rawToken),
        csrfToken: `${role}-csrf-token`,
      };
    };

    const viewer = await createSessionCookie('viewer');
    const viewerRead = await harness.app.inject({
      method: 'GET',
      url: '/api/projects',
      cookies: {
        schedulesync_session: viewer.cookieValue,
      },
    });
    expect(viewerRead.statusCode).toBe(200);

    const viewerWrite = await harness.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        name: 'Viewer cannot create',
        startDate: '2026-03-12T00:00:00.000Z',
      },
      cookies: {
        schedulesync_session: viewer.cookieValue,
      },
    });
    expect(viewerWrite.statusCode).toBe(403);

    const editor = await createSessionCookie('editor');
    const editorWrite = await harness.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': editor.csrfToken,
      },
      payload: {
        name: 'Editor project',
        startDate: '2026-03-12T00:00:00.000Z',
      },
      cookies: {
        schedulesync_session: editor.cookieValue,
      },
    });
    expect(editorWrite.statusCode).toBe(201);

    const editorAdminRoute = await harness.app.inject({
      method: 'GET',
      url: '/api/ai/config',
      cookies: {
        schedulesync_session: editor.cookieValue,
      },
    });
    expect(editorAdminRoute.statusCode).toBe(403);

    const admin = await createSessionCookie('admin');
    const adminRoute = await harness.app.inject({
      method: 'GET',
      url: '/api/ai/config',
      cookies: {
        schedulesync_session: admin.cookieValue,
      },
    });
    expect(adminRoute.statusCode).toBe(200);
  });
});

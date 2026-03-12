import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { runtimeConfig } from '../runtimeConfig.js';
import type { AuthRole, RequestAuthContext } from './types.js';

const SESSION_IDLE_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const AUTH_STATE_TTL_SECONDS = 10 * 60;
const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_ABSOLUTE_TTL_MS / 1000;

const ROLE_RANK: Record<AuthRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
}

interface OidcIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  displayName: string;
}

interface StoredOidcState {
  state: string;
  codeVerifier: string;
  returnTo: string;
  mode: 'redirect' | 'popup';
}

let discoveryCache:
  | {
      issuerUrl: string;
      fetchedAt: number;
      document: OidcDiscoveryDocument;
    }
  | null = null;

export class AuthHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function ensureCookieSecretConfigured(): void {
  if (runtimeConfig.auth.sessionCookieSecret) {
    return;
  }

  throw new AuthHttpError(
    503,
    'AUTH_NOT_CONFIGURED',
    'Authentication is not configured for this environment.',
  );
}

export function isOidcConfigured(): boolean {
  return Boolean(
    runtimeConfig.auth.oidc.issuerUrl &&
      runtimeConfig.auth.oidc.clientId &&
      runtimeConfig.auth.oidc.redirectUri &&
      runtimeConfig.auth.sessionCookieSecret,
  );
}

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function buildOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function buildPkceChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: runtimeConfig.isProduction,
    path: '/',
  };
}

function setSignedCookie(
  reply: FastifyReply,
  name: string,
  value: string,
  options: Partial<ReturnType<typeof getCookieOptions>> & { maxAge?: number } = {},
): void {
  ensureCookieSecretConfigured();
  reply.setCookie(name, value, {
    ...getCookieOptions(),
    signed: true,
    maxAge: options.maxAge,
    ...options,
  });
}

function clearSignedCookie(reply: FastifyReply, name: string): void {
  ensureCookieSecretConfigured();
  reply.clearCookie(name, {
    ...getCookieOptions(),
    signed: true,
  });
}

function getSignedCookieValue(request: FastifyRequest, name: string): string | null {
  ensureCookieSecretConfigured();
  const rawValue = request.cookies[name];
  if (!rawValue) {
    return null;
  }

  const result = request.unsignCookie(rawValue);
  return result.valid ? result.value : null;
}

async function getDiscoveryDocument(): Promise<OidcDiscoveryDocument> {
  const issuerUrl = runtimeConfig.auth.oidc.issuerUrl;
  if (!issuerUrl) {
    throw new AuthHttpError(
      503,
      'AUTH_NOT_CONFIGURED',
      'OIDC discovery is not configured.',
    );
  }

  const now = Date.now();
  if (
    discoveryCache &&
    discoveryCache.issuerUrl === issuerUrl &&
    now - discoveryCache.fetchedAt < 5 * 60 * 1000
  ) {
    return discoveryCache.document;
  }

  const response = await fetch(
    `${issuerUrl.replace(/\/+$/, '')}/.well-known/openid-configuration`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new AuthHttpError(
      502,
      'OIDC_DISCOVERY_FAILED',
      `OIDC discovery failed with status ${response.status}.`,
    );
  }

  const document = (await response.json()) as OidcDiscoveryDocument;
  if (!document.authorization_endpoint || !document.token_endpoint || !document.issuer) {
    throw new AuthHttpError(
      502,
      'OIDC_DISCOVERY_INVALID',
      'OIDC discovery did not return the required endpoints.',
    );
  }

  discoveryCache = {
    issuerUrl,
    fetchedAt: now,
    document,
  };

  return document;
}

async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<{ accessToken: string; discovery: OidcDiscoveryDocument }> {
  const clientId = runtimeConfig.auth.oidc.clientId;
  const redirectUri = runtimeConfig.auth.oidc.redirectUri;
  if (!clientId || !redirectUri) {
    throw new AuthHttpError(
      503,
      'AUTH_NOT_CONFIGURED',
      'OIDC client settings are not configured.',
    );
  }

  const discovery = await getDiscoveryDocument();
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  });

  if (runtimeConfig.auth.oidc.clientSecret) {
    form.set('client_secret', runtimeConfig.auth.oidc.clientSecret);
  }

  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!response.ok) {
    throw new AuthHttpError(
      502,
      'OIDC_TOKEN_EXCHANGE_FAILED',
      `OIDC token exchange failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new AuthHttpError(
      502,
      'OIDC_TOKEN_EXCHANGE_INVALID',
      'OIDC token exchange did not return an access token.',
    );
  }

  return {
    accessToken: payload.access_token,
    discovery,
  };
}

async function fetchIdentity(
  accessToken: string,
  discovery: OidcDiscoveryDocument,
): Promise<OidcIdentity> {
  if (!discovery.userinfo_endpoint) {
    throw new AuthHttpError(
      502,
      'OIDC_USERINFO_UNAVAILABLE',
      'OIDC discovery did not expose a userinfo endpoint.',
    );
  }

  const response = await fetch(discovery.userinfo_endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new AuthHttpError(
      502,
      'OIDC_USERINFO_FAILED',
      `OIDC userinfo lookup failed with status ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    preferred_username?: string;
  };

  if (!payload.sub) {
    throw new AuthHttpError(
      502,
      'OIDC_USERINFO_INVALID',
      'OIDC userinfo did not return a subject identifier.',
    );
  }

  const email = normalizeEmail(payload.email);
  const displayName =
    payload.name?.trim() ||
    payload.preferred_username?.trim() ||
    email ||
    payload.sub;

  return {
    issuer: discovery.issuer,
    subject: payload.sub,
    email,
    displayName,
  };
}

function resolveBootstrapRole(email: string | null, hasExistingAdmins: boolean): AuthRole {
  if (email && runtimeConfig.auth.oidc.adminEmails.includes(email)) {
    return 'admin';
  }

  if (!hasExistingAdmins) {
    return 'admin';
  }

  return 'viewer';
}

async function upsertUser(identity: OidcIdentity) {
  const existing = await prisma.user.findUnique({
    where: {
      issuer_subject: {
        issuer: identity.issuer,
        subject: identity.subject,
      },
    },
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        email: identity.email,
        emailNormalized: identity.email,
        displayName: identity.displayName,
        lastLoginAt: new Date(),
      },
    });
  }

  const existingAdminCount = await prisma.user.count({
    where: { role: 'admin' },
  });

  return prisma.user.create({
    data: {
      issuer: identity.issuer,
      subject: identity.subject,
      email: identity.email,
      emailNormalized: identity.email,
      displayName: identity.displayName,
      role: resolveBootstrapRole(identity.email, existingAdminCount > 0),
      lastLoginAt: new Date(),
    },
  });
}

export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string') {
    return '/';
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }

  return value;
}

export function beginOidcLogin(
  reply: FastifyReply,
  options: { returnTo: string; mode: 'redirect' | 'popup' },
  discovery: OidcDiscoveryDocument,
): string {
  const clientId = runtimeConfig.auth.oidc.clientId;
  const redirectUri = runtimeConfig.auth.oidc.redirectUri;
  if (!clientId || !redirectUri) {
    throw new AuthHttpError(
      503,
      'AUTH_NOT_CONFIGURED',
      'OIDC client settings are not configured.',
    );
  }

  const state = buildOpaqueToken(24);
  const codeVerifier = buildOpaqueToken(48);
  const challenge = buildPkceChallenge(codeVerifier);
  const payload: StoredOidcState = {
    state,
    codeVerifier,
    returnTo: sanitizeReturnTo(options.returnTo),
    mode: options.mode,
  };

  setSignedCookie(
    reply,
    runtimeConfig.auth.oidcStateCookieName,
    JSON.stringify(payload),
    { maxAge: AUTH_STATE_TTL_SECONDS },
  );

  const authorizationUrl = new URL(discovery.authorization_endpoint);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('scope', runtimeConfig.auth.oidc.scopes);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  return authorizationUrl.toString();
}

export function consumeOidcState(
  request: FastifyRequest,
  reply: FastifyReply,
): StoredOidcState | null {
  const rawPayload = getSignedCookieValue(request, runtimeConfig.auth.oidcStateCookieName);
  clearSignedCookie(reply, runtimeConfig.auth.oidcStateCookieName);
  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as StoredOidcState;
    if (
      parsed.state &&
      parsed.codeVerifier &&
      parsed.returnTo &&
      (parsed.mode === 'redirect' || parsed.mode === 'popup')
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function setSessionCookie(reply: FastifyReply, rawToken: string): void {
  setSignedCookie(reply, runtimeConfig.auth.cookieName, rawToken, {
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  clearSignedCookie(reply, runtimeConfig.auth.cookieName);
}

export async function createSessionFromAuthorizationCode(
  request: FastifyRequest,
  reply: FastifyReply,
  code: string,
  codeVerifier: string,
): Promise<RequestAuthContext> {
  const existingToken = getSignedCookieValue(request, runtimeConfig.auth.cookieName);
  if (existingToken) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashOpaqueToken(existingToken) },
    });
  }

  const { accessToken, discovery } = await exchangeAuthorizationCode(code, codeVerifier);
  const identity = await fetchIdentity(accessToken, discovery);
  const user = await upsertUser(identity);

  const rawSessionToken = buildOpaqueToken(32);
  const now = new Date();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaqueToken(rawSessionToken),
      csrfToken: buildOpaqueToken(24),
      userAgent: request.headers['user-agent']?.slice(0, 512) ?? null,
      ipAddress: request.ip,
      idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_TTL_MS),
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
      lastSeenAt: now,
    },
  });

  setSessionCookie(reply, rawSessionToken);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role as AuthRole,
    },
    session: {
      id: session.id,
      csrfToken: session.csrfToken,
      lastSeenAt: session.lastSeenAt,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    },
  };
}

async function deleteSessionByTokenHash(tokenHash: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { tokenHash },
  });
}

async function touchSessionIfNeeded(auth: RequestAuthContext): Promise<RequestAuthContext> {
  const now = Date.now();
  if (now - auth.session.lastSeenAt.getTime() < SESSION_TOUCH_INTERVAL_MS) {
    return auth;
  }

  const absoluteExpiresAtMs = auth.session.absoluteExpiresAt.getTime();
  const nextIdleExpiresAt = new Date(
    Math.min(absoluteExpiresAtMs, now + SESSION_IDLE_TTL_MS),
  );

  const session = await prisma.session.update({
    where: { id: auth.session.id },
    data: {
      lastSeenAt: new Date(now),
      idleExpiresAt: nextIdleExpiresAt,
    },
  });

  return {
    ...auth,
    session: {
      ...auth.session,
      lastSeenAt: session.lastSeenAt,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    },
  };
}

export async function resolveRequestAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<RequestAuthContext | null> {
  ensureCookieSecretConfigured();
  const rawSessionToken = getSignedCookieValue(request, runtimeConfig.auth.cookieName);
  if (!rawSessionToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashOpaqueToken(rawSessionToken) },
    include: { user: true },
  });

  if (!session) {
    clearSessionCookie(reply);
    return null;
  }

  const now = Date.now();
  if (
    session.idleExpiresAt.getTime() <= now ||
    session.absoluteExpiresAt.getTime() <= now
  ) {
    await deleteSessionByTokenHash(session.tokenHash);
    clearSessionCookie(reply);
    return null;
  }

  const auth = await touchSessionIfNeeded({
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      role: session.user.role as AuthRole,
    },
    session: {
      id: session.id,
      csrfToken: session.csrfToken,
      lastSeenAt: session.lastSeenAt,
      idleExpiresAt: session.idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    },
  });

  request.auth = auth;
  return auth;
}

export async function requireRequestAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<RequestAuthContext> {
  const auth = request.auth ?? (await resolveRequestAuth(request, reply));
  if (!auth) {
    throw new AuthHttpError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  return auth;
}

export function ensureCsrf(request: FastifyRequest, auth: RequestAuthContext): void {
  const rawHeader = request.headers['x-csrf-token'];
  const csrfToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!csrfToken || csrfToken !== auth.session.csrfToken) {
    throw new AuthHttpError(403, 'FORBIDDEN', 'A valid CSRF token is required.');
  }
}

export function hasRequiredRole(currentRole: AuthRole, requiredRole: AuthRole): boolean {
  return ROLE_RANK[currentRole] >= ROLE_RANK[requiredRole];
}

export async function destroyCurrentSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  ensureCookieSecretConfigured();
  const rawSessionToken = getSignedCookieValue(request, runtimeConfig.auth.cookieName);
  if (!rawSessionToken) {
    clearSessionCookie(reply);
    return;
  }

  await deleteSessionByTokenHash(hashOpaqueToken(rawSessionToken));
  clearSessionCookie(reply);
}

export async function getOidcLoginUrl(
  reply: FastifyReply,
  options: { returnTo: string; mode: 'redirect' | 'popup' },
): Promise<string> {
  if (!isOidcConfigured()) {
    throw new AuthHttpError(
      503,
      'AUTH_NOT_CONFIGURED',
      'OIDC is not configured for this environment.',
    );
  }

  const discovery = await getDiscoveryDocument();
  return beginOidcLogin(reply, options, discovery);
}

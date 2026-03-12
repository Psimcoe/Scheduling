# ScheduleSync Web Workspace

## Scope
- These instructions apply to the `web/` workspace, not the legacy VSTO add-in.
- The launch target is the React/Fastify web app only.
- Keep the current architecture: React 19 + Vite frontend, Fastify 5 backend, Prisma with SQLite for local deployment, single-organization auth. Do not replatform to another stack and do not add multi-tenancy in this phase.

## Stack Contract
- Frontend: React 19, TypeScript, Vite, MUI, TanStack Query, Zustand.
- Backend: Fastify 5, TypeScript, Prisma, SQLite in development, Postgres-ready schema.
- Shared libraries: keep scheduling logic in `packages/engine` and MSPDI logic in `packages/mspdi`.

## Architecture Rules
- Preserve separation of concerns:
  - route handlers validate/authorize and delegate,
  - services contain business logic,
  - Prisma/data-access code stays out of UI code and should stay out of route handlers when the logic is non-trivial.
- Keep backend request paths async and non-blocking. Do not introduce synchronous filesystem or CPU-heavy work in request handlers.
- Preserve the existing TanStack Query plus Zustand optimistic queue model. Make auth/session behavior integrate with it instead of replacing it.
- Keep heavy dialogs, AI panels, import flows, and Stratus flows behind lazy boundaries. Do not broaden initial bundle cost without a clear reason.

## Security Requirements
- Validate every server-side request boundary. For params, query strings, headers, cookies, and bodies, use Fastify schemas and/or `zod` with explicit types and bounded input sizes.
- Never trust frontend-only checks for authorization. Server routes must enforce RBAC with `viewer`, `editor`, and `admin`.
- Do not hardcode secrets, tokens, API keys, passwords, or client secrets. Use environment variables or a secret manager.
- Cookie-authenticated mutations must require CSRF protection with `X-CSRF-Token`. Do not remove or weaken that requirement.
- Keep CORS least-privilege. Use `SCHEDULESYNC_ALLOWED_ORIGINS`; do not restore permissive reflection such as `origin: true`.
- Keep session cookies `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Do not move auth tokens into `localStorage` or other JS-accessible storage.
- Avoid CWE-89 and CWE-79 patterns explicitly:
  - no SQL string concatenation with untrusted input,
  - no raw HTML insertion of untrusted content,
  - no unsafe redirect targets without strict allowlists,
  - no unvalidated `postMessage` origins or wildcard `targetOrigin` in auth flows.
- Redact or avoid logging session IDs, tokens, cookies, auth codes, PKCE material, and other sensitive auth fields.

## Performance Rules
- Prefer incremental changes over broad rewrites.
- Keep query invalidation targeted and avoid unnecessary full-app refetches.
- Preserve lazy loading for large dialogs and routes.
- Avoid adding new heavyweight dependencies without a concrete need.

## Testing And Delivery
- Every substantive change should include relevant automated tests.
- Auth and security changes should add or update backend integration tests for session flow, RBAC, CSRF, CORS, and rate limiting where applicable.
- Frontend auth changes should test bootstrap, `401`/`403` handling, optimistic queue rollback/resume behavior, and CSRF token attachment.
- Before considering work complete, make sure `pnpm lint`, `pnpm test`, and `pnpm build` pass in `web/`.

## Preferred Output Style
- Produce focused diffs that fit the existing codebase instead of speculative rewrites.
- Mention important security and performance tradeoffs when they are affected.
- If a request conflicts with these constraints, explain the conflict and choose the safest implementation that still meets the requirement.

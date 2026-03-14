import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

type BuildServer = typeof import("../buildServer.js").buildServer;
type PrismaModule = typeof import("../db.js");

const templateDatabasePath = fileURLToPath(
  new URL("../../prisma/dev-template.db", import.meta.url),
);

function toFileDatabaseUrl(pathValue: string): string {
  return `file:${pathValue.replace(/\\/g, "/")}`;
}

async function createHarness(role: "viewer" | "editor" | "admin" = "admin") {
  vi.resetModules();

  const tempDir = mkdtempSync(join(tmpdir(), "schedulesync-dev-routes-"));
  const tempDatabasePath = join(tempDir, "test.db");
  copyFileSync(templateDatabasePath, tempDatabasePath);

  process.env.DATABASE_URL = toFileDatabaseUrl(tempDatabasePath);
  process.env.SESSION_COOKIE_SECRET = "test-cookie-secret";
  process.env.SCHEDULESYNC_DEV_AUTH_BYPASS = "1";
  process.env.SCHEDULESYNC_DEV_AUTH_ROLE = role;

  const [{ buildServer }, { prisma }] = (await Promise.all([
    import("../buildServer.js"),
    import("../db.js"),
  ])) as [{ buildServer: BuildServer }, PrismaModule];

  const app = await buildServer({ logger: false });
  await app.ready();

  const cleanup = async () => {
    await app.close();
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  };

  return { app, prisma, cleanup, tempDatabasePath };
}

function extractCookie(
  response: { headers: Record<string, unknown> },
  name: string,
): string {
  const rawHeader = response.headers["set-cookie"];
  const cookies = Array.isArray(rawHeader) ? rawHeader : rawHeader ? [rawHeader] : [];
  const match = cookies
    .map((entry) => String(entry))
    .find((entry) => entry.startsWith(`${name}=`));

  if (!match) {
    throw new Error(`Cookie ${name} was not set.`);
  }

  return match.split(";", 1)[0];
}

async function createAuthHeaders(app: Awaited<ReturnType<typeof createHarness>>["app"]) {
  const sessionResponse = await app.inject({
    method: "GET",
    url: "/auth/session",
  });
  expect(sessionResponse.statusCode).toBe(200);

  const sessionCookie = extractCookie(sessionResponse, "schedulesync_session");
  const csrfResponse = await app.inject({
    method: "GET",
    url: "/auth/csrf",
    headers: {
      cookie: sessionCookie,
    },
  });
  expect(csrfResponse.statusCode).toBe(200);
  const { csrfToken } = csrfResponse.json<{ csrfToken: string }>();

  return {
    cookie: sessionCookie,
    "x-csrf-token": csrfToken,
  };
}

describe("dev routes integration", () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }

    delete process.env.DATABASE_URL;
    delete process.env.SESSION_COOKIE_SECRET;
    delete process.env.SCHEDULESYNC_DEV_AUTH_BYPASS;
    delete process.env.SCHEDULESYNC_DEV_AUTH_ROLE;
  });

  it("allows admins to fetch diagnostics and reset legacy mode idempotently", async () => {
    const harness = await createHarness("admin");
    cleanup = harness.cleanup;
    const diagnostics = await import("../services/devDiagnosticsService.js");
    diagnostics.clearDevDiagnosticsEntriesForTests();

    await harness.prisma.project.create({
      data: {
        id: "project-dev-1",
        name: "Developer Test Project",
        revision: 4,
        startDate: new Date("2026-03-01T08:00:00.000Z"),
        defaultCalendarId: "calendar-dev-1",
        stratusLocalMetadataVersion: 1,
        stratusProjectId: "stratus-project-1",
        stratusModelId: "model-1",
        stratusPackageWhere: "status eq 1",
        stratusLastPullAt: new Date("2026-03-02T08:00:00.000Z"),
      },
    });

    diagnostics.recordDevDiagnosticsEntry({
      level: "warn",
      type: "rateLimitRetry",
      projectId: "project-dev-1",
      message: "Stratus request rate limited.",
      details: { attempt: 0, delayMs: 2000 },
    });
    diagnostics.recordDevDiagnosticsEntry({
      level: "info",
      type: "seedUpgrade",
      projectId: "project-dev-1",
      message: "Legacy seed upgrade completed.",
      details: { jobId: "job-1" },
    });

    const headers = await createAuthHeaders(harness.app);
    const diagnosticsResponse = await harness.app.inject({
      method: "GET",
      url: "/api/dev/diagnostics?projectId=project-dev-1&limit=10",
      headers,
    });

    expect(diagnosticsResponse.statusCode).toBe(200);
    const diagnosticsBody = diagnosticsResponse.json<{
      database: { path: string; totalBytes: number };
      project: { id: string; stratusLocalMetadataVersion: number };
      highlights: { rateLimitRetryCount: number; seedUpgradeCount: number };
      logs: Array<{ message: string }>;
    }>();
    expect(diagnosticsBody.database.path.replace(/\\/g, "/")).toBe(
      harness.tempDatabasePath.replace(/\\/g, "/"),
    );
    expect(diagnosticsBody.database.totalBytes).toBeGreaterThan(0);
    expect(diagnosticsBody.project).toMatchObject({
      id: "project-dev-1",
      stratusLocalMetadataVersion: 1,
    });
    expect(diagnosticsBody.highlights).toEqual({
      rateLimitRetryCount: 1,
      seedUpgradeCount: 1,
    });
    expect(diagnosticsBody.logs.map((entry) => entry.message)).toEqual([
      "Legacy seed upgrade completed.",
      "Stratus request rate limited.",
    ]);

    const resetResponse = await harness.app.inject({
      method: "POST",
      url: "/api/dev/projects/project-dev-1/reset-legacy-mode",
      headers,
    });
    expect(resetResponse.statusCode).toBe(200);
    const resetBody = resetResponse.json<{
      projectId: string;
      revision: number;
      stratusLocalMetadataVersion: number;
      snapshot: { project: { stratusLocalMetadataVersion: number; revision: number } };
    }>();
    expect(resetBody).toMatchObject({
      projectId: "project-dev-1",
      revision: 5,
      stratusLocalMetadataVersion: 0,
      snapshot: {
        project: {
          stratusLocalMetadataVersion: 0,
          revision: 5,
        },
      },
    });

    const secondResetResponse = await harness.app.inject({
      method: "POST",
      url: "/api/dev/projects/project-dev-1/reset-legacy-mode",
      headers,
    });
    expect(secondResetResponse.statusCode).toBe(200);
    const secondResetBody = secondResetResponse.json<{ revision: number }>();
    expect(secondResetBody.revision).toBe(5);
  });

  it.each(["viewer", "editor"] as const)(
    "rejects %s users from developer routes",
    async (role) => {
      const harness = await createHarness(role);
      cleanup = harness.cleanup;
      const headers = await createAuthHeaders(harness.app);

      const diagnosticsResponse = await harness.app.inject({
        method: "GET",
        url: "/api/dev/diagnostics?projectId=project-dev-1",
        headers,
      });
      expect(diagnosticsResponse.statusCode).toBe(403);
      expect(diagnosticsResponse.json()).toMatchObject({
        code: "FORBIDDEN",
      });

      const resetResponse = await harness.app.inject({
        method: "POST",
        url: "/api/dev/projects/project-dev-1/reset-legacy-mode",
        headers,
      });
      expect(resetResponse.statusCode).toBe(403);
      expect(resetResponse.json()).toMatchObject({
        code: "FORBIDDEN",
      });
    },
  );

  it("returns 400 when diagnostics requests omit projectId", async () => {
    const harness = await createHarness("admin");
    cleanup = harness.cleanup;
    const headers = await createAuthHeaders(harness.app);

    const response = await harness.app.inject({
      method: "GET",
      url: "/api/dev/diagnostics",
      headers,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("returns 404 when diagnostics target an unknown project", async () => {
    const harness = await createHarness("admin");
    cleanup = harness.cleanup;
    const headers = await createAuthHeaders(harness.app);

    const diagnosticsResponse = await harness.app.inject({
      method: "GET",
      url: "/api/dev/diagnostics?projectId=missing-project",
      headers,
    });
    expect(diagnosticsResponse.statusCode).toBe(404);

    const resetResponse = await harness.app.inject({
      method: "POST",
      url: "/api/dev/projects/missing-project/reset-legacy-mode",
      headers,
    });
    expect(resetResponse.statusCode).toBe(404);
  });
});

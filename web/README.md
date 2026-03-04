# ScheduleSync — Web App

A Microsoft Project-style web scheduling application featuring a task grid, Gantt chart,
CPM scheduling engine, MSPDI import/export, and update import from CSV/JSON sources.

## Architecture

```
packages/
  engine/      Pure TypeScript scheduling engine (calendar, CPM, validation, parsers)
  mspdi/       MSPDI (XML) import/export
  backend/     Fastify REST API + Prisma/SQLite
  frontend/    React 19 + MUI 6 + Zustand + Vite
```

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)

## Getting Started

```bash
# 1. Install all dependencies
cd web
pnpm install

# 2. Generate Prisma client
pnpm --filter @schedulesync/backend exec prisma generate

# 3. Create / migrate the SQLite database
pnpm --filter @schedulesync/backend exec prisma db push

# 4. Build all packages (engine → mspdi → backend/frontend)
pnpm build

# 5. Start both backend & frontend in dev mode
pnpm dev
```

The backend runs on **http://localhost:3001** and the frontend on **http://localhost:5173**
(with API requests proxied to the backend).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start backend + frontend in watch mode |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all unit tests (vitest) |
| `pnpm test:e2e` | Run Playwright end-to-end tests |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Format source files with Prettier |

## Packages

### `@schedulesync/engine`

Isomorphic TypeScript library containing:

- **Calendar** — working-time calculations with support for custom calendars, exceptions, and non-standard hours.
- **Scheduler (CPM)** — forward pass, backward pass, critical path, summary rollup, all four link types (FS/SS/FF/SF) with lag.
- **Validation** — task change validation (summary tasks blocked, constraint warnings, percent range checks) and diff computation.
- **Import orchestrator** — 3-phase apply: validate → diff → apply with undo support.
- **Parsers** — CSV, JSON, and Stratus CSV update sources with status-to-percent mapping.
- **Logging** — audit log export (CSV/JSON).

### `@schedulesync/mspdi`

MSPDI (Microsoft Project XML) import/export:

- Full round-trip support: tasks, calendars, dependencies, resources, assignments, baselines.
- ISO 8601 duration ↔ minutes conversion.
- Field mapping between MSPDI XML values and engine enums.

### `@schedulesync/backend`

Fastify REST API:

- **Prisma** ORM with SQLite (development) — Postgres-ready schema.
- CRUD routes for projects, tasks, dependencies, calendars, resources, assignments, baselines.
- MSPDI import (file upload) and export (XML download).
- CSV/JSON update import with preview/diff/apply workflow.
- Snapshot-based undo/redo (100 levels).
- Auto-recalculate via engine after changes.

### `@schedulesync/frontend`

React SPA with Microsoft Project-style UI:

- **Task Grid** — inline editing, WBS indentation, expand/collapse summaries, selection.
- **Gantt Chart** — zoomable timeline (day → year), dependency arrows, baseline ghost bars, critical path highlighting, today line.
- **Split View** — resizable divider between grid and Gantt.
- **Toolbar** — ribbon-style: add/delete tasks, indent/outdent, link/unlink, undo/redo, import/export, baseline capture.
- **Dialogs** — task info, project info, baseline capture, import preview.
- **Sidebar** — project list and creation.

## Testing

```bash
# Run engine + mspdi unit tests
pnpm --filter @schedulesync/engine test
pnpm --filter @schedulesync/mspdi test

# Run all tests
pnpm test
```

## Project Context

This web app coexists in the same monorepo as the **ScheduleSync VSTO Add-in** (C# / .NET) at the repository root.
The C# project provides a Microsoft Project Desktop integration, while this web app provides the same
scheduling capabilities in a browser. The TypeScript engine is a port of the C# `ScheduleSync.Core` library.

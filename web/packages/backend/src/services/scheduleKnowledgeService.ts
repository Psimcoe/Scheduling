/**
 * Local schedule knowledge and RAG service.
 *
 * Builds SQLite-backed schedule chunks for past projects, keeps an FTS5 index
 * in sync, and retrieves cited evidence for AI prompts and UI display.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { buildTaskSignature, tokenizeSignature, type ProjectMetadata } from './aiLearningService.js';

const CHUNK_REBUILD_DEBOUNCE_MS = 750;
const FTS_TABLE_NAME = 'AiScheduleChunkFts';
const MAX_RETRIEVED_CHUNKS = 5;

let ftsInitPromise: Promise<void> | null = null;
const rebuildTimers = new Map<string, ReturnType<typeof setTimeout>>();
let rebuildQueue: Promise<void> = Promise.resolve();

interface ChunkRecord {
  id: string;
  projectId: string;
  chunkType: string;
  title: string;
  content: string;
  taskRefs: string | null;
  dependencyRefs: string | null;
  signatures: string | null;
  projectType: string | null;
  sector: string | null;
  region: string | null;
  scoreContext: string;
}

interface CitationCandidate {
  chunkId: string;
  projectId: string;
  projectName: string;
  title: string;
  content: string;
  chunkType: string;
  projectType: string | null;
  sector: string | null;
  region: string | null;
}

export interface AiCitation {
  chunkId: string;
  projectId: string;
  projectName: string;
  title: string;
  excerpt: string;
  score: number;
}

export function rerankScheduleCitations(
  candidates: CitationCandidate[],
  metadata: ProjectMetadata,
  queryText: string,
): AiCitation[] {
  const queryTokens = tokenizeSignature(queryText);

  return candidates
    .map((candidate, index) => {
      let score = Math.max(0, 6 - index);

      const contentTokens = new Set(tokenizeSignature(`${candidate.title} ${candidate.content}`));
      const overlap = queryTokens.filter((token) => contentTokens.has(token)).length;
      score += overlap * 2;

      if (metadata.projectType && metadata.projectType === candidate.projectType) score += 2;
      if (metadata.sector && metadata.sector === candidate.sector) score += 1.5;
      if (metadata.region && metadata.region === candidate.region) score += 1.5;

      if (queryText.toLowerCase().includes('depend') && candidate.chunkType === 'dependency-pattern') {
        score += 2;
      }
      if (queryText.toLowerCase().includes('duration') && candidate.chunkType === 'outcome-summary') {
        score += 1.5;
      }

      return {
        chunkId: candidate.chunkId,
        projectId: candidate.projectId,
        projectName: candidate.projectName,
        title: candidate.title,
        excerpt: buildExcerpt(candidate.content, queryTokens),
        score: Math.round(score * 10) / 10,
      } satisfies AiCitation;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RETRIEVED_CHUNKS);
}

export async function initializeScheduleKnowledge(): Promise<void> {
  await ensureChunkIndex();
  const projects = await prisma.project.findMany({ select: { id: true } });
  for (const project of projects) {
    markProjectKnowledgeDirty(project.id);
  }
}

export function markProjectKnowledgeDirty(projectId: string): void {
  const existing = rebuildTimers.get(projectId);
  if (existing) {
    clearTimeout(existing);
  }

  rebuildTimers.set(
    projectId,
    setTimeout(() => {
      rebuildTimers.delete(projectId);
      rebuildQueue = rebuildQueue
        .catch(() => undefined)
        .then(() => rebuildProjectScheduleChunks(projectId))
        .catch((err) => {
          console.error(
            `[ScheduleKnowledgeService] Failed to rebuild chunks for ${projectId}:`,
            err,
          );
        });
    }, CHUNK_REBUILD_DEBOUNCE_MS),
  );
}

export async function removeProjectKnowledge(projectId: string): Promise<void> {
  await ensureChunkIndex();
  const existingChunkIds = await prisma.aiScheduleChunk.findMany({
    where: { projectId },
    select: { id: true },
  });

  for (const chunk of existingChunkIds) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${FTS_TABLE_NAME}" WHERE chunkId = ?`, chunk.id);
  }

  await prisma.aiScheduleChunk.deleteMany({ where: { projectId } });
}

export async function retrieveScheduleCitations(
  projectId: string,
  queryText: string,
  limit = MAX_RETRIEVED_CHUNKS,
): Promise<AiCitation[]> {
  await ensureChunkIndex();
  const currentProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectType: true, sector: true, region: true },
  });

  if (!currentProject) {
    return [];
  }

  const ftsQuery = buildFtsQuery(queryText);
  let candidates: CitationCandidate[] = [];

  if (ftsQuery) {
    candidates = await prisma.$queryRawUnsafe<CitationCandidate[]>(
      `
        SELECT
          c.id as chunkId,
          c.projectId as projectId,
          p.name as projectName,
          c.title as title,
          c.content as content,
          c.chunkType as chunkType,
          c.projectType as projectType,
          c.sector as sector,
          c.region as region
        FROM "${FTS_TABLE_NAME}" f
        JOIN "AiScheduleChunk" c ON c.id = f.chunkId
        JOIN "Project" p ON p.id = c.projectId
        WHERE f MATCH ?
          AND c.projectId <> ?
        LIMIT ?
      `,
      ftsQuery,
      projectId,
      Math.max(limit * 4, 20),
    );
  }

  if (candidates.length === 0) {
    candidates = await prisma.aiScheduleChunk.findMany({
      where: {
        projectId: { not: projectId },
        OR: [
          {
            AND: [
              { projectType: currentProject.projectType ?? null },
              { sector: currentProject.sector ?? null },
              { region: currentProject.region ?? null },
            ],
          },
          {
            AND: [{ projectType: null }, { sector: null }, { region: null }],
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(limit * 3, 12),
      select: {
        id: true,
        projectId: true,
        title: true,
        content: true,
        chunkType: true,
        projectType: true,
        sector: true,
        region: true,
        project: {
          select: { name: true },
        },
      },
    }).then((rows) =>
      rows.map((row) => ({
        chunkId: row.id,
        projectId: row.projectId,
        projectName: row.project.name,
        title: row.title,
        content: row.content,
        chunkType: row.chunkType,
        projectType: row.projectType,
        sector: row.sector,
        region: row.region,
      })),
    );
  }

  return rerankScheduleCitations(candidates, currentProject, queryText).slice(0, limit);
}

export function formatCitationContext(citations: AiCitation[]): string {
  if (citations.length === 0) {
    return '';
  }

  return [
    'Past schedule evidence:',
    ...citations.map(
      (citation, index) =>
        `${index + 1}. ${citation.projectName} - ${citation.title}: ${citation.excerpt}`,
    ),
  ].join('\n');
}

async function ensureChunkIndex(): Promise<void> {
  if (ftsInitPromise) {
    return ftsInitPromise;
  }

  ftsInitPromise = prisma.$executeRawUnsafe(
    `CREATE VIRTUAL TABLE IF NOT EXISTS "${FTS_TABLE_NAME}" USING fts5(chunkId UNINDEXED, title, content, signatures, projectType, sector, region)`,
  ).then(() => undefined);

  return ftsInitPromise;
}

async function rebuildProjectScheduleChunks(projectId: string): Promise<void> {
  await ensureChunkIndex();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          type: true,
          parentId: true,
          outlineLevel: true,
          durationMinutes: true,
          percentComplete: true,
          isCritical: true,
          actualDurationMinutes: true,
          actualFinish: true,
        },
      },
      dependencies: {
        select: {
          id: true,
          fromTaskId: true,
          toTaskId: true,
          type: true,
        },
      },
    },
  });

  if (!project) {
    return;
  }

  const existingChunkIds = await prisma.aiScheduleChunk.findMany({
    where: { projectId },
    select: { id: true },
  });

  for (const chunk of existingChunkIds) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${FTS_TABLE_NAME}" WHERE chunkId = ?`, chunk.id);
  }

  await prisma.aiScheduleChunk.deleteMany({ where: { projectId } });

  const chunkRows = buildChunkRows(project);
  if (chunkRows.length === 0) {
    return;
  }

  await prisma.aiScheduleChunk.createMany({ data: chunkRows });

  for (const chunk of chunkRows) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${FTS_TABLE_NAME}" (chunkId, title, content, signatures, projectType, sector, region) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      chunk.id,
      chunk.title,
      chunk.content,
      chunk.signatures ?? '',
      chunk.projectType ?? '',
      chunk.sector ?? '',
      chunk.region ?? '',
    );
  }
}

function buildChunkRows(project: {
  id: string;
  name: string;
  projectType: string | null;
  sector: string | null;
  region: string | null;
  tasks: Array<{
    id: string;
    name: string;
    type: string;
    parentId: string | null;
    outlineLevel: number;
    durationMinutes: number;
    percentComplete: number;
    isCritical: boolean;
    actualDurationMinutes: number;
    actualFinish: Date | null;
  }>;
  dependencies: Array<{
    id: string;
    fromTaskId: string;
    toTaskId: string;
    type: string;
  }>;
}): ChunkRecord[] {
  const metadata = {
    projectType: normalizeNullable(project.projectType),
    sector: normalizeNullable(project.sector),
    region: normalizeNullable(project.region),
  };
  const rows: ChunkRecord[] = [];
  const taskMap = new Map(project.tasks.map((task) => [task.id, task]));
  const taskSignatures = project.tasks
    .filter((task) => task.type !== 'summary')
    .map((task) => buildTaskSignature(task.name, task.type));

  rows.push({
    id: randomUUID(),
    projectId: project.id,
    chunkType: 'project-summary',
    title: `${project.name} summary`,
    content: buildProjectSummaryContent(project, taskSignatures),
    taskRefs: JSON.stringify(project.tasks.slice(0, 20).map((task) => task.id)),
    dependencyRefs: JSON.stringify(project.dependencies.slice(0, 20).map((dependency) => dependency.id)),
    signatures: JSON.stringify(taskSignatures.slice(0, 20)),
    projectType: metadata.projectType,
    sector: metadata.sector,
    region: metadata.region,
    scoreContext: JSON.stringify({
      taskCount: project.tasks.length,
      dependencyCount: project.dependencies.length,
      criticalTaskCount: project.tasks.filter((task) => task.isCritical).length,
    }),
  });

  for (const cluster of buildTaskClusters(project.tasks)) {
    rows.push({
      id: randomUUID(),
      projectId: project.id,
      chunkType: 'task-cluster',
      title: `Task cluster: ${cluster.clusterKey}`,
      content: cluster.content,
      taskRefs: JSON.stringify(cluster.taskIds),
      dependencyRefs: null,
      signatures: JSON.stringify(cluster.signatures),
      projectType: metadata.projectType,
      sector: metadata.sector,
      region: metadata.region,
      scoreContext: JSON.stringify({ clusterKey: cluster.clusterKey, taskCount: cluster.taskIds.length }),
    });
  }

  const dependencyPatterns = new Map<string, number>();
  for (const dependency of project.dependencies) {
    const fromTask = taskMap.get(dependency.fromTaskId);
    const toTask = taskMap.get(dependency.toTaskId);
    if (!fromTask || !toTask) {
      continue;
    }

    const pattern = `${buildTaskSignature(fromTask.name, fromTask.type)} -> ${buildTaskSignature(toTask.name, toTask.type)} (${dependency.type})`;
    dependencyPatterns.set(pattern, (dependencyPatterns.get(pattern) ?? 0) + 1);
  }

  if (dependencyPatterns.size > 0) {
    rows.push({
      id: randomUUID(),
      projectId: project.id,
      chunkType: 'dependency-pattern',
      title: `${project.name} dependency patterns`,
      content: [
        `Project dependency patterns for ${project.name}:`,
        ...[...dependencyPatterns.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([pattern, count]) => `- ${pattern} seen ${count} time(s)`),
      ].join('\n'),
      taskRefs: null,
      dependencyRefs: JSON.stringify(project.dependencies.slice(0, 20).map((dependency) => dependency.id)),
      signatures: JSON.stringify([...dependencyPatterns.keys()]),
      projectType: metadata.projectType,
      sector: metadata.sector,
      region: metadata.region,
      scoreContext: JSON.stringify({ dependencyPatterns: dependencyPatterns.size }),
    });
  }

  const outcomeTasks = project.tasks.filter(
    (task) => task.actualDurationMinutes > 0 || task.actualFinish != null,
  );
  if (outcomeTasks.length > 0) {
    rows.push({
      id: randomUUID(),
      projectId: project.id,
      chunkType: 'outcome-summary',
      title: `${project.name} actual outcomes`,
      content: [
        `Actual duration outcomes for ${project.name}:`,
        ...outcomeTasks.slice(0, 15).map((task) => {
          const plannedDays = Math.round((task.durationMinutes / 480) * 10) / 10;
          const actualDays = Math.round(((task.actualDurationMinutes || task.durationMinutes) / 480) * 10) / 10;
          return `- ${task.name}: planned ${plannedDays}d, actual ${actualDays}d, progress ${task.percentComplete}%`;
        }),
      ].join('\n'),
      taskRefs: JSON.stringify(outcomeTasks.map((task) => task.id)),
      dependencyRefs: null,
      signatures: JSON.stringify(outcomeTasks.map((task) => buildTaskSignature(task.name, task.type))),
      projectType: metadata.projectType,
      sector: metadata.sector,
      region: metadata.region,
      scoreContext: JSON.stringify({ outcomeTaskCount: outcomeTasks.length }),
    });
  }

  return rows;
}

function buildProjectSummaryContent(
  project: {
    name: string;
    projectType: string | null;
    sector: string | null;
    region: string | null;
    tasks: Array<{ name: string; type: string; durationMinutes: number; isCritical: boolean }>;
    dependencies: Array<unknown>;
  },
  taskSignatures: string[],
): string {
  const criticalTaskCount = project.tasks.filter((task) => task.isCritical).length;
  const averageDuration =
    project.tasks.length > 0
      ? Math.round(
        (project.tasks.reduce((sum, task) => sum + task.durationMinutes, 0) / project.tasks.length / 480) * 10,
      ) / 10
      : 0;

  return [
    `Project ${project.name}`,
    `Metadata: type=${project.projectType ?? 'unspecified'}, sector=${project.sector ?? 'unspecified'}, region=${project.region ?? 'unspecified'}`,
    `Tasks=${project.tasks.length}, dependencies=${project.dependencies.length}, critical tasks=${criticalTaskCount}, average duration=${averageDuration}d`,
    `Representative task signatures: ${taskSignatures.slice(0, 10).join(', ')}`,
  ].join('\n');
}

function buildTaskClusters(tasks: Array<{
  id: string;
  name: string;
  type: string;
  outlineLevel: number;
  durationMinutes: number;
}>): Array<{ clusterKey: string; content: string; taskIds: string[]; signatures: string[] }> {
  const groups = new Map<string, Array<{ id: string; name: string; type: string; durationMinutes: number }>>();

  for (const task of tasks) {
    if (task.type === 'summary') {
      continue;
    }
    const signature = buildTaskSignature(task.name, task.type);
    const clusterKey = signature.split(' ')[0] ?? signature;
    const list = groups.get(clusterKey) ?? [];
    list.push(task);
    groups.set(clusterKey, list);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length >= 2)
    .slice(0, 8)
    .map(([clusterKey, group]) => ({
      clusterKey,
      content: [
        `Tasks commonly grouped under ${clusterKey}:`,
        ...group.slice(0, 8).map(
          (task) => `- ${task.name} (${Math.round((task.durationMinutes / 480) * 10) / 10}d)`,
        ),
      ].join('\n'),
      taskIds: group.map((task) => task.id),
      signatures: group.map((task) => buildTaskSignature(task.name, task.type)),
    }));
}

function buildFtsQuery(queryText: string): string | null {
  const tokens = tokenizeSignature(queryText);
  if (tokens.length === 0) {
    return null;
  }

  return tokens.map((token) => `${token}*`).join(' OR ');
}

function buildExcerpt(content: string, queryTokens: string[]): string {
  if (queryTokens.length === 0) {
    return truncate(content, 180);
  }

  const lower = content.toLowerCase();
  const matchIndex = queryTokens
    .map((token) => lower.indexOf(token))
    .find((index) => index >= 0);

  if (matchIndex == null || matchIndex < 0) {
    return truncate(content, 180);
  }

  const start = Math.max(0, matchIndex - 48);
  return truncate(content.slice(start), 180);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * AI learning service.
 *
 * Captures append-only learning events, derives cross-project priors for
 * duration/dependency suggestions, and exposes prompt-ready learning context.
 */

import { prisma } from '../db.js';
import type { Prisma } from '@prisma/client';

const SIGNATURE_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'onto', 'area', 'level', 'zone',
  'phase', 'floor', 'building', 'task', 'work', 'scope', 'section', 'project',
]);

const LEARNING_REBUILD_DEBOUNCE_MS = 750;
const RECENT_AI_EVENT_WINDOW_MS = 1000 * 60 * 60 * 48;

let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
let activeRebuild: Promise<void> | null = null;

export interface ProjectMetadata {
  projectType: string | null;
  sector: string | null;
  region: string | null;
}

interface ProjectSummary extends ProjectMetadata {
  id: string;
  name: string;
}

interface LearningEventInput {
  projectId: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  fieldName?: string | null;
  source: string;
  metadata: ProjectMetadata;
  taskSignature?: string | null;
  relatedTaskSignature?: string | null;
  payload: Record<string, unknown>;
}

interface TaskMutationSnapshot {
  id: string;
  name: string;
  type: string;
  durationMinutes: number;
  percentComplete?: number | null;
  actualDurationMinutes?: number | null;
  actualFinish?: Date | string | null;
}

interface DependencyMutationSnapshot {
  id?: string;
  fromTaskName: string;
  toTaskName: string;
  type: string;
  lagMinutes?: number | null;
}

interface DurationAccumulator {
  totalWeight: number;
  weightedDays: number;
  minDays: number;
  maxDays: number;
  sampleCount: number;
}

interface DependencyAccumulator {
  totalWeight: number;
  sampleCount: number;
}

export interface DurationPriorValue {
  recommendedDays: number;
  avgDays: number;
  minDays: number;
  maxDays: number;
}

export interface DependencyPriorValue {
  dependencyType: string;
  fromSignature: string;
  toSignature: string;
}

export function tokenizeSignature(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !SIGNATURE_STOP_WORDS.has(token))
    .slice(0, 4);
}

export function buildTaskSignature(name: string, taskType?: string | null): string {
  const tokens = tokenizeSignature(name);
  const normalizedType =
    taskType && taskType !== 'task' ? taskType.toLowerCase().replace(/[^a-z0-9]+/g, '') : null;

  if (normalizedType && tokens.length > 0) {
    return `${normalizedType}:${tokens.join(' ')}`;
  }

  if (tokens.length > 0) {
    return tokens.join(' ');
  }

  return normalizedType ?? 'general-task';
}

export function aggregateDurationSamples(
  samples: Array<{ days: number; weight: number }>,
): DurationPriorValue {
  if (samples.length === 0) {
    return { recommendedDays: 1, avgDays: 1, minDays: 1, maxDays: 1 };
  }

  let totalWeight = 0;
  let weightedDays = 0;
  let minDays = Number.POSITIVE_INFINITY;
  let maxDays = 0;

  for (const sample of samples) {
    totalWeight += sample.weight;
    weightedDays += sample.days * sample.weight;
    minDays = Math.min(minDays, sample.days);
    maxDays = Math.max(maxDays, sample.days);
  }

  const avgDays = weightedDays / Math.max(totalWeight, 1);
  const recommendedDays = roundToHalfDay(avgDays);

  return {
    recommendedDays,
    avgDays: roundToSingleDecimal(avgDays),
    minDays: roundToSingleDecimal(minDays),
    maxDays: roundToSingleDecimal(maxDays),
  };
}

export async function initializeLearningSubsystem(): Promise<void> {
  scheduleLearningRebuild();
}

export function scheduleLearningRebuild(): void {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }

  rebuildTimer = setTimeout(() => {
    activeRebuild = rebuildLearnedPriors().catch((err) => {
      console.error('[AiLearningService] Failed to rebuild learned priors:', err);
    });
  }, LEARNING_REBUILD_DEBOUNCE_MS);
}

export async function waitForLearningRebuild(): Promise<void> {
  await activeRebuild;
}

export async function logProjectMutation(
  projectId: string,
  eventType: string,
  payload: Record<string, unknown>,
  source = 'user',
): Promise<void> {
  const project = await getProjectSummary(projectId);
  await logLearningEvent({
    projectId,
    eventType,
    entityType: 'project',
    entityId: projectId,
    source,
    metadata: project,
    payload,
  });
}

export async function logTaskMutation(
  projectId: string,
  eventType: string,
  before: TaskMutationSnapshot | null,
  after: TaskMutationSnapshot | null,
  source = 'user',
): Promise<void> {
  const project = await getProjectSummary(projectId);
  const task = after ?? before;
  if (!task) {
    return;
  }

  const taskSignature = buildTaskSignature(task.name, task.type);
  const changedFields = getChangedTaskFields(before, after);

  await logLearningEvent({
    projectId,
    eventType,
    entityType: 'task',
    entityId: task.id,
    fieldName: changedFields.join(','),
    source,
    metadata: project,
    taskSignature,
    payload: {
      before,
      after,
      changedFields,
    },
  });

  if (source === 'user' && after) {
    await logRecentAiCorrections(project, after, changedFields, taskSignature);
  }
}

export async function logDependencyMutation(
  projectId: string,
  eventType: string,
  dependency: DependencyMutationSnapshot,
  source = 'user',
): Promise<void> {
  const project = await getProjectSummary(projectId);
  const fromSignature = buildTaskSignature(dependency.fromTaskName, 'task');
  const toSignature = buildTaskSignature(dependency.toTaskName, 'task');

  await logLearningEvent({
    projectId,
    eventType,
    entityType: 'dependency',
    entityId: dependency.id ?? null,
    fieldName: 'dependency',
    source,
    metadata: project,
    taskSignature: fromSignature,
    relatedTaskSignature: toSignature,
    payload: { ...dependency },
  });
}

export async function logImportEvent(
  projectId: string,
  importType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const project = await getProjectSummary(projectId);
  await logLearningEvent({
    projectId,
    eventType: 'import',
    entityType: 'project',
    entityId: projectId,
    fieldName: importType,
    source: 'import',
    metadata: project,
    payload,
  });
}

export async function logAiSuggestionEvent(args: {
  projectId: string;
  suggestionType: string;
  entityId?: string | null;
  taskName?: string | null;
  suggestion: string;
  context: Record<string, unknown>;
  citations: unknown[];
}): Promise<void> {
  const project = await getProjectSummary(args.projectId);
  const taskSignature = args.taskName ? buildTaskSignature(args.taskName, 'task') : null;

  await logLearningEvent({
    projectId: args.projectId,
    eventType: 'ai_suggestion',
    entityType: 'ai',
    entityId: args.entityId ?? null,
    fieldName: args.suggestionType,
    source: 'ai',
    metadata: project,
    taskSignature,
    payload: {
      suggestionType: args.suggestionType,
      taskName: args.taskName ?? null,
      suggestedValue: args.suggestion,
      context: args.context,
      citations: args.citations,
    },
  });
}

export async function logAiFeedbackEvent(args: {
  projectId: string;
  suggestionType: string;
  suggestion: Record<string, unknown>;
  accepted: boolean;
  correctedValue?: string;
}): Promise<void> {
  const project = await getProjectSummary(args.projectId);
  const payloadTaskName =
    toNullableString(args.suggestion.taskName)
    ?? toNullableString(args.suggestion.name)
    ?? null;
  const taskSignature = payloadTaskName ? buildTaskSignature(payloadTaskName, 'task') : null;

  await logLearningEvent({
    projectId: args.projectId,
    eventType: args.accepted ? 'ai_feedback_accepted' : 'ai_feedback_rejected',
    entityType: 'ai',
    fieldName: args.suggestionType,
    source: 'feedback',
    metadata: project,
    taskSignature,
    payload: {
      suggestion: args.suggestion,
      correctedValue: args.correctedValue ?? null,
    },
  });
}

export async function getLearningContext(
  projectId: string,
  queryText: string,
  context: Record<string, unknown> = {},
): Promise<string> {
  const project = await getProjectSummary(projectId);
  const candidateSignatures = buildCandidateSignatures(queryText, context);
  if (candidateSignatures.length === 0) {
    return '';
  }

  const priors = await prisma.aiLearnedPrior.findMany({
    where: {
      AND: [
        {
          OR: [
            { signature: { in: candidateSignatures } },
            ...candidateSignatures.map((signature) => ({
              relatedSignature: { contains: signature },
            })),
          ],
        },
        {
          OR: [
            {
              AND: [
                { projectType: project.projectType ?? null },
                { sector: project.sector ?? null },
                { region: project.region ?? null },
              ],
            },
            {
              AND: [{ projectType: null }, { sector: null }, { region: null }],
            },
          ],
        },
      ],
    },
    orderBy: [{ confidence: 'desc' }, { sampleCount: 'desc' }],
    take: 10,
  });

  if (priors.length === 0) {
    return '';
  }

  const durationLines: string[] = [];
  const dependencyLines: string[] = [];

  for (const prior of priors) {
    if (prior.priorType === 'duration') {
      const value = safeJsonParse(prior.value) as DurationPriorValue | null;
      if (!value) continue;
      durationLines.push(
        `- ${prior.signature}: similar tasks usually run ${value.recommendedDays} working days (avg ${value.avgDays}d, ${prior.sampleCount} samples)`,
      );
      continue;
    }

    if (prior.priorType === 'dependency') {
      const value = safeJsonParse(prior.value) as DependencyPriorValue | null;
      if (!value) continue;
      dependencyLines.push(
        `- ${value.fromSignature} commonly links to ${value.toSignature} with ${value.dependencyType} (${prior.sampleCount} samples)`,
      );
    }
  }

  const lines: string[] = [];
  if (durationLines.length > 0) {
    lines.push('Learned duration priors:', ...durationLines.slice(0, 4));
  }
  if (dependencyLines.length > 0) {
    lines.push('Learned dependency priors:', ...dependencyLines.slice(0, 4));
  }

  return lines.join('\n');
}

async function logLearningEvent(input: LearningEventInput): Promise<void> {
  await prisma.aiLearningEvent.create({
    data: {
      projectId: input.projectId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      fieldName: input.fieldName ?? null,
      source: input.source,
      projectType: normalizeNullable(input.metadata.projectType),
      sector: normalizeNullable(input.metadata.sector),
      region: normalizeNullable(input.metadata.region),
      taskSignature: input.taskSignature ?? null,
      relatedTaskSignature: input.relatedTaskSignature ?? null,
      payload: JSON.stringify(input.payload),
    },
  });

  scheduleLearningRebuild();
}

async function logRecentAiCorrections(
  project: ProjectSummary,
  after: TaskMutationSnapshot,
  changedFields: string[],
  taskSignature: string,
): Promise<void> {
  const relevantFields = changedFields.filter((field) => field === 'duration' || field === 'name');
  if (relevantFields.length === 0) {
    return;
  }

  const recentEvents = await prisma.aiLearningEvent.findMany({
    where: {
      projectId: project.id,
      eventType: 'ai_suggestion',
      fieldName: { in: relevantFields },
      OR: [
        { entityId: after.id },
        { taskSignature },
      ],
      createdAt: {
        gte: new Date(Date.now() - RECENT_AI_EVENT_WINDOW_MS),
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  for (const event of recentEvents) {
    const payload = safeJsonParse(event.payload) as Record<string, unknown> | null;
    if (!payload) {
      continue;
    }

    const suggestedValue = toNullableString(payload.suggestedValue);
    if (!suggestedValue) {
      continue;
    }

    if (event.fieldName === 'duration') {
      const suggestedMinutes = parseSuggestedDurationMinutes(suggestedValue);
      if (suggestedMinutes == null || suggestedMinutes === after.durationMinutes) {
        continue;
      }

      await logLearningEvent({
        projectId: project.id,
        eventType: 'manual_correction',
        entityType: 'task',
        entityId: after.id,
        fieldName: 'duration',
        source: 'user',
        metadata: project,
        taskSignature,
        payload: {
          suggestionEventId: event.id,
          suggestedValue,
          correctedValueMinutes: after.durationMinutes,
        },
      });
      continue;
    }

    if (event.fieldName === 'name' && suggestedValue.trim() !== after.name.trim()) {
      await logLearningEvent({
        projectId: project.id,
        eventType: 'manual_correction',
        entityType: 'task',
        entityId: after.id,
        fieldName: 'name',
        source: 'user',
        metadata: project,
        taskSignature,
        payload: {
          suggestionEventId: event.id,
          suggestedValue,
          correctedValue: after.name,
        },
      });
    }
  }
}

async function rebuildLearnedPriors(): Promise<void> {
  const [projects, events] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        projectType: true,
        sector: true,
        region: true,
        tasks: {
          select: {
            id: true,
            name: true,
            type: true,
            durationMinutes: true,
            actualDurationMinutes: true,
            actualFinish: true,
          },
        },
        dependencies: {
          select: {
            fromTaskId: true,
            toTaskId: true,
            type: true,
          },
        },
      },
    }),
    prisma.aiLearningEvent.findMany({
      orderBy: { createdAt: 'asc' },
      take: 5000,
    }),
  ]);

  const durationSamples = new Map<string, DurationAccumulator>();
  const durationSampleValues = new Map<string, Array<{ days: number; weight: number }>>();
  const dependencySamples = new Map<string, DependencyAccumulator>();

  for (const project of projects) {
    const metadata = {
      projectType: normalizeNullable(project.projectType),
      sector: normalizeNullable(project.sector),
      region: normalizeNullable(project.region),
    };
    const taskMap = new Map(project.tasks.map((task) => [task.id, task]));

    for (const task of project.tasks) {
      if (!task.name || task.type === 'summary') {
        continue;
      }

      const signature = buildTaskSignature(task.name, task.type);
      const plannedDays = task.durationMinutes / 480;
      addDurationSample(durationSamples, durationSampleValues, metadata, signature, plannedDays, 1);

      const actualDays =
        task.actualDurationMinutes && task.actualDurationMinutes > 0
          ? task.actualDurationMinutes / 480
          : null;
      if (actualDays && task.actualFinish) {
        addDurationSample(durationSamples, durationSampleValues, metadata, signature, actualDays, 2);
      }
    }

    for (const dependency of project.dependencies) {
      const fromTask = taskMap.get(dependency.fromTaskId);
      const toTask = taskMap.get(dependency.toTaskId);
      if (!fromTask || !toTask) {
        continue;
      }

      const fromSignature = buildTaskSignature(fromTask.name, fromTask.type);
      const toSignature = buildTaskSignature(toTask.name, toTask.type);
      addDependencySample(dependencySamples, metadata, fromSignature, toSignature, dependency.type, 1);
    }
  }

  for (const event of events) {
    const metadata = {
      projectType: normalizeNullable(event.projectType),
      sector: normalizeNullable(event.sector),
      region: normalizeNullable(event.region),
    };
    const payload = safeJsonParse(event.payload) as Record<string, unknown> | null;

    if (event.fieldName === 'duration' && event.taskSignature) {
      const correctedMinutes = toNullableNumber(payload?.correctedValueMinutes);
      const suggestedMinutes = parseSuggestedDurationMinutes(toNullableString(payload?.suggestedValue));

      if (event.eventType === 'manual_correction' && correctedMinutes != null) {
        addDurationSample(
          durationSamples,
          durationSampleValues,
          metadata,
          event.taskSignature,
          correctedMinutes / 480,
          4,
        );
      } else if (event.eventType === 'ai_feedback_accepted' && suggestedMinutes != null) {
        addDurationSample(
          durationSamples,
          durationSampleValues,
          metadata,
          event.taskSignature,
          suggestedMinutes / 480,
          3,
        );
      } else if (event.eventType === 'ai_feedback_rejected' && correctedMinutes != null) {
        addDurationSample(
          durationSamples,
          durationSampleValues,
          metadata,
          event.taskSignature,
          correctedMinutes / 480,
          4,
        );
      }
    }

    if (event.fieldName === 'dependency' && event.taskSignature && event.relatedTaskSignature) {
      const dependencyType =
        toNullableString(payload?.type)
        ?? toNullableString(payload?.dependencyType)
        ?? 'FS';

      if (
        event.eventType === 'manual_correction'
        || event.eventType === 'ai_feedback_accepted'
        || event.eventType === 'dependency_created'
        || event.eventType === 'dependency_updated'
      ) {
        addDependencySample(
          dependencySamples,
          metadata,
          event.taskSignature,
          event.relatedTaskSignature,
          dependencyType,
          event.eventType === 'manual_correction' ? 4 : event.eventType === 'ai_feedback_accepted' ? 3 : 1,
        );
      }
    }
  }

  const priorRows = [
    ...buildDurationPriorRows(durationSamples, durationSampleValues),
    ...buildDependencyPriorRows(dependencySamples),
  ];

  await prisma.$transaction([
    prisma.aiLearnedPrior.deleteMany(),
    ...(priorRows.length > 0 ? [prisma.aiLearnedPrior.createMany({ data: priorRows })] : []),
  ]);
}

function buildDurationPriorRows(
  accumulators: Map<string, DurationAccumulator>,
  sampleValues: Map<string, Array<{ days: number; weight: number }>>,
): Prisma.AiLearnedPriorCreateManyInput[] {
  return [...accumulators.entries()].map(([key, stats]) => {
    const parsed = parseScopedKey(key);
    const value = aggregateDurationSamples(sampleValues.get(key) ?? []);
    return {
      priorType: 'duration',
      signature: parsed.signature,
      relatedSignature: null,
      projectType: parsed.projectType,
      sector: parsed.sector,
      region: parsed.region,
      value: JSON.stringify(value),
      confidence: Math.min(1, stats.totalWeight / 8),
      sampleCount: stats.sampleCount,
    };
  });
}

function buildDependencyPriorRows(
  accumulators: Map<string, DependencyAccumulator>,
): Prisma.AiLearnedPriorCreateManyInput[] {
  return [...accumulators.entries()].map(([key, stats]) => {
    const parsed = parseScopedDependencyKey(key);
    return {
      priorType: 'dependency',
      signature: parsed.signature,
      relatedSignature: `${parsed.dependencyType}:${parsed.relatedSignature}`,
      projectType: parsed.projectType,
      sector: parsed.sector,
      region: parsed.region,
      value: JSON.stringify({
        dependencyType: parsed.dependencyType,
        fromSignature: parsed.signature,
        toSignature: parsed.relatedSignature,
      } satisfies DependencyPriorValue),
      confidence: Math.min(1, stats.totalWeight / 8),
      sampleCount: stats.sampleCount,
    };
  });
}

function addDurationSample(
  accumulators: Map<string, DurationAccumulator>,
  sampleValues: Map<string, Array<{ days: number; weight: number }>>,
  metadata: ProjectMetadata,
  signature: string,
  days: number,
  weight: number,
): void {
  if (!Number.isFinite(days) || days <= 0) {
    return;
  }

  for (const scope of buildMetadataScopes(metadata)) {
    const key = buildScopedKey(scope, signature);
    const existing = accumulators.get(key) ?? {
      totalWeight: 0,
      weightedDays: 0,
      minDays: Number.POSITIVE_INFINITY,
      maxDays: 0,
      sampleCount: 0,
    };

    existing.totalWeight += weight;
    existing.weightedDays += days * weight;
    existing.minDays = Math.min(existing.minDays, days);
    existing.maxDays = Math.max(existing.maxDays, days);
    existing.sampleCount += 1;
    accumulators.set(key, existing);

    const values = sampleValues.get(key) ?? [];
    values.push({ days, weight });
    sampleValues.set(key, values);
  }
}

function addDependencySample(
  accumulators: Map<string, DependencyAccumulator>,
  metadata: ProjectMetadata,
  fromSignature: string,
  toSignature: string,
  dependencyType: string,
  weight: number,
): void {
  if (!fromSignature || !toSignature) {
    return;
  }

  for (const scope of buildMetadataScopes(metadata)) {
    const key = buildScopedDependencyKey(scope, fromSignature, toSignature, dependencyType);
    const existing = accumulators.get(key) ?? { totalWeight: 0, sampleCount: 0 };
    existing.totalWeight += weight;
    existing.sampleCount += 1;
    accumulators.set(key, existing);
  }
}

function buildMetadataScopes(metadata: ProjectMetadata): ProjectMetadata[] {
  const normalized = {
    projectType: normalizeNullable(metadata.projectType),
    sector: normalizeNullable(metadata.sector),
    region: normalizeNullable(metadata.region),
  };

  const scopes: ProjectMetadata[] = [{ projectType: null, sector: null, region: null }];
  if (normalized.projectType || normalized.sector || normalized.region) {
    scopes.push(normalized);
  }

  return scopes;
}

function buildScopedKey(metadata: ProjectMetadata, signature: string): string {
  return [
    normalizeNullable(metadata.projectType) ?? '*',
    normalizeNullable(metadata.sector) ?? '*',
    normalizeNullable(metadata.region) ?? '*',
    signature,
  ].join('|');
}

function buildScopedDependencyKey(
  metadata: ProjectMetadata,
  signature: string,
  relatedSignature: string,
  dependencyType: string,
): string {
  return `${buildScopedKey(metadata, signature)}|${dependencyType}|${relatedSignature}`;
}

function parseScopedKey(key: string): ProjectMetadata & { signature: string } {
  const [projectType, sector, region, signature] = key.split('|');
  return {
    projectType: projectType === '*' ? null : projectType,
    sector: sector === '*' ? null : sector,
    region: region === '*' ? null : region,
    signature,
  };
}

function parseScopedDependencyKey(
  key: string,
): ProjectMetadata & { signature: string; relatedSignature: string; dependencyType: string } {
  const [projectType, sector, region, signature, dependencyType, relatedSignature] = key.split('|');
  return {
    projectType: projectType === '*' ? null : projectType,
    sector: sector === '*' ? null : sector,
    region: region === '*' ? null : region,
    signature,
    dependencyType,
    relatedSignature,
  };
}

function buildCandidateSignatures(queryText: string, context: Record<string, unknown>): string[] {
  const signatures = new Set<string>();

  const taskName =
    toNullableString(context.taskName)
    ?? toNullableString(context.name)
    ?? null;
  if (taskName) {
    signatures.add(buildTaskSignature(taskName, 'task'));
  }

  const textSignature = buildTaskSignature(queryText, 'task');
  if (textSignature !== 'general-task') {
    signatures.add(textSignature);
  }

  return [...signatures];
}

function getChangedTaskFields(
  before: TaskMutationSnapshot | null,
  after: TaskMutationSnapshot | null,
): string[] {
  if (!before || !after) {
    return [];
  }

  const changed: string[] = [];
  if (before.name !== after.name) changed.push('name');
  if (before.durationMinutes !== after.durationMinutes) changed.push('duration');
  if ((before.percentComplete ?? null) !== (after.percentComplete ?? null)) changed.push('progress');
  if ((before.actualDurationMinutes ?? null) !== (after.actualDurationMinutes ?? null)) changed.push('actualDuration');
  if ((before.actualFinish ?? null) !== (after.actualFinish ?? null)) changed.push('actualFinish');
  return changed;
}

async function getProjectSummary(projectId: string): Promise<ProjectSummary> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      projectType: true,
      sector: true,
      region: true,
    },
  });

  return {
    id: project.id,
    name: project.name,
    projectType: normalizeNullable(project.projectType),
    sector: normalizeNullable(project.sector),
    region: normalizeNullable(project.region),
  };
}

function parseSuggestedDurationMinutes(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = value.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(d|day|days|w|week|weeks|h|hr|hrs|hour|hours)/);
  if (!match) {
    return null;
  }

  const amount = parseFloat(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount)) {
    return null;
  }

  if (unit.startsWith('w')) return amount * 5 * 480;
  if (unit.startsWith('h')) return amount * 60;
  return amount * 480;
}

function roundToHalfDay(value: number): number {
  return Math.max(0.5, Math.round(value * 2) / 2);
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

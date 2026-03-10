/**
 * Memory Service — persistent AI learning system.
 * Captures insights from feedback, conversations, and patterns,
 * then injects the most relevant memories into AI prompts.
 */

import { prisma } from '../db.js';

// ────────── Types ──────────

export interface MemoryEntry {
  id: string;
  projectId: string | null;
  category: string;
  key: string;
  value: string;
  source: string;
  importance: number;
  uses: number;
  createdAt: Date;
  updatedAt: Date;
}

type MemoryCategory = 'preference' | 'correction' | 'context' | 'insight';
type MemorySource = 'feedback' | 'conversation' | 'pattern' | 'manual';

// ────────── Core CRUD ──────────

/** Store or update a memory. Uses upsert on (category, key, projectId). */
export async function storeMemory(
  projectId: string | null,
  category: MemoryCategory,
  key: string,
  value: string,
  source: MemorySource,
  importance = 0.5,
): Promise<MemoryEntry> {
  return prisma.aiMemory.upsert({
    where: {
      category_key_projectId: {
        category,
        key,
        projectId: projectId ?? '',
      },
    },
    update: {
      value,
      importance: Math.min(1, importance),
      source,
      updatedAt: new Date(),
    },
    create: {
      projectId: projectId || null,
      category,
      key,
      value,
      source,
      importance: Math.min(1, importance),
    },
  }) as unknown as MemoryEntry;
}

/** Get the most relevant memories for a project (includes global memories). */
export async function getRelevantMemories(
  projectId: string,
  limit = 30,
): Promise<MemoryEntry[]> {
  return prisma.aiMemory.findMany({
    where: {
      OR: [{ projectId }, { projectId: null }, { projectId: '' }],
    },
    orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
  }) as unknown as MemoryEntry[];
}

/** Build a formatted text block of memories for injection into AI prompts. */
export async function getMemoryText(projectId: string): Promise<string> {
  const memories = await getRelevantMemories(projectId, 25);
  if (memories.length === 0) return '';

  // Increment usage counter for each injected memory
  const ids = memories.map((m) => m.id);
  await prisma.aiMemory.updateMany({
    where: { id: { in: ids } },
    data: { uses: { increment: 1 } },
  });

  const grouped = new Map<string, typeof memories>();
  for (const m of memories) {
    const list = grouped.get(m.category) ?? [];
    list.push(m);
    grouped.set(m.category, list);
  }

  const sections: string[] = [];

  const corrections = grouped.get('correction');
  if (corrections?.length) {
    sections.push(
      'User corrections (ALWAYS apply these):',
      ...corrections.map((m) => `  - ${m.key}: ${m.value}`),
    );
  }

  const preferences = grouped.get('preference');
  if (preferences?.length) {
    sections.push(
      'User preferences:',
      ...preferences.map((m) => `  - ${m.key}: ${m.value}`),
    );
  }

  const insights = grouped.get('insight');
  if (insights?.length) {
    sections.push(
      'Learned insights:',
      ...insights.map((m) => `  - ${m.key}: ${m.value}`),
    );
  }

  const context = grouped.get('context');
  if (context?.length) {
    sections.push(
      'Project context notes:',
      ...context.map((m) => `  - ${m.key}: ${m.value}`),
    );
  }

  return sections.join('\n');
}

// ────────── Learning from Feedback ──────────

/**
 * When a user accepts or rejects an AI suggestion, extract a memory.
 * Corrections are the most valuable — they tell us what the user actually wanted.
 */
export async function learnFromFeedback(
  projectId: string,
  suggestionType: string,
  suggestion: Record<string, unknown>,
  accepted: boolean,
  correctedValue?: string,
): Promise<void> {
  if (!accepted && correctedValue) {
    // User rejected and provided a correction — high importance
    const key = buildFeedbackKey(suggestionType, suggestion);
    await storeMemory(
      projectId,
      'correction',
      key,
      `User corrected ${suggestionType}: suggested "${summarizeSuggestion(suggestion)}" but chose "${correctedValue}"`,
      'feedback',
      0.9,
    );
  } else if (accepted) {
    // User accepted — moderate importance, confirms pattern
    const key = buildFeedbackKey(suggestionType, suggestion);
    await storeMemory(
      projectId,
      'preference',
      key,
      `User accepted ${suggestionType} suggestion: "${summarizeSuggestion(suggestion)}"`,
      'feedback',
      0.6,
    );
  }
}

function buildFeedbackKey(
  type: string,
  suggestion: Record<string, unknown>,
): string {
  const taskName =
    (suggestion.taskName as string) ?? (suggestion.name as string) ?? '';
  const short = taskName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
  return `${type}_${short || 'general'}`;
}

function summarizeSuggestion(suggestion: Record<string, unknown>): string {
  // Extract the most meaningful value from the suggestion object
  const val =
    suggestion.value ?? suggestion.duration ?? suggestion.name ?? suggestion.suggestion;
  if (typeof val === 'string') return val.slice(0, 100);
  if (typeof val === 'number') return String(val);
  return JSON.stringify(suggestion).slice(0, 100);
}

// ────────── Learning from Conversations ──────────

/**
 * After a conversation turn, scan for explicit user instructions/preferences
 * that should be remembered across sessions.
 */
export async function learnFromConversation(
  projectId: string,
  userMessage: string,
  aiResponse: string,
): Promise<void> {
  // Look for explicit preference signals in the user message
  const prefPatterns = [
    /always\s+use\s+(.+)/i,
    /i\s+prefer\s+(.+)/i,
    /never\s+(.+)/i,
    /default\s+to\s+(.+)/i,
    /remember\s+that\s+(.+)/i,
    /from\s+now\s+on[,]?\s+(.+)/i,
    /our\s+standard\s+is\s+(.+)/i,
    /we\s+typically\s+(.+)/i,
  ];

  for (const pat of prefPatterns) {
    const match = userMessage.match(pat);
    if (match) {
      const pref = match[1].trim().slice(0, 200);
      const key = pref
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 50);
      await storeMemory(
        projectId,
        'preference',
        `user_stated_${key}`,
        pref,
        'conversation',
        0.8,
      );
    }
  }

  // Extract scheduling decisions from AI responses the user engaged with
  const decisionPatterns = [
    /(?:set|change|update)\s+(?:the\s+)?duration\s+(?:to|of)\s+(\d+\s*(?:days?|d|weeks?|w))/i,
    /(?:use|assign)\s+(.+?)\s+(?:as|for)\s+(?:the\s+)?resource/i,
    /(?:critical\s+path|float|slack)\s+(?:is|shows)\s+(.+)/i,
  ];

  for (const pat of decisionPatterns) {
    const match = aiResponse.match(pat);
    if (match) {
      const insight = match[0].slice(0, 200);
      const key = insight
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 50);
      await storeMemory(
        projectId,
        'insight',
        `ai_${key}`,
        insight,
        'conversation',
        0.4,
      );
    }
  }
}

// ────────── Memory Management ──────────

/** List all memories, optionally filtered by project. */
export async function listMemories(
  projectId?: string,
): Promise<MemoryEntry[]> {
  const where = projectId
    ? { OR: [{ projectId }, { projectId: null }, { projectId: '' }] }
    : {};
  return prisma.aiMemory.findMany({
    where,
    orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
  }) as unknown as MemoryEntry[];
}

/** Delete a specific memory by ID. */
export async function deleteMemory(id: string): Promise<void> {
  await prisma.aiMemory.delete({ where: { id } });
}

/** Clear all memories for a project (or global). */
export async function clearMemories(projectId?: string): Promise<number> {
  const result = await prisma.aiMemory.deleteMany({
    where: projectId ? { projectId } : {},
  });
  return result.count;
}

/** Get memory stats. */
export async function getMemoryStats(): Promise<{
  total: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  avgImportance: number;
}> {
  const all = await prisma.aiMemory.findMany({
    select: { category: true, source: true, importance: true },
  });

  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let totalImportance = 0;

  for (const m of all) {
    byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
    bySource[m.source] = (bySource[m.source] ?? 0) + 1;
    totalImportance += m.importance;
  }

  return {
    total: all.length,
    byCategory,
    bySource,
    avgImportance: all.length > 0 ? totalImportance / all.length : 0,
  };
}

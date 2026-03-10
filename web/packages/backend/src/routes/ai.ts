/**
 * /api/ai routes — AI chat, suggestions, patterns, feedback, memory, config, and presets.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  chat,
  suggest,
  recordFeedback,
  checkAiHealth,
  getAiConfig,
  setAiConfig,
  getSafeConfig,
  CLOUD_MODEL_PRESETS,
  type AiProvider,
} from '../services/aiService.js';
import {
  LOCAL_MODEL_PRESET_IDS,
  getModelStatus,
  invalidateConversationChatSession,
} from '../services/localModelManager.js';
import {
  listMemories,
  storeMemory,
  deleteMemory,
  clearMemories,
  getMemoryStats,
} from '../services/memoryService.js';
import { prisma } from '../db.js';

const chatSchema = z.object({
  projectId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

const suggestSchema = z.object({
  projectId: z.string().uuid(),
  type: z.enum(['duration', 'dependency', 'name', 'resource', 'general']),
  context: z.record(z.unknown()),
});

const feedbackSchema = z.object({
  projectId: z.string().uuid(),
  suggestionType: z.string(),
  suggestion: z.record(z.unknown()),
  accepted: z.boolean(),
  correctedValue: z.string().optional(),
});

export default async function aiRoutes(app: FastifyInstance) {
  // Health / status check
  app.get('/health', async () => {
    return checkAiHealth();
  });

  // Get AI configuration (API keys are omitted for safety)
  app.get('/config', async () => {
    return getSafeConfig();
  });

  // Get cloud model presets (optional alternatives to the built-in local model)
  app.get('/presets', async () => {
    return CLOUD_MODEL_PRESETS;
  });

  // Get local model download/loading status
  app.get('/model-status', async () => {
    return getModelStatus(getAiConfig().localModelId);
  });

  // Update AI configuration
  const configSchema = z.object({
    provider: z.enum(['local', 'openai', 'gemini', 'groq', 'openrouter'] as const).optional(),
    localModelId: z.enum(LOCAL_MODEL_PRESET_IDS as [typeof LOCAL_MODEL_PRESET_IDS[number], ...typeof LOCAL_MODEL_PRESET_IDS[number][]]).optional(),
    openaiApiKey: z.string().optional(),
    openaiBaseUrl: z.string().optional(),
    openaiModel: z.string().optional(),
    geminiApiKey: z.string().optional(),
    geminiModel: z.string().optional(),
    groqApiKey: z.string().optional(),
    groqModel: z.string().optional(),
    openrouterApiKey: z.string().optional(),
    openrouterModel: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(64).max(128000).optional(),
  });

  app.put('/config', async (req) => {
    const body = configSchema.parse(req.body);
    setAiConfig(body);
    return getSafeConfig();
  });

  // Chat with AI
  app.post('/chat', async (req, reply) => {
    const body = chatSchema.parse(req.body);
    try {
      const result = await chat(body.projectId, body.message, body.conversationId);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI service unavailable';
      return reply.code(502).send({ error: message });
    }
  });

  // Quick suggestion
  app.post('/suggest', async (req, reply) => {
    const body = suggestSchema.parse(req.body);
    try {
      return suggest(body.projectId, body.type, body.context);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI service unavailable';
      return reply.code(502).send({ error: message });
    }
  });

  // Record feedback
  app.post('/feedback', async (req, reply) => {
    const body = feedbackSchema.parse(req.body);
    await recordFeedback(
      body.projectId,
      body.suggestionType,
      body.suggestion,
      body.accepted,
      body.correctedValue,
    );
    return reply.code(201).send({ ok: true });
  });

  // List conversations for a project
  app.get<{ Querystring: { projectId: string } }>(
    '/conversations',
    async (req) => {
      const projectId = req.query.projectId;
      return prisma.aiConversation.findMany({
        where: { projectId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, createdAt: true, updatedAt: true },
      });
    },
  );

  // Get conversation messages
  app.get<{ Params: { id: string } }>('/conversations/:id', async (req, reply) => {
    const conv = await prisma.aiConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!conv) {
      return reply.code(404).send({ error: 'Conversation not found' });
    }
    return {
      id: conv.id,
      projectId: conv.projectId,
      messages: JSON.parse(conv.messages),
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  });

  // Delete conversation
  app.delete<{ Params: { id: string } }>(
    '/conversations/:id',
    async (req, reply) => {
      await prisma.aiConversation.delete({ where: { id: req.params.id } });
      await invalidateConversationChatSession(req.params.id);
      return reply.code(204).send();
    },
  );

  // Get learned patterns
  app.get('/patterns', async () => {
    return prisma.aiPattern.findMany({
      orderBy: { confidence: 'desc' },
    });
  });

  // Get feedback stats
  app.get('/feedback/stats', async () => {
    const [total, accepted] = await Promise.all([
      prisma.aiFeedback.count(),
      prisma.aiFeedback.count({ where: { accepted: true } }),
    ]);
    return {
      total,
      accepted,
      acceptanceRate: total > 0 ? accepted / total : 0,
    };
  });

  // ────────── Memory endpoints ──────────

  // List memories (optionally filtered by project)
  app.get<{ Querystring: { projectId?: string } }>('/memories', async (req) => {
    return listMemories(req.query.projectId);
  });

  // Memory stats
  app.get('/memories/stats', async () => {
    return getMemoryStats();
  });

  // Create a manual memory
  const memoryCreateSchema = z.object({
    projectId: z.string().uuid().nullable().optional(),
    category: z.enum(['preference', 'correction', 'context', 'insight']),
    key: z.string().min(1).max(100),
    value: z.string().min(1).max(500),
    importance: z.number().min(0).max(1).optional(),
  });

  app.post('/memories', async (req, reply) => {
    const body = memoryCreateSchema.parse(req.body);
    const memory = await storeMemory(
      body.projectId ?? null,
      body.category,
      body.key,
      body.value,
      'manual',
      body.importance ?? 0.7,
    );
    return reply.code(201).send(memory);
  });

  // Delete a specific memory
  app.delete<{ Params: { id: string } }>('/memories/:id', async (req, reply) => {
    await deleteMemory(req.params.id);
    return reply.code(204).send();
  });

  // Clear all memories (optionally for a project)
  app.delete<{ Querystring: { projectId?: string } }>('/memories', async (req) => {
    const count = await clearMemories(req.query.projectId);
    return { deleted: count };
  });
}

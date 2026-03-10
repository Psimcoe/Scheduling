/**
 * AI Service — multi-provider LLM integration with embedded local model as default.
 * Supports: Local (embedded GGUF presets via node-llama-cpp), OpenAI, Google Gemini, Groq, OpenRouter.
 * Integrates persistent memory, pattern learning, and feedback-driven improvement.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { prisma } from '../db.js';
import {
  getLearningContext,
  logAiFeedbackEvent,
  logAiSuggestionEvent,
} from './aiLearningService.js';
import { buildProjectContext } from './contextBuilder.js';
import { extractAndStorePatterns } from './patternExtractor.js';
import { getMemoryText, learnFromConversation, learnFromFeedback } from './memoryService.js';
import type { ChatHistoryItem } from 'node-llama-cpp';
import {
  formatCitationContext,
  retrieveScheduleCitations,
  type AiCitation,
} from './scheduleKnowledgeService.js';
import {
  getContext,
  getConversationChatSession,
  getModelStatus,
  invalidateConversationChatSession,
  isModelReady,
  LOCAL_MODEL_CONTEXT_LIMIT,
  listLocalModelPresets,
  type LocalModelPresetId,
  resolveLocalModelId,
  unloadModel,
  updateConversationChatSession,
} from './localModelManager.js';
import { runtimeConfig } from '../runtimeConfig.js';

// ────────── Provider Types ──────────

export type AiProvider = 'local' | 'openai' | 'gemini' | 'groq' | 'openrouter';

export interface AiProviderConfig {
  provider: AiProvider;
  localModelId: LocalModelPresetId;
  // OpenAI / OpenAI-compatible
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  // Google Gemini (free tier: 15 RPM, 1M context)
  geminiApiKey: string;
  geminiModel: string;
  // Groq (free tier: 30 RPM, fast inference)
  groqApiKey: string;
  groqModel: string;
  // OpenRouter (free models available)
  openrouterApiKey: string;
  openrouterModel: string;
  // Common parameters
  temperature: number;
  maxTokens: number;
}

/** Token budget hints per provider (conservative estimates for free tiers). */
const PROVIDER_CONTEXT_LIMITS: Record<AiProvider, number> = {
  local: LOCAL_MODEL_CONTEXT_LIMIT,
  openai: 128000,
  gemini: 1048576,   // Gemini Flash free: 1M tokens
  groq: 32768,       // Groq free: 32K for most models
  openrouter: 32768, // varies by model; conservative default
};

/** Pre-configured cloud model presets (optional — the embedded local model is the default). */
export const CLOUD_MODEL_PRESETS: Record<string, { provider: AiProvider; model: string; label: string }> = {
  'gemini-flash': { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Free, 1M context)' },
  'gemini-flash-lite': { provider: 'gemini', model: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite (Free, fast)' },
  'groq-llama70b': { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B via Groq (Free)' },
  'groq-llama8b': { provider: 'groq', model: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B via Groq (Free, fast)' },
  'groq-mixtral': { provider: 'groq', model: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B via Groq (Free)' },
  'openrouter-free': { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B via OpenRouter (Free)' },
};

const DEFAULT_CONFIG: AiProviderConfig = {
  provider: (process.env.AI_PROVIDER as AiProvider) ?? 'local',
  localModelId: resolveLocalModelId(process.env.LOCAL_MODEL_ID ?? null),
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
  groqApiKey: process.env.GROQ_API_KEY ?? '',
  groqModel: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openrouterModel: process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free',
  temperature: 0.7,
  maxTokens: 2048,
};

const CONFIG_PATH = runtimeConfig.aiConfigPath;

let cachedConfig: AiProviderConfig | null = null;

function normalizeProvider(provider?: string | null): AiProvider {
  switch (provider) {
    case 'local':
    case 'openai':
    case 'gemini':
    case 'groq':
    case 'openrouter':
      return provider;
    default:
      return DEFAULT_CONFIG.provider;
  }
}

function normalizeAiConfig(raw?: Partial<AiProviderConfig> | null): AiProviderConfig {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    provider: normalizeProvider(raw?.provider),
    localModelId: resolveLocalModelId(raw?.localModelId ?? DEFAULT_CONFIG.localModelId),
  };
}

export function getAiConfig(): AiProviderConfig {
  if (cachedConfig) return cachedConfig;
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      cachedConfig = normalizeAiConfig(JSON.parse(raw) as Partial<AiProviderConfig>);
      return cachedConfig!;
    }
  } catch {
    // Ignore parse errors — use defaults
  }
  cachedConfig = normalizeAiConfig();
  return cachedConfig!;
}

export function setAiConfig(partial: Partial<AiProviderConfig>): AiProviderConfig {
  const current = getAiConfig();
  cachedConfig = normalizeAiConfig({ ...current, ...partial });
  writeFileSync(CONFIG_PATH, JSON.stringify(cachedConfig, null, 2));
  const shouldUnloadLocalModel =
    (current.provider === 'local' || cachedConfig.provider === 'local')
    && (current.provider !== cachedConfig.provider || current.localModelId !== cachedConfig.localModelId);

  if (shouldUnloadLocalModel) {
    unloadModel().catch(() => {});
  } else {
    invalidateConversationChatSession().catch(() => {});
  }
  return cachedConfig;
}

/** Return the config without API keys (for the frontend). */
export function getSafeConfig() {
  const cfg = getAiConfig();
  const modelStatus = getModelStatus(cfg.localModelId);
  return {
    provider: cfg.provider,
    localModelId: cfg.localModelId,
    localModels: listLocalModelPresets(),
    openaiBaseUrl: cfg.openaiBaseUrl,
    openaiModel: cfg.openaiModel,
    openaiApiKeySet: !!cfg.openaiApiKey,
    geminiModel: cfg.geminiModel,
    geminiApiKeySet: !!cfg.geminiApiKey,
    groqModel: cfg.groqModel,
    groqApiKeySet: !!cfg.groqApiKey,
    openrouterModel: cfg.openrouterModel,
    openrouterApiKeySet: !!cfg.openrouterApiKey,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    localModelStatus: modelStatus,
  };
}

export type SafeConfig = ReturnType<typeof getSafeConfig>;

// ────────── Health Checks ──────────

/** Check if the configured AI provider is reachable/configured. */
export async function checkAiHealth(): Promise<{
  available: boolean;
  provider: string;
  models: string[];
  localModelStatus?: ReturnType<typeof getModelStatus>;
}> {
  const cfg = getAiConfig();
  const modelStatus = getModelStatus(cfg.localModelId);

  switch (cfg.provider) {
    case 'local': {
      const ok = isModelReady(cfg.localModelId) || modelStatus.state === 'loaded';
      return { available: ok, provider: 'local', models: ok ? [modelStatus.modelName] : [], localModelStatus: modelStatus };
    }
    case 'gemini': {
      const ok = !!cfg.geminiApiKey;
      return { available: ok, provider: 'gemini', models: ok ? [cfg.geminiModel] : [] };
    }
    case 'groq': {
      const ok = !!cfg.groqApiKey;
      return { available: ok, provider: 'groq', models: ok ? [cfg.groqModel] : [] };
    }
    case 'openrouter': {
      const ok = !!cfg.openrouterApiKey;
      return { available: ok, provider: 'openrouter', models: ok ? [cfg.openrouterModel] : [] };
    }
    default: {
      // OpenAI-compatible
      const ok = !!cfg.openaiApiKey;
      return { available: ok, provider: 'openai', models: ok ? [cfg.openaiModel] : [] };
    }
  }
}

// ────────── Chat Implementations ──────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  citations?: AiCitation[];
}

/** Unified chat function — dispatches to the configured provider. */
async function llmChat(messages: ChatMessage[]): Promise<string> {
  const cfg = getAiConfig();
  switch (cfg.provider) {
    case 'local':
      return localChat(messages, cfg);
    case 'gemini':
      return geminiChat(messages, cfg);
    case 'groq':
      return openaiCompatibleChat(messages, {
        apiKey: cfg.groqApiKey,
        baseUrl: 'https://api.groq.com/openai',
        model: cfg.groqModel,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        providerName: 'Groq',
        keyMissing: 'Groq API key not configured. Get a free key at console.groq.com',
      });
    case 'openrouter':
      return openaiCompatibleChat(messages, {
        apiKey: cfg.openrouterApiKey,
        baseUrl: 'https://openrouter.ai/api',
        model: cfg.openrouterModel,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        providerName: 'OpenRouter',
        keyMissing: 'OpenRouter API key not configured. Get a free key at openrouter.ai/keys',
        extraHeaders: { 'HTTP-Referer': 'https://schedulesync.app', 'X-Title': 'ScheduleSync' },
      });
    default:
      return openaiCompatibleChat(messages, {
        apiKey: cfg.openaiApiKey,
        baseUrl: cfg.openaiBaseUrl,
        model: cfg.openaiModel,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        providerName: 'OpenAI',
        keyMissing: 'OpenAI API key not configured. Open AI Settings to add your key.',
      });
  }
}

/** Chat using the embedded local model preset (node-llama-cpp + GGUF). */
async function localChat(messages: ChatMessage[], cfg: AiProviderConfig): Promise<string> {
  const { LlamaChatSession } = await import('node-llama-cpp');
  const context = await getContext(cfg.localModelId);

  // Extract system prompt and build conversation history
  const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt,
  });

  // Feed existing conversation history (all except the last user message)
  const historyMsgs = conversationMessages.slice(0, -1);
  for (let i = 0; i < historyMsgs.length; i += 2) {
    const userMsg = historyMsgs[i];
    const asstMsg = historyMsgs[i + 1];
    if (userMsg?.role === 'user' && asstMsg?.role === 'assistant') {
      session.setChatHistory([
        ...session.getChatHistory(),
        { type: 'user', text: userMsg.content },
        { type: 'model', response: [asstMsg.content] },
      ]);
    }
  }

  // Send the last user message and get the response
  const lastUserMsg = conversationMessages[conversationMessages.length - 1];
  if (!lastUserMsg || lastUserMsg.role !== 'user') {
    throw new Error('No user message to send to local model');
  }

  const response = await session.prompt(lastUserMsg.content, {
    maxTokens: cfg.maxTokens,
    temperature: cfg.temperature,
  });

  await session.dispose?.();
  return response;
}

async function localConversationChat(
  conversationId: string,
  systemPrompt: string,
  persistedHistoryCount: number,
  historyWithoutPendingUser: ChatMessage[],
  pendingUserMessage: string,
  cfg: AiProviderConfig,
): Promise<{ response: string; session: any }> {
  const session = await getConversationChatSession(
    conversationId,
    systemPrompt,
    toLocalChatHistory(historyWithoutPendingUser),
    persistedHistoryCount,
    cfg.localModelId,
  );

  const response = await session.prompt(pendingUserMessage, {
    maxTokens: cfg.maxTokens,
    temperature: cfg.temperature,
  });

  return { response, session };
}

/** OpenAI-compatible chat — works for OpenAI, Groq, and OpenRouter. */
async function openaiCompatibleChat(
  messages: ChatMessage[],
  opts: {
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    maxTokens: number;
    providerName: string;
    keyMissing: string;
    extraHeaders?: Record<string, string>;
  },
): Promise<string> {
  if (!opts.apiKey) {
    throw new Error(opts.keyMissing);
  }
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opts.apiKey}`,
      ...opts.extraHeaders,
    },
    body: JSON.stringify({
      model: opts.model,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${opts.providerName} error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? '';
}

/** Google Gemini chat — uses the Gemini REST API (different format from OpenAI). */
async function geminiChat(messages: ChatMessage[], cfg: AiProviderConfig): Promise<string> {
  if (!cfg.geminiApiKey) {
    throw new Error('Gemini API key not configured. Get a free key at aistudio.google.com/apikey');
  }

  // Convert OpenAI-style messages to Gemini format
  const systemInstruction = messages.find((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.geminiModel}:generateContent?key=${cfg.geminiApiKey}`;
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: cfg.temperature,
      maxOutputTokens: cfg.maxTokens,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ────────── Conversation Compression ──────────

/**
 * Compress conversation history to fit within the provider's context window.
 * Keeps the system prompt + first context message + last N messages,
 * summarizing older messages into a compact "conversation so far" block.
 */
function compressHistory(
  history: ChatMessage[],
  maxMessages: number,
): ChatMessage[] {
  if (history.length <= maxMessages) return history;

  // Keep the first message (has project context) and last N messages
  const firstMsg = history[0];
  const recentMessages = history.slice(-maxMessages + 1);
  const droppedMessages = history.slice(1, -maxMessages + 1);

  // Build a brief summary of dropped messages
  const summaryParts: string[] = [];
  for (const m of droppedMessages) {
    const short = m.content.slice(0, 120).replace(/\n/g, ' ');
    summaryParts.push(`[${m.role}]: ${short}...`);
  }

  const summaryMsg: ChatMessage = {
    role: 'user',
    content: `[Earlier conversation summary — ${droppedMessages.length} messages compressed]\n${summaryParts.join('\n')}`,
  };

  return [firstMsg, summaryMsg, ...recentMessages];
}

/** Determine max conversation messages based on provider context size. */
function getMaxHistoryMessages(): number {
  const cfg = getAiConfig();
  const limit = PROVIDER_CONTEXT_LIMITS[cfg.provider] ?? 32768;
  if (limit >= 128000) return 40; // Large context (Gemini, GPT-4o, larger local models)
  if (limit >= 32768) return 20;  // Medium context (Groq, OpenRouter)
  return 10;                       // Small context
}

/** System prompt — concise and directive for both local and cloud models. */
function buildSystemPrompt(
  learnedPatterns: string,
  memoryText: string,
  learningText = '',
  citationText = '',
): string {
  const cfg = getAiConfig();
  const isLocal = cfg.provider === 'local';

  // Keep prompt compact for local models, more detailed for cloud
  const base = isLocal
    ? `You are a construction scheduling expert in a project management app. Be concise.
Key skills: task durations, dependencies (FS/SS/FF/SF), critical path analysis, CSI MasterFormat, resource optimization.
Rules: Use bullet points. Give specific values (days, dependency types). State uncertainty as ranges.`
    : `You are a construction project scheduling expert assistant embedded in a scheduling application similar to Microsoft Project.
Your role is to help users build, optimize, and maintain construction schedules.
Key capabilities: suggest task names/durations/dependencies, identify critical path issues, recommend construction sequences, explain scheduling concepts, suggest schedule improvements.
Domain knowledge: CSI MasterFormat divisions, typical construction durations, predecessor/successor relationships, weather/crew/productivity factors.
Guidelines: Be concise and actionable. Specify exact field values. Format task suggestions as structured data. Consider critical path impact.`;

  const parts = [base];
  if (memoryText) parts.push(`User preferences and corrections:\n${memoryText}`);
  if (learnedPatterns) parts.push(`Learned patterns:\n${learnedPatterns}`);
  if (learningText) parts.push(learningText);
  if (citationText) parts.push(citationText);
  if (memoryText || learnedPatterns) parts.push('Apply remembered preferences — they override defaults.');

  return parts.join('\n\n');
}

/**
 * Chat with the AI about a project. Maintains conversation history,
 * integrates persistent memory, and compresses history for small-context models.
 */
export async function chat(
  projectId: string,
  userMessage: string,
  conversationId?: string,
): Promise<{ conversationId: string; response: string; citations: AiCitation[] }> {
  // Load or create conversation
  let conversation = conversationId
    ? await prisma.aiConversation.findUnique({ where: { id: conversationId } })
    : null;

  if (!conversation) {
    conversation = await prisma.aiConversation.create({
      data: { projectId, messages: '[]' },
    });
  }

  const history: ChatMessage[] = JSON.parse(conversation.messages);

  // Build context from project data + learned patterns + persistent memory
  const [projectContext, patterns, memoryText, learningText, citations] = await Promise.all([
    buildProjectContext(projectId),
    getLearnedPatternsText(projectId),
    getMemoryText(projectId),
    getLearningContext(projectId, userMessage),
    retrieveScheduleCitations(projectId, userMessage),
  ]);
  const citationText = formatCitationContext(citations);

  const systemMsg: ChatMessage = {
    role: 'system',
    content: buildSystemPrompt(patterns, memoryText, learningText, citationText),
  };

  // Include project context in the first user message or refresh periodically
  const contextPrefix =
    history.length === 0
      ? `[Current project context]\n${projectContext}\n\n`
      : '';

  const newUserMsg: ChatMessage = {
    role: 'user',
    content: `${contextPrefix}${userMessage}`,
  };

  history.push(newUserMsg);

  // Compress history for providers with smaller context windows
  const maxMessages = getMaxHistoryMessages();
  const compressed = compressHistory(history, maxMessages);
  const cfg = getAiConfig();
  const persistedHistoryCount = history.length - 1;

  // Call LLM
  let responseText: string;
  let localSession: any = null;

  if (cfg.provider === 'local') {
    const localResult = await localConversationChat(
      conversation.id,
      systemMsg.content,
      persistedHistoryCount,
      compressed.slice(0, -1),
      newUserMsg.content,
      cfg,
    );
    responseText = localResult.response;
    localSession = localResult.session;
  } else {
    responseText = await llmChat([systemMsg, ...compressed]);
  }

  const assistantMsg: ChatMessage = {
    role: 'assistant',
    content: responseText,
    citations,
  };
  history.push(assistantMsg);

  // Persist full (uncompressed) conversation
  await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: {
      messages: JSON.stringify(history),
      updatedAt: new Date(),
    },
  });

  if (localSession) {
    updateConversationChatSession(
      conversation.id,
      systemMsg.content,
      history.length,
      localSession,
      cfg.localModelId,
    );
  }

  // Async learning — don't block the response
  Promise.all([
    extractAndStorePatterns(projectId),
    learnFromConversation(projectId, userMessage, responseText),
  ]).catch(() => {});

  return { conversationId: conversation.id, response: responseText, citations };
}

/**
 * Get a quick AI suggestion for a specific action (non-conversational).
 * Includes memory context for more personalized suggestions.
 */
export async function suggest(
  projectId: string,
  suggestionType: 'duration' | 'dependency' | 'name' | 'resource' | 'general',
  context: Record<string, unknown>,
): Promise<{ suggestion: string; citations: AiCitation[] }> {
  const promptText = `Suggestion type ${suggestionType}. Context: ${JSON.stringify(context)}`;
  const [projectContext, patterns, memoryText, learningText, citations] = await Promise.all([
    buildProjectContext(projectId),
    getLearnedPatternsText(projectId),
    getMemoryText(projectId),
    getLearningContext(projectId, promptText, context),
    retrieveScheduleCitations(projectId, promptText),
  ]);
  const citationText = formatCitationContext(citations);

  const prompts: Record<string, string> = {
    duration: `Given this task context, suggest an appropriate duration in working days. Task: ${JSON.stringify(context)}`,
    dependency: `Given these tasks, suggest logical predecessor/successor relationships. Tasks: ${JSON.stringify(context)}`,
    name: `Suggest a proper construction task name for this activity. Context: ${JSON.stringify(context)}`,
    resource: `Suggest appropriate resource assignments for this task. Task: ${JSON.stringify(context)}`,
    general: `Analyze this project data and suggest improvements. Context: ${JSON.stringify(context)}`,
  };

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(patterns, memoryText, learningText, citationText) },
    {
      role: 'user',
      content: `[Project summary]\n${projectContext}\n\n${prompts[suggestionType]}\n\nRespond with a concise, actionable suggestion.`,
    },
  ];

  const suggestion = await llmChat(messages);

  await logAiSuggestionEvent({
    projectId,
    suggestionType,
    entityId: toOptionalString(context.taskId),
    taskName: toOptionalString(context.taskName) ?? toOptionalString(context.name),
    suggestion,
    context,
    citations,
  });

  return { suggestion, citations };
}

/**
 * Record user feedback on an AI suggestion (accepted/rejected/corrected).
 * Also triggers memory learning for continuous improvement.
 */
export async function recordFeedback(
  projectId: string,
  suggestionType: string,
  suggestion: Record<string, unknown>,
  accepted: boolean,
  correctedValue?: string,
): Promise<void> {
  await prisma.aiFeedback.create({
    data: {
      projectId,
      suggestionType,
      suggestion: JSON.stringify(suggestion),
      accepted,
      correctedValue: correctedValue ?? null,
    },
  });

  // Learn from this feedback asynchronously
  learnFromFeedback(projectId, suggestionType, suggestion, accepted, correctedValue).catch(() => {});
  logAiFeedbackEvent({ projectId, suggestionType, suggestion, accepted, correctedValue }).catch(() => {});
}

/** Compile learned patterns into a text summary for the system prompt. */
async function getLearnedPatternsText(projectId: string): Promise<string> {
  const patterns = await prisma.aiPattern.findMany({
    where: { confidence: { gte: 0.5 } },
    orderBy: { confidence: 'desc' },
    take: 20,
  });

  if (patterns.length === 0) return '';

  return patterns
    .map((p) => {
      const data = JSON.parse(p.pattern);
      return `- ${p.patternType}: ${JSON.stringify(data)} (confidence: ${(p.confidence * 100).toFixed(0)}%, seen ${p.occurrenceCount}x)`;
    })
    .join('\n');
}

function toLocalChatHistory(messages: ChatMessage[]): ChatHistoryItem[] {
  const history: ChatHistoryItem[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      history.push({ type: 'user', text: message.content });
      continue;
    }

    if (message.role === 'assistant') {
      history.push({ type: 'model', response: [message.content] });
    }
  }

  return history;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * LocalModelManager manages the embedded GGUF language model lifecycle.
 *
 * It handles model preset selection, download, adaptive model/context loading,
 * local chat-session reuse, inactivity-based unloading, and status reporting.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatHistoryItem } from 'node-llama-cpp';
import { runtimeConfig } from '../runtimeConfig.js';

interface LocalModelDefinition {
  label: string;
  huggingFaceRepo: string;
  fileName: string;
  description: string;
  downloadSizeGb: number;
  recommended?: boolean;
}

const LOCAL_MODEL_DEFINITIONS = {
  'qwen3-14b': {
    label: 'Qwen3-14B Q4_K_M',
    huggingFaceRepo: 'Qwen/Qwen3-14B-GGUF',
    fileName: 'Qwen3-14B-Q4_K_M.gguf',
    description: 'Best balance of reasoning quality and practicality for ScheduleSync local AI.',
    downloadSizeGb: 8.9,
    recommended: true,
  },
  'phi-3.5-mini': {
    label: 'Phi-3.5-mini-instruct Q4_K_M',
    huggingFaceRepo: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    fileName: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    description: 'Smaller and faster local fallback with lower memory pressure.',
    downloadSizeGb: 2.3,
    recommended: false,
  },
} as const satisfies Record<string, LocalModelDefinition>;

export type LocalModelPresetId = keyof typeof LOCAL_MODEL_DEFINITIONS;

export interface LocalModelPreset {
  id: LocalModelPresetId;
  label: string;
  description: string;
  downloadSizeGb: number;
  fileName: string;
  recommended: boolean;
}

export const DEFAULT_LOCAL_MODEL_ID: LocalModelPresetId = 'qwen3-14b';
export const LOCAL_MODEL_PRESET_IDS = Object.keys(LOCAL_MODEL_DEFINITIONS) as LocalModelPresetId[];
export const LOCAL_MODEL_CONTEXT_LIMIT = 32768;
const LOCAL_MODEL_CONTEXT_MIN = 8192;
const GPU_CONTEXT_BATCH_SIZE = 1024;
const CPU_CONTEXT_BATCH_SIZE = 512;

/** Inactivity timeout before the model is unloaded from RAM (ms). */
const UNLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const MODELS_DIR = runtimeConfig.modelsDir;

export type ModelState =
  | 'not-downloaded'
  | 'downloading'
  | 'ready'
  | 'loading'
  | 'loaded'
  | 'error';

export interface ModelStatus {
  state: ModelState;
  progress?: number;
  modelId: LocalModelPresetId;
  modelName: string;
  modelPath: string;
  description: string;
  downloadSizeGb: number;
  recommended: boolean;
  error?: string;
}

let activeModelId: LocalModelPresetId = DEFAULT_LOCAL_MODEL_ID;
let state: ModelState = 'not-downloaded';
let downloadProgress = 0;
let lastError: string | undefined;
let unloadTimer: ReturnType<typeof setTimeout> | null = null;

// node-llama-cpp instances are loaded lazily.
let llamaInstance: any = null;
let modelInstance: any = null;
let contextInstance: any = null;
let cachedChatSession:
  | {
    modelId: LocalModelPresetId;
    conversationId: string;
    messageCount: number;
    systemPrompt: string;
    session: any;
  }
  | null = null;

export function resolveLocalModelId(modelId?: string | null): LocalModelPresetId {
  if (!modelId) {
    return DEFAULT_LOCAL_MODEL_ID;
  }

  return Object.prototype.hasOwnProperty.call(LOCAL_MODEL_DEFINITIONS, modelId)
    ? (modelId as LocalModelPresetId)
    : DEFAULT_LOCAL_MODEL_ID;
}

export function listLocalModelPresets(): LocalModelPreset[] {
  return LOCAL_MODEL_PRESET_IDS.map((id) => {
    const preset = LOCAL_MODEL_DEFINITIONS[id];
    return {
      id,
      label: preset.label,
      description: preset.description,
      downloadSizeGb: preset.downloadSizeGb,
      fileName: preset.fileName,
      recommended: !!preset.recommended,
    };
  });
}

export function getModelStatus(modelId?: string | null): ModelStatus {
  const resolvedModelId = resolveLocalModelId(modelId);
  const preset = LOCAL_MODEL_DEFINITIONS[resolvedModelId];
  const modelPath = getModelPath(resolvedModelId);
  const isActiveModel = activeModelId === resolvedModelId;

  return {
    state: isActiveModel ? state : (existsSync(modelPath) ? 'ready' : 'not-downloaded'),
    progress: isActiveModel && state === 'downloading' ? downloadProgress : undefined,
    modelId: resolvedModelId,
    modelName: preset.label,
    modelPath,
    description: preset.description,
    downloadSizeGb: preset.downloadSizeGb,
    recommended: !!preset.recommended,
    error: isActiveModel ? lastError : undefined,
  };
}

export async function ensureModel(modelId?: string | null): Promise<void> {
  const resolvedModelId = await activateModel(modelId);
  const preset = LOCAL_MODEL_DEFINITIONS[resolvedModelId];
  const modelPath = getModelPath(resolvedModelId);

  if (state === 'downloading' || state === 'loading' || state === 'loaded') return;

  if (existsSync(modelPath)) {
    state = 'ready';
    return;
  }

  state = 'downloading';
  downloadProgress = 0;
  lastError = undefined;

  try {
    mkdirSync(MODELS_DIR, { recursive: true });

    const { createModelDownloader } = await import('node-llama-cpp');

    console.log(`[LocalModelManager] Downloading ${preset.label} from ${preset.huggingFaceRepo}...`);

    const downloader = await createModelDownloader({
      modelUri: `hf:${preset.huggingFaceRepo}/${preset.fileName}`,
      dirPath: MODELS_DIR,
      fileName: preset.fileName,
      onProgress: ({ downloadedSize, totalSize }: { downloadedSize: number; totalSize: number }) => {
        if (totalSize > 0) {
          downloadProgress = Math.round((downloadedSize / totalSize) * 100);
        }
      },
    });

    await downloader.download();

    state = 'ready';
    console.log(`[LocalModelManager] Download complete: ${modelPath}`);
  } catch (err: unknown) {
    state = 'error';
    lastError = err instanceof Error ? err.message : String(err);
    console.error('[LocalModelManager] Download failed:', lastError);
  }
}

export async function getContext(modelId?: string | null): Promise<any> {
  const resolvedModelId = await activateModel(modelId);
  const preset = LOCAL_MODEL_DEFINITIONS[resolvedModelId];
  const modelPath = getModelPath(resolvedModelId);

  resetUnloadTimer();

  if (contextInstance) {
    return contextInstance;
  }

  if (state !== 'ready' && state !== 'loaded') {
    if (state === 'not-downloaded' || state === 'error') {
      await ensureModel(resolvedModelId);
    }
    if (state === 'downloading') {
      throw new Error(`Model is still downloading (${downloadProgress}%). Please wait.`);
    }
    if (state === 'error') {
      throw new Error(`Model download failed: ${lastError}`);
    }
  }

  state = 'loading';
  console.log(`[LocalModelManager] Loading ${preset.label} into memory...`);

  try {
    const { getLlama } = await import('node-llama-cpp');
    llamaInstance = await getLlama({
      gpu: 'auto',
      build: runtimeConfig.isDesktopRuntime ? 'never' : 'auto',
      skipDownload: runtimeConfig.isDesktopRuntime,
      usePrebuiltBinaries: true,
    });

    const gpuEnabled = llamaInstance.supportsGpuOffloading && llamaInstance.gpu !== false;
    const gpuBackend = gpuEnabled ? String(llamaInstance.gpu) : 'cpu';
    const gpuDevices = gpuEnabled ? await llamaInstance.getGpuDeviceNames().catch(() => []) : [];
    const useMmap = gpuEnabled ? llamaInstance.gpuSupportsMmap : llamaInstance.supportsMmap;

    console.log(
      `[LocalModelManager] Runtime backend: ${gpuBackend}${
        gpuDevices.length > 0 ? ` (${gpuDevices.join(', ')})` : ''
      }`,
    );

    modelInstance = await llamaInstance.loadModel({
      modelPath,
      gpuLayers: gpuEnabled
        ? {
          fitContext: {
            contextSize: LOCAL_MODEL_CONTEXT_LIMIT,
          },
        }
        : 0,
      useMmap,
      defaultContextFlashAttention: gpuEnabled,
    });

    contextInstance = await createOptimizedContext({
      gpuEnabled,
      flashAttentionEnabled: gpuEnabled && modelInstance.flashAttentionSupported,
    });

    state = 'loaded';
    console.log(
      `[LocalModelManager] Model loaded. GPU layers=${modelInstance.gpuLayers}, context=${contextInstance.contextSize}, batch=${contextInstance.batchSize}, flashAttention=${contextInstance.flashAttention}`,
    );
    return contextInstance;
  } catch (err: unknown) {
    state = 'error';
    lastError = err instanceof Error ? err.message : String(err);
    console.error('[LocalModelManager] Failed to load model:', lastError);
    throw err;
  }
}

export function getLoadedModel(): any {
  return modelInstance;
}

export async function getConversationChatSession(
  conversationId: string,
  systemPrompt: string,
  history: ChatHistoryItem[],
  messageCount: number,
  modelId?: string | null,
): Promise<any> {
  const resolvedModelId = await activateModel(modelId);
  resetUnloadTimer();

  if (
    cachedChatSession &&
    cachedChatSession.modelId === resolvedModelId &&
    cachedChatSession.conversationId === conversationId &&
    cachedChatSession.systemPrompt === systemPrompt &&
    cachedChatSession.messageCount === messageCount &&
    !cachedChatSession.session.disposed
  ) {
    return cachedChatSession.session;
  }

  await invalidateConversationChatSession();

  const context = await getContext(resolvedModelId);
  const { LlamaChatSession } = await import('node-llama-cpp');
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt,
    autoDisposeSequence: true,
  });

  if (history.length > 0) {
    session.setChatHistory(history);
  }

  cachedChatSession = {
    modelId: resolvedModelId,
    conversationId,
    messageCount,
    systemPrompt,
    session,
  };

  return session;
}

export function updateConversationChatSession(
  conversationId: string,
  systemPrompt: string,
  messageCount: number,
  session: any,
  modelId?: string | null,
): void {
  const resolvedModelId = resolveLocalModelId(modelId);
  if (
    cachedChatSession &&
    cachedChatSession.modelId === resolvedModelId &&
    cachedChatSession.session === session &&
    cachedChatSession.conversationId === conversationId
  ) {
    cachedChatSession.systemPrompt = systemPrompt;
    cachedChatSession.messageCount = messageCount;
  }
}

export async function invalidateConversationChatSession(conversationId?: string): Promise<void> {
  if (!cachedChatSession) {
    return;
  }

  if (conversationId && cachedChatSession.conversationId !== conversationId) {
    return;
  }

  const session = cachedChatSession.session;
  cachedChatSession = null;

  try {
    session.dispose?.();
  } catch {
  }
}

export async function unloadModel(): Promise<void> {
  if (unloadTimer) {
    clearTimeout(unloadTimer);
    unloadTimer = null;
  }

  await invalidateConversationChatSession();

  if (contextInstance) {
    await contextInstance.dispose?.();
    contextInstance = null;
  }
  if (modelInstance) {
    await modelInstance.dispose?.();
    modelInstance = null;
  }

  if (state === 'loaded' || state === 'loading' || state === 'error') {
    state = existsSync(getModelPath(activeModelId)) ? 'ready' : 'not-downloaded';
  }
  downloadProgress = 0;
  lastError = undefined;
  console.log('[LocalModelManager] Model unloaded from memory.');
}

export async function shutdown(): Promise<void> {
  await unloadModel();
  if (llamaInstance) {
    await llamaInstance.dispose?.();
    llamaInstance = null;
  }
}

export function isModelReady(modelId?: string | null): boolean {
  const resolvedModelId = resolveLocalModelId(modelId);
  if (activeModelId === resolvedModelId) {
    return state === 'ready' || state === 'loaded';
  }

  return existsSync(getModelPath(resolvedModelId));
}

export function isModelLoaded(): boolean {
  return state === 'loaded' && !!contextInstance;
}

function resetUnloadTimer(): void {
  if (unloadTimer) clearTimeout(unloadTimer);
  unloadTimer = setTimeout(() => {
    console.log('[LocalModelManager] Inactivity timeout, unloading model...');
    unloadModel().catch(() => {});
  }, UNLOAD_TIMEOUT_MS);
}

async function createOptimizedContext({
  gpuEnabled,
  flashAttentionEnabled,
}: {
  gpuEnabled: boolean;
  flashAttentionEnabled: boolean;
}): Promise<any> {
  const baseOptions = {
    contextSize: {
      min: LOCAL_MODEL_CONTEXT_MIN,
      max: LOCAL_MODEL_CONTEXT_LIMIT,
    },
    batchSize: gpuEnabled ? GPU_CONTEXT_BATCH_SIZE : CPU_CONTEXT_BATCH_SIZE,
    failedCreationRemedy: {
      retries: 4,
      autoContextSizeShrink: 0.16,
    },
  };

  if (flashAttentionEnabled) {
    try {
      return await modelInstance.createContext({
        ...baseOptions,
        flashAttention: true,
      });
    } catch (err) {
      console.warn(
        `[LocalModelManager] Flash attention context creation failed, retrying without it: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return modelInstance.createContext({
    ...baseOptions,
    flashAttention: false,
  });
}

async function activateModel(modelId?: string | null): Promise<LocalModelPresetId> {
  const resolvedModelId = resolveLocalModelId(modelId);

  if (activeModelId === resolvedModelId) {
    if (state === 'not-downloaded' && existsSync(getModelPath(resolvedModelId))) {
      state = 'ready';
    }
    return resolvedModelId;
  }

  await unloadModel();
  activeModelId = resolvedModelId;
  state = existsSync(getModelPath(resolvedModelId)) ? 'ready' : 'not-downloaded';
  downloadProgress = 0;
  lastError = undefined;
  return resolvedModelId;
}

function getModelPath(modelId: LocalModelPresetId): string {
  return join(MODELS_DIR, LOCAL_MODEL_DEFINITIONS[modelId].fileName);
}

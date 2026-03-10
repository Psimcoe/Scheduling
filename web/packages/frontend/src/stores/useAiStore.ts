/**
 * AI store — manages chat state, suggestions, and AI provider connection status.
 */

import { create } from 'zustand';
import {
  aiApi,
  type AiChatResponse,
  type AiCitation,
  type AiConfigResponse,
  type ModelStatus,
} from '../api/client.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: AiCitation[];
}

interface AiState {
  // Panel visibility
  panelOpen: boolean;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;

  // Connection
  aiAvailable: boolean;
  aiProvider: string;
  availableModels: string[];
  modelStatus: ModelStatus | null;
  checkHealth: () => Promise<void>;

  // Chat
  conversationId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;

  sendMessage: (projectId: string, message: string) => Promise<void>;
  newConversation: () => void;
  loadConversation: (conversationId: string) => Promise<void>;

  // Quick suggestions
  suggestion: string | null;
  suggestionCitations: AiCitation[];
  isSuggesting: boolean;
  requestSuggestion: (
    projectId: string,
    type: 'duration' | 'dependency' | 'name' | 'resource' | 'general',
    context: Record<string, unknown>,
  ) => Promise<void>;
  clearSuggestion: () => void;

  // Configuration (loaded from backend)
  config: AiConfigResponse | null;
  loadConfig: () => Promise<void>;
  saveConfig: (updates: Record<string, unknown>) => Promise<void>;
}

export const useAiStore = create<AiState>((set, get) => ({
  panelOpen: false,
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),

  aiAvailable: false,
  aiProvider: 'local',
  availableModels: [],
  modelStatus: null,
  checkHealth: async () => {
    try {
      const health = await aiApi.health();
      set({
        aiAvailable: health.available,
        aiProvider: health.provider,
        availableModels: health.models,
        modelStatus: health.localModelStatus ?? null,
      });
    } catch {
      set({ aiAvailable: false, availableModels: [], modelStatus: null });
    }
  },

  conversationId: null,
  messages: [],
  isLoading: false,
  error: null,

  sendMessage: async (projectId, message) => {
    const { conversationId, messages } = get();

    // Add user message immediately
    const userMsg: ChatMessage = { role: 'user', content: message };
    set({ messages: [...messages, userMsg], isLoading: true, error: null });

    try {
      const result: AiChatResponse = await aiApi.chat(
        projectId,
        message,
        conversationId ?? undefined,
      );

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.response,
        citations: result.citations ?? [],
      };

      set((s) => ({
        conversationId: result.conversationId,
        messages: [...s.messages, assistantMsg],
        isLoading: false,
      }));
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : 'Failed to get AI response';
      set((s) => ({
        isLoading: false,
        error: errMsg,
        messages: s.messages,
      }));
    }
  },

  newConversation: () =>
    set({ conversationId: null, messages: [], error: null }),

  loadConversation: async (conversationId) => {
    try {
      const conv = await aiApi.getConversation(conversationId);
      set({
        conversationId: conv.id,
        messages: conv.messages as ChatMessage[],
        error: null,
      });
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : 'Failed to load conversation';
      set({ error: errMsg });
    }
  },

  suggestion: null,
  suggestionCitations: [],
  isSuggesting: false,
  requestSuggestion: async (projectId, type, context) => {
    set({ isSuggesting: true, suggestion: null, suggestionCitations: [] });
    try {
      const result = await aiApi.suggest(projectId, type, context);
      set({ suggestion: result.suggestion, suggestionCitations: result.citations ?? [], isSuggesting: false });
    } catch {
      set({ isSuggesting: false, suggestionCitations: [] });
    }
  },
  clearSuggestion: () => set({ suggestion: null, suggestionCitations: [] }),

  config: null,
  loadConfig: async () => {
    try {
      const cfg = await aiApi.getConfig();
      set({ config: cfg });
    } catch {
      // ignore
    }
  },
  saveConfig: async (updates) => {
    try {
      const cfg = await aiApi.updateConfig(updates);
      set({ config: cfg });
      // Re-check health after config change
      await get().checkHealth();
    } catch {
      // ignore
    }
  },
}));

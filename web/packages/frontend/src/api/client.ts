/**
 * API client — thin wrapper around fetch for the backend REST API.
 */

const BASE = '/api';

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    },
    ...init,
  });

  if (res.status === 204) return undefined as unknown as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

// ---------- Projects ----------

export interface ProjectSummaryResponse {
  id: string;
  name: string;
  startDate: string;
  finishDate: string | null;
  projectType: string | null;
  sector: string | null;
  region: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetailResponse extends ProjectSummaryResponse {
  defaultCalendarId: string;
  scheduleFrom: string;
  statusDate: string | null;
  _count?: {
    tasks: number;
    calendars: number;
    resources: number;
  };
}

export const projectsApi = {
  list: () => request<ProjectSummaryResponse[]>('/projects'),
  get: (id: string) => request<ProjectDetailResponse>(`/projects/${id}`),
  create: (data: { name: string; startDate: string; projectType?: string | null; sector?: string | null; region?: string | null }) =>
    request<ProjectDetailResponse>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    request<ProjectDetailResponse>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/projects/${id}`, { method: 'DELETE' }),
};

// ---------- Tasks ----------

export const tasksApi = {
  list: (projectId: string) =>
    request<any[]>(`/projects/${projectId}/tasks`),
  get: (projectId: string, taskId: string) =>
    request<any>(`/projects/${projectId}/tasks/${taskId}`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (projectId: string, taskId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  batchUpdate: (
    projectId: string,
    updates: { id: string; data: Record<string, unknown> }[],
    recalc = true,
  ) =>
    request<{ updated: number }>(`/projects/${projectId}/tasks/batch`, {
      method: 'POST',
      body: JSON.stringify({ updates, recalculate: recalc }),
    }),
  delete: (projectId: string, taskId: string) =>
    request<void>(`/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
    }),
  recalculate: (projectId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/tasks/recalculate`, {
      method: 'POST',
    }),
};

// ---------- Dependencies ----------

export const dependenciesApi = {
  list: (projectId: string) =>
    request<any[]>(`/projects/${projectId}/dependencies`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/dependencies`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (projectId: string, depId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/dependencies/${depId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, depId: string) =>
    request<void>(`/projects/${projectId}/dependencies/${depId}`, {
      method: 'DELETE',
    }),
};

// ---------- Calendars ----------

export const calendarsApi = {
  list: (projectId: string) =>
    request<any[]>(`/projects/${projectId}/calendars`),
  get: (projectId: string, calId: string) =>
    request<any>(`/projects/${projectId}/calendars/${calId}`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/calendars`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (projectId: string, calId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/calendars/${calId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, calId: string) =>
    request<void>(`/projects/${projectId}/calendars/${calId}`, {
      method: 'DELETE',
    }),
  addException: (
    projectId: string,
    calId: string,
    data: Record<string, unknown>,
  ) =>
    request<any>(`/projects/${projectId}/calendars/${calId}/exceptions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteException: (projectId: string, calId: string, excId: string) =>
    request<void>(
      `/projects/${projectId}/calendars/${calId}/exceptions/${excId}`,
      { method: 'DELETE' },
    ),
};

// ---------- Resources ----------

export const resourcesApi = {
  list: (projectId: string) =>
    request<any[]>(`/projects/${projectId}/resources`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/resources`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    projectId: string,
    resId: string,
    data: Record<string, unknown>,
  ) =>
    request<any>(`/projects/${projectId}/resources/${resId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, resId: string) =>
    request<void>(`/projects/${projectId}/resources/${resId}`, {
      method: 'DELETE',
    }),
};

// ---------- Assignments ----------

export const assignmentsApi = {
  list: (projectId: string) =>
    request<any[]>(`/projects/${projectId}/assignments`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${projectId}/assignments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    projectId: string,
    assignId: string,
    data: Record<string, unknown>,
  ) =>
    request<any>(`/projects/${projectId}/assignments/${assignId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, assignId: string) =>
    request<void>(`/projects/${projectId}/assignments/${assignId}`, {
      method: 'DELETE',
    }),
};

// ---------- Baselines ----------

export const baselinesApi = {
  list: (projectId: string) =>
    request<Record<number, any[]>>(`/projects/${projectId}/baselines`),
  capture: (projectId: string, baselineIndex: number) =>
    request<{ baselineIndex: number; taskCount: number }>(
      `/projects/${projectId}/baselines`,
      { method: 'POST', body: JSON.stringify({ baselineIndex }) },
    ),
  clear: (projectId: string, index: number) =>
    request<void>(`/projects/${projectId}/baselines/${index}`, {
      method: 'DELETE',
    }),
};

// ---------- Import / Export ----------

export const importExportApi = {
  importMspdi: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(
      `${BASE}/projects/${projectId}/import-export/import/mspdi`,
      { method: 'POST', body: form },
    );
    if (!res.ok) throw new Error('Import failed');
    return res.json();
  },

  exportMspdi: async (projectId: string) => {
    const res = await fetch(
      `${BASE}/projects/${projectId}/import-export/export/mspdi`,
    );
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },

  previewUpdates: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(
      `${BASE}/projects/${projectId}/import-export/import/preview`,
      { method: 'POST', body: form },
    );
    if (!res.ok) throw new Error('Preview failed');
    return res.json();
  },

  applyUpdates: async (
    projectId: string,
    file: File,
    options?: Record<string, unknown>,
  ) => {
    const form = new FormData();
    form.append('file', file);
    if (options) form.append('options', JSON.stringify(options));
    const res = await fetch(
      `${BASE}/projects/${projectId}/import-export/import/apply`,
      { method: 'POST', body: form },
    );
    if (!res.ok) throw new Error('Apply failed');
    return res.json();
  },

  undo: (projectId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/import-export/undo`, {
      method: 'POST',
    }),
  redo: (projectId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/import-export/redo`, {
      method: 'POST',
    }),

  undoHistory: (projectId: string) =>
    request<{
      entries: { id: string; description: string; position: number; createdAt: string }[];
      currentPointer: number | null;
    }>(`/projects/${projectId}/import-export/undo-history`),

  exportCsv: async (projectId: string) => {
    const res = await fetch(`${BASE}/projects/${projectId}/import-export/export/csv`);
    if (!res.ok) throw new Error('CSV export failed');
    return res.blob();
  },

  exportJson: async (projectId: string) => {
    const res = await fetch(`${BASE}/projects/${projectId}/import-export/export/json`);
    if (!res.ok) throw new Error('JSON export failed');
    return res.blob();
  },

  exportExcel: async (projectId: string) => {
    const res = await fetch(`${BASE}/projects/${projectId}/import-export/export/excel`);
    if (!res.ok) throw new Error('Excel export failed');
    return res.blob();
  },

  bulkCsvImport: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(
      `${BASE}/projects/${projectId}/import-export/import/bulk-csv`,
      { method: 'POST', body: form },
    );
    if (!res.ok) throw new Error('Bulk CSV import failed');
    return res.json() as Promise<{ created: number; updated: number; errors: string[] }>;
  },
};

// ---------- AI ----------

export type AiProvider = 'local' | 'openai' | 'gemini' | 'groq' | 'openrouter';
export type LocalModelId = 'qwen3-14b' | 'phi-3.5-mini';

export interface AiCitation {
  chunkId: string;
  projectId: string;
  projectName: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface AiChatResponse {
  conversationId: string;
  response: string;
  citations?: AiCitation[];
}

export interface AiSuggestionResponse {
  suggestion: string;
  citations?: AiCitation[];
}

export interface AiHealthResponse {
  available: boolean;
  provider: string;
  models: string[];
  localModelStatus?: ModelStatus;
}

export interface ModelStatus {
  state: 'not-downloaded' | 'downloading' | 'ready' | 'loading' | 'loaded' | 'error';
  progress?: number;
  modelId: LocalModelId;
  modelName: string;
  modelPath: string;
  description: string;
  downloadSizeGb: number;
  recommended: boolean;
  error?: string;
}

export interface LocalModelPreset {
  id: LocalModelId;
  label: string;
  description: string;
  downloadSizeGb: number;
  fileName: string;
  recommended: boolean;
}

export interface AiConfigResponse {
  provider: AiProvider;
  localModelId: LocalModelId;
  localModels: LocalModelPreset[];
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKeySet: boolean;
  geminiModel: string;
  geminiApiKeySet: boolean;
  groqModel: string;
  groqApiKeySet: boolean;
  openrouterModel: string;
  openrouterApiKeySet: boolean;
  temperature: number;
  maxTokens: number;
  localModelStatus: ModelStatus;
}

export interface AiConversationSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiPatternEntry {
  id: string;
  patternType: string;
  pattern: string;
  confidence: number;
  occurrenceCount: number;
}

export interface AiPreset {
  provider: AiProvider;
  model: string;
  label: string;
}

export interface AiMemoryEntry {
  id: string;
  projectId: string | null;
  category: string;
  key: string;
  value: string;
  source: string;
  importance: number;
  uses: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiMemoryStats {
  total: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  avgImportance: number;
}

export const aiApi = {
  health: () => request<AiHealthResponse>('/ai/health'),

  modelStatus: () => request<ModelStatus>('/ai/model-status'),

  chat: (projectId: string, message: string, conversationId?: string) =>
    request<AiChatResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ projectId, message, conversationId }),
    }),

  suggest: (
    projectId: string,
    type: 'duration' | 'dependency' | 'name' | 'resource' | 'general',
    context: Record<string, unknown>,
  ) =>
    request<AiSuggestionResponse>('/ai/suggest', {
      method: 'POST',
      body: JSON.stringify({ projectId, type, context }),
    }),

  feedback: (
    projectId: string,
    suggestionType: string,
    suggestion: Record<string, unknown>,
    accepted: boolean,
    correctedValue?: string,
  ) =>
    request<void>('/ai/feedback', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        suggestionType,
        suggestion,
        accepted,
        correctedValue,
      }),
    }),

  listConversations: (projectId: string) =>
    request<AiConversationSummary[]>(
      `/ai/conversations?projectId=${encodeURIComponent(projectId)}`,
    ),

  getConversation: (id: string) =>
    request<{
      id: string;
      projectId: string;
      messages: { role: string; content: string; citations?: AiCitation[] }[];
    }>(`/ai/conversations/${id}`),

  deleteConversation: (id: string) =>
    request<void>(`/ai/conversations/${id}`, { method: 'DELETE' }),

  getPatterns: () => request<AiPatternEntry[]>('/ai/patterns'),

  getFeedbackStats: () =>
    request<{ total: number; accepted: number; acceptanceRate: number }>(
      '/ai/feedback/stats',
    ),

  getConfig: () => request<AiConfigResponse>('/ai/config'),

  updateConfig: (config: Record<string, unknown>) =>
    request<AiConfigResponse>('/ai/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  getPresets: () => request<Record<string, AiPreset>>('/ai/presets'),

  // Memory endpoints
  listMemories: (projectId?: string) =>
    request<AiMemoryEntry[]>(
      `/ai/memories${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
    ),

  getMemoryStats: () => request<AiMemoryStats>('/ai/memories/stats'),

  createMemory: (data: {
    projectId?: string | null;
    category: string;
    key: string;
    value: string;
    importance?: number;
  }) =>
    request<AiMemoryEntry>('/ai/memories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteMemory: (id: string) =>
    request<void>(`/ai/memories/${id}`, { method: 'DELETE' }),

  clearMemories: (projectId?: string) =>
    request<{ deleted: number }>(
      `/ai/memories${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
      { method: 'DELETE' },
    ),
};

// ---------- Advanced (Cost, EV, Splits, Recurring, Auto-link, Statistics) ----------

export const advancedApi = {
  recalculateCosts: (projectId: string) =>
    request<{ tasks: number }>(`/projects/${projectId}/advanced/costs/recalculate`, {
      method: 'POST',
    }),

  computeEarnedValue: (projectId: string) =>
    request<any>(`/projects/${projectId}/advanced/earned-value`, {
      method: 'POST',
    }),

  // Interim plans
  captureInterimPlan: (projectId: string, planIndex: number) =>
    request<{ saved: number; planIndex: number }>(
      `/projects/${projectId}/advanced/interim-plans`,
      { method: 'POST', body: JSON.stringify({ planIndex }) },
    ),

  getInterimPlans: (projectId: string, planIndex?: number) =>
    request<any[]>(
      `/projects/${projectId}/advanced/interim-plans${planIndex !== undefined ? `?planIndex=${planIndex}` : ''}`,
    ),

  // Task splits
  splitTask: (projectId: string, taskId: string, splitDate: string, resumeDate: string) =>
    request<any[]>(
      `/projects/${projectId}/advanced/tasks/${taskId}/split`,
      { method: 'POST', body: JSON.stringify({ splitDate, resumeDate }) },
    ),

  getTaskSplits: (projectId: string, taskId: string) =>
    request<any[]>(`/projects/${projectId}/advanced/tasks/${taskId}/splits`),

  // Recurring tasks
  createRecurringTask: (projectId: string, data: Record<string, unknown>) =>
    request<any>(
      `/projects/${projectId}/advanced/recurring-tasks`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // Auto-link
  autoLink: (projectId: string, taskIds?: string[]) =>
    request<{ linked: number }>(
      `/projects/${projectId}/advanced/auto-link`,
      { method: 'POST', body: JSON.stringify({ taskIds }) },
    ),

  // Project statistics
  getStatistics: (projectId: string) =>
    request<any>(`/projects/${projectId}/advanced/statistics`),
};

// ---------- Leveling ----------

export interface LevelingResult {
  delayedTasks: { taskId: string; taskName: string; delayMinutes: number }[];
  overAllocatedResources: string[];
}

export const levelingApi = {
  level: (projectId: string) =>
    request<LevelingResult>(`/projects/${projectId}/leveling/level`, {
      method: 'POST',
    }),
  clear: (projectId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/leveling/clear`, {
      method: 'POST',
    }),
};

// ---------- Custom Fields ----------

export interface CustomFieldDef {
  id: string;
  projectId: string;
  fieldName: string;
  displayName: string;
  fieldType: string;
  formula: string | null;
  lookupTableJson: string | null;
  indicatorRules: string | null;
}

export interface CustomFieldValue {
  id: string;
  taskId: string;
  fieldId: string;
  textValue: string | null;
  numberValue: number | null;
  dateValue: string | null;
  flagValue: boolean | null;
}

export const customFieldsApi = {
  list: (projectId: string) =>
    request<CustomFieldDef[]>(`/projects/${projectId}/custom-fields`),
  create: (projectId: string, data: Record<string, unknown>) =>
    request<CustomFieldDef>(`/projects/${projectId}/custom-fields`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (projectId: string, fieldId: string, data: Record<string, unknown>) =>
    request<CustomFieldDef>(`/projects/${projectId}/custom-fields/${fieldId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, fieldId: string) =>
    request<void>(`/projects/${projectId}/custom-fields/${fieldId}`, {
      method: 'DELETE',
    }),
  getValues: (projectId: string, fieldId: string) =>
    request<CustomFieldValue[]>(`/projects/${projectId}/custom-fields/${fieldId}/values`),
  setValue: (projectId: string, fieldId: string, data: Record<string, unknown>) =>
    request<CustomFieldValue>(`/projects/${projectId}/custom-fields/${fieldId}/values`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

/**
 * AiSettingsDialog — AI settings with built-in local model as default.
 * Cloud providers (Gemini, Groq, OpenRouter, OpenAI) available in advanced section.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Box, Typography, FormControl, InputLabel, Select, MenuItem,
  Slider, Divider, Alert, Chip, Tabs, Tab, LinearProgress, IconButton,
  Tooltip, List, ListItem, ListItemText, ListItemSecondaryAction,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudIcon from '@mui/icons-material/Cloud';
import ComputerIcon from '@mui/icons-material/Computer';
import { useUIStore } from '../../stores';
import { useAiStore } from '../../stores/useAiStore.js';
import {
  aiApi,
  type AiProvider,
  type AiMemoryEntry,
  type AiMemoryStats,
  type LocalModelId,
  type LocalModelPreset,
  type ModelStatus,
} from '../../api/client.js';

type CloudProvider = Exclude<AiProvider, 'local'>;

const CLOUD_PROVIDER_LABELS: Record<CloudProvider, string> = {
  gemini: 'Google Gemini (Free)',
  groq: 'Groq (Free)',
  openrouter: 'OpenRouter (Free models)',
  openai: 'OpenAI / Compatible',
};

const AiSettingsDialog: React.FC = () => {
  const openDialog = useUIStore((s) => s.openDialog);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const open = openDialog === 'aiSettings';

  const config = useAiStore((s) => s.config);
  const loadConfig = useAiStore((s) => s.loadConfig);
  const saveConfig = useAiStore((s) => s.saveConfig);
  const checkHealth = useAiStore((s) => s.checkHealth);

  // Tab state
  const [tab, setTab] = useState(0);

  // Provider config state
  const [provider, setProvider] = useState<AiProvider>('local');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('https://api.openai.com');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [openrouterModel, setOpenrouterModel] = useState('meta-llama/llama-3.3-70b-instruct:free');
  const [localModelId, setLocalModelId] = useState<LocalModelId>('qwen3-14b');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [localStatus, setLocalStatus] = useState<ModelStatus | null>(null);

  // Memory/learning state
  const [memories, setMemories] = useState<AiMemoryEntry[]>([]);
  const [memoryStats, setMemoryStats] = useState<AiMemoryStats | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<{ total: number; accepted: number; acceptanceRate: number } | null>(null);

  // Load config from backend when dialog opens
  useEffect(() => {
    if (open) {
      loadConfig().then(() => {
        const cfg = useAiStore.getState().config;
        if (cfg) {
          setProvider(cfg.provider);
          setLocalModelId(cfg.localModelId);
          setOpenaiBaseUrl(cfg.openaiBaseUrl);
          setOpenaiModel(cfg.openaiModel);
          setGeminiModel(cfg.geminiModel);
          setGroqModel(cfg.groqModel);
          setOpenrouterModel(cfg.openrouterModel);
          setTemperature(cfg.temperature);
          setMaxTokens(cfg.maxTokens);
          setLocalStatus(cfg.localModelStatus);
        }
      });
      // Also fetch live model status
      aiApi.modelStatus().then(setLocalStatus).catch(() => {});
      setTestStatus('idle');
    }
  }, [open, loadConfig]);

  // Poll model status during download
  useEffect(() => {
    if (!open || !localStatus || (localStatus.state !== 'downloading' && localStatus.state !== 'loading')) return;
    const interval = setInterval(() => {
      aiApi.modelStatus().then(setLocalStatus).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [open, localStatus?.state]);

  // Load memory/learning data when memory tab is active
  useEffect(() => {
    if (open && tab === 1) {
      aiApi.listMemories().then(setMemories).catch(() => {});
      aiApi.getMemoryStats().then(setMemoryStats).catch(() => {});
      aiApi.getFeedbackStats().then(setFeedbackStats).catch(() => {});
    }
  }, [open, tab]);

  const buildConfigPayload = useCallback(() => {
    const payload: Record<string, unknown> = {
      provider,
      localModelId,
      openaiBaseUrl, openaiModel,
      geminiModel, groqModel, openrouterModel,
      temperature, maxTokens,
    };
    if (openaiApiKey) payload.openaiApiKey = openaiApiKey;
    if (geminiApiKey) payload.geminiApiKey = geminiApiKey;
    if (groqApiKey) payload.groqApiKey = groqApiKey;
    if (openrouterApiKey) payload.openrouterApiKey = openrouterApiKey;
    return payload;
  }, [provider, localModelId, openaiApiKey, openaiBaseUrl, openaiModel, geminiApiKey, geminiModel, groqApiKey, groqModel, openrouterApiKey, openrouterModel, temperature, maxTokens]);

  const handleTestConnection = useCallback(async () => {
    setTestStatus('testing');
    try {
      await saveConfig(buildConfigPayload());
      await checkHealth();
      const health = useAiStore.getState().aiAvailable;
      setTestStatus(health ? 'success' : 'error');
    } catch {
      setTestStatus('error');
    }
  }, [buildConfigPayload, saveConfig, checkHealth]);

  const handleSave = useCallback(async () => {
    await saveConfig(buildConfigPayload());
    await checkHealth();
    closeDialog();
  }, [buildConfigPayload, saveConfig, checkHealth, closeDialog]);

  const handleDeleteMemory = useCallback(async (id: string) => {
    await aiApi.deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleClearMemories = useCallback(async () => {
    await aiApi.clearMemories();
    setMemories([]);
    aiApi.getMemoryStats().then(setMemoryStats).catch(() => {});
  }, []);

  if (!open) return null;

  // Helpers
  const isLocal = provider === 'local';
  const cloudProvider = isLocal ? null : (provider as CloudProvider);
  const localModels: LocalModelPreset[] = config?.localModels ?? [];
  const selectedLocalModel =
    localModels.find((model) => model.id === localModelId)
    ?? localModels[0]
    ?? null;
  const hasPendingLocalModelChange = config ? config.localModelId !== localModelId : false;

  const localStateLabel = (): { text: string; color: 'success' | 'info' | 'warning' | 'error' } => {
    switch (localStatus?.state) {
      case 'loaded': return { text: 'Ready', color: 'success' };
      case 'ready': return { text: 'Downloaded — will load on first chat', color: 'info' };
      case 'loading': return { text: 'Loading model...', color: 'info' };
      case 'downloading': return { text: `Downloading ${localStatus.progress ?? 0}%`, color: 'info' };
      case 'error': return { text: `Error: ${localStatus.error ?? 'unknown'}`, color: 'error' };
      default: return { text: 'Not downloaded yet', color: 'warning' };
    }
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoFixHighIcon color="primary" />
        AI Settings
      </DialogTitle>
      <DialogContent sx={{ minHeight: 480 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Provider" />
          <Tab label="Memory & Learning" />
        </Tabs>

        {/* ── Tab 0: Provider ── */}
        {tab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* ── Built-in AI status card ── */}
            <Box sx={{ p: 2, border: 1, borderColor: isLocal ? 'primary.main' : 'divider', borderRadius: 2, bgcolor: isLocal ? 'action.hover' : undefined }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ComputerIcon color={isLocal ? 'primary' : 'disabled'} />
                <Typography variant="subtitle1" fontWeight={600}>
                  Built-in AI ({selectedLocalModel?.label ?? localStatus?.modelName ?? 'Local model'})
                </Typography>
                {isLocal && localStatus?.state === 'loaded' && (
                  <CheckCircleIcon color="success" fontSize="small" />
                )}
                {selectedLocalModel?.recommended && (
                  <Chip label="Recommended" size="small" color="primary" variant="outlined" />
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {selectedLocalModel?.description ?? 'Runs entirely on your machine. No API keys needed.'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Runs entirely on your machine. No API keys needed. Approx. {selectedLocalModel?.downloadSizeGb.toFixed(1) ?? localStatus?.downloadSizeGb.toFixed(1) ?? '0.0'} GB download on first use.
              </Typography>

              {localModels.length > 0 && (
                <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                  <InputLabel>Local Model</InputLabel>
                  <Select
                    value={localModelId}
                    label="Local Model"
                    onChange={(e) => setLocalModelId(e.target.value as LocalModelId)}
                  >
                    {localModels.map((model) => (
                      <MenuItem key={model.id} value={model.id}>
                        {model.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {/* Status indicator */}
              {(() => {
                const { text, color } = localStateLabel();
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label={text} size="small" color={color} variant="outlined" />
                    {localStatus?.state === 'downloading' && (
                      <LinearProgress variant="determinate" value={localStatus.progress ?? 0} sx={{ flex: 1 }} />
                    )}
                    {localStatus?.state === 'loading' && (
                      <LinearProgress variant="indeterminate" sx={{ flex: 1 }} />
                    )}
                  </Box>
                );
              })()}

              {hasPendingLocalModelChange && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Save to switch the built-in model to {selectedLocalModel?.label ?? 'the selected model'}.
                </Alert>
              )}

              {!isLocal && (
                <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => setProvider('local')}>
                  Switch to Built-in AI
                </Button>
              )}
            </Box>

            {/* ── Cloud providers (advanced) ── */}
            <Accordion defaultExpanded={!isLocal}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CloudIcon color={!isLocal ? 'primary' : 'disabled'} fontSize="small" />
                  <Typography variant="subtitle2">Cloud Providers (Advanced)</Typography>
                  {!isLocal && cloudProvider && (
                    <Chip label={CLOUD_PROVIDER_LABELS[cloudProvider]} size="small" color="primary" variant="outlined" />
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Cloud Provider</InputLabel>
                    <Select
                      value={isLocal ? '' : provider}
                      label="Cloud Provider"
                      displayEmpty
                      onChange={(e) => { if (e.target.value) setProvider(e.target.value as AiProvider); }}
                    >
                      <MenuItem value="" disabled><em>Select a cloud provider</em></MenuItem>
                      {(Object.entries(CLOUD_PROVIDER_LABELS) as [CloudProvider, string][]).map(([val, label]) => (
                        <MenuItem key={val} value={val}>{label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Provider-specific config */}
                  {provider === 'gemini' && (
                    <>
                      <TextField
                        size="small" label="API Key" type="password"
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        fullWidth
                        placeholder={config?.geminiApiKeySet ? '••••••••  (key saved)' : ''}
                        helperText={config?.geminiApiKeySet
                          ? 'Key saved. Leave blank to keep existing.'
                          : 'Free at aistudio.google.com/apikey — 15 requests/min, 1M token context'}
                      />
                      <TextField
                        size="small" label="Model" value={geminiModel}
                        onChange={(e) => setGeminiModel(e.target.value)} fullWidth
                        helperText="gemini-2.0-flash (recommended), gemini-2.0-flash-lite, gemini-1.5-flash"
                      />
                    </>
                  )}

                  {provider === 'groq' && (
                    <>
                      <TextField
                        size="small" label="API Key" type="password"
                        value={groqApiKey}
                        onChange={(e) => setGroqApiKey(e.target.value)}
                        fullWidth
                        placeholder={config?.groqApiKeySet ? '••••••••  (key saved)' : ''}
                        helperText={config?.groqApiKeySet
                          ? 'Key saved. Leave blank to keep existing.'
                          : 'Free at console.groq.com — ultra-fast inference, 30 requests/min'}
                      />
                      <TextField
                        size="small" label="Model" value={groqModel}
                        onChange={(e) => setGroqModel(e.target.value)} fullWidth
                        helperText="llama-3.3-70b-versatile (best), llama-3.1-8b-instant (fast), mixtral-8x7b-32768"
                      />
                    </>
                  )}

                  {provider === 'openrouter' && (
                    <>
                      <TextField
                        size="small" label="API Key" type="password"
                        value={openrouterApiKey}
                        onChange={(e) => setOpenrouterApiKey(e.target.value)}
                        fullWidth
                        placeholder={config?.openrouterApiKeySet ? '••••••••  (key saved)' : ''}
                        helperText={config?.openrouterApiKeySet
                          ? 'Key saved. Leave blank to keep existing.'
                          : 'Free key at openrouter.ai/keys — access many free & paid models'}
                      />
                      <TextField
                        size="small" label="Model" value={openrouterModel}
                        onChange={(e) => setOpenrouterModel(e.target.value)} fullWidth
                        helperText="meta-llama/llama-3.3-70b-instruct:free (best free), or any model ID from openrouter.ai/models"
                      />
                    </>
                  )}

                  {provider === 'openai' && (
                    <>
                      <TextField
                        size="small" label="API Key" type="password"
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        fullWidth
                        placeholder={config?.openaiApiKeySet ? '••••••••  (key saved)' : 'sk-...'}
                        helperText={config?.openaiApiKeySet
                          ? 'Key saved. Leave blank to keep existing.'
                          : 'Required. Get yours from platform.openai.com/api-keys'}
                      />
                      <TextField
                        size="small" label="Base URL" value={openaiBaseUrl}
                        onChange={(e) => setOpenaiBaseUrl(e.target.value)} fullWidth
                        helperText="Default: https://api.openai.com — change for Azure, local proxies, etc."
                      />
                      <TextField
                        size="small" label="Model" value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)} fullWidth
                        helperText="e.g. gpt-4o-mini, gpt-4o, gpt-3.5-turbo"
                      />
                    </>
                  )}

                  {/* Test connection (only for cloud providers) */}
                  {!isLocal && (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Button size="small" variant="outlined" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
                        {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                      </Button>
                      {testStatus === 'success' && cloudProvider && (
                        <Alert severity="success" sx={{ py: 0, flex: 1 }}>Connected to {CLOUD_PROVIDER_LABELS[cloudProvider]}</Alert>
                      )}
                      {testStatus === 'error' && cloudProvider && (
                        <Alert severity="error" sx={{ py: 0, flex: 1 }}>
                          Failed — check your {CLOUD_PROVIDER_LABELS[cloudProvider]} API key
                        </Alert>
                      )}
                    </Box>
                  )}
                </Box>
              </AccordionDetails>
            </Accordion>

            <Divider />
            <Typography variant="subtitle2">Parameters</Typography>

            <Box>
              <Typography variant="body2" gutterBottom>Temperature: {temperature.toFixed(1)}</Typography>
              <Slider
                value={temperature} onChange={(_, v) => setTemperature(v as number)}
                min={0} max={2} step={0.1}
                marks={[{ value: 0, label: '0' }, { value: 0.7, label: '0.7' }, { value: 2, label: '2' }]}
                size="small"
              />
            </Box>

            <TextField
              size="small" label="Max Tokens" type="number"
              value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} fullWidth
            />
          </Box>
        )}

        {/* ── Tab 1: Memory & Learning ── */}
        {tab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Stats overview */}
            <Typography variant="subtitle2">Learning Statistics</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, flex: 1, minWidth: 140 }}>
                <Typography variant="h5" color="primary">{memoryStats?.total ?? 0}</Typography>
                <Typography variant="caption" color="text.secondary">Memories Stored</Typography>
              </Box>
              <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, flex: 1, minWidth: 140 }}>
                <Typography variant="h5" color="primary">{feedbackStats?.total ?? 0}</Typography>
                <Typography variant="caption" color="text.secondary">Feedback Entries</Typography>
              </Box>
              <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, flex: 1, minWidth: 140 }}>
                <Typography variant="h5" color="primary">
                  {feedbackStats ? `${(feedbackStats.acceptanceRate * 100).toFixed(0)}%` : '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary">Acceptance Rate</Typography>
              </Box>
            </Box>

            {/* Category breakdown */}
            {memoryStats && memoryStats.total > 0 && (
              <>
                <Typography variant="subtitle2">Memory Categories</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {Object.entries(memoryStats.byCategory).map(([cat, count]) => (
                    <Chip key={cat} label={`${cat}: ${count}`} size="small" variant="outlined" />
                  ))}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {Object.entries(memoryStats.bySource).map(([src, count]) => (
                    <Chip key={src} label={`from ${src}: ${count}`} size="small" variant="outlined" color="secondary" />
                  ))}
                </Box>
              </>
            )}

            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2">Stored Memories</Typography>
              {memories.length > 0 && (
                <Button size="small" color="error" onClick={handleClearMemories}>Clear All</Button>
              )}
            </Box>

            {memories.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No memories yet. The AI learns from your conversations and feedback automatically.
              </Typography>
            ) : (
              <List dense sx={{ maxHeight: 260, overflow: 'auto' }}>
                {memories.map((m) => (
                  <ListItem key={m.id} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          <Chip label={m.category} size="small" sx={{ fontSize: 10 }} />
                          <Typography variant="body2" noWrap>{m.key}</Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          {m.value.slice(0, 120)}{m.value.length > 120 ? '...' : ''}
                          {' '}— importance: {(m.importance * 100).toFixed(0)}%, used {m.uses}x
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="Delete memory">
                        <IconButton edge="end" size="small" onClick={() => handleDeleteMemory(m.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}

            <Alert severity="info" sx={{ mt: 1 }}>
              Memories are learned automatically from your conversations and feedback.
              Corrections (when you reject a suggestion and provide the right answer) have the highest priority.
              The AI applies these memories in every future interaction.
            </Alert>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AiSettingsDialog;

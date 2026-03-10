/**
 * AI Chat Panel — side panel for conversational AI scheduling assistance.
 * Uses the embedded local model by default (zero-config).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useAiStore, type ChatMessage } from '../../stores/useAiStore.js';
import { useProjectStore } from '../../stores/useProjectStore.js';

/** Quick-action chips for common AI requests. */
const QUICK_ACTIONS = [
  { label: 'Analyze Schedule', prompt: 'Analyze my current schedule and suggest improvements.' },
  { label: 'Critical Path', prompt: 'Explain the critical path and identify risks.' },
  { label: 'Duration Help', prompt: 'Suggest realistic durations for tasks that seem too short or too long.' },
  { label: 'Missing Links', prompt: 'Identify tasks that might be missing predecessor or successor relationships.' },
  { label: 'Resource Advice', prompt: 'Review resource assignments and suggest optimizations.' },
];

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  // Strip [Current project context] prefix from display
  const displayContent = message.content.replace(
    /^\[Current project context\]\n[\s\S]*?\n\n/,
    '',
  );

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        mb: 1.5,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: '85%',
          px: 2,
          py: 1.5,
          borderRadius: 2,
          bgcolor: isUser ? 'primary.main' : 'grey.100',
          color: isUser ? 'primary.contrastText' : 'text.primary',
        }}
      >
        <Typography
          variant="body2"
          sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {displayContent}
        </Typography>
        {!isUser && message.citations && message.citations.length > 0 && (
          <Box
            sx={{
              mt: 1.5,
              pt: 1,
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              Past schedule evidence
            </Typography>
            {message.citations.map((citation) => (
              <Box
                key={citation.chunkId}
                sx={{
                  px: 1,
                  py: 0.75,
                  borderRadius: 1,
                  bgcolor: 'background.paper',
                  color: 'text.primary',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                  {citation.projectName} - {citation.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {citation.excerpt}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default function ChatPanel() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    panelOpen,
    closePanel,
    messages,
    isLoading,
    error,
    aiAvailable,
    aiProvider,
    modelStatus,
    sendMessage,
    newConversation,
    checkHealth,
  } = useAiStore();

  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  // Check health on mount and poll for model download progress
  useEffect(() => {
    if (panelOpen) {
      checkHealth();
    }
  }, [panelOpen, checkHealth]);

  // Poll model status during download
  useEffect(() => {
    if (!panelOpen) return;
    if (modelStatus?.state !== 'downloading' && modelStatus?.state !== 'loading') return;

    const interval = setInterval(() => {
      checkHealth();
    }, 2000);
    return () => clearInterval(interval);
  }, [panelOpen, modelStatus?.state, checkHealth]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || !activeProjectId || isLoading) return;
    sendMessage(activeProjectId, input.trim());
    setInput('');
  }, [input, activeProjectId, isLoading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (prompt: string) => {
    if (!activeProjectId || isLoading) return;
    sendMessage(activeProjectId, prompt);
  };

  if (!panelOpen) return null;

  return (
    <Box
      sx={{
        width: 380,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <SmartToyIcon color="primary" />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            AI Assistant
          </Typography>
          {aiAvailable && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CheckCircleIcon sx={{ fontSize: 12, color: 'success.main' }} />
              <Typography variant="caption" color="success.main">
                Ready
              </Typography>
            </Box>
          )}
        </Box>
        <Tooltip title="New conversation">
          <IconButton size="small" onClick={newConversation}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Close">
          <IconButton size="small" onClick={closePanel}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Status bar — download progress or error */}
      {!aiAvailable && modelStatus?.state === 'downloading' && (
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            AI is getting ready...
          </Typography>
          <LinearProgress
            variant="determinate"
            value={modelStatus.progress ?? 0}
            sx={{ borderRadius: 1, height: 6 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Downloading model ({modelStatus.progress ?? 0}%)
          </Typography>
        </Box>
      )}
      {!aiAvailable && modelStatus?.state === 'loading' && (
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            Loading AI model into memory...
          </Typography>
          <LinearProgress sx={{ borderRadius: 1, height: 6, mt: 1 }} />
        </Box>
      )}
      {!aiAvailable && modelStatus?.state === 'error' && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          AI model error: {modelStatus.error ?? 'Unknown error'}
        </Alert>
      )}
      {!aiAvailable && (!modelStatus || modelStatus.state === 'not-downloaded') && aiProvider !== 'local' && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          AI not configured. Open AI Settings to set up your provider and API key.
        </Alert>
      )}

      {/* Messages */}
      <Box
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          px: 2,
          py: 2,
        }}
      >
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <AutoFixHighIcon
              sx={{ fontSize: 48, color: 'primary.light', mb: 2 }}
            />
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Ask the AI assistant for scheduling advice, task suggestions, or
              schedule analysis.
            </Typography>

            {/* Quick actions */}
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1,
                justifyContent: 'center',
                mt: 2,
              }}
            >
              {QUICK_ACTIONS.map((qa) => (
                <Chip
                  key={qa.label}
                  label={qa.label}
                  size="small"
                  variant="outlined"
                  onClick={() => handleQuickAction(qa.prompt)}
                  disabled={!activeProjectId || !aiAvailable}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Box>
          </Box>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {isLoading && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              Thinking...
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        <div ref={messagesEndRef} />
      </Box>

      <Divider />

      {/* Input */}
      <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
        <TextField
          ref={inputRef}
          fullWidth
          size="small"
          multiline
          maxRows={4}
          placeholder={
            !activeProjectId
              ? 'Open a project first...'
              : !aiAvailable && modelStatus?.state === 'downloading'
                ? 'AI model is downloading...'
                : !aiAvailable
                  ? 'AI initializing...'
                  : 'Ask about your schedule...'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!activeProjectId || !aiAvailable || isLoading}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
            },
          }}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={
            !input.trim() || !activeProjectId || !aiAvailable || isLoading
          }
          sx={{ alignSelf: 'flex-end' }}
        >
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}

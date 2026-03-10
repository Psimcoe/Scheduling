/**
 * AiSuggestButton — a button that fetches an AI suggestion for a specific
 * task field and displays it as a tooltip / popover.
 */

import React, { useState, useCallback } from 'react';
import {
  IconButton,
  Tooltip,
  Popover,
  Box,
  Typography,
  Button,
  CircularProgress,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

import { useProjectStore } from '../../stores';
import { useAiStore } from '../../stores/useAiStore';
import { aiApi, type AiCitation } from '../../api/client.js';

interface AiSuggestButtonProps {
  taskId?: string;
  taskName: string;
  field: 'duration' | 'dependency' | 'name' | 'resource' | 'general';
  context?: string;
  onAccept?: (suggestion: string) => void;
}

const AiSuggestButton: React.FC<AiSuggestButtonProps> = ({
  taskId,
  taskName,
  field,
  context,
  onAccept,
}) => {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const aiAvailable = useAiStore((s) => s.aiAvailable);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [citations, setCitations] = useState<AiCitation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLElement>) => {
      if (!activeProjectId) return;
      setAnchorEl(e.currentTarget);
      setLoading(true);
      setError(null);
      setSuggestion(null);
      setCitations([]);

      try {
        const ctx = context
          ? { taskId, taskName, description: context }
          : { taskId, taskName };
        const result = await aiApi.suggest(activeProjectId, field, ctx);
        setSuggestion(result.suggestion);
        setCitations(result.citations ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to get suggestion');
      } finally {
        setLoading(false);
      }
    },
    [activeProjectId, taskName, field, context],
  );

  const handleClose = () => {
    setAnchorEl(null);
    setSuggestion(null);
    setCitations([]);
    setError(null);
  };

  const handleAccept = () => {
    if (suggestion && onAccept) {
      onAccept(suggestion);
    }
    // Record feedback
    if (activeProjectId && suggestion) {
      aiApi.feedback(activeProjectId, field, { taskId, taskName, value: suggestion }, true).catch(() => {});
    }
    handleClose();
  };

  const handleDismiss = () => {
    if (activeProjectId && suggestion) {
      aiApi.feedback(activeProjectId, field, { taskId, taskName, value: suggestion }, false).catch(() => {});
    }
    handleClose();
  };

  if (!aiAvailable) return null;

  return (
    <>
      <Tooltip title={`AI Suggest ${field}`}>
        <IconButton size="small" onClick={handleClick} disabled={!activeProjectId}>
          <AutoFixHighIcon fontSize="small" sx={{ color: '#ff9800' }} />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, maxWidth: 320, minWidth: 200 }}>
          <Typography variant="subtitle2" gutterBottom>
            AI Suggestion
          </Typography>
          {loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Thinking...
              </Typography>
            </Box>
          )}
          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
          {suggestion && (
            <>
              <Typography variant="body2" sx={{ mb: 1, whiteSpace: 'pre-wrap' }}>
                {suggestion}
              </Typography>
              {citations.length > 0 && (
                <Box sx={{ mb: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                    Past schedule evidence
                  </Typography>
                  {citations.map((citation) => (
                    <Box key={citation.chunkId} sx={{ p: 1, borderRadius: 1, bgcolor: 'grey.100' }}>
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
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button size="small" onClick={handleDismiss}>
                  Dismiss
                </Button>
                {onAccept && (
                  <Button size="small" variant="contained" onClick={handleAccept}>
                    Accept
                  </Button>
                )}
              </Box>
            </>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default AiSuggestButton;

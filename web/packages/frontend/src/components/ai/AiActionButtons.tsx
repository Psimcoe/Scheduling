/**
 * AiActionButtons — a set of AI-powered action buttons for the Task ribbon.
 * Each button sends a specific AI prompt and applies the response.
 */

import React, { useState, useCallback } from 'react';
import {
  IconButton, Tooltip, CircularProgress,
  Menu, MenuItem, ListItemIcon, ListItemText, Typography,
} from '@mui/material';
import ScheduleIcon from '@mui/icons-material/Schedule';
import LinkIcon from '@mui/icons-material/Link';
import BalanceIcon from '@mui/icons-material/Balance';
import TimerIcon from '@mui/icons-material/Timer';
import RateReviewIcon from '@mui/icons-material/RateReview';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

import { useProjectStore, useUIStore } from '../../stores';
import { useAiStore } from '../../stores/useAiStore.js';

const AI_ACTIONS = [
  {
    id: 'schedule',
    label: 'AI Schedule Analysis',
    icon: <ScheduleIcon fontSize="small" />,
    prompt: 'Analyze the current project schedule. Identify any scheduling conflicts, unreasonable task durations, missing dependencies, and suggest improvements. Provide specific actionable recommendations.',
  },
  {
    id: 'link',
    label: 'AI Auto-Link Suggestions',
    icon: <LinkIcon fontSize="small" />,
    prompt: 'Review all tasks in the project and suggest logical dependency links (predecessors/successors) based on task names and typical project workflows. Group suggestions by phase or work area.',
  },
  {
    id: 'level',
    label: 'AI Resource Analysis',
    icon: <BalanceIcon fontSize="small" />,
    prompt: 'Analyze resource allocations across the project. Identify over-allocated resources, under-utilized resources, and suggest rebalancing strategies. Include specific task reassignment recommendations.',
  },
  {
    id: 'estimate',
    label: 'AI Duration Estimates',
    icon: <TimerIcon fontSize="small" />,
    prompt: 'Review task durations in the project. Based on the task names and project context, suggest more accurate duration estimates for tasks that appear to have placeholder or unreasonable durations. Explain your reasoning.',
  },
  {
    id: 'review',
    label: 'AI Project Review',
    icon: <RateReviewIcon fontSize="small" />,
    prompt: 'Perform a comprehensive project health review. Check for: missing milestones, unreasonable critical path length, tasks without resources, tasks with 0% complete past their start date, cost overruns, and general best practice violations. Provide a prioritized list of issues.',
  },
] as const;

const AiActionButtons: React.FC = () => {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const aiAvailable = useAiStore((s) => s.aiAvailable);
  const openPanel = useAiStore((s) => s.openPanel);
  const sendMessage = useAiStore((s) => s.sendMessage);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const handleMenuOpen = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleAction = useCallback(async (action: typeof AI_ACTIONS[number]) => {
    if (!activeProjectId) return;
    handleMenuClose();
    setLoading(action.id);

    try {
      // Start a new conversation and open the panel
      useAiStore.getState().newConversation();
      openPanel();

      // Send the AI prompt through the chat, which adds messages to the store
      await sendMessage(activeProjectId, action.prompt);

      showSnackbar(`AI ${action.label} complete — see AI panel for results`, 'success');
    } catch (err: unknown) {
      showSnackbar(`AI action failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setLoading(null);
    }
  }, [activeProjectId, handleMenuClose, openPanel, showSnackbar]);

  if (!aiAvailable) return null;

  return (
    <>
      <Tooltip title="AI Actions">
        <IconButton
          size="small"
          onClick={handleMenuOpen}
          disabled={!activeProjectId}
          color={loading ? 'warning' : 'default'}
        >
          {loading ? <CircularProgress size={18} /> : <AutoFixHighIcon fontSize="small" sx={{ color: '#ff9800' }} />}
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {AI_ACTIONS.map((action) => (
          <MenuItem
            key={action.id}
            onClick={() => handleAction(action)}
            disabled={loading === action.id}
          >
            <ListItemIcon>
              {loading === action.id ? <CircularProgress size={18} /> : action.icon}
            </ListItemIcon>
            <ListItemText>
              <Typography variant="body2">{action.label}</Typography>
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default AiActionButtons;

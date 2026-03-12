/**
 * TaskRibbon - task-surface ribbon actions with loading and accessibility states.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import EventNoteIcon from '@mui/icons-material/EventNote';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import HistoryIcon from '@mui/icons-material/History';
import InfoIcon from '@mui/icons-material/Info';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import RedoIcon from '@mui/icons-material/Redo';
import RepeatIcon from '@mui/icons-material/Repeat';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import UndoIcon from '@mui/icons-material/Undo';

import { importExportApi } from '../../api';
import { useProjectStore, useUIStore } from '../../stores';
import { useAiStore } from '../../stores/useAiStore.js';
import AiActionButtons from '../ai/AiActionButtons.js';

const RibbonGroup: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      borderRight: '1px solid #E0E0E0',
      px: 1,
      py: 0.25,
      minWidth: 0,
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexWrap: 'nowrap' }}>
      {children}
    </Box>
    <Typography
      variant="caption"
      sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1, mt: 0.25 }}
    >
      {label}
    </Typography>
  </Box>
);

const RibbonIconAction: React.FC<{
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, disabled = false, loading = false, onClick, children }) => (
  <Tooltip title={label}>
    <span>
      <IconButton
        size="small"
        aria-label={label}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        onClick={onClick}
      >
        {loading ? <CircularProgress size={16} /> : children}
      </IconButton>
    </span>
  </Tooltip>
);

const TaskRibbon: React.FC = () => {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const selectedTaskIds = useProjectStore((state) => state.selectedTaskIds);
  const pendingActions = useProjectStore((state) => state.pendingActions);
  const createTask = useProjectStore((state) => state.createTask);
  const batchUpdateTasks = useProjectStore((state) => state.batchUpdateTasks);
  const createDependenciesBatch = useProjectStore((state) => state.createDependenciesBatch);
  const deleteDependenciesBatch = useProjectStore((state) => state.deleteDependenciesBatch);
  const tasks = useProjectStore((state) => state.tasks);
  const dependencies = useProjectStore((state) => state.dependencies);
  const openDialogWith = useUIStore((state) => state.openDialogWith);
  const openDeleteConfirm = useUIStore((state) => state.openDeleteConfirm);
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [historyLoading, setHistoryLoading] = useState<'undo' | 'redo' | null>(null);

  const mspdiInputRef = useRef<HTMLInputElement>(null);
  const updateInputRef = useRef<HTMLInputElement>(null);
  const disabled = !activeProjectId;
  const isPending = useCallback(
    (actionKey: string) => (pendingActions[actionKey] ?? 0) > 0,
    [pendingActions],
  );

  const handleAddTask = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      await createTask({ name: 'New Task' });
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Failed to add task', 'error');
    }
  }, [activeProjectId, createTask, showSnackbar]);

  const handleAddMilestone = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      await createTask({ name: 'New Milestone', durationMinutes: 0 });
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Failed to add milestone', 'error');
    }
  }, [activeProjectId, createTask, showSnackbar]);

  const handleDeleteTask = useCallback(() => {
    const selectedTasks = Array.from(selectedTaskIds)
      .map((id) => tasks.find((task) => task.id === id))
      .filter((task): task is (typeof tasks)[number] => Boolean(task));
    if (selectedTasks.length === 0) {
      return;
    }

    openDeleteConfirm({
      kind: 'tasks',
      tasks: selectedTasks.map((task) => ({
        id: task.id,
        name: task.name,
        hasStratusSync: Boolean(task.stratusSync),
      })),
    });
  }, [openDeleteConfirm, selectedTaskIds, tasks]);

  const handleIndent = useCallback(async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) {
      return;
    }

    const updates = ids.flatMap((id) => {
        const task = tasks.find((candidate) => candidate.id === id);
        if (!task) {
          return [];
        }

        const index = tasks.indexOf(task);
        const previousSibling = tasks
          .slice(0, index)
          .reverse()
          .find(
            (candidate) =>
              candidate.parentId === task.parentId &&
              candidate.outlineLevel === task.outlineLevel,
          );

        if (!previousSibling) {
          return [];
        }

        return [{ id, data: { parentId: previousSibling.id } }];
      });

    if (updates.length === 0) {
      return;
    }

    try {
      await batchUpdateTasks(updates);
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Indent failed', 'error');
    }
  }, [batchUpdateTasks, selectedTaskIds, showSnackbar, tasks]);

  const handleOutdent = useCallback(async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) {
      return;
    }

    const updates = ids.flatMap((id) => {
        const task = tasks.find((candidate) => candidate.id === id);
        if (!task || !task.parentId) {
          return [];
        }

        const parent = tasks.find((candidate) => candidate.id === task.parentId);
        return [{ id, data: { parentId: parent?.parentId ?? null } }];
      });

    if (updates.length === 0) {
      return;
    }

    try {
      await batchUpdateTasks(updates);
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Outdent failed', 'error');
    }
  }, [batchUpdateTasks, selectedTaskIds, showSnackbar, tasks]);

  const handleLink = useCallback(async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length < 2) {
      showSnackbar('Select at least 2 tasks to link', 'warning');
      return;
    }

    try {
      await createDependenciesBatch(
        ids.slice(0, -1).map((id, index) => ({
          fromTaskId: id,
          toTaskId: ids[index + 1]!,
          type: 'FS',
          lagMinutes: 0,
        })),
      );
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Link failed', 'error');
    }
  }, [createDependenciesBatch, selectedTaskIds, showSnackbar]);

  const handleUnlink = useCallback(async () => {
    const selectedIds = new Set(selectedTaskIds);
    const dependencyIds = dependencies
      .filter(
        (dependency) =>
          selectedIds.has(dependency.fromTaskId) || selectedIds.has(dependency.toTaskId),
      )
      .map((dependency) => dependency.id);

    if (dependencyIds.length === 0) {
      return;
    }

    try {
      await deleteDependenciesBatch(dependencyIds);
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Unlink failed', 'error');
    }
  }, [deleteDependenciesBatch, dependencies, selectedTaskIds, showSnackbar]);

  const handleUndo = useCallback(async () => {
    if (!activeProjectId) return;

    setHistoryLoading('undo');
    try {
      const result = await importExportApi.undo(activeProjectId);
      if (!result.success) {
        showSnackbar('Nothing to undo', 'info');
      } else {
        await useProjectStore.getState().fetchTasks();
        await useProjectStore.getState().fetchDependencies();
      }
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Undo failed', 'error');
    } finally {
      setHistoryLoading(null);
    }
  }, [activeProjectId, showSnackbar]);

  const handleRedo = useCallback(async () => {
    if (!activeProjectId) return;

    setHistoryLoading('redo');
    try {
      const result = await importExportApi.redo(activeProjectId);
      if (!result.success) {
        showSnackbar('Nothing to redo', 'info');
      } else {
        await useProjectStore.getState().fetchTasks();
        await useProjectStore.getState().fetchDependencies();
      }
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Redo failed', 'error');
    } finally {
      setHistoryLoading(null);
    }
  }, [activeProjectId, showSnackbar]);

  const handleMarkComplete = useCallback(async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) {
      return;
    }

    try {
      await batchUpdateTasks(ids.map((id) => ({ id, data: { percentComplete: 100 } })));
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Update failed', 'error');
    }
  }, [batchUpdateTasks, selectedTaskIds, showSnackbar]);

  const handleImportMspdi = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !activeProjectId) return;

      try {
        const result = await importExportApi.importMspdi(activeProjectId, file);
        showSnackbar(
          `Imported ${result.imported.tasks} tasks, ${result.imported.dependencies} dependencies`,
          'success',
        );
        await useProjectStore.getState().setActiveProject(activeProjectId);
      } catch (error: unknown) {
        showSnackbar(error instanceof Error ? error.message : 'Import failed', 'error');
      }

      event.target.value = '';
    },
    [activeProjectId, showSnackbar],
  );

  const handleImportUpdates = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !activeProjectId) return;
      openDialogWith('importPreview', file);
      event.target.value = '';
    },
    [activeProjectId, openDialogWith],
  );

  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
      <RibbonGroup label="Insert">
        <RibbonIconAction
          label="Add Task"
          disabled={disabled}
          loading={isPending('task:create')}
          onClick={() => {
            void handleAddTask();
          }}
        >
          <AddIcon fontSize="small" />
        </RibbonIconAction>
        <RibbonIconAction
          label="Add Milestone"
          disabled={disabled}
          loading={isPending('task:create')}
          onClick={() => {
            void handleAddMilestone();
          }}
        >
          <EventNoteIcon fontSize="small" />
        </RibbonIconAction>
        <RibbonIconAction
          label="Delete Task"
          disabled={disabled || selectedTaskIds.size === 0}
          loading={isPending('task:delete')}
          onClick={handleDeleteTask}
        >
          <DeleteIcon fontSize="small" />
        </RibbonIconAction>
        <RibbonIconAction
          label="Recurring Task"
          disabled={disabled}
          onClick={() => openDialogWith('recurringTask')}
        >
          <RepeatIcon fontSize="small" />
        </RibbonIconAction>
      </RibbonGroup>

      <RibbonGroup label="Schedule">
        <RibbonIconAction
          label="Indent"
          disabled={disabled || selectedTaskIds.size === 0}
          loading={isPending('task:batch-update')}
          onClick={() => {
            void handleIndent();
          }}
        >
          <FormatIndentIncreaseIcon fontSize="small" />
        </RibbonIconAction>
        <RibbonIconAction
          label="Outdent"
          disabled={disabled || selectedTaskIds.size === 0}
          loading={isPending('task:batch-update')}
          onClick={() => {
            void handleOutdent();
          }}
        >
          <FormatIndentDecreaseIcon fontSize="small" />
        </RibbonIconAction>
        <RibbonIconAction
          label="Link Tasks"
          disabled={disabled || selectedTaskIds.size < 2}
          loading={isPending('dependency:create')}
          onClick={() => {
            void handleLink();
          }}
        >
          <LinkIcon fontSize="small" />
        </RibbonIconAction>
        <RibbonIconAction
          label="Unlink Tasks"
          disabled={disabled || selectedTaskIds.size === 0}
          loading={isPending('dependency:delete')}
          onClick={() => {
            void handleUnlink();
          }}
        >
          <LinkOffIcon fontSize="small" />
        </RibbonIconAction>
      </RibbonGroup>

      <RibbonGroup label="Editing">
        <RibbonIconAction
          label="Undo"
          disabled={disabled}
          loading={historyLoading === 'undo'}
          onClick={() => {
            void handleUndo();
          }}
        >
          <UndoIcon fontSize="small" />
        </RibbonIconAction>
        <RibbonIconAction
          label="Redo"
          disabled={disabled}
          loading={historyLoading === 'redo'}
          onClick={() => {
            void handleRedo();
          }}
        >
          <RedoIcon fontSize="small" />
        </RibbonIconAction>
        <RibbonIconAction
          label="Undo History"
          disabled={disabled}
          onClick={() => openDialogWith('undoHistory')}
        >
          <HistoryIcon fontSize="small" />
        </RibbonIconAction>
        <RibbonIconAction
          label="Find & Replace"
          disabled={disabled}
          onClick={() => openDialogWith('findReplace')}
        >
          <SearchIcon fontSize="small" />
        </RibbonIconAction>
      </RibbonGroup>

      <RibbonGroup label="Properties">
        <RibbonIconAction
          label="Task Information"
          disabled={disabled || selectedTaskIds.size !== 1}
          onClick={() => {
            const selected = Array.from(selectedTaskIds);
            if (selected.length !== 1) {
              return;
            }

            const task = tasks.find((candidate) => candidate.id === selected[0]);
            if (task) {
              openDialogWith('taskInfo', task);
            }
          }}
        >
          <InfoIcon fontSize="small" />
        </RibbonIconAction>
        <RibbonIconAction
          label="Mark on Track"
          disabled={disabled || selectedTaskIds.size === 0}
          loading={isPending('task:batch-update')}
          onClick={() => {
            void handleMarkComplete();
          }}
        >
          <CheckCircleOutlineIcon fontSize="small" />
        </RibbonIconAction>
      </RibbonGroup>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, gap: 0.5 }}>
        <RibbonIconAction
          label="AI Assistant"
          onClick={useAiStore.getState().togglePanel}
        >
          <SmartToyIcon
            fontSize="small"
            color={useAiStore.getState().panelOpen ? 'primary' : 'inherit'}
          />
        </RibbonIconAction>
        <RibbonIconAction label="AI Settings" onClick={() => openDialogWith('aiSettings')}>
          <SettingsIcon fontSize="small" />
        </RibbonIconAction>
        <AiActionButtons />
      </Box>

      <input type="file" accept=".xml" hidden ref={mspdiInputRef} onChange={handleImportMspdi} />
      <input type="file" accept=".csv,.json" hidden ref={updateInputRef} onChange={handleImportUpdates} />
    </Box>
  );
};

export default TaskRibbon;

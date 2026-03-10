/**
 * Toolbar — MS Project-style ribbon-like toolbar.
 *
 * Buttons for: Add Task, Delete, Indent/Outdent, Link, Undo/Redo,
 * Import/Export, Baseline, Critical Path toggle, Zoom controls.
 */

import React, { useCallback, useRef } from 'react';
import {
  AppBar,
  Toolbar as MuiToolbar,
  Button,
  IconButton,
  Divider,
  Box,
  Tooltip,
  ButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import FlagIcon from '@mui/icons-material/Flag';
import TimelineIcon from '@mui/icons-material/Timeline';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import InfoIcon from '@mui/icons-material/Info';
import SmartToyIcon from '@mui/icons-material/SmartToy';

import { useProjectStore, useUIStore, type GanttZoom } from '../../stores';
import { useAiStore } from '../../stores/useAiStore.js';
import { importExportApi } from '../../api';

const ZOOM_LEVELS: GanttZoom[] = ['day', 'week', 'month', 'quarter', 'year'];

const ProjectToolbar: React.FC = () => {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const selectedTaskIds = useProjectStore((s) => s.selectedTaskIds);
  const createTask = useProjectStore((s) => s.createTask);
  const deleteTask = useProjectStore((s) => s.deleteTask);
  const batchUpdateTasks = useProjectStore((s) => s.batchUpdateTasks);
  const tasks = useProjectStore((s) => s.tasks);
  const dependencies = useProjectStore((s) => s.dependencies);
  const createDependency = useProjectStore((s) => s.createDependency);
  const deleteDependency = useProjectStore((s) => s.deleteDependency);

  const ganttZoom = useUIStore((s) => s.ganttZoom);
  const setGanttZoom = useUIStore((s) => s.setGanttZoom);
  const showCriticalPath = useUIStore((s) => s.showCriticalPath);
  const toggleCriticalPath = useUIStore((s) => s.toggleCriticalPath);
  const openDialogWith = useUIStore((s) => s.openDialogWith);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const mspdiInputRef = useRef<HTMLInputElement>(null);
  const updateInputRef = useRef<HTMLInputElement>(null);

  const handleAddTask = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      await createTask({ name: 'New Task' });
    } catch (e: any) {
      showSnackbar(e.message, 'error');
    }
  }, [activeProjectId, createTask, showSnackbar]);

  const handleDeleteTask = useCallback(async () => {
    const ids = Array.from(selectedTaskIds);
    for (const id of ids) {
      await deleteTask(id);
    }
  }, [selectedTaskIds, deleteTask]);

  const handleIndent = useCallback(async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;

    const updates = ids
      .map((id) => {
        const task = tasks.find((t) => t.id === id);
        if (!task) return null;
        // Find previous sibling to become parent
        const idx = tasks.indexOf(task);
        const prevSibling = tasks
          .slice(0, idx)
          .reverse()
          .find(
            (t) =>
              t.parentId === task.parentId && t.outlineLevel === task.outlineLevel,
          );
        if (!prevSibling) return null;
        return {
          id,
          data: { parentId: prevSibling.id },
        };
      })
      .filter(Boolean) as { id: string; data: Record<string, unknown> }[];

    if (updates.length > 0) await batchUpdateTasks(updates);
  }, [selectedTaskIds, tasks, batchUpdateTasks]);

  const handleOutdent = useCallback(async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;

    const updates = ids
      .map((id) => {
        const task = tasks.find((t) => t.id === id);
        if (!task || !task.parentId) return null;
        const parent = tasks.find((t) => t.id === task.parentId);
        return {
          id,
          data: { parentId: parent?.parentId ?? null },
        };
      })
      .filter(Boolean) as { id: string; data: Record<string, unknown> }[];

    if (updates.length > 0) await batchUpdateTasks(updates);
  }, [selectedTaskIds, tasks, batchUpdateTasks]);

  const handleLink = useCallback(async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length < 2) {
      showSnackbar('Select at least 2 tasks to link', 'warning');
      return;
    }
    // Link sequentially as FS
    for (let i = 0; i < ids.length - 1; i++) {
      await createDependency({
        fromTaskId: ids[i],
        toTaskId: ids[i + 1],
        type: 1,
        lagMinutes: 0,
      });
    }
  }, [selectedTaskIds, createDependency, showSnackbar]);

  const handleUnlink = useCallback(async () => {
    const ids = new Set(selectedTaskIds);
    const toRemove = dependencies.filter(
      (d) => ids.has(d.fromTaskId) || ids.has(d.toTaskId),
    );
    for (const dep of toRemove) {
      await deleteDependency(dep.id);
    }
  }, [selectedTaskIds, dependencies, deleteDependency]);

  const handleUndo = useCallback(async () => {
    if (!activeProjectId) return;
    const result = await importExportApi.undo(activeProjectId);
    if (!result.success) showSnackbar('Nothing to undo', 'info');
    else {
      useProjectStore.getState().fetchTasks();
      useProjectStore.getState().fetchDependencies();
    }
  }, [activeProjectId, showSnackbar]);

  const handleRedo = useCallback(async () => {
    if (!activeProjectId) return;
    const result = await importExportApi.redo(activeProjectId);
    if (!result.success) showSnackbar('Nothing to redo', 'info');
    else {
      useProjectStore.getState().fetchTasks();
      useProjectStore.getState().fetchDependencies();
    }
  }, [activeProjectId, showSnackbar]);

  const handleZoomIn = () => {
    const idx = ZOOM_LEVELS.indexOf(ganttZoom);
    if (idx > 0) setGanttZoom(ZOOM_LEVELS[idx - 1]);
  };

  const handleZoomOut = () => {
    const idx = ZOOM_LEVELS.indexOf(ganttZoom);
    if (idx < ZOOM_LEVELS.length - 1) setGanttZoom(ZOOM_LEVELS[idx + 1]);
  };

  const handleImportMspdi = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeProjectId) return;
      try {
        const result = await importExportApi.importMspdi(activeProjectId, file);
        showSnackbar(
          `Imported ${result.imported.tasks} tasks, ${result.imported.dependencies} dependencies`,
          'success',
        );
        await useProjectStore.getState().setActiveProject(activeProjectId);
      } catch (err: any) {
        showSnackbar(err.message, 'error');
      }
      e.target.value = '';
    },
    [activeProjectId, showSnackbar],
  );

  const handleExportMspdi = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const blob = await importExportApi.exportMspdi(activeProjectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.xml';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showSnackbar(err.message, 'error');
    }
  }, [activeProjectId, showSnackbar]);

  const handleImportUpdates = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeProjectId) return;
      openDialogWith('importPreview', file);
      e.target.value = '';
    },
    [activeProjectId, openDialogWith],
  );

  const disabled = !activeProjectId;

  return (
    <AppBar position="static" color="default" elevation={1}>
      <MuiToolbar variant="dense" sx={{ gap: 0.5, flexWrap: 'wrap', py: 0.5 }}>
        {/* Task ops */}
        <Tooltip title="Add Task (Ins)">
          <span>
            <IconButton
              size="small"
              onClick={handleAddTask}
              disabled={disabled}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Delete Task (Del)">
          <span>
            <IconButton
              size="small"
              onClick={handleDeleteTask}
              disabled={disabled || selectedTaskIds.size === 0}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        <Tooltip title="Indent">
          <span>
            <IconButton size="small" onClick={handleIndent} disabled={disabled}>
              <FormatIndentIncreaseIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Outdent">
          <span>
            <IconButton size="small" onClick={handleOutdent} disabled={disabled}>
              <FormatIndentDecreaseIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        <Tooltip title="Link Tasks (FS)">
          <span>
            <IconButton size="small" onClick={handleLink} disabled={disabled}>
              <LinkIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Unlink Tasks">
          <span>
            <IconButton size="small" onClick={handleUnlink} disabled={disabled}>
              <LinkOffIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        <Tooltip title="Undo">
          <span>
            <IconButton size="small" onClick={handleUndo} disabled={disabled}>
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo">
          <span>
            <IconButton size="small" onClick={handleRedo} disabled={disabled}>
              <RedoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Import / Export */}
        <input
          type="file"
          accept=".xml"
          hidden
          ref={mspdiInputRef}
          onChange={handleImportMspdi}
        />
        <Tooltip title="Import MSPDI XML">
          <span>
            <IconButton
              size="small"
              onClick={() => mspdiInputRef.current?.click()}
              disabled={disabled}
            >
              <FileUploadIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Export MSPDI XML">
          <span>
            <IconButton
              size="small"
              onClick={handleExportMspdi}
              disabled={disabled}
            >
              <FileDownloadIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <input
          type="file"
          accept=".csv,.json"
          hidden
          ref={updateInputRef}
          onChange={handleImportUpdates}
        />
        <Tooltip title="Import Updates (CSV/JSON)">
          <span>
            <IconButton
              size="small"
              onClick={() => updateInputRef.current?.click()}
              disabled={disabled}
            >
              <SaveAltIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Baseline */}
        <Tooltip title="Capture Baseline">
          <span>
            <Button
              size="small"
              startIcon={<FlagIcon />}
              onClick={() => openDialogWith('baselineCapture')}
              disabled={disabled}
            >
              Baseline
            </Button>
          </span>
        </Tooltip>

        {/* Critical path */}
        <Tooltip title="Toggle Critical Path">
          <span>
            <IconButton
              size="small"
              onClick={toggleCriticalPath}
              color={showCriticalPath ? 'error' : 'default'}
              disabled={disabled}
            >
              <TimelineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        {/* Zoom */}
        <ButtonGroup size="small" variant="outlined">
          <Tooltip title="Zoom In">
            <IconButton size="small" onClick={handleZoomIn}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button size="small" disabled sx={{ minWidth: 50, textTransform: 'capitalize' }}>
            {ganttZoom}
          </Button>
          <Tooltip title="Zoom Out">
            <IconButton size="small" onClick={handleZoomOut}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </ButtonGroup>

        {/* Project Info */}
        <Tooltip title="Project Information">
          <span>
            <IconButton
              size="small"
              onClick={() => openDialogWith('projectInfo')}
              disabled={disabled}
            >
              <InfoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {/* AI Assistant */}
        <Tooltip title="AI Assistant">
          <IconButton
            size="small"
            onClick={useAiStore.getState().togglePanel}
            color={useAiStore.getState().panelOpen ? 'primary' : 'default'}
          >
            <SmartToyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </MuiToolbar>
    </AppBar>
  );
};

export default ProjectToolbar;

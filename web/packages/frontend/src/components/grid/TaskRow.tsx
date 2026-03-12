/**
 * TaskRow - a virtualized task-grid row rendered with a flat flex layout.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DiamondIcon from '@mui/icons-material/Diamond';
import InfoIcon from '@mui/icons-material/Info';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import InlineEditor from './InlineEditor';
import {
  ROW_HEIGHT,
  useProjectStore,
  useUIStore,
  type ColumnDef,
  type TaskRow as TaskRowType,
} from '../../stores';
import {
  constraintLabel,
  currency,
  depTypeLabel,
  durationDays,
  isoDate,
  parseDuration,
  pctLabel,
  shortDate,
} from '../../utils/format';

interface TaskRowProps {
  task: TaskRowType;
  index: number;
  isSelected: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggleExpand: (taskId: string) => void;
  visibleColumns: ColumnDef[];
  top: number;
}

type EditingField =
  | 'name'
  | 'duration'
  | 'start'
  | 'finish'
  | 'pct'
  | 'cost'
  | 'fixedCost'
  | 'work'
  | 'deadline'
  | null;

function getCellLayout(column: ColumnDef) {
  if (column.id === 'name') {
    return {
      flex: `1 0 ${column.width}px`,
      minWidth: column.width,
      justifyContent: 'flex-start',
    } as const;
  }

  return {
    flex: `0 0 ${column.width}px`,
    width: column.width,
    minWidth: column.width,
    justifyContent:
      column.align === 'right'
        ? 'flex-end'
        : column.align === 'center'
          ? 'center'
          : 'flex-start',
  } as const;
}

const TaskRowComponent: React.FC<TaskRowProps> = ({
  task,
  index,
  isSelected,
  isExpanded,
  hasChildren,
  onToggleExpand,
  visibleColumns,
  top,
}) => {
  const updateTask = useProjectStore((state) => state.updateTask);
  const selectTask = useProjectStore((state) => state.selectTask);
  const createTask = useProjectStore((state) => state.createTask);
  const dependencies = useProjectStore((state) => state.dependencies);
  const assignments = useProjectStore((state) => state.assignments);
  const resources = useProjectStore((state) => state.resources);
  const tasks = useProjectStore((state) => state.tasks);
  const showCriticalPath = useUIStore((state) => state.showCriticalPath);
  const openDialogWith = useUIStore((state) => state.openDialogWith);
  const openDeleteConfirm = useUIStore((state) => state.openDeleteConfirm);
  const [editing, setEditing] = useState<EditingField>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const isSummary = task.type === 'summary';
  const isMilestone = task.type === 'milestone' || task.durationMinutes === 0;
  const indentPx = task.outlineLevel * 20;
  const criticalColor = showCriticalPath && task.isCritical ? '#D32F2F' : undefined;

  const predecessorsStr = useMemo(() => {
    const predecessors = dependencies.filter((dependency) => dependency.toTaskId === task.id);
    if (predecessors.length === 0) {
      return '';
    }

    return predecessors
      .map((dependency) => {
        const fromIndex = tasks.findIndex((candidate) => candidate.id === dependency.fromTaskId);
        const lag = dependency.lagMinutes ? `+${durationDays(dependency.lagMinutes)}` : '';
        return `${fromIndex + 1}${depTypeLabel(dependency.type)}${lag}`;
      })
      .join(', ');
  }, [dependencies, task.id, tasks]);

  const resourceNamesStr = useMemo(() => {
    const taskAssignments = assignments.filter((assignment) => assignment.taskId === task.id);
    return taskAssignments
      .map((assignment) => resources.find((resource) => resource.id === assignment.resourceId)?.name ?? '')
      .filter(Boolean)
      .join(', ');
  }, [assignments, task.id, resources]);

  const handleDoubleClick = useCallback(
    (field: EditingField) => {
      if (isSummary && field !== 'name') {
        return;
      }
      setEditing(field);
    },
    [isSummary],
  );

  const commitEdit = useCallback(
    async (field: Exclude<EditingField, null>, rawValue: string) => {
      setEditing(null);
      const data: Record<string, unknown> = {};

      switch (field) {
        case 'name':
          if (rawValue.trim() && rawValue !== task.name) {
            data.name = rawValue.trim();
          }
          break;
        case 'duration': {
          const minutes = parseDuration(rawValue);
          if (minutes !== null && minutes !== task.durationMinutes) {
            data.durationMinutes = minutes;
          }
          break;
        }
        case 'start':
          if (rawValue && rawValue !== isoDate(task.start)) {
            data.start = new Date(rawValue).toISOString();
          }
          break;
        case 'finish':
          if (rawValue && rawValue !== isoDate(task.finish)) {
            data.finish = new Date(rawValue).toISOString();
          }
          break;
        case 'pct': {
          const percentComplete = Number.parseFloat(rawValue);
          if (
            !Number.isNaN(percentComplete) &&
            percentComplete >= 0 &&
            percentComplete <= 100 &&
            percentComplete !== task.percentComplete
          ) {
            data.percentComplete = percentComplete;
          }
          break;
        }
        case 'cost': {
          const value = Number.parseFloat(rawValue.replace(/[$,]/g, ''));
          if (!Number.isNaN(value) && value !== task.cost) {
            data.cost = value;
          }
          break;
        }
        case 'fixedCost': {
          const value = Number.parseFloat(rawValue.replace(/[$,]/g, ''));
          if (!Number.isNaN(value) && value !== task.fixedCost) {
            data.fixedCost = value;
          }
          break;
        }
        case 'work': {
          const minutes = parseDuration(rawValue);
          if (minutes !== null && minutes !== task.work) {
            data.work = minutes;
          }
          break;
        }
        case 'deadline':
          if (rawValue && rawValue !== isoDate(task.deadline)) {
            data.deadline = new Date(rawValue).toISOString();
          } else if (!rawValue && task.deadline) {
            data.deadline = null;
          }
          break;
      }

      if (Object.keys(data).length > 0) {
        await updateTask(task.id, data);
      }
    },
    [task, updateTask],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      selectTask(task.id, false);
      setContextMenu({ x: event.clientX, y: event.clientY });
    },
    [selectTask, task.id],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        selectTask(task.id, event.ctrlKey || event.metaKey);
        return;
      }

      if (event.key === 'Enter' && !editing) {
        event.preventDefault();
        openDialogWith('taskInfo', task);
        return;
      }

      if (event.key === 'F2') {
        event.preventDefault();
        setEditing('name');
        return;
      }

      if (hasChildren && event.key === 'ArrowLeft' && isExpanded) {
        event.preventDefault();
        onToggleExpand(task.id);
        return;
      }

      if (hasChildren && event.key === 'ArrowRight' && !isExpanded) {
        event.preventDefault();
        onToggleExpand(task.id);
      }
    },
    [editing, hasChildren, isExpanded, onToggleExpand, openDialogWith, selectTask, task],
  );

  const handleInsertTaskAbove = useCallback(async () => {
    closeContextMenu();
    await createTask({ name: 'New Task', sortOrder: task.sortOrder });
  }, [closeContextMenu, createTask, task.sortOrder]);

  const handleInsertTaskBelow = useCallback(async () => {
    closeContextMenu();
    await createTask({ name: 'New Task', sortOrder: task.sortOrder + 1 });
  }, [closeContextMenu, createTask, task.sortOrder]);

  const handleDeleteTask = useCallback(() => {
    closeContextMenu();
    openDeleteConfirm({
      kind: 'tasks',
      tasks: [
        {
          id: task.id,
          name: task.name,
          hasStratusSync: Boolean(task.stratusSync),
        },
      ],
    });
  }, [closeContextMenu, openDeleteConfirm, task.id, task.name, task.stratusSync]);

  const handleMarkComplete = useCallback(async () => {
    closeContextMenu();
    await updateTask(task.id, { percentComplete: 100 });
  }, [closeContextMenu, task.id, updateTask]);

  const handleIndent = useCallback(async () => {
    closeContextMenu();
    await updateTask(task.id, { outlineLevel: task.outlineLevel + 1 });
  }, [closeContextMenu, task.id, task.outlineLevel, updateTask]);

  const handleOutdent = useCallback(async () => {
    closeContextMenu();
    if (task.outlineLevel > 0) {
      await updateTask(task.id, { outlineLevel: task.outlineLevel - 1 });
    }
  }, [closeContextMenu, task.id, task.outlineLevel, updateTask]);

  const renderCellContent = useCallback(
    (column: ColumnDef) => {
      switch (column.id) {
        case 'rowNum':
          return index + 1;
        case 'name':
          if (editing === 'name') {
            return (
              <InlineEditor
                value={task.name}
                onCommit={(value) => commitEdit('name', value)}
                onCancel={() => setEditing(null)}
              />
            );
          }

          return (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                minWidth: 0,
                width: '100%',
                pl: `${indentPx}px`,
              }}
            >
              {hasChildren ? (
                <IconButton
                  size="small"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleExpand(task.id);
                  }}
                  sx={{ p: 0, mr: 0.5 }}
                >
                  {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                </IconButton>
              ) : (
                <Box sx={{ width: 24, flexShrink: 0 }} />
              )}
              {isMilestone && !isSummary && (
                <DiamondIcon sx={{ fontSize: 14, mr: 0.5, color: '#333' }} />
              )}
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {task.name}
              </Box>
            </Box>
          );
        case 'duration':
          return editing === 'duration' ? (
            <InlineEditor
              value={durationDays(task.durationMinutes)}
              onCommit={(value) => commitEdit('duration', value)}
              onCancel={() => setEditing(null)}
              type="duration"
            />
          ) : (
            durationDays(task.durationMinutes)
          );
        case 'start':
          return editing === 'start' ? (
            <InlineEditor
              value={isoDate(task.start)}
              onCommit={(value) => commitEdit('start', value)}
              onCancel={() => setEditing(null)}
              type="date"
            />
          ) : (
            shortDate(task.start)
          );
        case 'finish':
          return editing === 'finish' ? (
            <InlineEditor
              value={isoDate(task.finish)}
              onCommit={(value) => commitEdit('finish', value)}
              onCancel={() => setEditing(null)}
              type="date"
            />
          ) : (
            shortDate(task.finish)
          );
        case 'percentComplete':
          return editing === 'pct' ? (
            <InlineEditor
              value={String(task.percentComplete)}
              onCommit={(value) => commitEdit('pct', value)}
              onCancel={() => setEditing(null)}
              type="number"
            />
          ) : (
            pctLabel(task.percentComplete)
          );
        case 'predecessors':
          return predecessorsStr;
        case 'resourceNames':
          return resourceNamesStr;
        case 'cost':
          return editing === 'cost' ? (
            <InlineEditor
              value={String(task.cost ?? 0)}
              onCommit={(value) => commitEdit('cost', value)}
              onCancel={() => setEditing(null)}
              type="number"
            />
          ) : (
            currency(task.cost)
          );
        case 'fixedCost':
          return editing === 'fixedCost' ? (
            <InlineEditor
              value={String(task.fixedCost ?? 0)}
              onCommit={(value) => commitEdit('fixedCost', value)}
              onCancel={() => setEditing(null)}
              type="number"
            />
          ) : (
            currency(task.fixedCost)
          );
        case 'actualCost':
          return currency(task.actualCost);
        case 'remainingCost':
          return currency(task.remainingCost);
        case 'work':
          return editing === 'work' ? (
            <InlineEditor
              value={task.work != null ? durationDays(task.work) : '0d'}
              onCommit={(value) => commitEdit('work', value)}
              onCancel={() => setEditing(null)}
              type="duration"
            />
          ) : (
            task.work != null ? durationDays(task.work) : ''
          );
        case 'actualWork':
          return task.actualWork != null ? durationDays(task.actualWork) : '';
        case 'remainingWork':
          return task.remainingWork != null ? durationDays(task.remainingWork) : '';
        case 'bcws':
          return currency(task.bcws);
        case 'bcwp':
          return currency(task.bcwp);
        case 'acwp':
          return currency(task.acwp);
        case 'totalSlack':
          return durationDays(task.totalSlackMinutes);
        case 'freeSlack':
          return durationDays(task.freeSlackMinutes);
        case 'deadline':
          return editing === 'deadline' ? (
            <InlineEditor
              value={isoDate(task.deadline) ?? ''}
              onCommit={(value) => commitEdit('deadline', value)}
              onCancel={() => setEditing(null)}
              type="date"
            />
          ) : (
            shortDate(task.deadline)
          );
        case 'constraintType':
          return constraintLabel(task.constraintType);
        case 'wbsCode':
          return task.wbsCode;
        default:
          return '';
      }
    },
    [
      commitEdit,
      editing,
      hasChildren,
      indentPx,
      index,
      isExpanded,
      isMilestone,
      isSummary,
      onToggleExpand,
      predecessorsStr,
      resourceNamesStr,
      task,
    ],
  );

  return (
    <>
      <Box
        role="row"
        aria-selected={isSelected}
        tabIndex={0}
        onClick={(event) => selectTask(task.id, event.ctrlKey || event.metaKey)}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        sx={{
          position: 'absolute',
          top,
          left: 0,
          right: 0,
          height: ROW_HEIGHT,
          display: 'flex',
          alignItems: 'stretch',
          cursor: 'pointer',
          bgcolor: isSelected ? 'action.selected' : index % 2 === 0 ? 'background.paper' : 'rgba(0,0,0,0.02)',
          borderBottom: '1px solid #F0F0F0',
          '&:hover': {
            bgcolor: isSelected ? 'action.selected' : 'action.hover',
          },
        }}
      >
        {visibleColumns.map((column) => (
          <Box
            key={column.id}
            role="gridcell"
            onDoubleClick={() => {
              if (column.id === 'name') handleDoubleClick('name');
              if (column.id === 'duration') handleDoubleClick('duration');
              if (column.id === 'start') handleDoubleClick('start');
              if (column.id === 'finish') handleDoubleClick('finish');
              if (column.id === 'percentComplete') handleDoubleClick('pct');
              if (column.id === 'cost') handleDoubleClick('cost');
              if (column.id === 'fixedCost') handleDoubleClick('fixedCost');
              if (column.id === 'work') handleDoubleClick('work');
              if (column.id === 'deadline') handleDoubleClick('deadline');
            }}
            sx={{
              ...getCellLayout(column),
              display: 'flex',
              alignItems: 'center',
              px: 1,
              py: 0,
              minHeight: ROW_HEIGHT,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              borderRight: '1px solid #F5F5F5',
              color: criticalColor,
              fontWeight: isSummary ? 700 : 400,
            }}
          >
            {renderCellContent(column)}
          </Box>
        ))}
      </Box>

      <Menu
        open={contextMenu !== null}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
      >
        <MenuItem
          onClick={() => {
            closeContextMenu();
            openDialogWith('taskInfo', task);
          }}
        >
          <ListItemIcon>
            <InfoIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Task Information...</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleInsertTaskAbove}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Insert Task Above</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleInsertTaskBelow}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Insert Task Below</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDeleteTask}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete Task</ListItemText>
        </MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleIndent}>
          <ListItemIcon>
            <FormatIndentIncreaseIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Indent</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleOutdent} disabled={task.outlineLevel === 0}>
          <ListItemIcon>
            <FormatIndentDecreaseIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Outdent</ListItemText>
        </MenuItem>
        <MenuItem divider />
        <MenuItem onClick={handleMarkComplete}>
          <ListItemIcon>
            <CheckCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Mark 100% Complete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export default memo(TaskRowComponent);

/**
 * TaskGrid — the left-side task table (MS Project style).
 *
 * Flat table with virtual-ish rendering, inline editing,
 * expand/collapse for summary tasks, selection.
 * Columns are driven by the configurable column definitions in the UI store.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Box,
  Typography,
  TextField,
} from '@mui/material';

import TaskRowComponent from './TaskRow';
import { useProjectStore, useUIStore, ROW_HEIGHT, type TaskRow, type FilterCriteria, type SortCriteria } from '../../stores';

/** Check whether a task matches a single filter criterion. */
function matchesCriterion(task: TaskRow, c: FilterCriteria): boolean {
  const raw = (task as unknown as Record<string, unknown>)[c.field];
  const strVal = String(raw ?? '').toLowerCase();
  const cmpVal = String(c.value ?? '').toLowerCase();

  switch (c.operator) {
    case 'contains':
      return strVal.includes(cmpVal);
    case 'eq':
      return strVal === cmpVal;
    case 'ne':
      return strVal !== cmpVal;
    case 'gt':
      return Number(raw) > Number(c.value);
    case 'lt':
      return Number(raw) < Number(c.value);
    case 'between':
      return c.value2 != null && Number(raw) >= Number(c.value) && Number(raw) <= Number(c.value2);
    default:
      return true;
  }
}

const TaskGrid: React.FC<{ onScroll?: (scrollTop: number) => void; scrollRef?: React.RefObject<HTMLDivElement | null> }> = ({ onScroll, scrollRef }) => {
  const tasks = useProjectStore((s) => s.tasks);
  const selectedTaskIds = useProjectStore((s) => s.selectedTaskIds);
  const createTask = useProjectStore((s) => s.createTask);
  const columns = useUIStore((s) => s.columns);
  const filters = useUIStore((s) => s.filters);
  const sortCriteria = useUIStore((s) => s.sortCriteria);
  const groupBy = useUIStore((s) => s.groupBy);
  const collapsedIds = useUIStore((s) => s.collapsedIds);
  const toggleCollapsed = useUIStore((s) => s.toggleCollapsed);
  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible),
    [columns],
  );

  const [newTaskName, setNewTaskName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine which tasks have children
  const childMap = useMemo(() => {
    const map = new Set<string>();
    for (const t of tasks) {
      if (t.parentId) map.add(t.parentId);
    }
    return map;
  }, [tasks]);

  // Build collapsed ancestor set for hiding children
  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>();
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    for (const t of tasks) {
      let cur = t.parentId;
      while (cur) {
        if (collapsedIds.has(cur)) {
          hidden.add(t.id);
          break;
        }
        const parent = taskById.get(cur);
        cur = parent?.parentId ?? null;
      }
    }
    return hidden;
  }, [tasks, collapsedIds]);

  const visibleTasks = useMemo(() => {
    let result = tasks.filter((t) => !hiddenIds.has(t.id));
    if (filters.length > 0) {
      result = result.filter((t) => filters.every((c) => matchesCriterion(t, c)));
    }
    if (sortCriteria.length > 0) {
      result = [...result].sort((a, b) => {
        for (const sc of sortCriteria) {
          const aVal = (a as unknown as Record<string, unknown>)[sc.field];
          const bVal = (b as unknown as Record<string, unknown>)[sc.field];
          const aStr = String(aVal ?? '');
          const bStr = String(bVal ?? '');
          const aNum = Number(aVal);
          const bNum = Number(bVal);
          let cmp: number;
          if (!isNaN(aNum) && !isNaN(bNum)) {
            cmp = aNum - bNum;
          } else {
            cmp = aStr.localeCompare(bStr);
          }
          if (cmp !== 0) return sc.direction === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }
    return result;
  }, [tasks, hiddenIds, filters, sortCriteria]);

  // Sync vertical scroll with Gantt panel
  const handleScroll = useCallback(() => {
    if (containerRef.current && onScroll) {
      onScroll(containerRef.current.scrollTop);
    }
  }, [onScroll]);

  // Accept external scroll position
  useEffect(() => {
    const el = scrollRef?.current ?? containerRef.current;
    if (!el) return;
    // nothing to do by default — the SplitView drives sync
  }, [scrollRef]);

  const handleNewTaskKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && newTaskName.trim()) {
        e.preventDefault();
        const maxOrder = tasks.reduce((m, t) => Math.max(m, t.sortOrder ?? 0), 0);
        await createTask({ name: newTaskName.trim(), sortOrder: maxOrder + 1 });
        setNewTaskName('');
      }
    },
    [newTaskName, tasks, createTask],
  );

  if (tasks.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'text.secondary',
        }}
      >
        <Typography variant="body2">No tasks yet. Add a task to begin.</Typography>
      </Box>
    );
  }

  return (
    <TableContainer
      ref={(el: HTMLDivElement | null) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        if (scrollRef) (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      onScroll={handleScroll}
      sx={{ height: '100%', overflow: 'auto' }}
    >
      <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow sx={{ height: ROW_HEIGHT }}>
            {visibleColumns.map((col) => (
              <TableCell
                key={col.id}
                align={col.align ?? 'left'}
                sx={{
                  width: col.id === 'name' ? undefined : col.width,
                  minWidth: col.id === 'name' ? col.width : undefined,
                  height: ROW_HEIGHT,
                  py: 0,
                  lineHeight: `${ROW_HEIGHT}px`,
                }}
              >
                {col.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {(() => {
            if (!groupBy) {
              return visibleTasks.map((task, idx) => (
                <TaskRowComponent
                  key={task.id}
                  task={task}
                  index={idx}
                  isSelected={selectedTaskIds.has(task.id)}
                  isExpanded={!collapsedIds.has(task.id)}
                  hasChildren={childMap.has(task.id)}
                  onToggleExpand={toggleCollapsed}
                  visibleColumns={visibleColumns}
                />
              ));
            }
            // Group tasks by the selected field
            const groups = new Map<string, TaskRow[]>();
            for (const task of visibleTasks) {
              const raw = (task as unknown as Record<string, unknown>)[groupBy.field];
              const key = String(raw ?? '(blank)');
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(task);
            }
            const sortedKeys = [...groups.keys()].sort((a, b) =>
              groupBy.direction === 'desc' ? b.localeCompare(a) : a.localeCompare(b),
            );
            let rowIdx = 0;
            return sortedKeys.flatMap((key) => {
              const groupTasks = groups.get(key)!;
              const header = (
                <TableRow key={`group-${key}`}>
                  <TableCell
                    colSpan={visibleColumns.length}
                    sx={{ bgcolor: 'action.hover', fontWeight: 700, py: 0.5 }}
                  >
                    {groupBy.field}: {key} ({groupTasks.length})
                  </TableCell>
                </TableRow>
              );
              const rows = groupTasks.map((task) => {
                const idx = rowIdx++;
                return (
                  <TaskRowComponent
                    key={task.id}
                    task={task}
                    index={idx}
                    isSelected={selectedTaskIds.has(task.id)}
                    isExpanded={!collapsedIds.has(task.id)}
                    hasChildren={childMap.has(task.id)}
                    onToggleExpand={toggleCollapsed}
                    visibleColumns={visibleColumns}
                  />
                );
              });
              return [header, ...rows];
            });
          })()}

          {/* New task entry row */}
          <TableRow sx={{ height: ROW_HEIGHT }}>
            {visibleColumns.map((col, ci) =>
              col.id === 'name' ? (
                <TableCell key={col.id} sx={{ py: 0, height: ROW_HEIGHT }}>
                  <TextField
                    size="small"
                    variant="standard"
                    placeholder="Type a new task name..."
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    onKeyDown={handleNewTaskKeyDown}
                    fullWidth
                    slotProps={{
                      input: {
                        disableUnderline: true,
                        sx: { fontSize: '0.8125rem', height: ROW_HEIGHT - 4, pl: '4px' },
                      },
                    }}
                  />
                </TableCell>
              ) : (
                <TableCell key={col.id} sx={{ py: 0, height: ROW_HEIGHT }}>
                  {ci === 0 ? '' : ''}
                </TableCell>
              ),
            )}
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default TaskGrid;

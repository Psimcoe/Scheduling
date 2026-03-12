/**
 * TaskGrid - a flat, virtualized task table driven by the shared visible-row model.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { Box, TextField, Typography } from '@mui/material';

import TaskRowComponent from './TaskRow';
import { ROW_HEIGHT, useProjectStore, useUIStore, type ColumnDef } from '../../stores';
import type { VisibleTaskListRow } from '../../hooks/useVisibleTaskRows';

interface TaskGridProps {
  rows: VisibleTaskListRow[];
  virtualRows: VirtualItem[];
  totalBodyHeight: number;
  headerHeight: number;
}

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

const TaskGrid: React.FC<TaskGridProps> = ({
  rows,
  virtualRows,
  totalBodyHeight,
  headerHeight,
}) => {
  const tasks = useProjectStore((state) => state.tasks);
  const createTask = useProjectStore((state) => state.createTask);
  const columns = useUIStore((state) => state.columns);
  const toggleCollapsed = useUIStore((state) => state.toggleCollapsed);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const [newTaskName, setNewTaskName] = useState('');

  const visibleColumns = useMemo(
    () => columns.filter((column) => column.visible),
    [columns],
  );
  const gridWidth = useMemo(
    () => visibleColumns.reduce((total, column) => total + column.width, 0),
    [visibleColumns],
  );

  const syncHeaderScroll = useCallback(() => {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
  }, []);

  const handleNewTaskKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter' || !newTaskName.trim()) {
        return;
      }

      event.preventDefault();
      const maxOrder = tasks.reduce((currentMax, task) => Math.max(currentMax, task.sortOrder ?? 0), 0);
      await createTask({ name: newTaskName.trim(), sortOrder: maxOrder + 1 });
      setNewTaskName('');
    },
    [createTask, newTaskName, tasks],
  );

  return (
    <Box
      role="grid"
      aria-rowcount={rows.length}
      aria-colcount={visibleColumns.length}
      sx={{
        position: 'relative',
        minHeight: headerHeight + totalBodyHeight,
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 3,
          height: headerHeight,
          bgcolor: 'background.paper',
          borderBottom: '1px solid #DADCE0',
        }}
      >
        <Box ref={headerScrollRef} sx={{ overflow: 'hidden' }}>
          <Box
            role="row"
            sx={{
              display: 'flex',
              alignItems: 'stretch',
              width: gridWidth,
              minWidth: '100%',
              height: headerHeight,
            }}
          >
            {visibleColumns.map((column) => (
              <Box
                key={column.id}
                role="columnheader"
                sx={{
                  ...getCellLayout(column),
                  display: 'flex',
                  alignItems: 'center',
                  px: 1,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'text.secondary',
                  borderRight: '1px solid #F0F0F0',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {column.label}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box
        ref={bodyScrollRef}
        onScroll={syncHeaderScroll}
        sx={{
          height: totalBodyHeight,
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: gridWidth,
            minWidth: '100%',
            height: totalBodyHeight,
          }}
        >
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) {
              return null;
            }

            if (row.kind === 'group') {
              return (
                <Box
                  key={row.key}
                  role="row"
                  sx={{
                    position: 'absolute',
                    top: virtualRow.start,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                    display: 'flex',
                    alignItems: 'center',
                    px: 1.5,
                    bgcolor: 'action.hover',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    borderBottom: '1px solid #E6E6E6',
                  }}
                >
                  {row.label} ({row.count})
                </Box>
              );
            }

            if (row.kind === 'newTask') {
              return (
                <Box
                  key={row.key}
                  role="row"
                  sx={{
                    position: 'absolute',
                    top: virtualRow.start,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                    display: 'flex',
                    alignItems: 'stretch',
                    bgcolor: 'background.paper',
                    borderBottom: '1px solid #F0F0F0',
                  }}
                >
                  {visibleColumns.map((column) => (
                    <Box
                      key={column.id}
                      role="gridcell"
                      sx={{
                        ...getCellLayout(column),
                        display: 'flex',
                        alignItems: 'center',
                        px: 1,
                        borderRight: '1px solid #F5F5F5',
                      }}
                    >
                      {column.id === 'name' ? (
                        <TextField
                          fullWidth
                          size="small"
                          variant="standard"
                          placeholder="Type a new task name..."
                          value={newTaskName}
                          onChange={(event) => setNewTaskName(event.target.value)}
                          onKeyDown={handleNewTaskKeyDown}
                          slotProps={{
                            input: {
                              disableUnderline: false,
                              sx: {
                                fontSize: '0.8125rem',
                                padding: '0 4px',
                                height: '24px',
                              },
                            },
                          }}
                        />
                      ) : null}
                    </Box>
                  ))}
                </Box>
              );
            }

            return (
              <TaskRowComponent
                key={row.key}
                task={row.task}
                index={row.index}
                isSelected={row.isSelected}
                isExpanded={row.isExpanded}
                hasChildren={row.hasChildren}
                onToggleExpand={toggleCollapsed}
                visibleColumns={visibleColumns}
                top={virtualRow.start}
              />
            );
          })}

          {tasks.length === 0 ? (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                No tasks yet. Add a task to begin.
              </Typography>
            </Box>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
};

export default TaskGrid;

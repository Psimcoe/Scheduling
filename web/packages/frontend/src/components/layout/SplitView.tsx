/**
 * SplitView - shared-scroll split pane layout for the task grid and Gantt surface.
 */

import React, { useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Box } from '@mui/material';

import { TaskGrid } from '../grid';
import { GanttChart } from '../gantt';
import {
  CalendarView,
  NetworkDiagram,
  ReportingView,
  ResourceGraph,
  ResourceSheet,
  ResourceUsage,
  TaskSheet,
  TaskUsage,
  TeamPlanner,
  Timeline,
  TrackingGantt,
} from '../views';
import { useVisibleTaskRows } from '../../hooks/useVisibleTaskRows';
import { ROW_HEIGHT, useUIStore } from '../../stores';

const MIN_PERCENT = 15;
const MAX_PERCENT = 85;
const SURFACE_HEADER_HEIGHT = 40;

const SplitView: React.FC = () => {
  const activeView = useUIStore((state) => state.activeView);
  const gridSplitPercent = useUIStore((state) => state.gridSplitPercent);
  const setGridSplitPercent = useUIStore((state) => state.setGridSplitPercent);
  const { rows, visibleDependencies } = useVisibleTaskRows();
  const containerRef = useRef<HTMLDivElement>(null);
  const verticalScrollRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => verticalScrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 14,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalBodyHeight = rowVirtualizer.getTotalSize();
  const totalContentHeight = SURFACE_HEADER_HEIGHT + totalBodyHeight;

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setDragging(true);

      const controller = new AbortController();

      const handleMouseMove = (mouseEvent: MouseEvent) => {
        if (!containerRef.current) {
          return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const percentage = ((mouseEvent.clientX - rect.left) / rect.width) * 100;
        setGridSplitPercent(Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, percentage)));
      };

      const handleMouseUp = () => {
        setDragging(false);
        controller.abort();
      };

      document.addEventListener('mousemove', handleMouseMove, { signal: controller.signal });
      document.addEventListener('mouseup', handleMouseUp, { signal: controller.signal });
    },
    [setGridSplitPercent],
  );

  if (activeView === 'networkDiagram') return <NetworkDiagram />;
  if (activeView === 'resourceSheet') return <ResourceSheet />;
  if (activeView === 'resourceUsage') return <ResourceUsage />;
  if (activeView === 'taskUsage') return <TaskUsage />;
  if (activeView === 'calendar') return <CalendarView />;
  if (activeView === 'trackingGantt') return <TrackingGantt />;
  if (activeView === 'reporting') return <ReportingView />;
  if (activeView === 'taskSheet') return <TaskSheet />;
  if (activeView === 'resourceGraph') return <ResourceGraph />;
  if (activeView === 'teamPlanner') return <TeamPlanner />;
  if (activeView === 'timeline') return <Timeline />;

  return (
    <Box
      ref={containerRef}
      sx={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        cursor: dragging ? 'col-resize' : undefined,
      }}
    >
      <Box
        ref={verticalScrollRef}
        sx={{
          display: 'flex',
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <Box sx={{ display: 'flex', minWidth: '100%', minHeight: totalContentHeight }}>
          <Box
            sx={{
              width: `${gridSplitPercent}%`,
              minWidth: 0,
              overflow: 'hidden',
              borderRight: '2px solid #E0E0E0',
            }}
          >
            <TaskGrid
              rows={rows}
              virtualRows={virtualRows}
              totalBodyHeight={totalBodyHeight}
              headerHeight={SURFACE_HEADER_HEIGHT}
            />
          </Box>

          <Box
            onMouseDown={handleMouseDown}
            sx={{
              width: 6,
              flexShrink: 0,
              cursor: 'col-resize',
              bgcolor: dragging ? 'primary.light' : 'transparent',
              '&:hover': { bgcolor: 'primary.light', opacity: 0.5 },
              zIndex: 5,
            }}
          />

          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <GanttChart
              rows={rows}
              visibleDependencies={visibleDependencies}
              virtualRows={virtualRows}
              totalBodyHeight={totalBodyHeight}
              headerHeight={SURFACE_HEADER_HEIGHT}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default SplitView;

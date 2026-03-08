/**
 * SplitView — the grid|gantt split pane layout, or alternate full-screen views.
 *
 * For Gantt/TrackingGantt: uses a draggable divider to resize grid and gantt panels.
 * For other views: renders the view full-width.
 */

import React, { useState, useRef, useCallback } from 'react';
import { Box } from '@mui/material';

import { TaskGrid } from '../grid';
import { GanttChart } from '../gantt';
import {
  NetworkDiagram,
  ResourceSheet,
  ResourceUsage,
  TaskUsage,
  CalendarView,
  TrackingGantt,
  ReportingView,
  TaskSheet,
  ResourceGraph,
  TeamPlanner,
  Timeline,
} from '../views';
import { useUIStore } from '../../stores';

const MIN_PERCENT = 15;
const MAX_PERCENT = 85;

const SplitView: React.FC = () => {
  const activeView = useUIStore((s) => s.activeView);
  const gridSplitPercent = useUIStore((s) => s.gridSplitPercent);
  const setGridSplitPercent = useUIStore((s) => s.setGridSplitPercent);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const scrollingSource = useRef<'grid' | 'gantt' | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);

    const controller = new AbortController();

    const handleMouseMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setGridSplitPercent(Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, pct)));
    };

    const handleMouseUp = () => {
      setDragging(false);
      controller.abort();
    };

    document.addEventListener('mousemove', handleMouseMove, { signal: controller.signal });
    document.addEventListener('mouseup', handleMouseUp, { signal: controller.signal });
  }, [setGridSplitPercent]);

  // Vertical scroll synchronization
  const handleGridScroll = useCallback((scrollTop: number) => {
    if (scrollingSource.current === 'gantt') return;
    scrollingSource.current = 'grid';
    if (ganttScrollRef.current) ganttScrollRef.current.scrollTop = scrollTop;
    requestAnimationFrame(() => { scrollingSource.current = null; });
  }, []);

  const handleGanttScroll = useCallback((scrollTop: number) => {
    if (scrollingSource.current === 'grid') return;
    scrollingSource.current = 'gantt';
    if (gridScrollRef.current) gridScrollRef.current.scrollTop = scrollTop;
    requestAnimationFrame(() => { scrollingSource.current = null; });
  }, []);

  // Non-split views
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

  // Default: Gantt split view
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
      {/* Grid pane */}
      <Box
        sx={{
          width: `${gridSplitPercent}%`,
          minWidth: 0,
          overflow: 'hidden',
          borderRight: '2px solid #E0E0E0',
        }}
      >
        <TaskGrid onScroll={handleGridScroll} scrollRef={gridScrollRef} />
      </Box>

      {/* Draggable divider */}
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          width: 6,
          cursor: 'col-resize',
          bgcolor: dragging ? 'primary.light' : 'transparent',
          '&:hover': { bgcolor: 'primary.light', opacity: 0.5 },
          zIndex: 5,
          flexShrink: 0,
        }}
      />

      {/* Gantt pane */}
      <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <GanttChart onScroll={handleGanttScroll} scrollRef={ganttScrollRef} />
      </Box>
    </Box>
  );
};

export default SplitView;

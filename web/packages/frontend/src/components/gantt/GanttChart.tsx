/**
 * GanttChart - virtualized Gantt surface that shares the task-grid row model.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { Box } from '@mui/material';
import dayjs from 'dayjs';
import minMax from 'dayjs/plugin/minMax';
import utc from 'dayjs/plugin/utc';

import TimelineHeader from './TimelineHeader';
import GanttBar from './GanttBar';
import DependencyLines from './DependencyLines';
import { ROW_HEIGHT, useProjectStore, useUIStore, type DependencyRow, type GanttZoom, type TaskRow } from '../../stores';
import type { VisibleTaskListRow } from '../../hooks/useVisibleTaskRows';

dayjs.extend(utc);
dayjs.extend(minMax);

interface GanttChartProps {
  rows: VisibleTaskListRow[];
  visibleDependencies: DependencyRow[];
  virtualRows: VirtualItem[];
  totalBodyHeight: number;
  headerHeight: number;
}

function dayWidthForZoom(zoom: GanttZoom): number {
  switch (zoom) {
    case 'day':
      return 30;
    case 'week':
      return 14;
    case 'month':
      return 5;
    case 'quarter':
      return 1.8;
    case 'year':
      return 0.8;
  }
}

const GanttChart: React.FC<GanttChartProps> = ({
  rows,
  visibleDependencies,
  virtualRows,
  totalBodyHeight,
  headerHeight,
}) => {
  const activeProject = useProjectStore((state) => state.activeProject);
  const taskBounds = useProjectStore((state) => state.taskBounds);
  const selectedTaskIds = useProjectStore((state) => state.selectedTaskIds);
  const zoom = useUIStore((state) => state.ganttZoom);
  const dayWidth = dayWidthForZoom(zoom);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  const syncHeaderScroll = useCallback(() => {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
  }, []);

  const renderedRows = useMemo(
    () =>
      virtualRows
        .map((virtualRow) => {
          const row = rows[virtualRow.index];
          return row ? { virtualRow, row } : null;
        })
        .filter(
          (
            entry,
          ): entry is {
            virtualRow: VirtualItem;
            row: VisibleTaskListRow;
          } => Boolean(entry),
        ),
    [rows, virtualRows],
  );

  const renderedTaskRows = useMemo(
    () =>
      renderedRows.filter(
        (
          entry,
        ): entry is {
          virtualRow: VirtualItem;
          row: Extract<VisibleTaskListRow, { kind: 'task' }>;
        } => entry.row.kind === 'task',
      ),
    [renderedRows],
  );

  const taskYMap = useMemo(
    () =>
      new Map(
        renderedTaskRows.map(({ row, virtualRow }) => [
          row.task.id,
          virtualRow.start + ROW_HEIGHT / 2,
        ]),
      ),
    [renderedTaskRows],
  );

  const renderedTaskIds = useMemo(
    () => new Set(renderedTaskRows.map(({ row }) => row.task.id)),
    [renderedTaskRows],
  );

  const renderedDependencies = useMemo(
    () =>
      visibleDependencies.filter(
        (dependency) =>
          renderedTaskIds.has(dependency.fromTaskId) &&
          renderedTaskIds.has(dependency.toTaskId),
      ),
    [renderedTaskIds, visibleDependencies],
  );

  const renderedTasks = useMemo(
    () => renderedTaskRows.map(({ row }) => row.task),
    [renderedTaskRows],
  );

  const { timelineStart, timelineEnd } = useMemo(() => {
    const fallbackStart = taskBounds?.start
      ? dayjs.utc(taskBounds.start)
      : activeProject?.startDate
        ? dayjs.utc(activeProject.startDate)
        : dayjs.utc();
    const fallbackFinish = taskBounds?.finish
      ? dayjs.utc(taskBounds.finish)
      : activeProject?.finishDate
        ? dayjs.utc(activeProject.finishDate)
        : fallbackStart.add(3, 'month').endOf('month');
    const earliest = fallbackStart.subtract(7, 'day').startOf('week');
    const latest = fallbackFinish.add(14, 'day').endOf('week');

    return {
      timelineStart: earliest.toISOString(),
      timelineEnd: latest.toISOString(),
    };
  }, [activeProject?.finishDate, activeProject?.startDate, taskBounds]);

  const totalDays = Math.max(dayjs.utc(timelineEnd).diff(dayjs.utc(timelineStart), 'day'), 1);
  const totalWidth = totalDays * dayWidth;

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: headerHeight + totalBodyHeight,
        bgcolor: '#FFFFFF',
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          height: headerHeight,
          bgcolor: '#FFFFFF',
          borderBottom: '1px solid #DADCE0',
        }}
      >
        <Box ref={headerScrollRef} sx={{ overflow: 'hidden' }}>
          <Box sx={{ width: totalWidth, minWidth: '100%' }}>
            <TimelineHeader
              startDate={timelineStart}
              endDate={timelineEnd}
              dayWidth={dayWidth}
            />
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
          position: 'relative',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: totalWidth,
            minWidth: '100%',
            height: totalBodyHeight,
          }}
        >
          {renderedRows.map(({ row, virtualRow }) => (
            <Box
              key={`stripe:${row.key}`}
              sx={{
                position: 'absolute',
                top: virtualRow.start,
                left: 0,
                right: 0,
                width: totalWidth,
                height: ROW_HEIGHT,
                bgcolor:
                  row.kind === 'group'
                    ? 'rgba(0,0,0,0.05)'
                    : row.kind === 'newTask'
                      ? 'rgba(0,0,0,0.01)'
                      : virtualRow.index % 2 === 0
                        ? 'transparent'
                        : 'rgba(0,0,0,0.02)',
                borderBottom: '1px solid #F0F0F0',
              }}
            />
          ))}

          {(() => {
            const todayOffset = dayjs.utc().diff(dayjs.utc(timelineStart), 'day', true) * dayWidth;
            if (todayOffset <= 0 || todayOffset >= totalWidth) {
              return null;
            }

            return (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: todayOffset,
                  width: 1.5,
                  height: totalBodyHeight,
                  bgcolor: '#ED6C02',
                  opacity: 0.7,
                  zIndex: 1,
                }}
              />
            );
          })()}

          {renderedTaskRows.map(({ row, virtualRow }) => (
            <GanttBar
              key={row.task.id}
              task={row.task}
              timelineStart={timelineStart}
              dayWidth={dayWidth}
              rowHeight={ROW_HEIGHT}
              rowTop={virtualRow.start}
              isSelected={selectedTaskIds.has(row.task.id)}
            />
          ))}

          <DependencyLines
            tasks={renderedTasks}
            dependencies={renderedDependencies}
            timelineStart={timelineStart}
            dayWidth={dayWidth}
            taskYMap={taskYMap}
            totalHeight={totalBodyHeight}
            totalWidth={totalWidth}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default GanttChart;

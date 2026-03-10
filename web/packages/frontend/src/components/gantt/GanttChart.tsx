/**
 * GanttChart — the right-side Gantt panel: timeline header + bars + dependency lines.
 *
 * Scrolls horizontally. Row heights match the task grid so they align.
 */

import React, { useMemo, useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import minMax from 'dayjs/plugin/minMax';

import TimelineHeader from './TimelineHeader';
import GanttBar from './GanttBar';
import DependencyLines from './DependencyLines';
import { useProjectStore, useUIStore, ROW_HEIGHT, type GanttZoom, type FilterCriteria, type TaskRow } from '../../stores';

dayjs.extend(utc);
dayjs.extend(minMax);

/** Check whether a task matches a single filter criterion (mirrors TaskGrid). */
function matchesCriterion(task: TaskRow, c: FilterCriteria): boolean {
  const raw = (task as unknown as Record<string, unknown>)[c.field];
  const strVal = String(raw ?? '').toLowerCase();
  const cmpVal = String(c.value ?? '').toLowerCase();
  switch (c.operator) {
    case 'contains': return strVal.includes(cmpVal);
    case 'eq': return strVal === cmpVal;
    case 'ne': return strVal !== cmpVal;
    case 'gt': return Number(raw) > Number(c.value);
    case 'lt': return Number(raw) < Number(c.value);
    case 'between': return c.value2 != null && Number(raw) >= Number(c.value) && Number(raw) <= Number(c.value2);
    default: return true;
  }
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

const GanttChart: React.FC<{ onScroll?: (scrollTop: number) => void; scrollRef?: React.RefObject<HTMLDivElement | null> }> = ({ onScroll, scrollRef }) => {
  const tasks = useProjectStore((s) => s.tasks);
  const dependencies = useProjectStore((s) => s.dependencies);
  const selectedTaskIds = useProjectStore((s) => s.selectedTaskIds);
  const zoom = useUIStore((s) => s.ganttZoom);
  const collapsedIds = useUIStore((s) => s.collapsedIds);
  const filters = useUIStore((s) => s.filters);
  const sortCriteria = useUIStore((s) => s.sortCriteria);
  const containerRef = useRef<HTMLDivElement>(null);

  const dayWidth = dayWidthForZoom(zoom);

  // Compute visible tasks — match TaskGrid logic exactly
  const visibleTasks = useMemo(() => {
    // Build hidden set from collapsed summary parents
    const hiddenIds = new Set<string>();
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    for (const t of tasks) {
      let cur = t.parentId;
      while (cur) {
        if (collapsedIds.has(cur)) { hiddenIds.add(t.id); break; }
        const parent = taskById.get(cur);
        cur = parent?.parentId ?? null;
      }
    }
    let result = tasks.filter((t) => !hiddenIds.has(t.id));
    if (filters.length > 0) {
      result = result.filter((t) => filters.every((c) => matchesCriterion(t, c)));
    }
    if (sortCriteria.length > 0) {
      result = [...result].sort((a, b) => {
        for (const sc of sortCriteria) {
          const aVal = (a as unknown as Record<string, unknown>)[sc.field];
          const bVal = (b as unknown as Record<string, unknown>)[sc.field];
          const aNum = Number(aVal);
          const bNum = Number(bVal);
          let cmp: number;
          if (!isNaN(aNum) && !isNaN(bNum)) cmp = aNum - bNum;
          else cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''));
          if (cmp !== 0) return sc.direction === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }
    return result;
  }, [tasks, collapsedIds, filters, sortCriteria]);

  // Compute timeline range — from earliest start to latest finish + buffer
  const { timelineStart, timelineEnd } = useMemo(() => {
    if (tasks.length === 0) {
      const now = dayjs.utc();
      return {
        timelineStart: now.startOf('month').toISOString(),
        timelineEnd: now.add(3, 'month').endOf('month').toISOString(),
      };
    }
    const starts = tasks.map((t) => dayjs.utc(t.start));
    const finishes = tasks.map((t) => dayjs.utc(t.finish));
    const earliest = dayjs.min(...starts)!.subtract(7, 'day').startOf('week');
    const latest = dayjs.max(...finishes)!.add(14, 'day').endOf('week');
    return {
      timelineStart: earliest.toISOString(),
      timelineEnd: latest.toISOString(),
    };
  }, [tasks]);

  const totalDays = dayjs.utc(timelineEnd).diff(dayjs.utc(timelineStart), 'day');
  const totalWidth = totalDays * dayWidth;
  const totalHeight = visibleTasks.length * ROW_HEIGHT;

  const taskIndexMap = useMemo(
    () => new Map(visibleTasks.map((t, i) => [t.id, i])),
    [visibleTasks],
  );

  // Sync vertical scroll
  const handleScroll = useCallback(() => {
    if (containerRef.current && onScroll) {
      onScroll(containerRef.current.scrollTop);
    }
  }, [onScroll]);

  return (
    <Box
      ref={(el: HTMLDivElement | null) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        if (scrollRef) (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      onScroll={handleScroll}
      sx={{
        height: '100%',
        overflow: 'auto',
        position: 'relative',
        bgcolor: '#FFFFFF',
      }}
    >
      {/* Timeline header (sticky top) */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: '#FFFFFF' }}>
        <TimelineHeader
          startDate={timelineStart}
          endDate={timelineEnd}
          dayWidth={dayWidth}
        />
      </Box>

      {/* Bar area */}
      <Box
        sx={{
          position: 'relative',
          width: totalWidth,
          height: totalHeight,
          minHeight: 200,
        }}
      >
        {/* Alternating row stripes */}
        {visibleTasks.map((_, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              top: i * ROW_HEIGHT,
              left: 0,
              right: 0,
              width: totalWidth,
              height: ROW_HEIGHT,
              bgcolor: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
              borderBottom: '1px solid #F0F0F0',
            }}
          />
        ))}

        {/* Today line */}
        {(() => {
          const todayOffset =
            dayjs.utc().diff(dayjs.utc(timelineStart), 'day', true) * dayWidth;
          if (todayOffset > 0 && todayOffset < totalWidth) {
            return (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: todayOffset,
                  width: 1.5,
                  height: totalHeight,
                  bgcolor: '#ED6C02',
                  zIndex: 1,
                  opacity: 0.7,
                }}
              />
            );
          }
          return null;
        })()}

        {/* Bars */}
        {visibleTasks.map((task, idx) => (
          <GanttBar
            key={task.id}
            task={task}
            timelineStart={timelineStart}
            dayWidth={dayWidth}
            rowHeight={ROW_HEIGHT}
            rowIndex={idx}
            isSelected={selectedTaskIds.has(task.id)}
          />
        ))}

        {/* Dependency lines */}
        <DependencyLines
          tasks={visibleTasks}
          dependencies={dependencies}
          timelineStart={timelineStart}
          dayWidth={dayWidth}
          rowHeight={ROW_HEIGHT}
          taskIndexMap={taskIndexMap}
          totalHeight={totalHeight}
          totalWidth={totalWidth}
        />
      </Box>
    </Box>
  );
};

export default GanttChart;

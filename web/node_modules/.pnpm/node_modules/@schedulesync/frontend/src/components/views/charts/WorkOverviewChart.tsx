/**
 * WorkOverviewChart — SVG stacked area/bar chart showing work distribution.
 */

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { type TaskRow } from '../../../stores';

interface WorkOverviewChartProps {
  tasks: TaskRow[];
  width?: number;
  height?: number;
}

const WorkOverviewChart: React.FC<WorkOverviewChartProps> = ({ tasks, width = 560, height = 240 }) => {
  const data = useMemo(() => {
    const nonSummary = tasks.filter((t) => t.type !== 'summary' && t.start && t.finish);
    if (nonSummary.length === 0) return { bars: [], labels: [], maxWork: 0 };

    const starts = nonSummary.map((t) => dayjs(t.start));
    const finishes = nonSummary.map((t) => dayjs(t.finish));
    const projStart = starts.reduce((a, b) => (a.isBefore(b) ? a : b));
    const projFinish = finishes.reduce((a, b) => (a.isAfter(b) ? a : b));

    // Group into weeks
    const numWeeks = Math.max(1, Math.ceil(projFinish.diff(projStart, 'week', true)));
    const weekBuckets: { planned: number; actual: number; label: string }[] = [];

    for (let w = 0; w < Math.min(numWeeks, 26); w++) {
      const weekStart = projStart.add(w, 'week');
      const weekEnd = weekStart.add(1, 'week');
      let planned = 0;
      let actual = 0;

      for (const t of nonSummary) {
        const tStart = dayjs(t.start);
        const tFinish = dayjs(t.finish);
        // Does this task overlap this week?
        if (tStart.isBefore(weekEnd) && tFinish.isAfter(weekStart)) {
          const taskDays = Math.max(1, tFinish.diff(tStart, 'day'));
          const overlapStart = tStart.isAfter(weekStart) ? tStart : weekStart;
          const overlapEnd = tFinish.isBefore(weekEnd) ? tFinish : weekEnd;
          const overlapDays = Math.max(0, overlapEnd.diff(overlapStart, 'day'));
          const fraction = overlapDays / taskDays;
          const workHours = (t.work ?? t.durationMinutes) / 60;
          planned += workHours * fraction;
          actual += workHours * fraction * (t.percentComplete / 100);
        }
      }

      weekBuckets.push({
        planned: Math.round(planned),
        actual: Math.round(actual),
        label: weekStart.format('MMM D'),
      });
    }

    const maxWork = Math.max(...weekBuckets.map((b) => b.planned), 1);
    return { bars: weekBuckets, labels: weekBuckets.map((b) => b.label), maxWork };
  }, [tasks]);

  if (data.bars.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">No work data available</Typography>
      </Box>
    );
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const barGroupWidth = chartW / data.bars.length;
  const barW = Math.max(4, barGroupWidth * 0.35);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ fontFamily: 'Segoe UI, sans-serif' }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padding.top + chartH - frac * chartH;
        return (
          <g key={frac}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#E0E0E0" strokeDasharray="3 3" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize={9} fill="#666">
              {Math.round(data.maxWork * frac)}h
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.bars.map((bar, i) => {
        const x = padding.left + i * barGroupWidth + barGroupWidth * 0.15;
        const plannedH = (bar.planned / data.maxWork) * chartH;
        const actualH = (bar.actual / data.maxWork) * chartH;
        return (
          <g key={bar.label}>
            {/* Planned bar */}
            <rect
              x={x} y={padding.top + chartH - plannedH}
              width={barW} height={plannedH}
              fill="#90CAF9" rx={2}
            />
            {/* Actual bar */}
            <rect
              x={x + barW + 2} y={padding.top + chartH - actualH}
              width={barW} height={actualH}
              fill="#1B6B3A" rx={2}
            />
            {/* Label */}
            {(i % 3 === 0 || i === data.bars.length - 1) && (
              <text x={x + barW} y={height - 8} textAnchor="middle" fontSize={8} fill="#666">
                {bar.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Legend */}
      <rect x={padding.left} y={height - 28} width={12} height={8} fill="#90CAF9" rx={1} />
      <text x={padding.left + 16} y={height - 21} fontSize={9} fill="#666">Planned</text>
      <rect x={padding.left + 70} y={height - 28} width={12} height={8} fill="#1B6B3A" rx={1} />
      <text x={padding.left + 86} y={height - 21} fontSize={9} fill="#666">Actual</text>
    </svg>
  );
};

export default WorkOverviewChart;

/**
 * BurndownChart — SVG-based burndown chart showing planned vs actual progress over time.
 */

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { type TaskRow } from '../../../stores';

interface BurndownChartProps {
  tasks: TaskRow[];
  width?: number;
  height?: number;
}

const BurndownChart: React.FC<BurndownChartProps> = ({ tasks, width = 560, height = 280 }) => {
  const data = useMemo(() => {
    const nonSummary = tasks.filter((t) => t.type !== 'summary');
    if (nonSummary.length === 0) return { planned: [], actual: [], labels: [] };

    const starts = nonSummary.filter((t) => t.start).map((t) => dayjs(t.start));
    const finishes = nonSummary.filter((t) => t.finish).map((t) => dayjs(t.finish));
    if (starts.length === 0 || finishes.length === 0) return { planned: [], actual: [], labels: [] };

    const projStart = starts.reduce((a, b) => (a.isBefore(b) ? a : b));
    const projFinish = finishes.reduce((a, b) => (a.isAfter(b) ? a : b));
    const totalDays = projFinish.diff(projStart, 'day') || 1;
    const totalTasks = nonSummary.length;

    const points = 12;
    const planned: number[] = [];
    const actual: number[] = [];
    const labels: string[] = [];
    const today = dayjs();

    for (let i = 0; i <= points; i++) {
      const date = projStart.add(Math.round((totalDays * i) / points), 'day');
      labels.push(date.format('MMM D'));

      // Planned: linear burndown
      const pctElapsed = i / points;
      planned.push(Math.round(totalTasks * (1 - pctElapsed)));

      // Actual: tasks not yet complete at this date
      if (date.isAfter(today)) {
        actual.push(NaN);
      } else {
        const remaining = nonSummary.filter((t) => {
          if (t.percentComplete >= 100) {
            // Consider done if finish <= date
            return t.finish ? dayjs(t.finish).isAfter(date) : true;
          }
          return true;
        }).length;
        actual.push(remaining);
      }
    }

    return { planned, actual, labels };
  }, [tasks]);

  if (data.planned.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">No task data for burndown chart</Typography>
      </Box>
    );
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.planned, ...data.actual.filter((v) => !isNaN(v)));
  const yScale = (v: number) => padding.top + chartH - (v / maxVal) * chartH;
  const xScale = (i: number) => padding.left + (i / (data.planned.length - 1)) * chartW;

  const plannedPath = data.planned.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(v)}`).join(' ');
  const actualPoints = data.actual
    .map((v, i) => (isNaN(v) ? null : { x: xScale(i), y: yScale(v) }))
    .filter(Boolean) as { x: number; y: number }[];
  const actualPath = actualPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ fontFamily: 'Segoe UI, sans-serif' }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
        <g key={frac}>
          <line
            x1={padding.left} y1={yScale(maxVal * frac)}
            x2={width - padding.right} y2={yScale(maxVal * frac)}
            stroke="#E0E0E0" strokeDasharray="3 3"
          />
          <text x={padding.left - 8} y={yScale(maxVal * frac) + 4} textAnchor="end" fontSize={10} fill="#666">
            {Math.round(maxVal * frac)}
          </text>
        </g>
      ))}

      {/* X axis labels */}
      {data.labels.map((label, i) => ({ label, i })).filter(({ i }) => i % 3 === 0 || i === data.labels.length - 1).map(({ label, i }) => (
          <text key={i} x={xScale(i)} y={height - 8} textAnchor="middle" fontSize={9} fill="#666">
            {label}
          </text>
      ))}

      {/* Planned line */}
      <path d={plannedPath} fill="none" stroke="#90CAF9" strokeWidth={2} strokeDasharray="6 4" />

      {/* Actual line */}
      {actualPath && <path d={actualPath} fill="none" stroke="#1B6B3A" strokeWidth={2.5} />}

      {/* Legend */}
      <line x1={padding.left} y1={height - 24} x2={padding.left + 20} y2={height - 24} stroke="#90CAF9" strokeWidth={2} strokeDasharray="6 4" />
      <text x={padding.left + 24} y={height - 20} fontSize={10} fill="#666">Planned</text>
      <line x1={padding.left + 80} y1={height - 24} x2={padding.left + 100} y2={height - 24} stroke="#1B6B3A" strokeWidth={2.5} />
      <text x={padding.left + 104} y={height - 20} fontSize={10} fill="#666">Actual</text>
    </svg>
  );
};

export default BurndownChart;

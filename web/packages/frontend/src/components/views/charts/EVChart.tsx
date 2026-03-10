/**
 * EVChart — Earned Value S-curve chart showing PV, EV, AC over time.
 */

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { type TaskRow } from '../../../stores';

interface EVChartProps {
  tasks: TaskRow[];
  width?: number;
  height?: number;
}

const EVChart: React.FC<EVChartProps> = ({ tasks, width = 560, height = 260 }) => {
  const data = useMemo(() => {
    const nonSummary = tasks.filter((t) => t.type !== 'summary' && t.start && t.finish);
    if (nonSummary.length === 0) return null;

    const starts = nonSummary.map((t) => dayjs(t.start));
    const finishes = nonSummary.map((t) => dayjs(t.finish));
    const projStart = starts.reduce((a, b) => (a.isBefore(b) ? a : b));
    const projFinish = finishes.reduce((a, b) => (a.isAfter(b) ? a : b));
    const totalDays = Math.max(1, projFinish.diff(projStart, 'day'));

    const points = Math.min(20, totalDays);
    const pv: number[] = [];
    const ev: number[] = [];
    const ac: number[] = [];
    const labels: string[] = [];
    const today = dayjs();

    for (let i = 0; i <= points; i++) {
      const date = projStart.add(Math.round((totalDays * i) / points), 'day');
      labels.push(date.format('MMM D'));

      let pvCum = 0;
      let evCum = 0;
      let acCum = 0;

      for (const t of nonSummary) {
        const tStart = dayjs(t.start);
        const tFinish = dayjs(t.finish);
        const taskCost = t.cost ?? 0;
        const taskDuration = Math.max(1, tFinish.diff(tStart, 'day'));

        // PV: planned value through this date
        if (date.isAfter(tStart) || date.isSame(tStart)) {
          const elapsed = Math.min(date.diff(tStart, 'day'), taskDuration);
          pvCum += taskCost * (elapsed / taskDuration);
        }

        // EV: earned value (based on % complete, capped at date)
        if (date.isAfter(tStart) || date.isSame(tStart)) {
          evCum += taskCost * (t.percentComplete / 100);
        }

        // AC: actual cost (simplified — distribute actual cost linearly)
        if (date.isAfter(tStart) || date.isSame(tStart)) {
          const actualCost = t.actualCost ?? 0;
          const elapsed = Math.min(date.diff(tStart, 'day'), taskDuration);
          acCum += actualCost * (elapsed / taskDuration);
        }
      }

      pv.push(Math.round(pvCum));
      ev.push(date.isAfter(today) ? NaN : Math.round(evCum));
      ac.push(date.isAfter(today) ? NaN : Math.round(acCum));
    }

    const maxVal = Math.max(...pv, ...ev.filter((v) => !isNaN(v)), ...ac.filter((v) => !isNaN(v)), 1);
    return { pv, ev, ac, labels, maxVal };
  }, [tasks]);

  if (!data) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">No data for EV chart</Typography>
      </Box>
    );
  }

  const padding = { top: 20, right: 20, bottom: 44, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const yScale = (v: number) => padding.top + chartH - (v / data.maxVal) * chartH;
  const xScale = (i: number) => padding.left + (i / (data.pv.length - 1)) * chartW;

  const makePath = (vals: number[]) => {
    const valid = vals.map((v, i) => (isNaN(v) ? null : { x: xScale(i), y: yScale(v) })).filter(Boolean) as { x: number; y: number }[];
    return valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  };

  const fmtCost = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ fontFamily: 'Segoe UI, sans-serif' }}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
        <g key={frac}>
          <line x1={padding.left} y1={yScale(data.maxVal * frac)} x2={width - padding.right} y2={yScale(data.maxVal * frac)} stroke="#E0E0E0" strokeDasharray="3 3" />
          <text x={padding.left - 8} y={yScale(data.maxVal * frac) + 4} textAnchor="end" fontSize={9} fill="#666">
            {fmtCost(Math.round(data.maxVal * frac))}
          </text>
        </g>
      ))}

      {/* X labels */}
      {data.labels.map((label, i) => ({ label, i })).filter(({ i }) => i % 4 === 0 || i === data.labels.length - 1).map(({ label, i }) => (
          <text key={i} x={xScale(i)} y={height - 28} textAnchor="middle" fontSize={8} fill="#666">
            {label}
          </text>
      ))}

      {/* Lines */}
      <path d={makePath(data.pv)} fill="none" stroke="#90CAF9" strokeWidth={2} strokeDasharray="6 4" />
      <path d={makePath(data.ev)} fill="none" stroke="#1B6B3A" strokeWidth={2.5} />
      <path d={makePath(data.ac)} fill="none" stroke="#F44336" strokeWidth={2} />

      {/* Legend */}
      <line x1={padding.left} y1={height - 12} x2={padding.left + 16} y2={height - 12} stroke="#90CAF9" strokeWidth={2} strokeDasharray="6 4" />
      <text x={padding.left + 20} y={height - 8} fontSize={9} fill="#666">PV (Planned)</text>
      <line x1={padding.left + 100} y1={height - 12} x2={padding.left + 116} y2={height - 12} stroke="#1B6B3A" strokeWidth={2.5} />
      <text x={padding.left + 120} y={height - 8} fontSize={9} fill="#666">EV (Earned)</text>
      <line x1={padding.left + 195} y1={height - 12} x2={padding.left + 211} y2={height - 12} stroke="#F44336" strokeWidth={2} />
      <text x={padding.left + 215} y={height - 8} fontSize={9} fill="#666">AC (Actual)</text>
    </svg>
  );
};

export default EVChart;

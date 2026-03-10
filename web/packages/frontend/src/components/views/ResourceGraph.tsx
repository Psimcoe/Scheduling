/**
 * ResourceGraph — histogram view showing resource allocation over time.
 * Displays a bar chart per resource showing allocated vs available units per period.
 */

import React, { useMemo } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import dayjs from 'dayjs';
import { useProjectStore } from '../../stores';
import { useUIStore } from '../../stores';

const PERIOD_WIDTH = 60;
const BAR_HEIGHT = 120;
const ROW_HEIGHT = 160;

const ResourceGraph: React.FC = () => {
  const tasks = useProjectStore((s) => s.tasks);
  const resources = useProjectStore((s) => s.resources);
  const assignments = useProjectStore((s) => s.assignments);
  const ganttZoom = useUIStore((s) => s.ganttZoom);

  const { periods, resourceRows, projectStart, projectEnd } = useMemo(() => {
    if (tasks.length === 0 || resources.length === 0) {
      return { periods: [], resourceRows: [], projectStart: dayjs(), projectEnd: dayjs() };
    }

    // Determine project date range
    const starts = tasks.map((t) => dayjs(t.start));
    const ends = tasks.map((t) => dayjs(t.finish));
    const pStart = starts.reduce((a, b) => (a.isBefore(b) ? a : b));
    const pEnd = ends.reduce((a, b) => (a.isAfter(b) ? a : b));

    // Generate time periods based on zoom
    const periodDates: dayjs.Dayjs[] = [];
    let current = pStart.startOf(ganttZoom === 'day' ? 'day' : ganttZoom === 'week' ? 'week' : 'month');
    while (current.isBefore(pEnd.add(1, ganttZoom === 'day' ? 'day' : ganttZoom === 'week' ? 'week' : 'month'))) {
      periodDates.push(current);
      current = current.add(1, ganttZoom === 'day' ? 'day' : ganttZoom === 'week' ? 'week' : 'month');
    }

    // Build resource allocation data
    const rows = resources
      .filter((r) => r.type === 'work')
      .map((resource) => {
        const resAssignments = assignments.filter((a) => a.resourceId === resource.id);
        const maxUnits = resource.maxUnits / 100;

        const allocation = periodDates.map((periodStart) => {
          const periodEnd = periodStart.add(1, ganttZoom === 'day' ? 'day' : ganttZoom === 'week' ? 'week' : 'month');
          let totalUnits = 0;

          for (const a of resAssignments) {
            const task = tasks.find((t) => t.id === a.taskId);
            if (!task) continue;
            const tStart = dayjs(task.start);
            const tEnd = dayjs(task.finish);

            // Check if task overlaps this period
            if (tStart.isBefore(periodEnd) && tEnd.isAfter(periodStart)) {
              totalUnits += a.units;
            }
          }

          return {
            periodStart,
            periodEnd,
            units: totalUnits,
            overAllocated: totalUnits > maxUnits,
            percentage: maxUnits > 0 ? (totalUnits / maxUnits) * 100 : 0,
          };
        });

        return { resource, maxUnits, allocation };
      });

    return { periods: periodDates, resourceRows: rows, projectStart: pStart, projectEnd: pEnd };
  }, [tasks, resources, assignments, ganttZoom]);

  if (resources.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No work resources to display.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Box
        sx={{
          bgcolor: '#F5F5F5',
          borderBottom: '1px solid #E0E0E0',
          px: 2,
          py: 0.5,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
          Resource Graph
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', display: 'flex' }}>
        {/* Resource names column */}
        <Box sx={{
          width: 160,
          flexShrink: 0,
          borderRight: '2px solid #E0E0E0',
          bgcolor: '#FAFAFA',
        }}>
          {/* Header spacer */}
          <Box sx={{ height: 28, borderBottom: '1px solid #E0E0E0' }} />
          {resourceRows.map((row) => (
            <Box
              key={row.resource.id}
              sx={{
                height: ROW_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                px: 1,
                borderBottom: '1px solid #E0E0E0',
              }}
            >
              <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 500 }} noWrap>
                {row.resource.name}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Chart area */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {/* Period headers */}
          <Box sx={{ display: 'flex', borderBottom: '1px solid #E0E0E0', height: 28 }}>
            {periods.map((p) => (
              <Box
                key={p.format('YYYY-MM-DD')}
                sx={{
                  width: PERIOD_WIDTH,
                  minWidth: PERIOD_WIDTH,
                  textAlign: 'center',
                  borderRight: '1px solid #F0F0F0',
                  fontSize: '0.6rem',
                  lineHeight: '28px',
                  color: 'text.secondary',
                }}
              >
                {ganttZoom === 'day' ? p.format('MM/DD') : ganttZoom === 'week' ? p.format('MM/DD') : p.format('MMM YY')}
              </Box>
            ))}
          </Box>

          {/* Histogram rows */}
          {resourceRows.map((row) => {
            const maxPct = Math.max(
              ...row.allocation.map((x) => x.percentage),
              100,
            );
            // Position the 100% reference line at the correct bar height
            const lineHeight100 = (100 / maxPct) * BAR_HEIGHT;

            return (
            <Box
              key={row.resource.id}
              sx={{
                height: ROW_HEIGHT,
                display: 'flex',
                alignItems: 'flex-end',
                borderBottom: '1px solid #E0E0E0',
                position: 'relative',
              }}
            >
              {/* 100% line */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 20 + lineHeight100,
                  left: 0,
                  right: 0,
                  borderTop: '1px dashed #1B6B3A',
                  opacity: 0.5,
                }}
              />
              {row.allocation.map((a) => {
                const barPct = maxPct > 0 ? (a.percentage / maxPct) * BAR_HEIGHT : 0;
                return (
                  <Tooltip
                    key={a.periodStart.format('YYYY-MM-DD')}
                    title={`${a.periodStart.format('MM/DD')} — ${Math.round(a.units * 100)}% allocated`}
                  >
                    <Box
                      sx={{
                        width: PERIOD_WIDTH,
                        minWidth: PERIOD_WIDTH,
                        height: barPct,
                        bgcolor: a.overAllocated ? '#D32F2F' : '#1B6B3A',
                        opacity: a.units > 0 ? 0.7 : 0,
                        borderRight: '1px solid #FFF',
                        transition: 'height 0.2s',
                        mb: '20px',
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
          );
          })}
        </Box>
      </Box>
    </Box>
  );
};

export default ResourceGraph;

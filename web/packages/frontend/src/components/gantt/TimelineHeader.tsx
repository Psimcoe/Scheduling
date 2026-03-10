/**
 * TimelineHeader — renders the time scale above the Gantt bars.
 *
 * Two-tier header: top tier (month/quarter) + bottom tier (day/week).
 * Syncs horizontal scroll with the bars below.
 */

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

import { useUIStore, type GanttZoom } from '../../stores';

dayjs.extend(utc);

interface TimelineHeaderProps {
  startDate: string;
  endDate: string;
  dayWidth: number;
}

function getTopTierUnits(
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  zoom: GanttZoom,
): { label: string; days: number }[] {
  const units: { label: string; days: number }[] = [];
  let cursor = start;

  while (cursor.isBefore(end)) {
    let nextBoundary: dayjs.Dayjs;
    let label: string;

    switch (zoom) {
      case 'day':
      case 'week':
        // Top tier = months
        nextBoundary = cursor.add(1, 'month').startOf('month');
        label = cursor.format('MMM YYYY');
        break;
      case 'month':
        // Top tier = quarters
        nextBoundary = cursor.add(3, 'month').startOf('month');
        label = `Q${Math.ceil((cursor.month() + 1) / 3)} ${cursor.year()}`;
        break;
      case 'quarter':
      case 'year':
        // Top tier = years
        nextBoundary = cursor.add(1, 'year').startOf('year');
        label = cursor.format('YYYY');
        break;
      default:
        nextBoundary = cursor.add(1, 'month').startOf('month');
        label = cursor.format('MMM YYYY');
    }

    const clampedEnd = nextBoundary.isAfter(end) ? end : nextBoundary;
    const days = clampedEnd.diff(cursor, 'day');
    if (days > 0) {
      units.push({ label, days });
    }
    cursor = nextBoundary;
  }
  return units;
}

function getBottomTierUnits(
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  zoom: GanttZoom,
): { label: string; days: number }[] {
  const units: { label: string; days: number }[] = [];
  let cursor = start;

  while (cursor.isBefore(end)) {
    let nextBoundary: dayjs.Dayjs;
    let label: string;

    switch (zoom) {
      case 'day':
        nextBoundary = cursor.add(1, 'day');
        label = cursor.format('D');
        break;
      case 'week':
        nextBoundary = cursor.add(1, 'week').startOf('week');
        if (nextBoundary.isSame(cursor)) nextBoundary = nextBoundary.add(1, 'week');
        label = cursor.format('D');
        break;
      case 'month':
        nextBoundary = cursor.add(1, 'month').startOf('month');
        label = cursor.format('MMM');
        break;
      case 'quarter':
        nextBoundary = cursor.add(3, 'month').startOf('month');
        label = `Q${Math.ceil((cursor.month() + 1) / 3)}`;
        break;
      case 'year':
        nextBoundary = cursor.add(1, 'year').startOf('year');
        label = cursor.format('YYYY');
        break;
      default:
        nextBoundary = cursor.add(1, 'day');
        label = cursor.format('D');
    }

    const clampedEnd = nextBoundary.isAfter(end) ? end : nextBoundary;
    const days = clampedEnd.diff(cursor, 'day');
    if (days > 0) {
      units.push({ label, days });
    }
    cursor = nextBoundary;
  }
  return units;
}

const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  startDate,
  endDate,
  dayWidth,
}) => {
  const zoom = useUIStore((s) => s.ganttZoom);
  const start = useMemo(() => dayjs.utc(startDate), [startDate]);
  const end = useMemo(() => dayjs.utc(endDate), [endDate]);

  const topUnits = useMemo(
    () => getTopTierUnits(start, end, zoom),
    [start, end, zoom],
  );
  const bottomUnits = useMemo(
    () => getBottomTierUnits(start, end, zoom),
    [start, end, zoom],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Top tier */}
      <Box sx={{ display: 'flex', borderBottom: '1px solid #E0E0E0', height: 20 }}>
        {topUnits.map((u, i) => (
          <Box
            key={i}
            sx={{
              width: u.days * dayWidth,
              minWidth: u.days * dayWidth,
              borderRight: '1px solid #E0E0E0',
              overflow: 'hidden',
              px: 0.5,
              bgcolor: '#FAFAFA',
            }}
          >
            <Typography
              variant="caption"
              noWrap
              sx={{ fontSize: '0.7rem', fontWeight: 600 }}
            >
              {u.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Bottom tier */}
      <Box sx={{ display: 'flex', borderBottom: '1px solid #BDBDBD', height: 20 }}>
        {bottomUnits.map((u, i) => (
          <Box
            key={i}
            sx={{
              width: u.days * dayWidth,
              minWidth: u.days * dayWidth,
              borderRight: '1px solid #E0E0E0',
              overflow: 'hidden',
              px: 0.5,
              bgcolor: '#F5F5F5',
            }}
          >
            <Typography variant="caption" noWrap sx={{ fontSize: '0.65rem' }}>
              {u.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default TimelineHeader;

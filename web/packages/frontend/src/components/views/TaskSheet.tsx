/**
 * TaskSheet — a table-only view (no Gantt chart) for data entry and review.
 * Similar to the Gantt view's grid but takes the full width.
 */

import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Box, Typography } from '@mui/material';
import { TaskGrid } from '../grid';
import { useVisibleTaskRows } from '../../hooks/useVisibleTaskRows';
import { ROW_HEIGHT } from '../../stores';

const SURFACE_HEADER_HEIGHT = 40;

const TaskSheet: React.FC = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { rows } = useVisibleTaskRows();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 14,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Box
        sx={{
          bgcolor: '#F5F5F5',
          borderBottom: '1px solid #E0E0E0',
          px: 2,
          py: 0.5,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
          Task Sheet
        </Typography>
      </Box>
      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <TaskGrid
          rows={rows}
          virtualRows={rowVirtualizer.getVirtualItems()}
          totalBodyHeight={rowVirtualizer.getTotalSize()}
          headerHeight={SURFACE_HEADER_HEIGHT}
        />
      </Box>
    </Box>
  );
};

export default TaskSheet;

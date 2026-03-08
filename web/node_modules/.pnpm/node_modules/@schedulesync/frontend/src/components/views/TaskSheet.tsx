/**
 * TaskSheet — a table-only view (no Gantt chart) for data entry and review.
 * Similar to the Gantt view's grid but takes the full width.
 */

import React from 'react';
import { Box, Typography } from '@mui/material';
import { TaskGrid } from '../grid';

const TaskSheet: React.FC = () => {
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
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <TaskGrid />
      </Box>
    </Box>
  );
};

export default TaskSheet;

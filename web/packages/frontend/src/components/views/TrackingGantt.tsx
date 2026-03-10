/**
 * TrackingGantt — Gantt chart with baseline comparison overlay.
 * Reuses the existing GanttChart but forces baseline display on.
 */

import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import GanttChart from '../gantt/GanttChart';
import { useUIStore } from '../../stores';

const TrackingGantt: React.FC = () => {
  const showBaseline = useUIStore((s) => s.showBaseline);
  const setShowBaseline = useUIStore((s) => s.setShowBaseline);

  // Auto-enable baseline 0 if not already showing
  React.useEffect(() => {
    if (showBaseline === null) {
      setShowBaseline(0);
    }
  }, [showBaseline, setShowBaseline]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Info bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.5,
          bgcolor: '#F5F5F5',
          borderBottom: '1px solid #E0E0E0',
          minHeight: 28,
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
          Tracking Gantt
        </Typography>
        <Chip
          size="small"
          label={`Baseline ${showBaseline ?? 0}`}
          color="primary"
          variant="outlined"
          sx={{ height: 20, fontSize: '0.65rem' }}
        />
        <Box sx={{ display: 'flex', gap: 1, ml: 2, alignItems: 'center' }}>
          <Box
            sx={{ width: 20, height: 6, bgcolor: '#4694E4', borderRadius: 0.5 }}
          />
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
            Scheduled
          </Typography>
          <Box
            sx={{ width: 20, height: 4, bgcolor: 'rgba(128,128,128,0.5)', borderRadius: 0.5 }}
          />
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
            Baseline
          </Typography>
          <Box
            sx={{ width: 20, height: 6, bgcolor: '#D32F2F', borderRadius: 0.5 }}
          />
          <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
            Critical
          </Typography>
        </Box>
      </Box>

      {/* The actual Gantt */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <GanttChart />
      </Box>
    </Box>
  );
};

export default TrackingGantt;

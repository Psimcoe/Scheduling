import React from 'react';
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import type { StratusJobResponse } from '../../api/client';

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatElapsed(job: StratusJobResponse): string {
  const startValue = job.startedAt ?? job.createdAt;
  const endValue =
    job.finishedAt ?? (job.status === 'queued' ? job.createdAt : new Date().toISOString());
  const elapsedMs = Math.max(0, Date.parse(endValue) - Date.parse(startValue));
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

function resolveSeverity(job: StratusJobResponse): 'info' | 'success' | 'warning' | 'error' {
  if (job.status === 'failed') {
    return 'error';
  }
  if (job.status === 'succeeded') {
    return 'success';
  }
  return 'info';
}

export interface StratusJobStatusCardProps {
  job: StratusJobResponse;
}

const StratusJobStatusCard: React.FC<StratusJobStatusCardProps> = ({ job }) => {
  const totalPackages = job.progress.totalPackages;
  const processedPackages = job.progress.processedPackages;
  const percent =
    totalPackages > 0
      ? Math.min(100, Math.round((processedPackages / totalPackages) * 100))
      : job.status === 'succeeded'
        ? 100
        : 0;

  return (
    <Alert severity={resolveSeverity(job)}>
      <Stack spacing={1}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip size="small" label={`Status ${job.status}`} />
          <Chip size="small" label={`Phase ${job.progress.phase}`} />
          <Chip size="small" label={`Elapsed ${formatElapsed(job)}`} />
          {job.progress.source && (
            <Chip
              size="small"
              label={
                job.progress.source === 'stratusApi'
                  ? 'Source Stratus API'
                  : 'Source SQL Big Data'
              }
            />
          )}
        </Box>
        <Typography variant="body2">
          {job.progress.message || (job.status === 'succeeded' ? 'Stratus job complete.' : 'Stratus job is running.')}
        </Typography>
        <LinearProgress
          variant={totalPackages > 0 ? 'determinate' : 'indeterminate'}
          value={percent}
        />
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">
            Packages {processedPackages}/{totalPackages || '-'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Assemblies {job.progress.processedAssemblies}/{job.progress.totalAssemblies || '-'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Skipped unchanged {job.progress.skippedUnchangedPackages}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Started {formatDateTime(job.startedAt)}
          </Typography>
        </Box>
        {job.error && (
          <Typography variant="caption" color="error.main">
            {job.error}
          </Typography>
        )}
      </Stack>
    </Alert>
  );
};

export default StratusJobStatusCard;

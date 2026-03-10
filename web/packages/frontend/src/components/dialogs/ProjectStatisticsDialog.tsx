/**
 * ProjectStatisticsDialog — display comprehensive project metrics.
 * Mirrors MS Project's Project > Project Statistics.
 */

import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, Typography, Table, TableBody, TableRow, TableCell, CircularProgress, Divider,
} from '@mui/material';
import { useUIStore, useProjectStore } from '../../stores';
import { advancedApi } from '../../api';

interface ProjectStats {
  taskCount: number;
  completedTasks: number;
  milestoneTasks: number;
  summaryTasks: number;
  criticalTasks: number;
  totalDurationMinutes: number;
  totalWorkMinutes: number;
  percentComplete: number;
  totalCost: number;
  actualCost: number;
  remainingCost: number;
  projectStart: string | null;
  projectFinish: string | null;
  baselineStart: string | null;
  baselineFinish: string | null;
  baselineDurationMinutes: number;
  baselineCost: number;
  durationVariance: number;
  costVariance: number;
}

const StatRow: React.FC<{ label: string; current: string; baseline?: string; variance?: string }> = ({
  label, current, baseline, variance,
}) => (
  <TableRow>
    <TableCell sx={{ fontWeight: 500, fontSize: '0.8rem', py: 0.5 }}>{label}</TableCell>
    <TableCell sx={{ fontSize: '0.8rem', py: 0.5, textAlign: 'right' }}>{current}</TableCell>
    {baseline !== undefined && <TableCell sx={{ fontSize: '0.8rem', py: 0.5, textAlign: 'right', color: 'text.secondary' }}>{baseline}</TableCell>}
    {variance !== undefined && <TableCell sx={{ fontSize: '0.8rem', py: 0.5, textAlign: 'right', color: parseFloat(variance) > 0 ? 'error.main' : 'success.main' }}>{variance}</TableCell>}
  </TableRow>
);

const fmtDays = (minutes: number) => `${Math.round(minutes / 480)}d`;
const fmtCost = (val: number) => `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : 'N/A';
const fmtPct = (val: number) => `${Math.round(val)}%`;

const ProjectStatisticsDialog: React.FC = () => {
  const openDialog = useUIStore((s) => s.openDialog);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const open = openDialog === 'projectStatistics';
  const projectId = useProjectStore((s) => s.activeProjectId);

  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    advancedApi.getStatistics(projectId)
      .then((data: ProjectStats) => setStats(data))
      .catch(() => { /* silently fail, show N/A */ })
      .finally(() => setLoading(false));
  }, [open, projectId]);

  if (!open) return null;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Project Statistics</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : stats ? (
          <Box>
            {/* Dates section */}
            <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>Dates</Typography>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}></TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textAlign: 'right' }}>Current</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textAlign: 'right' }}>Baseline</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textAlign: 'right' }}>Variance</TableCell>
                </TableRow>
                <StatRow label="Start" current={fmtDate(stats.projectStart)} baseline={fmtDate(stats.baselineStart)} variance="—" />
                <StatRow label="Finish" current={fmtDate(stats.projectFinish)} baseline={fmtDate(stats.baselineFinish)} variance="—" />
                <StatRow label="Duration" current={fmtDays(stats.totalDurationMinutes)} baseline={fmtDays(stats.baselineDurationMinutes)} variance={fmtDays(stats.durationVariance)} />
              </TableBody>
            </Table>

            <Divider sx={{ my: 1.5 }} />

            {/* Cost section */}
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Cost</Typography>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}></TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textAlign: 'right' }}>Current</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textAlign: 'right' }}>Baseline</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textAlign: 'right' }}>Variance</TableCell>
                </TableRow>
                <StatRow label="Total Cost" current={fmtCost(stats.totalCost)} baseline={fmtCost(stats.baselineCost)} variance={fmtCost(stats.costVariance)} />
                <StatRow label="Actual Cost" current={fmtCost(stats.actualCost)} />
                <StatRow label="Remaining Cost" current={fmtCost(stats.remainingCost)} />
              </TableBody>
            </Table>

            <Divider sx={{ my: 1.5 }} />

            {/* Task counts */}
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Tasks</Typography>
            <Table size="small">
              <TableBody>
                <StatRow label="Total Tasks" current={String(stats.taskCount)} />
                <StatRow label="Completed" current={String(stats.completedTasks)} />
                <StatRow label="Milestones" current={String(stats.milestoneTasks)} />
                <StatRow label="Summary Tasks" current={String(stats.summaryTasks)} />
                <StatRow label="Critical Tasks" current={String(stats.criticalTasks)} />
                <StatRow label="% Complete" current={fmtPct(stats.percentComplete)} />
              </TableBody>
            </Table>

            {/* Work */}
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Work</Typography>
            <Table size="small">
              <TableBody>
                <StatRow label="Total Work" current={`${Math.round(stats.totalWorkMinutes / 60)}h`} />
              </TableBody>
            </Table>
          </Box>
        ) : (
          <Typography color="text.secondary">No statistics available.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={closeDialog}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectStatisticsDialog;

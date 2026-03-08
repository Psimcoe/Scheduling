/**
 * ReportingView — Project reporting dashboard with overview stats,
 * cost summary, milestone status, and task distribution charts.
 * Uses pure CSS/SVG for visualisations (no external chart library).
 */

import React, { useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Divider,
} from '@mui/material';
import dayjs from 'dayjs';

import { useProjectStore, type TaskRow } from '../../stores';
import { currency, durationDays } from '../../utils/format';
import { BurndownChart, CostOverviewChart, WorkOverviewChart, EVChart } from './charts';

/* ---------- helpers ---------- */

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

function barColor(ratio: number): string {
  if (ratio >= 1) return '#4caf50';
  if (ratio >= 0.5) return '#ff9800';
  return '#f44336';
}

/* ---------- component ---------- */

const ReportingView: React.FC = () => {
  const tasks = useProjectStore((s) => s.tasks);
  const resources = useProjectStore((s) => s.resources);
  const assignments = useProjectStore((s) => s.assignments);
  const activeProject = useProjectStore((s) => s.activeProject);

  const stats = useMemo(() => {
    const nonSummary = tasks.filter((t) => t.type !== 'summary');
    const milestones = tasks.filter((t) => t.type === 'milestone');
    const summaryTasks = tasks.filter((t) => t.type === 'summary');
    const critical = nonSummary.filter((t) => t.isCritical);
    const completed = nonSummary.filter((t) => t.percentComplete >= 100);
    const inProgress = nonSummary.filter((t) => t.percentComplete > 0 && t.percentComplete < 100);
    const notStarted = nonSummary.filter((t) => t.percentComplete === 0);

    const totalCost = nonSummary.reduce((s, t) => s + (t.cost ?? 0), 0);
    const actualCost = nonSummary.reduce((s, t) => s + (t.actualCost ?? 0), 0);
    const remainingCost = nonSummary.reduce((s, t) => s + (t.remainingCost ?? 0), 0);
    const totalWork = nonSummary.reduce((s, t) => s + (t.work ?? 0), 0);
    const actualWork = nonSummary.reduce((s, t) => s + (t.actualWork ?? 0), 0);
    const totalDuration = nonSummary.reduce((s, t) => s + t.durationMinutes, 0);

    const overallPct =
      nonSummary.length === 0
        ? 0
        : Math.round(nonSummary.reduce((s, t) => s + t.percentComplete, 0) / nonSummary.length);

    // Earned value
    const bcws = nonSummary.reduce((s, t) => s + (t.bcws ?? 0), 0);
    const bcwp = nonSummary.reduce((s, t) => s + (t.bcwp ?? 0), 0);
    const acwp = nonSummary.reduce((s, t) => s + (t.acwp ?? 0), 0);
    const spi = bcws === 0 ? 0 : bcwp / bcws;
    const cpi = acwp === 0 ? 0 : bcwp / acwp;

    // Date range
    const starts = nonSummary.filter((t) => t.start).map((t) => dayjs(t.start));
    const finishes = nonSummary.filter((t) => t.finish).map((t) => dayjs(t.finish));
    const projectStart = starts.length > 0 ? starts.reduce((a, b) => (a.isBefore(b) ? a : b)) : null;
    const projectFinish = finishes.length > 0 ? finishes.reduce((a, b) => (a.isAfter(b) ? a : b)) : null;

    return {
      total: tasks.length,
      nonSummary,
      milestones,
      summaryTasks,
      critical,
      completed,
      inProgress,
      notStarted,
      totalCost,
      actualCost,
      remainingCost,
      totalWork,
      actualWork,
      totalDuration,
      overallPct,
      bcws,
      bcwp,
      acwp,
      spi,
      cpi,
      projectStart,
      projectFinish,
    };
  }, [tasks]);

  // Milestones table
  const milestonesInfo = useMemo(
    () =>
      stats.milestones.map((m) => ({
        name: m.name,
        date: m.finish,
        pct: m.percentComplete,
        status: m.percentComplete >= 100 ? 'Complete' : dayjs(m.finish).isBefore(dayjs()) ? 'Late' : 'On Track',
      })),
    [stats.milestones],
  );

  // Resource allocation
  const resourceSummary = useMemo(() => {
    return resources.map((r) => {
      const ras = assignments.filter((a) => a.resourceId === r.id);
      const totalWork = ras.reduce((s, a) => s + a.workMinutes, 0);
      const taskCount = ras.length;
      return { name: r.name, type: r.type, taskCount, totalWork };
    });
  }, [resources, assignments]);

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 2, bgcolor: '#f5f5f5' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {activeProject?.name ?? 'Project'} — Dashboard
      </Typography>

      {/* Row 1: KPI cards */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <KpiCard label="Total Tasks" value={String(stats.total)} />
        <KpiCard label="% Complete" value={`${stats.overallPct}%`} />
        <KpiCard label="Critical Tasks" value={String(stats.critical.length)} color="#f44336" />
        <KpiCard label="On Track" value={String(stats.completed.length + stats.inProgress.length)} color="#4caf50" />
        <KpiCard label="Resources" value={String(resources.length)} />
        <KpiCard label="Total Duration" value={durationDays(stats.totalDuration)} />
      </Box>

      {/* Row 2: Charts */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Card sx={{ flex: '1 1 560px', minWidth: 400 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Burndown Chart</Typography>
            <BurndownChart tasks={tasks} />
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 560px', minWidth: 400 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Earned Value</Typography>
            <EVChart tasks={tasks} />
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Card sx={{ flex: '1 1 560px', minWidth: 400 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Work Overview (Weekly)</Typography>
            <WorkOverviewChart tasks={tasks} />
          </CardContent>
        </Card>
        <Card sx={{ flex: '1 1 400px', minWidth: 340 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Cost Overview</Typography>
            <CostOverviewChart
              budgeted={stats.totalCost}
              actual={stats.actualCost}
              remaining={stats.remainingCost}
              baseline={stats.bcws}
            />
          </CardContent>
        </Card>
      </Box>

      {/* Row 3: Progress + Cost */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        {/* Progress breakdown */}
        <Card sx={{ flex: '1 1 320px', minWidth: 280 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Task Status Breakdown</Typography>
            <StatusBar label="Completed" count={stats.completed.length} total={stats.nonSummary.length} color="#4caf50" />
            <StatusBar label="In Progress" count={stats.inProgress.length} total={stats.nonSummary.length} color="#ff9800" />
            <StatusBar label="Not Started" count={stats.notStarted.length} total={stats.nonSummary.length} color="#e0e0e0" />
            <StatusBar label="Milestones" count={stats.milestones.length} total={stats.total} color="#2196f3" />
            <StatusBar label="Summary" count={stats.summaryTasks.length} total={stats.total} color="#9c27b0" />
          </CardContent>
        </Card>

        {/* Cost summary */}
        <Card sx={{ flex: '1 1 320px', minWidth: 280 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Cost Summary</Typography>
            <MetricRow label="Budgeted Cost" value={currency(stats.totalCost)} />
            <MetricRow label="Actual Cost" value={currency(stats.actualCost)} />
            <MetricRow label="Remaining Cost" value={currency(stats.remainingCost)} />
            <Divider sx={{ my: 1 }} />
            <MetricRow label="BCWS (PV)" value={currency(stats.bcws)} />
            <MetricRow label="BCWP (EV)" value={currency(stats.bcwp)} />
            <MetricRow label="ACWP (AC)" value={currency(stats.acwp)} />
            <Divider sx={{ my: 1 }} />
            <MetricRow label="SPI" value={stats.spi.toFixed(2)} color={barColor(stats.spi)} />
            <MetricRow label="CPI" value={stats.cpi.toFixed(2)} color={barColor(stats.cpi)} />
          </CardContent>
        </Card>

        {/* Work summary */}
        <Card sx={{ flex: '1 1 280px', minWidth: 240 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Work Summary</Typography>
            <MetricRow label="Total Work" value={durationDays(stats.totalWork)} />
            <MetricRow label="Actual Work" value={durationDays(stats.actualWork)} />
            <MetricRow label="Remaining Work" value={durationDays(stats.totalWork - stats.actualWork)} />
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">Work Complete</Typography>
              <LinearProgress
                variant="determinate"
                value={pct(stats.actualWork, stats.totalWork)}
                sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
              />
              <Typography variant="caption">{pct(stats.actualWork, stats.totalWork)}%</Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Row 3: Milestones + Resources */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {/* Milestones table */}
        <Card sx={{ flex: '1 1 400px', minWidth: 340 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Milestone Status</Typography>
            <TableContainer sx={{ maxHeight: 260 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Milestone</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {milestonesInfo.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                        No milestones
                      </TableCell>
                    </TableRow>
                  ) : (
                    milestonesInfo.map((m) => (
                      <TableRow key={m.name}>
                        <TableCell>{m.name}</TableCell>
                        <TableCell>{dayjs(m.date).format('MMM D, YYYY')}</TableCell>
                        <TableCell>
                          <Typography
                            variant="caption"
                            sx={{
                              px: 1,
                              py: 0.25,
                              borderRadius: 1,
                              bgcolor:
                                m.status === 'Complete'
                                  ? '#e8f5e9'
                                  : m.status === 'Late'
                                  ? '#ffebee'
                                  : '#e3f2fd',
                              color:
                                m.status === 'Complete'
                                  ? '#2e7d32'
                                  : m.status === 'Late'
                                  ? '#c62828'
                                  : '#1565c0',
                            }}
                          >
                            {m.status}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        {/* Resource allocation */}
        <Card sx={{ flex: '1 1 400px', minWidth: 340 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Resource Allocation</Typography>
            <TableContainer sx={{ maxHeight: 260 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Resource</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Tasks</TableCell>
                    <TableCell align="right">Work</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {resourceSummary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                        No resources
                      </TableCell>
                    </TableRow>
                  ) : (
                    resourceSummary.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.type}</TableCell>
                        <TableCell align="right">{r.taskCount}</TableCell>
                        <TableCell align="right">{durationDays(r.totalWork)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

/* ---------- sub-components ---------- */

const KpiCard: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <Card sx={{ flex: '1 1 140px', minWidth: 120 }}>
    <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Typography variant="h5" sx={{ fontWeight: 700, color: color ?? 'primary.main' }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </CardContent>
  </Card>
);

const StatusBar: React.FC<{ label: string; count: number; total: number; color: string }> = ({
  label,
  count,
  total,
  color,
}) => {
  const p = pct(count, total);
  return (
    <Box sx={{ mb: 0.75 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="caption">{label}</Typography>
        <Typography variant="caption">
          {count} ({p}%)
        </Typography>
      </Box>
      <Box sx={{ height: 6, bgcolor: '#eee', borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${p}%`, bgcolor: color, borderRadius: 3 }} />
      </Box>
    </Box>
  );
};

const MetricRow: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 600, color }}>
      {value}
    </Typography>
  </Box>
);

export default ReportingView;

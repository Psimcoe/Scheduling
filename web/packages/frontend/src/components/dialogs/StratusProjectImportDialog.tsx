import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  stratusApi,
  type StratusProjectImportApplyResponse,
  type StratusProjectImportPreviewResponse,
  type StratusProjectImportPreviewRow,
} from '../../api/client';
import StratusJobStatusCard from './StratusJobStatusCard';
import { useStratusJob } from '../../hooks/useStratusJob';
import { useProjectStore, useUIStore } from '../../stores';

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : '-';
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function getExcludedProjectIds(
  preview: StratusProjectImportPreviewResponse | null,
): string[] {
  return (
    preview?.rows
      .filter((row) => row.action === 'exclude')
      .map((row) => row.stratusProjectId) ?? []
  );
}

function getActionChipColor(
  row: StratusProjectImportPreviewRow,
): 'default' | 'primary' | 'success' | 'warning' {
  if (row.action === 'create') {
    return 'success';
  }
  if (row.action === 'update') {
    return 'primary';
  }
  if (row.action === 'exclude') {
    return 'warning';
  }
  return 'default';
}

const StratusProjectImportDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'stratusProjectImport');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const openDialogWith = useUIStore((s) => s.openDialogWith);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const { job, startJob, clearJob, isRunning } = useStratusJob();

  const [savingOverrideProjectId, setSavingOverrideProjectId] = useState<string | null>(null);
  const [preview, setPreview] = useState<StratusProjectImportPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handledJobId, setHandledJobId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      return;
    }
    setPreview(null);
    setError(null);
    setHandledJobId(null);
    setSavingOverrideProjectId(null);
    clearJob();
  }, [open, clearJob]);

  useEffect(() => {
    if (!job || job.id === handledJobId) {
      return;
    }

    if (job.status === 'failed') {
      setHandledJobId(job.id);
      setError(job.error || 'Stratus job failed.');
      showSnackbar(job.error || 'Stratus job failed.', 'error');
      return;
    }

    if (job.status !== 'succeeded' || !job.result) {
      return;
    }

    setHandledJobId(job.id);
    if (job.kind === 'projectImportPreview') {
      setPreview(job.result as StratusProjectImportPreviewResponse);
      setError(null);
      return;
    }

    if (job.kind === 'projectImportApply') {
      const result = job.result as StratusProjectImportApplyResponse;
      void useProjectStore.getState().fetchProjects();
      closeDialog();
      showSnackbar(
        `Stratus project import complete. Created ${result.summary.created}, updated ${result.summary.updated}, skipped ${result.summary.skipped}, excluded ${result.summary.excluded}, failed ${result.summary.failed}.`,
        result.summary.failed > 0 ? 'warning' : 'success',
      );
    }
  }, [job, handledJobId, closeDialog, showSnackbar]);

  const runPreview = async () => {
    setError(null);
    await startJob(() => stratusApi.createProjectImportJob('preview'));
  };

  const handleQuickImport = async () => {
    setError(null);
    await startJob(() => stratusApi.createProjectImportJob('apply'));
  };

  const handleOverrideToggle = async (row: StratusProjectImportPreviewRow) => {
    const excludedProjectIds = new Set(getExcludedProjectIds(preview));
    if (row.action === 'exclude') {
      excludedProjectIds.delete(row.stratusProjectId);
    } else {
      excludedProjectIds.add(row.stratusProjectId);
    }

    setSavingOverrideProjectId(row.stratusProjectId);
    try {
      await stratusApi.updateConfig({
        excludedProjectIds: [...excludedProjectIds],
      });
      setPreview(null);
      await runPreview();
      showSnackbar(
        row.action === 'exclude'
          ? 'Project restored for future Stratus imports'
          : 'Project excluded from future Stratus imports',
        'success',
      );
    } catch (requestError: unknown) {
      showSnackbar(
        requestError instanceof Error
          ? requestError.message
          : 'Failed to save Stratus import override',
        'error',
      );
    } finally {
      setSavingOverrideProjectId(null);
    }
  };

  const importableRows =
    preview?.rows.filter((row) => row.action !== 'exclude').length ?? 0;

  return (
    <Dialog open={open} onClose={isRunning ? undefined : closeDialog} maxWidth="lg" fullWidth>
      <DialogTitle>Import Active Stratus Projects</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          <Alert severity="info">
            Quick Import runs immediately in the background using the Stratus API. Preview remains available when you want to review the import set first.
          </Alert>
          <Alert severity="info">
            Use <strong>Exclude</strong> to keep a Stratus project out of this import and future imports. Use <strong>Include</strong> later to restore it.
          </Alert>

          {job && <StratusJobStatusCard job={job} />}

          {preview && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={
                  preview.sourceInfo.source === 'sqlBigData'
                    ? 'Source SQL Big Data'
                    : preview.sourceInfo.fallbackUsed
                      ? 'Source API Fallback'
                      : 'Source Stratus API'
                }
                size="small"
                color={preview.sourceInfo.source === 'sqlBigData' ? 'primary' : 'default'}
              />
              <Chip label={`Projects ${preview.summary.totalProjects}`} size="small" />
              <Chip label={`Create ${preview.summary.createCount}`} size="small" color="success" />
              <Chip label={`Update ${preview.summary.updateCount}`} size="small" color="primary" />
              <Chip label={`Skip ${preview.summary.skipCount}`} size="small" />
              <Chip label={`Excluded ${preview.summary.excludedCount}`} size="small" color="warning" />
              <Chip label={`Runtime ${(preview.meta.durationMs / 1000).toFixed(1)}s`} size="small" />
            </Box>
          )}
          {preview && (
            <Alert severity={preview.sourceInfo.fallbackUsed ? 'warning' : 'info'}>
              {preview.sourceInfo.message || 'Import source ready.'}
              <br />
              Freshness {formatDateTime(preview.sourceInfo.freshness)} | Package report {preview.sourceInfo.packageReportName || '-'} | Assembly report {preview.sourceInfo.assemblyReportName || '-'}
            </Alert>
          )}

          {!job && !preview && !error && (
            <Alert severity="info">
              Choose <strong>Quick Import</strong> to start immediately, or <strong>Preview</strong> to review the active Stratus projects first.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {!isRunning && !error && preview && preview.rows.length === 0 && (
            <Alert severity="info">No active Stratus projects were returned.</Alert>
          )}

          {!isRunning && !error && preview && preview.rows.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Action</TableCell>
                  <TableCell>Stratus Project</TableCell>
                  <TableCell>Local Project</TableCell>
                  <TableCell>Mapped Values</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.rows.map((row) => (
                  <TableRow key={row.stratusProjectId}>
                    <TableCell>
                      <Stack spacing={1} alignItems="flex-start">
                        <Chip size="small" label={row.action} color={getActionChipColor(row)} />
                        <Button
                          size="small"
                          variant={row.action === 'exclude' ? 'contained' : 'outlined'}
                          color={row.action === 'exclude' ? 'warning' : 'inherit'}
                          disabled={isRunning || savingOverrideProjectId !== null}
                          onClick={() => {
                            void handleOverrideToggle(row);
                          }}
                        >
                          {savingOverrideProjectId === row.stratusProjectId
                            ? 'Saving...'
                            : row.action === 'exclude'
                              ? 'Include'
                              : 'Exclude'}
                        </Button>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {row.projectNumber || row.stratusProjectId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {row.projectName || row.stratusProjectId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Stratus Id: {row.stratusProjectId}
                      </Typography>
                      {row.warnings.map((warning) => (
                        <Typography
                          key={warning}
                          variant="caption"
                          color={row.action === 'exclude' ? 'info.main' : 'warning.main'}
                          display="block"
                        >
                          {warning}
                        </Typography>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.localProjectName || 'New local project'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.localProjectId || 'Will be created'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.mappedProject.name}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Start {formatDate(row.mappedProject.startDate)} | Finish {formatDate(row.mappedProject.finishDate)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Type {row.mappedProject.projectType || '-'} | Sector {row.mappedProject.sector || '-'} | Region {row.mappedProject.region || '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Button onClick={() => openDialogWith('stratusSettings')}>Stratus Settings</Button>
        </Box>
        <Button onClick={closeDialog} disabled={isRunning || savingOverrideProjectId !== null}>
          Close
        </Button>
        <Button
          onClick={() => {
            void runPreview();
          }}
          disabled={isRunning || savingOverrideProjectId !== null}
        >
          Preview
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            void handleQuickImport();
          }}
          disabled={isRunning || savingOverrideProjectId !== null || (preview !== null && importableRows === 0)}
        >
          Quick Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StratusProjectImportDialog;

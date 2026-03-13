import React, { useEffect, useState, useTransition } from 'react';
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
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  stratusApi,
  type StratusPullApplyResponse,
  type StratusPullPreviewResponse,
} from '../../api/client';
import { useStratusJob } from '../../hooks/useStratusJob';
import { useProjectStore, useUIStore } from '../../stores';
import StratusJobStatusCard from './StratusJobStatusCard';

interface StratusPullPreviewDialogPayload {
  jobId?: string;
  mode?: 'seedUpgrade';
}

function readDialogPayload(payload: unknown): StratusPullPreviewDialogPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  return {
    jobId: typeof candidate.jobId === 'string' ? candidate.jobId : undefined,
    mode: candidate.mode === 'seedUpgrade' ? 'seedUpgrade' : undefined,
  };
}

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

const StratusPullPreviewDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'stratusPullPreview');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const dialogPayload = useUIStore((s) => s.dialogPayload);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { job, setJob, startJob, clearJob, isRunning } = useStratusJob();
  const [, startTransition] = useTransition();
  const payload = readDialogPayload(dialogPayload);

  const [preview, setPreview] = useState<StratusPullPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handledJobId, setHandledJobId] = useState<string | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      return;
    }
    setPreview(null);
    setError(null);
    setHandledJobId(null);
    setSelectedPackageId(null);
    clearJob();
  }, [open, clearJob]);

  useEffect(() => {
    if (!open || !payload?.jobId) {
      return;
    }

    let cancelled = false;
    setError(null);
    setHandledJobId(null);

    void stratusApi
      .getJob(payload.jobId)
      .then((loadedJob) => {
        if (!cancelled) {
          setJob(loadedJob);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : 'Stratus job status could not be loaded.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, payload?.jobId, setJob]);

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
    if (job.kind === 'pullPreview') {
      const result = job.result as StratusPullPreviewResponse;
      setPreview(result);
      setSelectedPackageId((current) => current ?? result.rows[0]?.packageId ?? null);
      setError(null);
      return;
    }

    if (job.kind === 'pullApply' && activeProjectId) {
      const result = job.result as StratusPullApplyResponse;
      startTransition(() => {
        closeDialog();
      });
      void Promise.all([
        useProjectStore.getState().fetchProjects(),
        useProjectStore.getState().setActiveProject(activeProjectId),
      ]).finally(() => {
        showSnackbar(
          `Stratus pull complete. Packages: created ${result.summary.created}, updated ${result.summary.updated}, skipped ${result.summary.skipped}, failed ${result.summary.failed}. Assemblies: created ${result.summary.createdAssemblies}, updated ${result.summary.updatedAssemblies}, skipped ${result.summary.skippedAssemblies}, failed ${result.summary.failedAssemblies}.`,
          result.summary.failed > 0 || result.summary.failedAssemblies > 0 ? 'warning' : 'success',
        );
      });
    }
  }, [job, handledJobId, activeProjectId, closeDialog, showSnackbar, startTransition]);

  const runPreview = async () => {
    if (!activeProjectId) {
      return;
    }
    setError(null);
    await startJob(() =>
      stratusApi.createPullJob(activeProjectId, {
        mode: 'preview',
        refreshMode: 'incremental',
      }),
    );
  };

  const handleQuickPull = async (refreshMode: 'incremental' | 'full') => {
    if (!activeProjectId) {
      return;
    }
    setError(null);
    await startJob(() =>
      stratusApi.createPullJob(activeProjectId, {
        mode: 'apply',
        refreshMode,
      }),
    );
  };

  const actionableRows =
    preview?.rows.filter((row) => row.action !== 'skip').length ?? 0;
  const selectedRow =
    preview?.rows.find((row) => row.packageId === selectedPackageId) ??
    preview?.rows[0] ??
    null;

  const packageColumns: GridColDef[] = [
    {
      field: 'action',
      headerName: 'Action',
      width: 100,
    },
    {
      field: 'packageNumber',
      headerName: 'Package',
      width: 180,
      valueGetter: (_value, row) => row.packageNumber || row.packageId,
    },
    {
      field: 'packageName',
      headerName: 'Name',
      flex: 1,
      minWidth: 260,
      valueGetter: (_value, row) => row.packageName || row.externalKey || row.packageId,
    },
    {
      field: 'match',
      headerName: 'Match',
      width: 180,
      valueGetter: (_value, row) =>
        row.matchStrategy === 'none' ? 'New task' : `Matched by ${row.matchStrategy}`,
    },
    {
      field: 'mappedName',
      headerName: 'Mapped Task',
      flex: 1,
      minWidth: 220,
      valueGetter: (_value, row) => row.mappedTask.name,
    },
    {
      field: 'assemblies',
      headerName: 'Assemblies',
      width: 180,
      valueGetter: (_value, row) =>
        `${row.assemblyCount} total, ${row.skipAssemblyCount} skipped`,
    },
    {
      field: 'dates',
      headerName: 'Dates',
      width: 220,
      valueGetter: (_value, row) =>
        `Start ${formatDate(row.mappedTask.start)} | Finish ${formatDate(row.mappedTask.finish)}`,
    },
  ];

  const assemblyColumns: GridColDef[] = [
    {
      field: 'action',
      headerName: 'Action',
      width: 100,
    },
    {
      field: 'assemblyName',
      headerName: 'Assembly',
      flex: 1,
      minWidth: 260,
      valueGetter: (_value, row) => row.assemblyName || row.externalKey,
    },
    {
      field: 'taskName',
      headerName: 'Local Task',
      flex: 1,
      minWidth: 240,
      valueGetter: (_value, row) => row.taskName || 'New task',
    },
    {
      field: 'percentComplete',
      headerName: '% Done',
      width: 100,
      valueGetter: (_value, row) => row.mappedTask.percentComplete,
    },
    {
      field: 'externalKey',
      headerName: 'External Key',
      width: 260,
    },
  ];

  return (
    <Dialog open={open} onClose={isRunning ? undefined : closeDialog} maxWidth="xl" fullWidth>
      <DialogTitle>Stratus Pull</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          {payload?.mode === 'seedUpgrade' && (
            <Alert severity="info">
              One-time Stratus data upgrade is running. This full refresh seeds
              assembly status metadata so future status mapping saves can remap
              locally without another API sync.
            </Alert>
          )}

          <Alert severity="info">
            Quick Pull runs immediately in the background using the Stratus API. Preview remains available when you want to review package and assembly changes first. Full Refresh bypasses the incremental skip logic.
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
              <Chip label={`Packages ${preview.summary.totalPackages}`} size="small" />
              <Chip label={`Create ${preview.summary.createCount}`} size="small" color="success" />
              <Chip label={`Update ${preview.summary.updateCount}`} size="small" color="primary" />
              <Chip label={`Skip ${preview.summary.skipCount}`} size="small" />
              <Chip label={`Assemblies ${preview.summary.totalAssemblies}`} size="small" />
              <Chip label={`Unchanged ${preview.meta.skippedUnchangedPackages}`} size="small" />
              <Chip label={`Undefined ${preview.meta.undefinedPackageCount}`} size="small" color="warning" />
              <Chip label={`Orphan Assemblies ${preview.meta.orphanAssemblyCount}`} size="small" color="warning" />
              <Chip label={`Runtime ${(preview.meta.durationMs / 1000).toFixed(1)}s`} size="small" />
            </Box>
          )}
          {preview && (
            <Alert severity={preview.sourceInfo.fallbackUsed ? 'warning' : 'info'}>
              {preview.sourceInfo.message || 'Pull source ready.'}
              <br />
              Freshness {formatDateTime(preview.sourceInfo.freshness)} | Package report {preview.sourceInfo.packageReportName || '-'} | Assembly report {preview.sourceInfo.assemblyReportName || '-'}
            </Alert>
          )}

          {!job && !preview && !error && (
            <Alert severity="info">
              Choose <strong>Quick Pull</strong> for the fastest path, <strong>Full Refresh</strong> to rebuild everything, or <strong>Preview</strong> to inspect the next pull result first.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {!isRunning && !error && preview && preview.rows.length === 0 && (
            <Alert severity="info">No Stratus packages were returned for the current project target.</Alert>
          )}

          {!isRunning && !error && preview && preview.rows.length > 0 && (
            <>
              <Box sx={{ height: 420 }}>
                <DataGrid
                  rows={preview.rows}
                  columns={packageColumns}
                  getRowId={(row) => row.packageId}
                  rowSelectionModel={selectedPackageId ? [selectedPackageId] : []}
                  onRowSelectionModelChange={(selection) => {
                    const nextSelection = selection[0];
                    setSelectedPackageId(typeof nextSelection === 'string' ? nextSelection : null);
                  }}
                  disableRowSelectionOnClick={false}
                  pageSizeOptions={[25, 50, 100]}
                  initialState={{
                    pagination: {
                      paginationModel: {
                        pageSize: 25,
                        page: 0,
                      },
                    },
                  }}
                />
              </Box>

              {selectedRow && (
                <Stack spacing={1}>
                  <Typography variant="subtitle2">
                    {selectedRow.packageNumber || selectedRow.packageId} - {selectedRow.packageName || selectedRow.externalKey || selectedRow.packageId}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedRow.matchStrategy === 'none'
                      ? 'No existing match'
                      : `Matched by ${selectedRow.matchStrategy}`} | Duration {selectedRow.mappedTask.durationMinutes ? `${Math.round(selectedRow.mappedTask.durationMinutes)} min` : '-'} | % Done {selectedRow.mappedTask.percentComplete}
                  </Typography>
                  {selectedRow.warnings.map((warning) => (
                    <Typography key={warning} variant="caption" color="warning.main">
                      {warning}
                    </Typography>
                  ))}
                  <Box sx={{ height: 240 }}>
                    <DataGrid
                      rows={selectedRow.assemblyRows}
                      columns={assemblyColumns}
                      getRowId={(row) => row.externalKey}
                      disableRowSelectionOnClick
                      pageSizeOptions={[10, 25, 50]}
                      initialState={{
                        pagination: {
                          paginationModel: {
                            pageSize: 10,
                            page: 0,
                          },
                        },
                      }}
                    />
                  </Box>
                </Stack>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={closeDialog} disabled={isRunning}>
          Close
        </Button>
        <Button
          onClick={() => {
            void runPreview();
          }}
          disabled={isRunning || !activeProjectId}
        >
          Preview
        </Button>
        <Button
          onClick={() => {
            void handleQuickPull('full');
          }}
          disabled={isRunning || !activeProjectId}
        >
          Full Refresh
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            void handleQuickPull('incremental');
          }}
          disabled={isRunning || !activeProjectId || (preview !== null && actionableRows === 0)}
        >
          Quick Pull
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StratusPullPreviewDialog;

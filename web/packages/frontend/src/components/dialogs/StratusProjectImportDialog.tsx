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
import { stratusApi, type StratusProjectImportPreviewResponse, type StratusProjectImportPreviewRow } from '../../api/client';
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

function getExcludedProjectIds(preview: StratusProjectImportPreviewResponse | null): string[] {
  return preview?.rows
    .filter((row) => row.action === 'exclude')
    .map((row) => row.stratusProjectId) ?? [];
}

function getActionChipColor(row: StratusProjectImportPreviewRow): 'default' | 'primary' | 'success' | 'warning' {
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

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [savingOverrideProjectId, setSavingOverrideProjectId] = useState<string | null>(null);
  const [preview, setPreview] = useState<StratusProjectImportPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError(null);

    stratusApi.previewProjectImport()
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load active Stratus projects');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const result = await stratusApi.applyProjectImport();
      await useProjectStore.getState().fetchProjects();
      closeDialog();
      showSnackbar(
        `Stratus project import complete. Created ${result.summary.created}, updated ${result.summary.updated}, skipped ${result.summary.skipped}, excluded ${result.summary.excluded}, failed ${result.summary.failed}.`,
        result.summary.failed > 0 ? 'warning' : 'success',
      );
    } catch (requestError: unknown) {
      showSnackbar(requestError instanceof Error ? requestError.message : 'Failed to import Stratus projects', 'error');
    } finally {
      setApplying(false);
    }
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
      const refreshedPreview = await stratusApi.previewProjectImport();
      setPreview(refreshedPreview);
      showSnackbar(
        row.action === 'exclude'
          ? 'Project restored for future Stratus imports'
          : 'Project excluded from future Stratus imports',
        'success',
      );
    } catch (requestError: unknown) {
      showSnackbar(
        requestError instanceof Error ? requestError.message : 'Failed to save Stratus import override',
        'error',
      );
    } finally {
      setSavingOverrideProjectId(null);
    }
  };

  const importableRows = preview?.rows.filter((row) => row.action !== 'exclude').length ?? 0;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="lg" fullWidth>
      <DialogTitle>Import Active Stratus Projects</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          <Alert severity="info">
            This imports active Stratus projects by project number and name, refreshes the master <strong>Prefab</strong> project, and updates each imported project with package and assembly reference rows tied to that Prefab data.
          </Alert>
          <Alert severity="info">
            Use <strong>Exclude</strong> to keep a Stratus project out of this import and future imports. Use <strong>Include</strong> later to restore it.
          </Alert>
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
            </Box>
          )}
          {preview && (
            <Alert severity={preview.sourceInfo.fallbackUsed ? 'warning' : 'info'}>
              {preview.sourceInfo.message || 'Import source ready.'}
              <br />
              Freshness {formatDateTime(preview.sourceInfo.freshness)} | Package report {preview.sourceInfo.packageReportName || '-'} | Assembly report {preview.sourceInfo.assemblyReportName || '-'}
            </Alert>
          )}

          {loading && <Alert severity="info">Loading active Stratus projects...</Alert>}
          {!loading && error && <Alert severity="error">{error}</Alert>}
          {!loading && !error && preview && preview.rows.length === 0 && (
            <Alert severity="info">No active Stratus projects were returned.</Alert>
          )}

          {!loading && !error && preview && preview.rows.length > 0 && (
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
                        <Chip
                          size="small"
                          label={row.action}
                          color={getActionChipColor(row)}
                        />
                        <Button
                          size="small"
                          variant={row.action === 'exclude' ? 'contained' : 'outlined'}
                          color={row.action === 'exclude' ? 'warning' : 'inherit'}
                          disabled={loading || applying || savingOverrideProjectId !== null}
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
                      <Typography variant="body2">{row.localProjectName || 'New local project'}</Typography>
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
          <Button onClick={() => openDialogWith('stratusSettings')}>
            Stratus Settings
          </Button>
        </Box>
        <Button onClick={closeDialog}>Close</Button>
        <Button
          variant="contained"
          onClick={handleApply}
          disabled={loading || applying || savingOverrideProjectId !== null || importableRows === 0}
        >
          {applying ? 'Importing...' : 'Import Projects'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StratusProjectImportDialog;

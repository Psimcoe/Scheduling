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
import { stratusApi, type StratusPullPreviewResponse } from '../../api/client';
import { useProjectStore, useUIStore } from '../../stores';

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : '-';
}

const StratusPullPreviewDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'stratusPullPreview');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<StratusPullPreviewResponse | null>(null);

  useEffect(() => {
    if (!open || !activeProjectId) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPreview(null);

    stratusApi.previewPull(activeProjectId)
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          showSnackbar(error instanceof Error ? error.message : 'Failed to preview Stratus pull', 'error');
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
  }, [open, activeProjectId, showSnackbar]);

  const handleApply = async () => {
    if (!activeProjectId) {
      return;
    }

    setApplying(true);
    try {
      const result = await stratusApi.applyPull(activeProjectId);
      await useProjectStore.getState().setActiveProject(activeProjectId);
      closeDialog();
      showSnackbar(
        `Stratus pull complete. Packages: created ${result.summary.created}, updated ${result.summary.updated}, skipped ${result.summary.skipped}, failed ${result.summary.failed}. Assemblies: created ${result.summary.createdAssemblies}, updated ${result.summary.updatedAssemblies}, skipped ${result.summary.skippedAssemblies}, failed ${result.summary.failedAssemblies}.`,
        result.summary.failed > 0 || result.summary.failedAssemblies > 0 ? 'warning' : 'success',
      );
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Failed to apply Stratus pull', 'error');
    } finally {
      setApplying(false);
    }
  };

  const actionableRows = preview?.rows.filter((row) => row.action !== 'skip').length ?? 0;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="lg" fullWidth>
      <DialogTitle>Stratus Pull Preview</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          <Alert severity="info">
            Project-specific pulls refresh that project’s reference rows and also backfill any newly discovered Stratus package and assembly ids into the master <strong>Prefab</strong> project.
          </Alert>
          {preview && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={`Packages ${preview.summary.totalPackages}`} size="small" />
              <Chip label={`Create ${preview.summary.createCount}`} size="small" color="success" />
              <Chip label={`Update ${preview.summary.updateCount}`} size="small" color="primary" />
              <Chip label={`Skip ${preview.summary.skipCount}`} size="small" />
              <Chip label={`Assemblies ${preview.summary.totalAssemblies}`} size="small" />
              <Chip label={`Assembly Create ${preview.summary.createAssemblyCount}`} size="small" color="success" />
              <Chip label={`Assembly Update ${preview.summary.updateAssemblyCount}`} size="small" color="primary" />
              <Chip label={`Assembly Skip ${preview.summary.skipAssemblyCount}`} size="small" />
            </Box>
          )}

          {loading && <Alert severity="info">Loading Stratus package preview...</Alert>}
          {!loading && preview && preview.rows.length === 0 && (
            <Alert severity="info">No Stratus packages were returned for the current project target.</Alert>
          )}

          {!loading && preview && preview.rows.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Action</TableCell>
                  <TableCell>Package</TableCell>
                  <TableCell>Match</TableCell>
                  <TableCell>Mapped Task</TableCell>
                  <TableCell>Assemblies</TableCell>
                  <TableCell>Dates</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.rows.map((row) => (
                  <TableRow key={row.packageId}>
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.action}
                        color={row.action === 'create' ? 'success' : row.action === 'update' ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {row.packageNumber || row.packageId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {row.packageName || row.externalKey || row.packageId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Package Id: {row.packageId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Key: {row.externalKey || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.taskName || 'New task'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.matchStrategy === 'none' ? 'No existing match' : `Matched by ${row.matchStrategy}`}
                      </Typography>
                      {row.warnings.map((warning) => (
                        <Typography key={warning} variant="caption" color="warning.main" display="block">
                          {warning}
                        </Typography>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.mappedTask.name}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        % Complete {row.mappedTask.percentComplete}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Duration {row.mappedTask.durationMinutes ? `${Math.round(row.mappedTask.durationMinutes)} min` : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.assemblyCount} assemblies
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Create {row.createAssemblyCount} | Update {row.updateAssemblyCount} | Skip {row.skipAssemblyCount}
                      </Typography>
                      {row.assemblyRows.slice(0, 3).map((assembly) => (
                        <Typography key={assembly.assemblyId} variant="caption" color="text.secondary" display="block">
                          {assembly.action}: {assembly.assemblyName || assembly.externalKey} ({assembly.assemblyId})
                        </Typography>
                      ))}
                      {row.assemblyCount > 3 && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          +{row.assemblyCount - 3} more
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" display="block">
                        Start {formatDate(row.mappedTask.start)}
                      </Typography>
                      <Typography variant="caption" display="block">
                        Finish {formatDate(row.mappedTask.finish)}
                      </Typography>
                      <Typography variant="caption" display="block">
                        Deadline {formatDate(row.mappedTask.deadline)}
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
        <Button onClick={closeDialog}>Close</Button>
        <Button
          variant="contained"
          onClick={handleApply}
          disabled={loading || applying || actionableRows === 0}
        >
          {applying ? 'Applying...' : 'Apply Pull'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StratusPullPreviewDialog;

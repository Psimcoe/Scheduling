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
import { stratusApi, type StratusSyncToPrefabPreviewResponse } from '../../api/client';
import { useProjectStore, useUIStore } from '../../stores';

const StratusSyncToPrefabPreviewDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'stratusSyncToPrefabPreview');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<StratusSyncToPrefabPreviewResponse | null>(null);

  useEffect(() => {
    if (!open || !activeProjectId) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPreview(null);

    stratusApi.previewSyncToPrefab(activeProjectId)
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          showSnackbar(error instanceof Error ? error.message : 'Failed to preview Prefab sync', 'error');
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
      const result = await stratusApi.applySyncToPrefab(activeProjectId);
      await useProjectStore.getState().setActiveProject(activeProjectId);
      closeDialog();
      showSnackbar(
        `Synced ${result.summary.synced} package date change(s) to ${result.prefabProjectName}. Push from Prefab if you want to update Stratus.`,
        result.summary.failed > 0 ? 'warning' : 'success',
      );
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Failed to sync changes to Prefab', 'error');
    } finally {
      setApplying(false);
    }
  };

  const syncableRows = preview?.rows.filter((row) => row.action === 'sync').length ?? 0;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="lg" fullWidth>
      <DialogTitle>Sync Project Dates To Prefab</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          <Alert severity="info">
            This updates the matching package dates in <strong>Prefab</strong> only. It does not push anything to Stratus automatically.
          </Alert>

          {preview && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={`Candidates ${preview.summary.candidateTaskCount}`} size="small" />
              <Chip label={`Sync ${preview.summary.syncCount}`} size="small" color="primary" />
              <Chip label={`Skip ${preview.summary.skipCount}`} size="small" />
              <Chip label={`Target ${preview.prefabProjectName}`} size="small" variant="outlined" />
            </Box>
          )}

          {loading && <Alert severity="info">Loading Prefab sync preview...</Alert>}
          {!loading && preview && preview.rows.length === 0 && (
            <Alert severity="info">No package reference tasks are available to sync back to Prefab.</Alert>
          )}

          {!loading && preview && preview.rows.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Action</TableCell>
                  <TableCell>Project Task</TableCell>
                  <TableCell>Prefab Task</TableCell>
                  <TableCell>Changes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.rows.map((row) => (
                  <TableRow key={row.sourceTaskId}>
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.action}
                        color={row.action === 'sync' ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.sourceTaskName}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {row.externalKey}
                      </Typography>
                      {row.warnings.map((warning) => (
                        <Typography key={warning} variant="caption" color="warning.main" display="block">
                          {warning}
                        </Typography>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.prefabTaskName || '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      {row.changes.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          No changes
                        </Typography>
                      ) : (
                        row.changes.map((change) => (
                          <Typography key={`${row.sourceTaskId}-${change.field}`} variant="caption" display="block">
                            {change.field}: {change.from || '-'} to {change.to || '-'}
                          </Typography>
                        ))
                      )}
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
          disabled={loading || applying || syncableRows === 0}
        >
          {applying ? 'Applying...' : 'Sync To Prefab'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StratusSyncToPrefabPreviewDialog;

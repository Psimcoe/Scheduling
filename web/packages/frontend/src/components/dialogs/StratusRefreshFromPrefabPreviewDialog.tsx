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
  type StratusRefreshFromPrefabPreviewResponse,
} from '../../api/client';
import { useProjectStore, useUIStore } from '../../stores';

const StratusRefreshFromPrefabPreviewDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'stratusRefreshFromPrefabPreview');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] =
    useState<StratusRefreshFromPrefabPreviewResponse | null>(null);

  useEffect(() => {
    if (!open || !activeProjectId) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPreview(null);

    stratusApi
      .previewRefreshFromPrefab(activeProjectId)
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          showSnackbar(
            error instanceof Error
              ? error.message
              : 'Failed to preview Prefab refresh',
            'error',
          );
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
      const result = await stratusApi.applyRefreshFromPrefab(activeProjectId);
      await useProjectStore.getState().setActiveProject(activeProjectId);
      closeDialog();
      showSnackbar(
        `Refreshed ${result.summary.refreshed} reference date change(s) from ${result.prefabProjectName}.`,
        result.summary.failed > 0 ? 'warning' : 'success',
      );
    } catch (error: unknown) {
      showSnackbar(
        error instanceof Error
          ? error.message
          : 'Failed to refresh references from Prefab',
        'error',
      );
    } finally {
      setApplying(false);
    }
  };

  const refreshableRows =
    preview?.rows.filter((row) => row.action === 'refresh').length ?? 0;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="lg" fullWidth>
      <DialogTitle>Refresh Project Dates From Prefab</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          <Alert severity="info">
            This updates the current project's reference tasks from{' '}
            <strong>Prefab</strong> only. It does not call Stratus.
          </Alert>

          {preview && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`Candidates ${preview.summary.candidateTaskCount}`}
                size="small"
              />
              <Chip
                label={`Refresh ${preview.summary.refreshCount}`}
                size="small"
                color="primary"
              />
              <Chip label={`Skip ${preview.summary.skipCount}`} size="small" />
              <Chip
                label={`Source ${preview.prefabProjectName}`}
                size="small"
                variant="outlined"
              />
            </Box>
          )}

          {loading && (
            <Alert severity="info">Loading Prefab refresh preview...</Alert>
          )}
          {!loading && preview && preview.rows.length === 0 && (
            <Alert severity="info">
              No reference tasks are available to refresh from Prefab.
            </Alert>
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
                        color={row.action === 'refresh' ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.sourceTaskName}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {row.externalKey}
                      </Typography>
                      {row.warnings.map((warning) => (
                        <Typography
                          key={warning}
                          variant="caption"
                          color="warning.main"
                          display="block"
                        >
                          {warning}
                        </Typography>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.prefabTaskName || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {row.changes.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          No changes
                        </Typography>
                      ) : (
                        row.changes.map((change) => (
                          <Typography
                            key={`${row.sourceTaskId}-${change.field}`}
                            variant="caption"
                            display="block"
                          >
                            {change.field}: {change.from || '-'} to{' '}
                            {change.to || '-'}
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
          disabled={loading || applying || refreshableRows === 0}
        >
          {applying ? 'Applying...' : 'Refresh From Prefab'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StratusRefreshFromPrefabPreviewDialog;

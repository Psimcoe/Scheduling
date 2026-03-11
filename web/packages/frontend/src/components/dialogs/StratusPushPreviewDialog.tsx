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
import { stratusApi, type StratusPushPreviewResponse } from '../../api/client';
import { useProjectStore, useUIStore } from '../../stores';

const StratusPushPreviewDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'stratusPushPreview');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<StratusPushPreviewResponse | null>(null);

  useEffect(() => {
    if (!open || !activeProjectId) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPreview(null);

    stratusApi.previewPush(activeProjectId)
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          showSnackbar(error instanceof Error ? error.message : 'Failed to preview Stratus push', 'error');
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
      const result = await stratusApi.applyPush(activeProjectId);
      await useProjectStore.getState().setActiveProject(activeProjectId);
      closeDialog();
      showSnackbar(
        `Stratus push complete. Pushed ${result.summary.pushed}, skipped ${result.summary.skipped}, failed ${result.summary.failed}.`,
        result.summary.failed > 0 ? 'warning' : 'success',
      );
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : 'Failed to apply Stratus push', 'error');
    } finally {
      setApplying(false);
    }
  };

  const pushableRows = preview?.rows.filter((row) => row.action === 'push').length ?? 0;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="lg" fullWidth>
      <DialogTitle>Stratus Push Preview</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          {preview && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={`Linked ${preview.summary.linkedTaskCount}`} size="small" />
              <Chip label={`Push ${preview.summary.pushCount}`} size="small" color="primary" />
              <Chip label={`Skip ${preview.summary.skipCount}`} size="small" />
            </Box>
          )}

          {loading && <Alert severity="info">Loading Stratus push preview...</Alert>}
          {!loading && preview && !preview.fieldResolution.canPush && (
            <Alert severity="error">{preview.fieldResolution.message || 'Push is blocked until the Stratus field ids are resolved.'}</Alert>
          )}
          {!loading && preview && preview.rows.length === 0 && (
            <Alert severity="info">No linked Stratus tasks are available for push.</Alert>
          )}

          {!loading && preview && preview.rows.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Action</TableCell>
                  <TableCell>Task</TableCell>
                  <TableCell>Package</TableCell>
                  <TableCell>Changes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.rows.map((row) => (
                  <TableRow key={row.taskId}>
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.action}
                        color={row.action === 'push' ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.taskName}</Typography>
                      {row.warnings.map((warning) => (
                        <Typography key={warning} variant="caption" color="warning.main" display="block">
                          {warning}
                        </Typography>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {row.packageNumber || row.packageId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.packageName || row.packageId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {row.changes.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          No changes
                        </Typography>
                      ) : (
                        row.changes.map((change) => (
                          <Typography key={`${row.taskId}-${change.field}`} variant="caption" display="block">
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
          disabled={loading || applying || pushableRows === 0 || !preview?.fieldResolution.canPush}
        >
          {applying ? 'Applying...' : 'Apply Push'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StratusPushPreviewDialog;

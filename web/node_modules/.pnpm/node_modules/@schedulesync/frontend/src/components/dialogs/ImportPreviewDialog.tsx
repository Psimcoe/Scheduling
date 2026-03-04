/**
 * ImportPreviewDialog — shows the diff preview before applying CSV/JSON updates.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Chip,
  Typography,
  CircularProgress,
  Box,
} from '@mui/material';

import { useProjectStore, useUIStore } from '../../stores';
import { importExportApi } from '../../api';
import { shortDate, durationDays } from '../../utils/format';

const ImportPreviewDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'importPreview');
  const file = useUIStore((s) => s.dialogPayload) as File | null;
  const closeDialog = useUIStore((s) => s.closeDialog);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  useEffect(() => {
    if (open && file && activeProjectId) {
      setLoading(true);
      importExportApi
        .previewUpdates(activeProjectId, file)
        .then(setPreview)
        .catch((e) => showSnackbar(e.message, 'error'))
        .finally(() => setLoading(false));
    }
    return () => setPreview(null);
  }, [open, file, activeProjectId, showSnackbar]);

  const handleApply = async () => {
    if (!file || !activeProjectId) return;
    try {
      setLoading(true);
      const result = await importExportApi.applyUpdates(activeProjectId, file);
      showSnackbar(
        `Applied: ${result.updated} updated, ${result.created} created, ${result.skipped} skipped`,
        'success',
      );
      await useProjectStore.getState().fetchTasks();
      await useProjectStore.getState().fetchDependencies();
      closeDialog();
    } catch (e: any) {
      showSnackbar(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="lg" fullWidth>
      <DialogTitle>Import Preview — {file?.name}</DialogTitle>
      <DialogContent>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {!loading && preview && (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {preview.totalUpdates} updates parsed — {preview.diffs.length} diffs
              generated
            </Typography>
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Task</TableCell>
                    <TableCell>Field</TableCell>
                    <TableCell>Before</TableCell>
                    <TableCell>After</TableCell>
                    <TableCell>Warnings</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.diffs.map((diff: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{diff.uniqueId}</TableCell>
                      <TableCell>{diff.taskName}</TableCell>
                      <TableCell>
                        {diff.changedFieldNames?.join(', ') ?? '-'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>
                        {diff.oldStart ? shortDate(diff.oldStart) : ''}
                        {diff.oldDurationMinutes !== undefined
                          ? ` | ${durationDays(diff.oldDurationMinutes)}`
                          : ''}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>
                        {diff.newStart ? shortDate(diff.newStart) : ''}
                        {diff.newDurationMinutes !== undefined
                          ? ` | ${durationDays(diff.newDurationMinutes)}`
                          : ''}
                      </TableCell>
                      <TableCell>
                        {diff.warnings?.map((w: any, j: number) => (
                          <Chip
                            key={j}
                            label={w.message}
                            size="small"
                            color={
                              w.severity === 2
                                ? 'error'
                                : w.severity === 1
                                  ? 'warning'
                                  : 'default'
                            }
                            sx={{ mr: 0.5, mb: 0.5, fontSize: '0.7rem' }}
                          />
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleApply}
          disabled={loading || !preview || preview.diffs.length === 0}
        >
          Apply Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportPreviewDialog;

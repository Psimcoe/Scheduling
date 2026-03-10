/**
 * BulkImportDialog — upload a CSV to bulk-create or update tasks.
 *
 * Rows whose ID column matches an existing task are updated;
 * rows without a matching ID are created as new tasks.
 */

import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';

import { useProjectStore, useUIStore } from '../../stores';
import { importExportApi } from '../../api';

const BulkImportDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'bulkImport');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setFile(null);
    setResult(null);
    closeDialog();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
  };

  const handleImport = async () => {
    if (!file || !activeProjectId) return;
    try {
      setLoading(true);
      const res = await importExportApi.bulkCsvImport(activeProjectId, file);
      setResult(res);
      showSnackbar(
        `Bulk import: ${res.created} created, ${res.updated} updated` +
          (res.errors.length > 0 ? `, ${res.errors.length} errors` : ''),
        res.errors.length > 0 ? 'warning' : 'success',
      );
      // Refresh task list
      await useProjectStore.getState().fetchTasks();
      await useProjectStore.getState().fetchDependencies();
    } catch (err: unknown) {
      showSnackbar(err instanceof Error ? err.message : 'Bulk import failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Bulk CSV Import</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Upload a CSV file to create or update tasks. Rows with an <b>ID</b> that
          matches an existing task will be updated; all other rows will create new
          tasks.
        </Typography>

        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Supported columns: ID, Name, Type, Duration (days), Start, Finish,
          % Complete, Cost, Actual Cost, Work (hours), Actual Work (hours),
          Constraint, Notes
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Button variant="outlined" size="small" onClick={() => inputRef.current?.click()}>
            Choose CSV File
          </Button>
          <Typography variant="body2" color="text.secondary">
            {file ? file.name : 'No file selected'}
          </Typography>
          <input
            type="file"
            accept=".csv"
            hidden
            ref={inputRef}
            onChange={handleFileChange}
          />
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {result && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">
              <b>{result.created}</b> tasks created, <b>{result.updated}</b> tasks
              updated
            </Typography>
            {result.errors.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1, maxHeight: 200, overflow: 'auto' }}>
                {result.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={!file || loading || !activeProjectId}
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkImportDialog;

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
import { stratusApi, type StratusProjectImportPreviewResponse } from '../../api/client';
import { useProjectStore, useUIStore } from '../../stores';

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : '-';
}

const StratusProjectImportDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'stratusProjectImport');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const openDialogWith = useUIStore((s) => s.openDialogWith);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
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
        `Stratus project import complete. Created ${result.summary.created}, updated ${result.summary.updated}, skipped ${result.summary.skipped}, failed ${result.summary.failed}.`,
        result.summary.failed > 0 ? 'warning' : 'success',
      );
    } catch (requestError: unknown) {
      showSnackbar(requestError instanceof Error ? requestError.message : 'Failed to import Stratus projects', 'error');
    } finally {
      setApplying(false);
    }
  };

  const actionableRows = preview?.rows.filter((row) => row.action !== 'skip').length ?? 0;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="lg" fullWidth>
      <DialogTitle>Import Active Stratus Projects</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2}>
          <Alert severity="info">
            This imports active Stratus projects by project number and name, refreshes the master <strong>Prefab</strong> project, and updates each imported project with package and assembly reference rows tied to that Prefab data.
          </Alert>
          {preview && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={`Projects ${preview.summary.totalProjects}`} size="small" />
              <Chip label={`Create ${preview.summary.createCount}`} size="small" color="success" />
              <Chip label={`Update ${preview.summary.updateCount}`} size="small" color="primary" />
              <Chip label={`Skip ${preview.summary.skipCount}`} size="small" />
            </Box>
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
                      <Chip
                        size="small"
                        label={row.action}
                        color={row.action === 'create' ? 'success' : row.action === 'update' ? 'primary' : 'default'}
                      />
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
                        <Typography key={warning} variant="caption" color="warning.main" display="block">
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
          disabled={loading || applying || actionableRows === 0}
        >
          {applying ? 'Importing...' : 'Import Projects'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StratusProjectImportDialog;

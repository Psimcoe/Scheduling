/**
 * BaselineCaptureDialog — select a baseline index to capture.
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';

import { useProjectStore, useUIStore } from '../../stores';
import { baselinesApi } from '../../api';

const BaselineCaptureDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'baselineCapture');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const [index, setIndex] = useState(0);

  const handleCapture = async () => {
    if (!activeProjectId) return;
    try {
      const result = await baselinesApi.capture(activeProjectId, index);
      showSnackbar(
        `Baseline ${index} captured for ${result.taskCount} tasks`,
        'success',
      );
      closeDialog();
    } catch (e: any) {
      showSnackbar(e.message, 'error');
    }
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="xs" fullWidth>
      <DialogTitle>Capture Baseline</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <FormControl size="small" fullWidth>
          <InputLabel>Baseline</InputLabel>
          <Select
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            label="Baseline"
          >
            {Array.from({ length: 11 }, (_, i) => (
              <MenuItem key={i} value={i}>
                Baseline {i === 0 ? '' : i}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="contained" onClick={handleCapture}>
          Capture
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BaselineCaptureDialog;

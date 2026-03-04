/**
 * NewProjectDialog — create a new project with name + start date.
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material';
import dayjs from 'dayjs';

import { useProjectStore, useUIStore } from '../../stores';

const NewProjectDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'newProject');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const createProject = useProjectStore((s) => s.createProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(dayjs().format('YYYY-MM-DD'));

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const id = await createProject(
        name.trim(),
        new Date(startDate).toISOString(),
      );
      await setActiveProject(id);
      closeDialog();
      setName('');
      showSnackbar(`Project "${name.trim()}" created`, 'success');
    } catch (e: any) {
      showSnackbar(e.message, 'error');
    }
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="xs" fullWidth>
      <DialogTitle>New Project</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField
          label="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          fullWidth
          size="small"
        />
        <TextField
          label="Start Date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          fullWidth
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!name.trim()}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewProjectDialog;

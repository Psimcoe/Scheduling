/**
 * ProjectInfoDialog — view/edit project settings.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';

import { useProjectStore, useUIStore } from '../../stores';
import { projectsApi } from '../../api';

const ProjectInfoDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'projectInfo');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const activeProject = useProjectStore((s) => s.activeProject);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [scheduleFrom, setScheduleFrom] = useState('start');
  const [statusDate, setStatusDate] = useState('');
  const [projectType, setProjectType] = useState('');
  const [sector, setSector] = useState('');
  const [region, setRegion] = useState('');

  useEffect(() => {
    if (activeProject) {
      setName(activeProject.name);
      setStartDate(
        new Date(activeProject.startDate).toISOString().slice(0, 10),
      );
      setScheduleFrom(activeProject.scheduleFrom);
      setProjectType(activeProject.projectType ?? '');
      setSector(activeProject.sector ?? '');
      setRegion(activeProject.region ?? '');
      setStatusDate(
        activeProject.statusDate
          ? new Date(activeProject.statusDate).toISOString().slice(0, 10)
          : '',
      );
    }
  }, [activeProject]);

  const handleSave = async () => {
    if (!activeProjectId) return;
    try {
      await projectsApi.update(activeProjectId, {
        name,
        startDate: new Date(startDate).toISOString(),
        scheduleFrom,
        statusDate: statusDate ? new Date(statusDate).toISOString() : null,
        projectType: projectType || null,
        sector: sector || null,
        region: region || null,
      });
      await useProjectStore.getState().setActiveProject(activeProjectId);
      closeDialog();
      showSnackbar('Project updated', 'success');
    } catch (e: any) {
      showSnackbar(e.message, 'error');
    }
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Project Information</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField
          label="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <FormControl size="small" fullWidth>
          <InputLabel>Schedule From</InputLabel>
          <Select
            value={scheduleFrom}
            onChange={(e) => setScheduleFrom(String(e.target.value))}
            label="Schedule From"
          >
            <MenuItem value="start">Project Start Date</MenuItem>
            <MenuItem value="finish">Project Finish Date</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label="Project Type"
          value={projectType}
          onChange={(e) => setProjectType(e.target.value)}
          fullWidth
          size="small"
          placeholder="e.g. Healthcare, Commercial, Industrial"
        />
        <TextField
          label="Sector"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          fullWidth
          size="small"
          placeholder="e.g. New build, Tenant improvement"
        />
        <TextField
          label="Region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          fullWidth
          size="small"
          placeholder="e.g. Northeast, Texas, Pacific Northwest"
        />
        <TextField
          label="Status Date"
          type="date"
          value={statusDate}
          onChange={(e) => setStatusDate(e.target.value)}
          fullWidth
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectInfoDialog;

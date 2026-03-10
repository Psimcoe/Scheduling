/**
 * ResourceInfoDialog — detailed resource editing.
 * Mirrors MS Project's Resource > Resource Information dialog.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Box, FormControl, InputLabel, Select, MenuItem,
  Tabs, Tab, Typography, Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import { useUIStore, useProjectStore } from '../../stores';
import { resourcesApi } from '../../api';

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div hidden={value !== index} style={{ padding: '16px 0' }}>{value === index && children}</div>
);

const ResourceInfoDialog: React.FC = () => {
  const openDialog = useUIStore((s) => s.openDialog);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const dialogPayload = useUIStore((s) => s.dialogPayload) as any;
  const open = openDialog === 'resourceInfo';

  const resources = useProjectStore((s) => s.resources);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const fetchResources = useProjectStore((s) => s.fetchResources);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const [tab, setTab] = useState(0);
  const [name, setName] = useState('');
  const [type, setType] = useState('work');
  const [maxUnits, setMaxUnits] = useState(100);
  const [standardRate, setStandardRate] = useState(0);
  const [overtimeRate, setOvertimeRate] = useState(0);
  const [costPerUse, setCostPerUse] = useState(0);
  const [email, setEmail] = useState('');
  const [group, setGroup] = useState('');
  const [initials, setInitials] = useState('');
  const [calendarName, setCalendarName] = useState('Standard');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open || !dialogPayload?.id) return;
    const res = resources.find((r) => r.id === dialogPayload.id);
    if (!res) {
      closeDialog();
      return;
    }
    setName(res.name);
    setType(res.type ?? 'work');
    setMaxUnits(res.maxUnits ?? 100);
    setStandardRate((res as any).standardRate ?? 0);
    setOvertimeRate((res as any).overtimeRate ?? 0);
    setCostPerUse((res as any).costPerUse ?? 0);
    setEmail((res as any).email ?? '');
    setGroup((res as any).group ?? '');
    setInitials((res as any).initials ?? '');
    setCalendarName((res as any).calendarName ?? 'Standard');
    setNotes((res as any).notes ?? '');
  }, [open, dialogPayload, resources]);

  const handleSave = useCallback(async () => {
    if (!dialogPayload?.id || !activeProjectId) return;
    try {
      await resourcesApi.update(activeProjectId, dialogPayload.id, {
        name, type, maxUnits,
        standardRate, overtimeRate, costPerUse,
        email, group, initials, calendarName, notes,
      });
      await fetchResources();
      showSnackbar('Resource updated', 'success');
      closeDialog();
    } catch (e: unknown) {
      showSnackbar(e instanceof Error ? e.message : 'Update failed', 'error');
    }
  }, [dialogPayload, activeProjectId, name, type, maxUnits, standardRate, overtimeRate, costPerUse, email, group, initials, calendarName, notes, fetchResources, showSnackbar, closeDialog]);

  if (!open) return null;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Resource Information</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="General" sx={{ fontSize: '0.75rem', textTransform: 'none' }} />
          <Tab label="Costs" sx={{ fontSize: '0.75rem', textTransform: 'none' }} />
          <Tab label="Notes" sx={{ fontSize: '0.75rem', textTransform: 'none' }} />
        </Tabs>

        <TabPanel value={tab} index={0}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField size="small" label="Resource Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
            <TextField size="small" label="Initials" value={initials} onChange={(e) => setInitials(e.target.value)} fullWidth />
            <TextField size="small" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
            <TextField size="small" label="Group" value={group} onChange={(e) => setGroup(e.target.value)} fullWidth />
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={type} label="Type" onChange={(e) => setType(e.target.value)}>
                <MenuItem value="work">Work</MenuItem>
                <MenuItem value="material">Material</MenuItem>
                <MenuItem value="cost">Cost</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" label="Max Units (%)" type="number" value={maxUnits} onChange={(e) => setMaxUnits(Number(e.target.value))} fullWidth />
            <FormControl size="small" fullWidth>
              <InputLabel>Calendar</InputLabel>
              <Select value={calendarName} label="Calendar" onChange={(e) => setCalendarName(e.target.value)}>
                <MenuItem value="Standard">Standard</MenuItem>
                <MenuItem value="24 Hours">24 Hours</MenuItem>
                <MenuItem value="Night Shift">Night Shift</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2">Cost Rate Table A</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Rate Type</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', textAlign: 'right' }}>Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ fontSize: '0.8rem' }}>Standard Rate</TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <TextField size="small" type="number" value={standardRate}
                      onChange={(e) => setStandardRate(Number(e.target.value))}
                      InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>$</Typography> }}
                      sx={{ width: 120 }}
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontSize: '0.8rem' }}>Overtime Rate</TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <TextField size="small" type="number" value={overtimeRate}
                      onChange={(e) => setOvertimeRate(Number(e.target.value))}
                      InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>$</Typography> }}
                      sx={{ width: 120 }}
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontSize: '0.8rem' }}>Cost Per Use</TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <TextField size="small" type="number" value={costPerUse}
                      onChange={(e) => setCostPerUse(Number(e.target.value))}
                      InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>$</Typography> }}
                      sx={{ width: 120 }}
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        </TabPanel>

        <TabPanel value={tab} index={2}>
          <TextField
            multiline
            minRows={6}
            fullWidth
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>OK</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ResourceInfoDialog;

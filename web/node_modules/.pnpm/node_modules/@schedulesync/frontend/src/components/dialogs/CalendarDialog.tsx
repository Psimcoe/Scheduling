/**
 * CalendarDialog — "Change Working Time" dialog.
 *
 * Allows managing project calendars: working days, working hours,
 * and calendar exceptions (holidays, special days).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Checkbox,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

import { useProjectStore, useUIStore } from '../../stores';
import { calendarsApi } from '../../api';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarData {
  id: string;
  name: string;
  workingDaysOfWeek: boolean[];
  defaultWorkingHours: { startHour: number; startMinute: number; endHour: number; endMinute: number }[];
  exceptions: { id: string; startDate: string; endDate: string; isWorking: boolean }[];
}

const CalendarDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === ('calendar' as any));
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [calendars, setCalendars] = useState<CalendarData[]>([]);
  const [selectedCalId, setSelectedCalId] = useState<string>('');
  const [workingDays, setWorkingDays] = useState<boolean[]>([false, true, true, true, true, true, false]);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [newExcDate, setNewExcDate] = useState('');
  const [newExcEnd, setNewExcEnd] = useState('');

  const loadCalendars = useCallback(async () => {
    if (!activeProjectId) return;
    const cals = await calendarsApi.list(activeProjectId);
    const parsed: CalendarData[] = cals.map((c: any) => ({
      id: c.id,
      name: c.name,
      workingDaysOfWeek: typeof c.workingDaysOfWeek === 'string'
        ? JSON.parse(c.workingDaysOfWeek)
        : c.workingDaysOfWeek,
      defaultWorkingHours: typeof c.defaultWorkingHours === 'string'
        ? JSON.parse(c.defaultWorkingHours)
        : c.defaultWorkingHours,
      exceptions: (c.exceptions ?? []).map((e: any) => ({
        id: e.id,
        startDate: e.startDate,
        endDate: e.endDate,
        isWorking: e.isWorking,
      })),
    }));
    setCalendars(parsed);
    if (parsed.length > 0 && !selectedCalId) {
      setSelectedCalId(parsed[0].id);
      applyCalToForm(parsed[0]);
    }
  }, [activeProjectId, selectedCalId]);

  const applyCalToForm = (cal: CalendarData) => {
    setWorkingDays([...cal.workingDaysOfWeek]);
    if (cal.defaultWorkingHours.length > 0) {
      const first = cal.defaultWorkingHours[0];
      const last = cal.defaultWorkingHours[cal.defaultWorkingHours.length - 1];
      setStartTime(`${String(first.startHour).padStart(2, '0')}:${String(first.startMinute).padStart(2, '0')}`);
      setEndTime(`${String(last.endHour).padStart(2, '0')}:${String(last.endMinute).padStart(2, '0')}`);
    }
  };

  useEffect(() => {
    if (open) loadCalendars();
  }, [open, loadCalendars]);

  const selectedCal = calendars.find((c) => c.id === selectedCalId);

  const handleSelectCalendar = (id: string) => {
    setSelectedCalId(id);
    const cal = calendars.find((c) => c.id === id);
    if (cal) applyCalToForm(cal);
  };

  const handleSave = async () => {
    if (!activeProjectId || !selectedCalId) return;
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    await calendarsApi.update(activeProjectId, selectedCalId, {
      workingDaysOfWeek: workingDays,
      defaultWorkingHours: [
        { startHour: sH, startMinute: sM, endHour: eH, endMinute: eM },
      ],
    });
    showSnackbar('Calendar updated', 'success');
    await loadCalendars();
  };

  const handleCreateCalendar = async () => {
    if (!activeProjectId) return;
    await calendarsApi.create(activeProjectId, { name: 'New Calendar' });
    await loadCalendars();
  };

  const handleDeleteCalendar = async () => {
    if (!activeProjectId || !selectedCalId) return;
    await calendarsApi.delete(activeProjectId, selectedCalId);
    setSelectedCalId('');
    await loadCalendars();
  };

  const handleAddException = async () => {
    if (!activeProjectId || !selectedCalId || !newExcDate) return;
    await calendarsApi.addException(activeProjectId, selectedCalId, {
      startDate: newExcDate,
      endDate: newExcEnd || newExcDate,
      isWorking: false,
    });
    setNewExcDate('');
    setNewExcEnd('');
    await loadCalendars();
  };

  const handleDeleteException = async (excId: string) => {
    if (!activeProjectId || !selectedCalId) return;
    await calendarsApi.deleteException(activeProjectId, selectedCalId, excId);
    await loadCalendars();
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Change Working Time</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>Calendar</InputLabel>
            <Select
              label="Calendar"
              value={selectedCalId}
              onChange={(e) => handleSelectCalendar(e.target.value)}
            >
              {calendars.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton size="small" onClick={handleCreateCalendar} title="New Calendar">
            <AddIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleDeleteCalendar}
            disabled={!selectedCalId}
            title="Delete Calendar"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>

        {selectedCal && (
          <>
            {/* Working days */}
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Working Days</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
              {DAY_NAMES.map((day, idx) => (
                <FormControlLabel
                  key={day}
                  control={
                    <Checkbox
                      size="small"
                      checked={workingDays[idx]}
                      onChange={(e) => {
                        const next = [...workingDays];
                        next[idx] = e.target.checked;
                        setWorkingDays(next);
                      }}
                    />
                  }
                  label={day}
                  sx={{ '& .MuiTypography-root': { fontSize: '0.75rem' } }}
                />
              ))}
            </Box>

            {/* Working hours */}
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Working Hours</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                size="small"
                label="Start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                sx={{ width: 140 }}
              />
              <TextField
                size="small"
                label="End"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                sx={{ width: 140 }}
              />
            </Box>

            <Divider sx={{ my: 1 }} />

            {/* Exceptions */}
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Exceptions (Holidays / Non-working Days)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
              <TextField
                size="small"
                label="From"
                type="date"
                value={newExcDate}
                onChange={(e) => setNewExcDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 150 }}
              />
              <TextField
                size="small"
                label="To"
                type="date"
                value={newExcEnd}
                onChange={(e) => setNewExcEnd(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 150 }}
              />
              <Button size="small" variant="outlined" onClick={handleAddException}>
                Add
              </Button>
            </Box>

            <List dense sx={{ maxHeight: 150, overflow: 'auto' }}>
              {selectedCal.exceptions.map((exc) => (
                <ListItem key={exc.id}>
                  <ListItemText
                    primary={`${exc.startDate} — ${exc.endDate}`}
                    secondary={exc.isWorking ? 'Working' : 'Non-working'}
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteException(exc.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
              {selectedCal.exceptions.length === 0 && (
                <ListItem>
                  <ListItemText
                    primary="No exceptions defined"
                    sx={{ color: 'text.secondary', fontStyle: 'italic' }}
                  />
                </ListItem>
              )}
            </List>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!selectedCalId}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CalendarDialog;

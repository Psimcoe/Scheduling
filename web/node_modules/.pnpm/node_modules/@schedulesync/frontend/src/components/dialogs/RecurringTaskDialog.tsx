/**
 * RecurringTaskDialog — create a recurring task series.
 * Mirrors MS Project's Insert > Recurring Task dialog.
 */

import React, { useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Box, Typography, FormControl, InputLabel, Select, MenuItem,
  RadioGroup, FormControlLabel, Radio, Divider,
} from '@mui/material';
import { useUIStore, useProjectStore } from '../../stores';
import { advancedApi } from '../../api';

type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

const RecurringTaskDialog: React.FC = () => {
  const openDialog = useUIStore((s) => s.openDialog);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const open = openDialog === 'recurringTask';
  const projectId = useProjectStore((s) => s.activeProjectId);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const [taskName, setTaskName] = useState('Recurring Task');
  const [durationMinutes, setDurationMinutes] = useState(480);
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [interval, setInterval] = useState(1);
  const [rangeStart, setRangeStart] = useState(new Date().toISOString().slice(0, 10));
  const [rangeEnd, setRangeEnd] = useState('');
  const [occurrences, setOccurrences] = useState(10);
  const [rangeType, setRangeType] = useState<'endDate' | 'occurrences'>('occurrences');

  const handleCreate = useCallback(async () => {
    if (!projectId) return;
    try {
      const body: Record<string, unknown> = {
        name: taskName,
        durationMinutes,
        frequency,
        interval,
        rangeStart,
      };
      if (rangeType === 'endDate' && rangeEnd) {
        body.rangeEnd = rangeEnd;
      } else {
        body.occurrences = occurrences;
      }

      const result = await advancedApi.createRecurringTask(projectId, body);
      showSnackbar(`Created ${result.created ?? 'recurring'} task occurrences`, 'success');
      await useProjectStore.getState().fetchTasks();
      closeDialog();
    } catch (e: unknown) {
      showSnackbar(e instanceof Error ? e.message : 'Failed to create recurring task', 'error');
    }
  }, [projectId, taskName, durationMinutes, frequency, interval, rangeStart, rangeEnd, occurrences, rangeType, showSnackbar, closeDialog]);

  if (!open) return null;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Recurring Task Information</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            size="small"
            label="Task Name"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            fullWidth
          />

          <TextField
            size="small"
            label="Duration (days)"
            type="number"
            value={Math.round(durationMinutes / 480)}
            onChange={(e) => setDurationMinutes(Number(e.target.value) * 480)}
            fullWidth
          />

          <Divider />
          <Typography variant="subtitle2">Recurrence Pattern</Typography>

          <FormControl size="small" fullWidth>
            <InputLabel>Frequency</InputLabel>
            <Select value={frequency} label="Frequency" onChange={(e) => setFrequency(e.target.value as Frequency)}>
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            label={`Every ${interval > 1 ? interval : ''} ${frequency.replace('ly', frequency === 'daily' ? '' : 's')}`}
            type="number"
            value={interval}
            onChange={(e) => setInterval(Math.max(1, Number(e.target.value)))}
            fullWidth
            helperText={`Recur every X ${frequency === 'daily' ? 'day(s)' : frequency === 'weekly' ? 'week(s)' : frequency === 'monthly' ? 'month(s)' : 'year(s)'}`}
          />

          <Divider />
          <Typography variant="subtitle2">Range of Recurrence</Typography>

          <TextField
            size="small"
            label="Start"
            type="date"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <RadioGroup value={rangeType} onChange={(e) => setRangeType(e.target.value as any)}>
            <FormControlLabel value="occurrences" control={<Radio size="small" />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2">End after</Typography>
                  <TextField size="small" type="number" value={occurrences}
                    onChange={(e) => setOccurrences(Number(e.target.value))}
                    sx={{ width: 80 }}
                    disabled={rangeType !== 'occurrences'}
                  />
                  <Typography variant="body2">occurrences</Typography>
                </Box>
              }
            />
            <FormControlLabel value="endDate" control={<Radio size="small" />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2">End by</Typography>
                  <TextField size="small" type="date" value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 160 }}
                    disabled={rangeType !== 'endDate'}
                  />
                </Box>
              }
            />
          </RadioGroup>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate}>OK</Button>
      </DialogActions>
    </Dialog>
  );
};

export default RecurringTaskDialog;

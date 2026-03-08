/**
 * SortDialog — lets users define multi-level sort criteria for the task grid.
 *
 * Supports up to 3 levels of sorting, matching MS Project's Sort dialog.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Select,
  MenuItem,
  Box,
  Typography,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';

import { useUIStore, type SortCriteria } from '../../stores';

const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '(none)' },
  { value: 'name', label: 'Task Name' },
  { value: 'duration', label: 'Duration' },
  { value: 'start', label: 'Start' },
  { value: 'finish', label: 'Finish' },
  { value: 'percentComplete', label: '% Complete' },
  { value: 'cost', label: 'Cost' },
  { value: 'totalSlack', label: 'Total Slack' },
  { value: 'freeSlack', label: 'Free Slack' },
  { value: 'wbsCode', label: 'WBS' },
  { value: 'sortOrder', label: 'ID (default)' },
];

function emptyRow(): SortCriteria {
  return { field: '', direction: 'asc' };
}

const SortDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === ('sort' as any));
  const closeDialog = useUIStore((s) => s.closeDialog);
  const existingSorts = useUIStore((s) => s.sortCriteria);
  const setSortCriteria = useUIStore((s) => s.setSortCriteria);

  const [rows, setRows] = useState<SortCriteria[]>([
    emptyRow(),
    emptyRow(),
    emptyRow(),
  ]);

  useEffect(() => {
    if (open) {
      const filled = [...existingSorts];
      while (filled.length < 3) filled.push(emptyRow());
      setRows(filled.slice(0, 3));
    }
  }, [open, existingSorts]);

  const updateRow = (index: number, patch: Partial<SortCriteria>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  };

  const handleApply = () => {
    const valid = rows.filter((r) => r.field !== '');
    setSortCriteria(valid);
    closeDialog();
  };

  const handleClear = () => {
    setSortCriteria([]);
    closeDialog();
  };

  const labels = ['Sort by', 'Then by', 'Then by'];

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="xs" fullWidth>
      <DialogTitle>Sort Tasks</DialogTitle>
      <DialogContent>
        {rows.map((row, idx) => (
          <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5 }}>
            <Typography
              variant="body2"
              sx={{ width: 60, flexShrink: 0, color: 'text.secondary' }}
            >
              {labels[idx]}
            </Typography>

            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Field</InputLabel>
              <Select
                label="Field"
                value={row.field}
                onChange={(e) => updateRow(idx, { field: e.target.value })}
              >
                {FIELD_OPTIONS.map((f) => (
                  <MenuItem key={f.value} value={f.value}>
                    {f.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <ToggleButtonGroup
              size="small"
              exclusive
              value={row.direction}
              onChange={(_, v) => v && updateRow(idx, { direction: v })}
            >
              <ToggleButton value="asc" sx={{ fontSize: '0.7rem', py: 0.5 }}>
                Asc
              </ToggleButton>
              <ToggleButton value="desc" sx={{ fontSize: '0.7rem', py: 0.5 }}>
                Desc
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        ))}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClear}>Reset</Button>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button onClick={handleApply} variant="contained">
          Sort
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SortDialog;

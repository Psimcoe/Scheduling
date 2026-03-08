/**
 * FilterDialog — lets users define filter criteria for the task grid.
 *
 * Supports field selection, operator, and value(s). Multiple criteria rows
 * with AND logic (all must match). MS Project-like filter dialog.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Select,
  MenuItem,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

import { useUIStore, type FilterCriteria } from '../../stores';

const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'name', label: 'Task Name' },
  { value: 'duration', label: 'Duration (min)' },
  { value: 'start', label: 'Start' },
  { value: 'finish', label: 'Finish' },
  { value: 'percentComplete', label: '% Complete' },
  { value: 'cost', label: 'Cost' },
  { value: 'actualCost', label: 'Actual Cost' },
  { value: 'remainingCost', label: 'Remaining Cost' },
  { value: 'work', label: 'Work' },
  { value: 'actualWork', label: 'Actual Work' },
  { value: 'remainingWork', label: 'Remaining Work' },
  { value: 'totalSlack', label: 'Total Slack' },
  { value: 'freeSlack', label: 'Free Slack' },
  { value: 'bcws', label: 'BCWS' },
  { value: 'bcwp', label: 'BCWP' },
  { value: 'acwp', label: 'ACWP' },
  { value: 'wbsCode', label: 'WBS' },
  { value: 'resourceNames', label: 'Resource Names' },
  { value: 'constraintType', label: 'Constraint Type' },
  { value: 'type', label: 'Task Type' },
  { value: 'isCritical', label: 'Critical' },
];

const OPERATOR_OPTIONS: {
  value: FilterCriteria['operator'];
  label: string;
}[] = [
  { value: 'eq', label: 'equals' },
  { value: 'ne', label: 'does not equal' },
  { value: 'gt', label: 'is greater than' },
  { value: 'lt', label: 'is less than' },
  { value: 'contains', label: 'contains' },
  { value: 'between', label: 'is between' },
];

function emptyRow(): FilterCriteria {
  return { field: 'name', operator: 'contains', value: '' };
}

const FilterDialog: React.FC = () => {
  const open = useUIStore(
    (s) => s.openDialog === ('filter' as any),
  );
  const closeDialog = useUIStore((s) => s.closeDialog);
  const existingFilters = useUIStore((s) => s.filters);
  const setFilters = useUIStore((s) => s.setFilters);

  const [rows, setRows] = useState<FilterCriteria[]>([emptyRow()]);

  useEffect(() => {
    if (open) {
      setRows(existingFilters.length > 0 ? [...existingFilters] : [emptyRow()]);
    }
  }, [open, existingFilters]);

  const updateRow = (index: number, patch: Partial<FilterCriteria>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (index: number) =>
    setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== index)));

  const handleApply = () => {
    // Filter out rows with empty value
    const valid = rows.filter(
      (r) => r.value !== '' && r.value !== undefined && r.value !== null,
    );
    setFilters(valid);
    closeDialog();
  };

  const handleClear = () => {
    setFilters([]);
    closeDialog();
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Filter Tasks</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Show tasks where ALL of the following are true:
        </Typography>

        {rows.map((row, idx) => (
          <Box
            key={idx}
            sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}
          >
            <FormControl size="small" sx={{ minWidth: 140 }}>
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

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Test</InputLabel>
              <Select
                label="Test"
                value={row.operator}
                onChange={(e) =>
                  updateRow(idx, {
                    operator: e.target.value as FilterCriteria['operator'],
                  })
                }
              >
                {OPERATOR_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Value"
              value={String(row.value ?? '')}
              onChange={(e) => updateRow(idx, { value: e.target.value })}
              sx={{ flex: 1 }}
            />

            {row.operator === 'between' && (
              <TextField
                size="small"
                label="And"
                value={String(row.value2 ?? '')}
                onChange={(e) => updateRow(idx, { value2: e.target.value })}
                sx={{ width: 100 }}
              />
            )}

            <IconButton size="small" onClick={() => removeRow(idx)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}

        <Button size="small" startIcon={<AddIcon />} onClick={addRow} sx={{ mt: 0.5 }}>
          Add Condition
        </Button>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClear}>Clear Filter</Button>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button onClick={handleApply} variant="contained">
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FilterDialog;

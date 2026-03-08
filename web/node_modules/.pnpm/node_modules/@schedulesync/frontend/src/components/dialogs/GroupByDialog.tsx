/**
 * GroupByDialog — lets users group tasks by a field.
 *
 * MS Project-like Group By dialog with field + direction.
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

import { useUIStore, type GroupByOption } from '../../stores';

const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '(none — no grouping)' },
  { value: 'type', label: 'Task Type' },
  { value: 'isCritical', label: 'Critical' },
  { value: 'percentComplete', label: '% Complete' },
  { value: 'constraintType', label: 'Constraint Type' },
  { value: 'outlineLevel', label: 'Outline Level' },
  { value: 'isManuallyScheduled', label: 'Task Mode' },
  { value: 'wbsCode', label: 'WBS' },
];

const GroupByDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === ('groupBy' as any));
  const closeDialog = useUIStore((s) => s.closeDialog);
  const existingGroup = useUIStore((s) => s.groupBy);
  const setGroupBy = useUIStore((s) => s.setGroupBy);

  const [field, setField] = useState('');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (open) {
      setField(existingGroup?.field ?? '');
      setDirection(existingGroup?.direction ?? 'asc');
    }
  }, [open, existingGroup]);

  const handleApply = () => {
    if (field) {
      setGroupBy({ field, direction });
    } else {
      setGroupBy(null);
    }
    closeDialog();
  };

  const handleClear = () => {
    setGroupBy(null);
    closeDialog();
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="xs" fullWidth>
      <DialogTitle>Group By</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Group tasks by a common field value.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>Field</InputLabel>
            <Select
              label="Field"
              value={field}
              onChange={(e) => setField(e.target.value)}
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
            value={direction}
            onChange={(_, v) => v && setDirection(v)}
          >
            <ToggleButton value="asc" sx={{ fontSize: '0.7rem', py: 0.5 }}>
              Asc
            </ToggleButton>
            <ToggleButton value="desc" sx={{ fontSize: '0.7rem', py: 0.5 }}>
              Desc
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClear}>Clear</Button>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button onClick={handleApply} variant="contained">
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GroupByDialog;

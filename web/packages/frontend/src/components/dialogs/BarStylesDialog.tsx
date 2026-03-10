/**
 * BarStylesDialog — configure Gantt bar appearance (colors, shapes, patterns).
 * Mirrors MS Project's Format > Bar Styles dialog.
 */

import React, { useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Table, TableHead, TableBody, TableRow, TableCell,
  TextField, Select, MenuItem, IconButton, Typography, Box,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useUIStore, type BarStyleEntry } from '../../stores';

const BarStylesDialog: React.FC = () => {
  const openDialog = useUIStore((s) => s.openDialog);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const storeStyles = useUIStore((s) => s.barStyles);
  const setBarStyles = useUIStore((s) => s.setBarStyles);
  const open = openDialog === 'barStyles';

  const [styles, setStyles] = useState<BarStyleEntry[]>(storeStyles.map((s) => ({ ...s })));

  // Re-sync local state when dialog opens
  React.useEffect(() => {
    if (open) setStyles(storeStyles.map((s) => ({ ...s })));
  }, [open, storeStyles]);

  const handleChange = useCallback((id: string, field: keyof BarStyleEntry, value: string) => {
    setStyles((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }, []);

  const handleAdd = useCallback(() => {
    const newId = String(Date.now());
    setStyles((prev) => [
      ...prev,
      { id: newId, name: 'New Style', showFor: 'task', barColor: '#0078D4', barShape: 'bar', barPattern: 'solid', startShape: 'none', endShape: 'none', progressColor: '#005A9E' },
    ]);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setStyles((prev) => prev.filter((s) => s.id !== id));
  }, []);

  if (!open) return null;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="md" fullWidth>
      <DialogTitle>Bar Styles</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Configure how Gantt chart bars appear for different task types.
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Show For</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Color</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Shape</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Pattern</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} width={40}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {styles.map((style) => (
              <TableRow key={style.id}>
                <TableCell>
                  <TextField
                    size="small"
                    value={style.name}
                    onChange={(e) => handleChange(style.id, 'name', e.target.value)}
                    variant="standard"
                    sx={{ fontSize: '0.75rem' }}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={style.showFor}
                    onChange={(e) => handleChange(style.id, 'showFor', e.target.value)}
                    variant="standard"
                    sx={{ fontSize: '0.75rem' }}
                  >
                    <MenuItem value="task">Normal Task</MenuItem>
                    <MenuItem value="critical">Critical</MenuItem>
                    <MenuItem value="milestone">Milestone</MenuItem>
                    <MenuItem value="summary">Summary</MenuItem>
                    <MenuItem value="progress">Progress</MenuItem>
                    <MenuItem value="baseline">Baseline</MenuItem>
                    <MenuItem value="slack">Slack</MenuItem>
                  </Select>
                </TableCell>
                <TableCell>
                  <input
                    type="color"
                    value={style.barColor}
                    onChange={(e) => handleChange(style.id, 'barColor', e.target.value)}
                    style={{ width: 32, height: 24, border: 'none', cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={style.barShape}
                    onChange={(e) => handleChange(style.id, 'barShape', e.target.value)}
                    variant="standard"
                    sx={{ fontSize: '0.75rem' }}
                  >
                    <MenuItem value="bar">Bar</MenuItem>
                    <MenuItem value="diamond">Diamond</MenuItem>
                    <MenuItem value="triangle">Triangle</MenuItem>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={style.barPattern}
                    onChange={(e) => handleChange(style.id, 'barPattern', e.target.value)}
                    variant="standard"
                    sx={{ fontSize: '0.75rem' }}
                  >
                    <MenuItem value="solid">Solid</MenuItem>
                    <MenuItem value="striped">Striped</MenuItem>
                    <MenuItem value="dotted">Dotted</MenuItem>
                  </Select>
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => handleDelete(style.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Box sx={{ mt: 1 }}>
          <Button size="small" startIcon={<AddIcon />} onClick={handleAdd}>
            Add Style
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="contained" onClick={() => { setBarStyles(styles); closeDialog(); }}>OK</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BarStylesDialog;

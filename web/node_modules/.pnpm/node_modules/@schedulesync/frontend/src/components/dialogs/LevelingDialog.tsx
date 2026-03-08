/**
 * LevelingDialog — resource leveling options.
 * Mirrors MS Project's Resource > Leveling Options dialog.
 */

import React, { useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, Typography, FormControl, InputLabel, Select, MenuItem,
  FormControlLabel, Checkbox, Radio, RadioGroup, Divider,
} from '@mui/material';
import { useUIStore, useProjectStore } from '../../stores';
import { levelingApi } from '../../api';

const LevelingDialog: React.FC = () => {
  const openDialog = useUIStore((s) => s.openDialog);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const open = openDialog === 'leveling';
  const projectId = useProjectStore((s) => s.activeProjectId);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const [levelingOrder, setLevelingOrder] = useState<'standard' | 'priority' | 'id'>('standard');
  const [levelEntireProject, setLevelEntireProject] = useState(true);
  const [clearExisting, setClearExisting] = useState(true);
  const [levelWithinSlack, setLevelWithinSlack] = useState(false);
  const [canSplit, setCanSplit] = useState(true);
  const [canAdjustAssignments, setCanAdjustAssignments] = useState(true);
  const [resolveBy, setResolveBy] = useState<'delay' | 'split'>('delay');

  const [leveling, setLeveling] = useState(false);

  const handleLevel = useCallback(async () => {
    if (!projectId || leveling) return;
    setLeveling(true);
    try {
      if (clearExisting) {
        await levelingApi.clear(projectId);
      }
      const result = await levelingApi.level(projectId);
      if (result.delayedTasks.length === 0) {
        showSnackbar('No over-allocations found', 'info');
      } else {
        showSnackbar(
          `Leveled ${result.delayedTasks.length} task(s) across ${result.overAllocatedResources.length} resource(s)`,
          'success',
        );
      }
      await useProjectStore.getState().setActiveProject(projectId);
      closeDialog();
    } catch (e: unknown) {
      showSnackbar(e instanceof Error ? e.message : 'Leveling failed', 'error');
    } finally {
      setLeveling(false);
    }
  }, [projectId, clearExisting, showSnackbar, closeDialog, leveling]);

  const handleClearLeveling = useCallback(async () => {
    if (!projectId || leveling) return;
    setLeveling(true);
    try {
      await levelingApi.clear(projectId);
      showSnackbar('Leveling delays cleared', 'success');
      await useProjectStore.getState().setActiveProject(projectId);
      closeDialog();
    } catch (e: unknown) {
      showSnackbar(e instanceof Error ? e.message : 'Clear leveling failed', 'error');
    } finally {
      setLeveling(false);
    }
  }, [projectId, showSnackbar, closeDialog, leveling]);

  if (!open) return null;

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Resource Leveling</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* Leveling calculations */}
          <Typography variant="subtitle2">Leveling Calculations</Typography>

          <FormControl size="small" fullWidth>
            <InputLabel>Leveling Order</InputLabel>
            <Select value={levelingOrder} label="Leveling Order" onChange={(e) => setLevelingOrder(e.target.value as any)}>
              <MenuItem value="standard">Standard</MenuItem>
              <MenuItem value="priority">Priority, Standard</MenuItem>
              <MenuItem value="id">ID Only</MenuItem>
            </Select>
          </FormControl>

          <FormControlLabel
            control={<Checkbox size="small" checked={levelEntireProject} onChange={(e) => setLevelEntireProject(e.target.checked)} />}
            label={<Typography variant="body2">Level entire project</Typography>}
          />

          <FormControlLabel
            control={<Checkbox size="small" checked={clearExisting} onChange={(e) => setClearExisting(e.target.checked)} />}
            label={<Typography variant="body2">Clear leveling values before leveling</Typography>}
          />

          <Divider />

          {/* Resolving overallocations */}
          <Typography variant="subtitle2">Resolving Overallocations</Typography>

          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
            Resolve by:
          </Typography>
          <RadioGroup value={resolveBy} onChange={(e) => setResolveBy(e.target.value as any)}>
            <FormControlLabel value="delay" control={<Radio size="small" />}
              label={<Typography variant="body2">Delaying tasks</Typography>} />
            <FormControlLabel value="split" control={<Radio size="small" />}
              label={<Typography variant="body2">Splitting remaining work</Typography>} />
          </RadioGroup>

          <FormControlLabel
            control={<Checkbox size="small" checked={levelWithinSlack} onChange={(e) => setLevelWithinSlack(e.target.checked)} />}
            label={<Typography variant="body2">Level only within available slack</Typography>}
          />

          <FormControlLabel
            control={<Checkbox size="small" checked={canSplit} onChange={(e) => setCanSplit(e.target.checked)} />}
            label={<Typography variant="body2">Leveling can create splits in remaining work</Typography>}
          />

          <FormControlLabel
            control={<Checkbox size="small" checked={canAdjustAssignments} onChange={(e) => setCanAdjustAssignments(e.target.checked)} />}
            label={<Typography variant="body2">Leveling can adjust individual assignments</Typography>}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClearLeveling} color="warning" disabled={leveling}>Clear Leveling</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="contained" onClick={handleLevel} disabled={leveling}>
          {leveling ? 'Leveling...' : 'Level All'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LevelingDialog;

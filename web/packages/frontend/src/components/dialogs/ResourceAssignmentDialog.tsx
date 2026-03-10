/**
 * ResourceAssignmentDialog — MS Project "Assign Resources" dialog.
 *
 * Shows available resources, current assignments, and lets users
 * add/remove/change resource assignments for the selected task(s).
 */

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  TextField,
  Typography,
  Checkbox,
  Box,
  Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

import {
  useProjectStore,
  useUIStore,
  type ResourceRow,
  type AssignmentRow,
} from '../../stores';

const ResourceAssignmentDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'resource');
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);

  const tasks = useProjectStore((s) => s.tasks);
  const resources = useProjectStore((s) => s.resources);
  const assignments = useProjectStore((s) => s.assignments);
  const selectedTaskIds = useProjectStore((s) => s.selectedTaskIds);
  const createAssignment = useProjectStore((s) => s.createAssignment);
  const deleteAssignment = useProjectStore((s) => s.deleteAssignment);

  // Track units for each resource row in the dialog
  const [unitsMap, setUnitsMap] = useState<Record<string, number>>({});

  const selectedTasks = useMemo(
    () => tasks.filter((t) => selectedTaskIds.has(t.id)),
    [tasks, selectedTaskIds],
  );

  // Assignments for the selected tasks
  const selectedAssignments = useMemo(
    () => assignments.filter((a: AssignmentRow) => selectedTaskIds.has(a.taskId)),
    [assignments, selectedTaskIds],
  );

  // Which resources are assigned to at least one selected task
  const assignedResourceIds = useMemo(
    () => new Set(selectedAssignments.map((a) => a.resourceId)),
    [selectedAssignments],
  );

  const getUnits = (resId: string): number => {
    if (unitsMap[resId] !== undefined) return unitsMap[resId];
    const existing = selectedAssignments.find((a) => a.resourceId === resId);
    return existing ? Math.round(existing.units * 100) : 100;
  };

  const setUnits = (resId: string, val: number) => {
    setUnitsMap((prev) => ({ ...prev, [resId]: val }));
  };

  const handleAssign = async (resource: ResourceRow) => {
    if (selectedTasks.length === 0) return;
    const units = getUnits(resource.id) / 100;
    try {
      for (const task of selectedTasks) {
        // Skip if already assigned
        const existing = assignments.find(
          (a) => a.taskId === task.id && a.resourceId === resource.id,
        );
        if (!existing) {
          await createAssignment({
            taskId: task.id,
            resourceId: resource.id,
            units,
          });
        }
      }
      showSnackbar(`Assigned ${resource.name}`, 'success');
    } catch (e: unknown) {
      showSnackbar(e instanceof Error ? e.message : 'Assignment failed', 'error');
    }
  };

  const handleRemove = async (resource: ResourceRow) => {
    try {
      for (const task of selectedTasks) {
        const existing = assignments.find(
          (a) => a.taskId === task.id && a.resourceId === resource.id,
        );
        if (existing) {
          await deleteAssignment(existing.id);
        }
      }
      showSnackbar(`Removed ${resource.name}`, 'info');
    } catch (e: unknown) {
      showSnackbar(e instanceof Error ? e.message : 'Removal failed', 'error');
    }
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Assign Resources</DialogTitle>
      <DialogContent>
        {selectedTasks.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            Select one or more tasks first.
          </Typography>
        ) : (
          <>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Task{selectedTasks.length > 1 ? 's' : ''}:{' '}
                {selectedTasks.map((t) => (
                  <Chip
                    key={t.id}
                    label={t.name}
                    size="small"
                    sx={{ mr: 0.5, mb: 0.5 }}
                  />
                ))}
              </Typography>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Resource Name</TableCell>
                  <TableCell width={80}>Units %</TableCell>
                  <TableCell width={50} />
                </TableRow>
              </TableHead>
              <TableBody>
                {resources.map((res) => {
                  const isAssigned = assignedResourceIds.has(res.id);
                  return (
                    <TableRow key={res.id}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={isAssigned}
                          onChange={() =>
                            isAssigned
                              ? handleRemove(res)
                              : handleAssign(res)
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {res.name}
                        {isAssigned && (
                          <Chip
                            label="Assigned"
                            color="success"
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          value={getUnits(res.id)}
                          onChange={(e) =>
                            setUnits(res.id, Number(e.target.value))
                          }
                          sx={{ width: 70 }}
                          inputProps={{ min: 0 }}
                        />
                      </TableCell>
                      <TableCell>
                        {isAssigned && (
                          <IconButton
                            size="small"
                            onClick={() => handleRemove(res)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {resources.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography variant="body2" color="text.secondary">
                        No resources in project. Add resources first.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ResourceAssignmentDialog;

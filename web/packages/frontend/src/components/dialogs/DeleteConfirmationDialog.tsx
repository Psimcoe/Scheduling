import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import {
  useProjectStore,
  useUIStore,
  type DeleteConfirmationPayload,
} from '../../stores';

function isDeleteConfirmationPayload(
  value: unknown,
): value is DeleteConfirmationPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<DeleteConfirmationPayload>;
  return candidate.kind === 'project' || candidate.kind === 'tasks';
}

const DeleteConfirmationDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'deleteConfirm');
  const dialogPayload = useUIStore((s) => s.dialogPayload);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const deleteTasks = useProjectStore((s) => s.deleteTasks);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
    }
  }, [open]);

  const payload = isDeleteConfirmationPayload(dialogPayload)
    ? dialogPayload
    : null;

  const derived = useMemo(() => {
    if (!payload) {
      return null;
    }

    if (payload.kind === 'project') {
      return {
        title: 'Delete Project',
        confirmLabel: 'Delete Project',
        successMessage: `Deleted project "${payload.project.name}" locally. Nothing was deleted in Stratus.`,
      };
    }

    const count = payload.tasks.length;
    return {
      title: count === 1 ? 'Delete Task' : `Delete ${count} Tasks`,
      confirmLabel: count === 1 ? 'Delete Task' : `Delete ${count} Tasks`,
      successMessage:
        count === 1
          ? `Deleted "${payload.tasks[0]?.name ?? 'task'}" locally. Nothing was deleted in Stratus.`
          : `Deleted ${count} tasks locally. Nothing was deleted in Stratus.`,
    };
  }, [payload]);

  const hasStratusLinkedTasks =
    payload?.kind === 'tasks' &&
    payload.tasks.some((task) => task.hasStratusSync);

  const visibleTaskNames =
    payload?.kind === 'tasks' ? payload.tasks.slice(0, 5) : [];
  const extraTaskCount =
    payload?.kind === 'tasks'
      ? Math.max(payload.tasks.length - visibleTaskNames.length, 0)
      : 0;

  const handleConfirm = async () => {
    if (!payload || !derived) {
      closeDialog();
      return;
    }

    setSubmitting(true);
    try {
      if (payload.kind === 'project') {
        await deleteProject(payload.project.id);
      } else {
        await deleteTasks(payload.tasks.map((task) => task.id));
      }
      closeDialog();
      showSnackbar(derived.successMessage, 'success');
    } catch (error: unknown) {
      showSnackbar(
        error instanceof Error ? error.message : 'Delete failed',
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open && !!payload && !!derived} onClose={submitting ? undefined : closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>{derived?.title ?? 'Delete'}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {payload?.kind === 'project' && (
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>
              This only deletes the local project in ScheduleSync. Nothing is deleted in Stratus under any circumstance.
            </Alert>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              <strong>{payload.project.name}</strong> will be removed from the local app only.
            </Typography>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Deleting this project does not change Stratus exclusions or settings, including any Import Active Stratus Projects overrides.
            </Typography>
            <Typography variant="body2">
              If this project still exists in Stratus, you can recreate it later with Import Active Stratus Projects.
            </Typography>
          </>
        )}

        {payload?.kind === 'tasks' && (
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>
              {hasStratusLinkedTasks
                ? 'This only deletes the selected tasks locally in ScheduleSync. Nothing is deleted in Stratus, and a future Stratus Quick Pull or Full Refresh may recreate linked items.'
                : 'This only deletes the selected tasks locally in ScheduleSync. Nothing is deleted in Stratus.'}
            </Alert>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              {payload.tasks.length === 1
                ? 'The selected task will be removed from the local app only.'
                : `The selected ${payload.tasks.length} tasks will be removed from the local app only.`}
            </Typography>
            <Box component="ul" sx={{ my: 0, pl: 2.5 }}>
              {visibleTaskNames.map((task) => (
                <Box component="li" key={task.id} sx={{ mb: 0.5 }}>
                  <Typography variant="body2">{task.name}</Typography>
                </Box>
              ))}
            </Box>
            {extraTaskCount > 0 && (
              <Typography variant="body2" sx={{ mt: 1.5 }}>
                And {extraTaskCount} more task{extraTaskCount === 1 ? '' : 's'}.
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog} disabled={submitting}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => {
            void handleConfirm();
          }}
          disabled={submitting || !payload || !derived}
        >
          {derived?.confirmLabel ?? 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteConfirmationDialog;

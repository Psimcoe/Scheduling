/**
 * UndoHistoryDialog — shows the list of undo entries for the active project
 * and lets the user see what actions are in the undo/redo stack.
 */

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  Typography,
  Box,
} from '@mui/material';
import dayjs from 'dayjs';

import { useProjectStore, useUIStore } from '../../stores';
import { importExportApi } from '../../api';

interface UndoEntry {
  id: string;
  description: string;
  position: number;
  createdAt: string;
}

const UndoHistoryDialog: React.FC = () => {
  const openDialog = useUIStore((s) => s.openDialog);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const open = openDialog === 'undoHistory';

  const [entries, setEntries] = useState<UndoEntry[]>([]);
  const [pointer, setPointer] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !activeProjectId) return;
    importExportApi.undoHistory(activeProjectId).then((data) => {
      setEntries(data.entries);
      setPointer(data.currentPointer);
    });
  }, [open, activeProjectId]);

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Undo History</DialogTitle>
      <DialogContent dividers>
        {entries.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            No undo history available.
          </Typography>
        ) : (
          <List dense disablePadding>
            {entries.map((entry) => {
              const isCurrent = pointer != null && entry.position === pointer;
              const isUndone = pointer != null && entry.position > pointer;
              return (
                <ListItem
                  key={entry.id}
                  sx={{
                    bgcolor: isCurrent ? 'action.selected' : isUndone ? 'action.disabledBackground' : undefined,
                    opacity: isUndone ? 0.5 : 1,
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" sx={{ fontWeight: isCurrent ? 700 : 400 }}>
                          {entry.description || 'Action'}
                          {isCurrent && ' (current)'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          #{entry.position}
                        </Typography>
                      </Box>
                    }
                    secondary={dayjs(entry.createdAt).format('MMM D, YYYY h:mm A')}
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default UndoHistoryDialog;

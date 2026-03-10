/**
 * ColumnChooserDialog — lets users toggle which columns are visible.
 *
 * MS Project-like "Insert Column" / column chooser dialog.
 */

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
} from '@mui/material';

import { useUIStore, type TaskColumnId } from '../../stores';

const ColumnChooserDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === 'columnChooser' as any);
  const closeDialog = useUIStore((s) => s.closeDialog);
  const columns = useUIStore((s) => s.columns);
  const toggleColumn = useUIStore((s) => s.toggleColumn);

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="xs" fullWidth>
      <DialogTitle>Show/Hide Columns</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <List dense>
          {columns.map((col) => (
            <ListItem key={col.id} disablePadding>
              <ListItemButton
                onClick={() => toggleColumn(col.id)}
                disabled={col.id === 'rowNum' || col.id === 'name'}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox
                    edge="start"
                    checked={col.visible}
                    tabIndex={-1}
                    disableRipple
                    size="small"
                  />
                </ListItemIcon>
                <ListItemText primary={col.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ColumnChooserDialog;

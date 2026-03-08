/**
 * CustomFieldsDialog — manage custom field definitions for the project.
 *
 * MS Project-like custom fields management: create, edit, delete
 * custom field definitions (Text, Number, Date, Flag, Cost, Duration).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

import { useProjectStore, useUIStore } from '../../stores';
import { customFieldsApi, type CustomFieldDef } from '../../api/client';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'flag', label: 'Flag (Yes/No)' },
  { value: 'cost', label: 'Cost' },
  { value: 'duration', label: 'Duration' },
  { value: 'outlineCode', label: 'Outline Code' },
];

const CustomFieldsDialog: React.FC = () => {
  const open = useUIStore((s) => s.openDialog === ('customFields' as any));
  const closeDialog = useUIStore((s) => s.closeDialog);
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [formula, setFormula] = useState('');

  const loadFields = useCallback(async () => {
    if (!activeProjectId) return;
    const list = await customFieldsApi.list(activeProjectId);
    setFields(list);
  }, [activeProjectId]);

  useEffect(() => {
    if (open) {
      loadFields();
      setSelectedId(null);
      resetForm();
    }
  }, [open, loadFields]);

  const resetForm = () => {
    setFieldName('');
    setDisplayName('');
    setFieldType('text');
    setFormula('');
  };

  const handleSelect = (f: CustomFieldDef) => {
    setSelectedId(f.id);
    setFieldName(f.fieldName);
    setDisplayName(f.displayName);
    setFieldType(f.fieldType);
    setFormula(f.formula ?? '');
  };

  const handleCreate = async () => {
    if (!activeProjectId || !fieldName.trim()) return;
    await customFieldsApi.create(activeProjectId, {
      fieldName: fieldName.trim(),
      displayName: displayName.trim() || fieldName.trim(),
      fieldType,
      formula: formula || undefined,
    });
    showSnackbar('Custom field created', 'success');
    resetForm();
    setSelectedId(null);
    await loadFields();
  };

  const handleUpdate = async () => {
    if (!activeProjectId || !selectedId || !fieldName.trim()) return;
    await customFieldsApi.update(activeProjectId, selectedId, {
      fieldName: fieldName.trim(),
      displayName: displayName.trim() || fieldName.trim(),
      fieldType,
      formula: formula || undefined,
    });
    showSnackbar('Custom field updated', 'success');
    await loadFields();
  };

  const handleDelete = async (id: string) => {
    if (!activeProjectId) return;
    await customFieldsApi.delete(activeProjectId, id);
    if (selectedId === id) {
      setSelectedId(null);
      resetForm();
    }
    showSnackbar('Custom field deleted', 'success');
    await loadFields();
  };

  return (
    <Dialog open={open} onClose={closeDialog} maxWidth="sm" fullWidth>
      <DialogTitle>Custom Fields</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 2, height: 360 }}>
          {/* Field list */}
          <Box sx={{ width: 200, borderRight: '1px solid #E0E0E0', pr: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Fields
            </Typography>
            <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
              {fields.map((f) => (
                <ListItemButton
                  key={f.id}
                  selected={selectedId === f.id}
                  onClick={() => handleSelect(f)}
                  sx={{ py: 0.25 }}
                >
                  <ListItemText
                    primary={f.displayName || f.fieldName}
                    secondary={f.fieldType}
                    primaryTypographyProps={{ fontSize: '0.8rem' }}
                    secondaryTypographyProps={{ fontSize: '0.65rem' }}
                  />
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(f.id);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemButton>
              ))}
              {fields.length === 0 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ px: 1 }}
                >
                  No custom fields yet.
                </Typography>
              )}
            </List>
          </Box>

          {/* Edit form */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              size="small"
              label="Field Name"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                label="Type"
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
              >
                {FIELD_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Formula (optional)"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              multiline
              rows={2}
              fullWidth
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        {selectedId ? (
          <Button onClick={handleUpdate} variant="contained">
            Update
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            variant="contained"
            startIcon={<AddIcon />}
            disabled={!fieldName.trim()}
          >
            Create
          </Button>
        )}
        <Button onClick={() => { setSelectedId(null); resetForm(); }}>
          New
        </Button>
        <Button onClick={closeDialog}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomFieldsDialog;

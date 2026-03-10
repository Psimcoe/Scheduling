/**
 * Sidebar — project list and navigation.
 */

import React, { useEffect } from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  Typography,
  Divider,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

import { useProjectStore, useUIStore } from '../../stores';

const Sidebar: React.FC = () => {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const openDialogWith = useUIStore((s) => s.openDialogWith);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <Box
      sx={{
        width: 220,
        minWidth: 220,
        borderRight: '1px solid #E0E0E0',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#FAFAFA',
        height: '100%',
      }}
    >
      <Box
        sx={{
          p: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Projects
        </Typography>
        <Tooltip title="New Project">
          <IconButton size="small" onClick={() => openDialogWith('newProject')}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />
      <List dense sx={{ overflow: 'auto', flex: 1 }}>
        {projects.map((p) => (
          <ListItemButton
            key={p.id}
            selected={p.id === activeProjectId}
            onClick={() => setActiveProject(p.id)}
          >
            <ListItemText
              primary={p.name}
              secondary={new Date(p.updatedAt).toLocaleDateString()}
              primaryTypographyProps={{ fontSize: '0.8125rem', noWrap: true }}
              secondaryTypographyProps={{ fontSize: '0.7rem' }}
            />
          </ListItemButton>
        ))}
        {projects.length === 0 && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              No projects yet
            </Typography>
          </Box>
        )}
      </List>
    </Box>
  );
};

export default Sidebar;

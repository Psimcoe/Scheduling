import React from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { useProjectBrowserStore, useProjectStore, useUIStore } from '../../stores';
import { buildQuickAccessProjects } from '../../utils/projectBrowser';

function formatProjectDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function QuickAccessSection({
  title,
  emptyLabel,
  projects,
  activeProjectId,
  onOpenProject,
}: {
  title: string;
  emptyLabel: string;
  projects: Array<{ id: string; name: string; updatedAt: string }>;
  activeProjectId: string | null;
  onOpenProject: (projectId: string) => void;
}) {
  return (
    <Box>
      {title ? (
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ px: 1.5, pb: 0.5, display: 'block', letterSpacing: '0.08em' }}
        >
          {title}
        </Typography>
      ) : null}
      {projects.length === 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1.5 }}>
          {emptyLabel}
        </Typography>
      ) : (
        <List dense disablePadding>
          {projects.map((project) => (
            <ListItemButton
              key={project.id}
              selected={project.id === activeProjectId}
              onClick={() => onOpenProject(project.id)}
              sx={{
                mx: 1,
                mb: 0.5,
                borderRadius: 1.5,
                alignItems: 'flex-start',
              }}
            >
              <ListItemText
                primary={project.name}
                secondary={formatProjectDate(project.updatedAt)}
                primaryTypographyProps={{ fontSize: '0.8125rem', noWrap: true }}
                secondaryTypographyProps={{ fontSize: '0.7rem' }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
}

const Sidebar: React.FC = () => {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const loadingProjects = useProjectStore((state) => state.loadingProjects);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const openDialogWith = useUIStore((state) => state.openDialogWith);
  const pinnedProjectIds = useProjectBrowserStore((state) => state.pinnedProjectIds);
  const recentProjectIds = useProjectBrowserStore((state) => state.recentProjectIds);
  const markProjectOpened = useProjectBrowserStore((state) => state.markProjectOpened);

  const quickAccess = buildQuickAccessProjects(
    projects,
    pinnedProjectIds,
    recentProjectIds,
  );

  const openProject = (projectId: string) => {
    markProjectOpened(projectId);
    void setActiveProject(projectId);
  };

  const showFallback =
    quickAccess.pinned.length === 0 && quickAccess.recent.length === 0;

  return (
    <Box
      sx={{
        width: 280,
        minWidth: 280,
        borderRight: '1px solid #E0E0E0',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#F6F4EE',
        height: '100%',
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: '#FFFDF8',
        }}
      >
        <Box
          component="img"
          src="/logo.png"
          alt="ScheduleSync logo"
          sx={{
            width: 38,
            height: 38,
            flexShrink: 0,
          }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} lineHeight={1.1} noWrap>
            ScheduleSync
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Project browser + planning
          </Typography>
        </Box>
        <Tooltip title="Stratus Settings">
          <IconButton size="small" onClick={() => openDialogWith('stratusSettings')}>
            <SettingsInputComponentIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="New Project">
          <IconButton size="small" onClick={() => openDialogWith('newProject')}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />

      <Box sx={{ p: 1.25, display: 'grid', gap: 1 }}>
        <Button
          variant="contained"
          startIcon={<TravelExploreIcon />}
          onClick={() => openDialogWith('projectBrowser', { initialTab: 'local' })}
        >
          Browse Projects
        </Button>
        <Button
          variant="outlined"
          startIcon={<CloudDownloadIcon />}
          onClick={() => openDialogWith('projectBrowser', { initialTab: 'stratus' })}
        >
          Import Active Stratus
        </Button>
      </Box>

      <Divider />

      <List dense disablePadding sx={{ px: 1, py: 1 }}>
        <ListItemButton
          onClick={() => openDialogWith('projectBrowser', { initialTab: 'local' })}
          sx={{ borderRadius: 1.5, mb: 0.5 }}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <FolderOpenOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Browse All Projects"
            secondary="Search, sort, and filter the full list"
            primaryTypographyProps={{ fontSize: '0.825rem' }}
            secondaryTypographyProps={{ fontSize: '0.72rem' }}
          />
        </ListItemButton>
        <ListItemButton
          onClick={() => openDialogWith('projectBrowser', { initialTab: 'stratus' })}
          sx={{ borderRadius: 1.5 }}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <CloudDownloadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Stratus Import"
            secondary="Preview and import active Stratus projects"
            primaryTypographyProps={{ fontSize: '0.825rem' }}
            secondaryTypographyProps={{ fontSize: '0.72rem' }}
          />
        </ListItemButton>
      </List>

      <Divider />

      <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
        {loadingProjects && projects.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ px: 1.5 }}>
            Loading projects...
          </Typography>
        ) : projects.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ px: 1.5 }}>
            No local projects yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Box>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ px: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}
              >
                <PushPinIcon sx={{ fontSize: 14 }} />
                Pinned
              </Typography>
              <QuickAccessSection
                title=""
                emptyLabel="Pin projects from the browser for fast access."
                projects={quickAccess.pinned}
                activeProjectId={activeProjectId}
                onOpenProject={openProject}
              />
            </Box>

            <Box>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ px: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}
              >
                <ScheduleIcon sx={{ fontSize: 14 }} />
                Recent
              </Typography>
              <QuickAccessSection
                title=""
                emptyLabel="Projects you open will appear here."
                projects={quickAccess.recent}
                activeProjectId={activeProjectId}
                onOpenProject={openProject}
              />
            </Box>

            {showFallback && (
              <Box>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ px: 1.5, pb: 0.5, display: 'block' }}
                >
                  Recent Updates
                </Typography>
                <List dense disablePadding>
                  {quickAccess.fallback.map((project) => (
                    <ListItemButton
                      key={project.id}
                      selected={project.id === activeProjectId}
                      onClick={() => openProject(project.id)}
                      sx={{
                        mx: 1,
                        mb: 0.5,
                        borderRadius: 1.5,
                        alignItems: 'flex-start',
                      }}
                    >
                      <ListItemText
                        primary={project.name}
                        secondary={formatProjectDate(project.updatedAt)}
                        primaryTypographyProps={{ fontSize: '0.8125rem', noWrap: true }}
                        secondaryTypographyProps={{ fontSize: '0.7rem' }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Sidebar;

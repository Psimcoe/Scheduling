/**
 * ViewRibbon — ribbon content for the View tab.
 * Contains: View switcher buttons, Zoom, Show/Hide toggles, Filter, Sort.
 */

import React from 'react';
import {
  Box,
  IconButton,
  Button,
  ButtonGroup,
  Tooltip,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import TableChartIcon from '@mui/icons-material/TableChart';
import CalendarViewMonthIcon from '@mui/icons-material/CalendarViewMonth';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import AssessmentIcon from '@mui/icons-material/Assessment';
import WorkHistoryIcon from '@mui/icons-material/WorkHistory';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import TimelineIcon from '@mui/icons-material/Timeline';
import FilterListIcon from '@mui/icons-material/FilterList';
import SortIcon from '@mui/icons-material/Sort';
import CategoryIcon from '@mui/icons-material/Category';
import BarChartIcon from '@mui/icons-material/BarChart';
import GroupsIcon from '@mui/icons-material/Groups';
import ViewListIcon from '@mui/icons-material/ViewList';
import LinearScaleIcon from '@mui/icons-material/LinearScale';

import { useUIStore, type GanttZoom, type ViewType } from '../../stores';

const ZOOM_LEVELS: GanttZoom[] = ['day', 'week', 'month', 'quarter', 'year'];

const RibbonGroup: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      borderRight: '1px solid #E0E0E0',
      px: 1,
      py: 0.25,
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>{children}</Box>
    <Typography
      variant="caption"
      sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1, mt: 0.25 }}
    >
      {label}
    </Typography>
  </Box>
);

const VIEW_OPTIONS: { value: ViewType; label: string; icon: React.ReactNode }[] = [
  { value: 'gantt', label: 'Gantt Chart', icon: <ViewTimelineIcon fontSize="small" /> },
  { value: 'taskSheet', label: 'Task Sheet', icon: <ViewListIcon fontSize="small" /> },
  { value: 'networkDiagram', label: 'Network Diagram', icon: <AccountTreeIcon fontSize="small" /> },
  { value: 'calendar', label: 'Calendar', icon: <CalendarViewMonthIcon fontSize="small" /> },
  { value: 'timeline', label: 'Timeline', icon: <LinearScaleIcon fontSize="small" /> },
  { value: 'resourceSheet', label: 'Resource Sheet', icon: <TableChartIcon fontSize="small" /> },
  { value: 'resourceUsage', label: 'Resource Usage', icon: <PersonSearchIcon fontSize="small" /> },
  { value: 'resourceGraph', label: 'Resource Graph', icon: <BarChartIcon fontSize="small" /> },
  { value: 'teamPlanner', label: 'Team Planner', icon: <GroupsIcon fontSize="small" /> },
  { value: 'taskUsage', label: 'Task Usage', icon: <WorkHistoryIcon fontSize="small" /> },
  { value: 'trackingGantt', label: 'Tracking Gantt', icon: <AssessmentIcon fontSize="small" /> },
  { value: 'reporting', label: 'Reports', icon: <AssessmentIcon fontSize="small" /> },
];

const ViewRibbon: React.FC = () => {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const ganttZoom = useUIStore((s) => s.ganttZoom);
  const setGanttZoom = useUIStore((s) => s.setGanttZoom);
  const showCriticalPath = useUIStore((s) => s.showCriticalPath);
  const toggleCriticalPath = useUIStore((s) => s.toggleCriticalPath);
  const openDialogWith = useUIStore((s) => s.openDialogWith);

  const handleZoomIn = () => {
    const idx = ZOOM_LEVELS.indexOf(ganttZoom);
    if (idx > 0) setGanttZoom(ZOOM_LEVELS[idx - 1]);
  };

  const handleZoomOut = () => {
    const idx = ZOOM_LEVELS.indexOf(ganttZoom);
    if (idx < ZOOM_LEVELS.length - 1) setGanttZoom(ZOOM_LEVELS[idx + 1]);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
      {/* Task Views */}
      <RibbonGroup label="Task Views">
        {VIEW_OPTIONS.slice(0, 5).map((v) => (
          <Tooltip key={v.value} title={v.label}>
            <IconButton
              size="small"
              onClick={() => setActiveView(v.value)}
              color={activeView === v.value ? 'primary' : 'default'}
            >
              {v.icon}
            </IconButton>
          </Tooltip>
        ))}
      </RibbonGroup>

      {/* Resource Views */}
      <RibbonGroup label="Resource Views">
        {VIEW_OPTIONS.slice(5, 9).map((v) => (
          <Tooltip key={v.value} title={v.label}>
            <IconButton
              size="small"
              onClick={() => setActiveView(v.value)}
              color={activeView === v.value ? 'primary' : 'default'}
            >
              {v.icon}
            </IconButton>
          </Tooltip>
        ))}
      </RibbonGroup>

      {/* Tracking Views */}
      <RibbonGroup label="Tracking">
        {VIEW_OPTIONS.slice(9).map((v) => (
          <Tooltip key={v.value} title={v.label}>
            <IconButton
              size="small"
              onClick={() => setActiveView(v.value)}
              color={activeView === v.value ? 'primary' : 'default'}
            >
              {v.icon}
            </IconButton>
          </Tooltip>
        ))}
      </RibbonGroup>

      {/* Zoom */}
      <RibbonGroup label="Zoom">
        <Tooltip title="Zoom In">
          <IconButton size="small" onClick={handleZoomIn}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Button size="small" disabled sx={{ minWidth: 40, textTransform: 'capitalize', fontSize: '0.7rem' }}>
          {ganttZoom}
        </Button>
        <Tooltip title="Zoom Out">
          <IconButton size="small" onClick={handleZoomOut}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </RibbonGroup>

      {/* Data */}
      <RibbonGroup label="Data">
        <Tooltip title="Toggle Critical Path">
          <IconButton
            size="small"
            onClick={toggleCriticalPath}
            color={showCriticalPath ? 'error' : 'default'}
          >
            <TimelineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Filter">
          <IconButton
            size="small"
            onClick={() => openDialogWith('filter')}
          >
            <FilterListIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Sort">
          <IconButton
            size="small"
            onClick={() => openDialogWith('sort')}
          >
            <SortIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Group By">
          <IconButton
            size="small"
            onClick={() => openDialogWith('groupBy')}
          >
            <CategoryIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </RibbonGroup>
    </Box>
  );
};

export default ViewRibbon;

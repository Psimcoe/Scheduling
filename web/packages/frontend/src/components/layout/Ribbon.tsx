/**
 * Ribbon — MS Project-style ribbon with tabs and contextual content.
 *
 * Combines RibbonTabs (Task/Resource/Project/View/Format) with
 * the corresponding ribbon content panel.
 */

import React from 'react';
import { Box, AppBar } from '@mui/material';
import RibbonTabs from './RibbonTabs';
import {
  TaskRibbon,
  ResourceRibbon,
  ProjectRibbon,
  ViewRibbon,
  FormatRibbon,
} from '../ribbon';
import { useUIStore, type RibbonTab } from '../../stores';

const ribbonContent: Record<RibbonTab, React.ReactNode> = {
  task: <TaskRibbon />,
  resource: <ResourceRibbon />,
  project: <ProjectRibbon />,
  view: <ViewRibbon />,
  format: <FormatRibbon />,
};

const Ribbon: React.FC = () => {
  const activeTab = useUIStore((s) => s.activeRibbonTab);

  return (
    <AppBar position="static" color="default" elevation={1} sx={{ zIndex: 10 }}>
      <RibbonTabs />
      <Box
        sx={{
          minHeight: 48,
          display: 'flex',
          alignItems: 'stretch',
          px: 0.5,
          bgcolor: '#FFFFFF',
          borderBottom: '1px solid #E0E0E0',
        }}
      >
        {ribbonContent[activeTab]}
      </Box>
    </AppBar>
  );
};

export default Ribbon;

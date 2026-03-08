/**
 * RibbonTabs — MS Project-style ribbon tab bar that sits above the toolbar content.
 * Tabs: Task | Resource | Project | View | Format
 */

import React from 'react';
import { Tabs, Tab, Box } from '@mui/material';
import { useUIStore, type RibbonTab } from '../../stores';

const TABS: { value: RibbonTab; label: string }[] = [
  { value: 'task', label: 'Task' },
  { value: 'resource', label: 'Resource' },
  { value: 'project', label: 'Project' },
  { value: 'view', label: 'View' },
  { value: 'format', label: 'Format' },
];

const RibbonTabs: React.FC = () => {
  const activeTab = useUIStore((s) => s.activeRibbonTab);
  const setActiveTab = useUIStore((s) => s.setActiveRibbonTab);

  return (
    <Box sx={{ borderBottom: '1px solid #E0E0E0', bgcolor: '#F5F5F5' }}>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          minHeight: 28,
          '& .MuiTab-root': {
            minHeight: 28,
            py: 0,
            px: 2,
            fontSize: '0.75rem',
            textTransform: 'none',
            fontWeight: 600,
          },
          '& .MuiTabs-indicator': {
            height: 2,
          },
        }}
      >
        {TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>
    </Box>
  );
};

export default RibbonTabs;

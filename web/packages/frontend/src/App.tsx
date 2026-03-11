/**
 * App — root component that wires together the layout.
 *
 * Sidebar | Toolbar + SplitView (Grid | Gantt)
 */

import React from 'react';
import { Box, Snackbar, Alert } from '@mui/material';

import { Sidebar, Ribbon, SplitView, StatusBar } from './components/layout';
import {
  NewProjectDialog,
  ProjectInfoDialog,
  TaskInfoDialog,
  BaselineCaptureDialog,
  ImportPreviewDialog,
  ResourceAssignmentDialog,
  ColumnChooserDialog,
  FilterDialog,
  SortDialog,
  GroupByDialog,
  CalendarDialog,
  CustomFieldsDialog,
  UndoHistoryDialog,
  BarStylesDialog,
  FindReplaceDialog,
  PrintPreviewDialog,
  ProjectStatisticsDialog,
  ResourceInfoDialog,
  LevelingDialog,
  RecurringTaskDialog,
  AiSettingsDialog,
  BulkImportDialog,
  StratusSettingsDialog,
  StratusProjectImportDialog,
  StratusPullPreviewDialog,
  StratusRefreshFromPrefabPreviewDialog,
  StratusSyncToPrefabPreviewDialog,
  StratusPushPreviewDialog,
} from './components/dialogs';
import ChatPanel from './components/ai/ChatPanel';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useUIStore } from './stores';

const App: React.FC = () => {
  const snackbar = useUIStore((s) => s.snackbar);
  const clearSnackbar = useUIStore((s) => s.clearSnackbar);
  useKeyboardShortcuts();

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Ribbon />
        <SplitView />
        <StatusBar />
      </Box>

      {/* AI Chat Panel */}
      <ChatPanel />

      {/* Dialogs */}
      <NewProjectDialog />
      <ProjectInfoDialog />
      <TaskInfoDialog />
      <BaselineCaptureDialog />
      <ImportPreviewDialog />
      <ResourceAssignmentDialog />
      <ColumnChooserDialog />
      <FilterDialog />
      <SortDialog />
      <GroupByDialog />
      <CalendarDialog />
      <CustomFieldsDialog />
      <UndoHistoryDialog />
      <BarStylesDialog />
      <FindReplaceDialog />
      <PrintPreviewDialog />
      <ProjectStatisticsDialog />
      <ResourceInfoDialog />
      <LevelingDialog />
      <RecurringTaskDialog />
      <AiSettingsDialog />
      <BulkImportDialog />
      <StratusSettingsDialog />
      <StratusProjectImportDialog />
      <StratusPullPreviewDialog />
      <StratusRefreshFromPrefabPreviewDialog />
      <StratusSyncToPrefabPreviewDialog />
      <StratusPushPreviewDialog />

      {/* Global snackbar */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={clearSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert
            onClose={clearSnackbar}
            severity={snackbar.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
};

export default App;

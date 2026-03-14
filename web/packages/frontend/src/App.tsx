/**
 * App — root component that wires together the layout.
 *
 * Sidebar | Toolbar + SplitView (Grid | Gantt)
 */

import React from 'react';
import { Box, Snackbar, Alert } from '@mui/material';

import { Sidebar, Ribbon, SplitView, StatusBar } from './components/layout';
import ChatPanel from './components/ai/ChatPanel';
import DialogHost from './components/dialogs/DialogHost';
import ProjectDataBridge from './data/ProjectDataBridge';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useServerEvents } from './realtime/useServerEvents';
import { useUIStore } from './stores';

const App: React.FC = () => {
  const snackbar = useUIStore((s) => s.snackbar);
  const clearSnackbar = useUIStore((s) => s.clearSnackbar);
  useKeyboardShortcuts();
  useServerEvents();

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <ProjectDataBridge />

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

      <DialogHost />

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

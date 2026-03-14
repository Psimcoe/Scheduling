import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectBrowserDialog from './ProjectBrowserDialog';
import { resetProjectBrowserStoreForTesting } from '../../stores/useProjectBrowserStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';

const startJobMock = vi.fn();
const clearJobMock = vi.fn();

vi.mock('../../hooks/useStratusJob', () => ({
  useStratusJob: () => ({
    job: null,
    startJob: startJobMock,
    clearJob: clearJobMock,
    isRunning: false,
  }),
}));

const initialProjectState = useProjectStore.getState();
const initialUiState = useUIStore.getState();

function createProject(id: string, name: string) {
  return {
    id,
    name,
    revision: 1,
    startDate: '2026-03-01T00:00:00.000Z',
    finishDate: null,
    projectType: null,
    sector: null,
    region: null,
    stratusProjectId: null,
    stratusModelId: null,
    stratusPackageWhere: null,
    stratusLastPullAt: null,
    stratusLastPushAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
  };
}

function resetStores() {
  useProjectStore.setState(
    {
      ...initialProjectState,
      projects: [],
      loadingProjects: false,
      activeProjectId: null,
      activeProject: null,
      tasks: [],
      dependencies: [],
      resources: [],
      assignments: [],
      loading: false,
      error: null,
      selectedTaskIds: new Set(),
      pendingActions: {},
      scheduleJobs: {},
    },
    true,
  );

  useUIStore.setState(
    {
      ...initialUiState,
      openDialog: 'none',
      dialogPayload: null,
      snackbar: null,
    },
    true,
  );

  resetProjectBrowserStoreForTesting();
  startJobMock.mockReset();
  startJobMock.mockResolvedValue(undefined);
  clearJobMock.mockReset();
}

describe('ProjectBrowserDialog', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    cleanup();
    resetStores();
  });

  it('does not open a project on selection and waits for explicit open', async () => {
    const setActiveProject = vi.fn().mockResolvedValue(undefined);

    useProjectStore.setState({
      projects: [createProject('project-1', 'Alpha Project')],
      setActiveProject,
    });
    useUIStore.setState({
      openDialog: 'projectBrowser',
      dialogPayload: { initialTab: 'local' },
    });

    render(<ProjectBrowserDialog />);

    fireEvent.click(await screen.findByText('Alpha Project'));
    expect(setActiveProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open Project' }));

    await waitFor(() => {
      expect(setActiveProject).toHaveBeenCalledWith('project-1');
    });
    expect(useUIStore.getState().openDialog).toBe('none');
  });

  it('auto-runs the Stratus preview once when the Stratus tab is opened first', async () => {
    useProjectStore.setState({
      projects: [createProject('project-1', 'Alpha Project')],
    });
    useUIStore.setState({
      openDialog: 'projectBrowser',
      dialogPayload: { initialTab: 'stratus' },
    });

    render(<ProjectBrowserDialog />);

    await waitFor(() => {
      expect(startJobMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Local' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Stratus' }));

    await waitFor(() => {
      expect(startJobMock).toHaveBeenCalledTimes(1);
    });
  });
});

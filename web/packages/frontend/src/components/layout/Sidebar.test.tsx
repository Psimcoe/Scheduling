import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';
import { useProjectBrowserStore } from '../../stores/useProjectBrowserStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { resetProjectBrowserStoreForTesting } from '../../stores/useProjectBrowserStore';

const initialProjectState = useProjectStore.getState();
const initialUiState = useUIStore.getState();

function createProject(id: string, name: string, updatedAt: string) {
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
    updatedAt,
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
}

describe('Sidebar', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    cleanup();
    resetStores();
  });

  it('does not fetch projects on mount and opens the unified browser entry points', () => {
    const fetchProjects = vi.fn().mockResolvedValue(undefined);

    useProjectStore.setState({
      fetchProjects,
      projects: [createProject('project-1', 'Alpha', '2026-03-01T00:00:00.000Z')],
    });

    render(<Sidebar />);

    expect(fetchProjects).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Browse Projects' }));
    expect(useUIStore.getState().openDialog).toBe('projectBrowser');
    expect(useUIStore.getState().dialogPayload).toEqual({ initialTab: 'local' });

    fireEvent.click(screen.getByRole('button', { name: 'Import Active Stratus' }));
    expect(useUIStore.getState().openDialog).toBe('projectBrowser');
    expect(useUIStore.getState().dialogPayload).toEqual({ initialTab: 'stratus' });
  });

  it('renders pinned and recent sections and opens a clicked shortcut immediately', async () => {
    const setActiveProject = vi.fn().mockResolvedValue(undefined);

    useProjectStore.setState({
      projects: [
        createProject('project-a', 'Pinned Project', '2026-03-03T00:00:00.000Z'),
        createProject('project-b', 'Recent Project', '2026-03-02T00:00:00.000Z'),
      ],
      setActiveProject,
    });
    useProjectBrowserStore.setState({
      pinnedProjectIds: ['project-a'],
      recentProjectIds: ['project-b'],
    });

    render(<Sidebar />);

    expect(screen.getByText('Pinned Project')).toBeInTheDocument();
    expect(screen.getByText('Recent Project')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Recent Project'));

    await waitFor(() => {
      expect(setActiveProject).toHaveBeenCalledWith('project-b');
    });
    expect(useProjectBrowserStore.getState().recentProjectIds[0]).toBe('project-b');
  });

  it('falls back to recently updated projects when pinned and recent are empty', () => {
    useProjectStore.setState({
      projects: [
        createProject('project-a', 'Older Project', '2026-03-01T00:00:00.000Z'),
        createProject('project-b', 'Newest Project', '2026-03-04T00:00:00.000Z'),
        createProject('project-c', 'Middle Project', '2026-03-03T00:00:00.000Z'),
      ],
    });

    render(<Sidebar />);

    expect(screen.getByText('Recent Updates')).toBeInTheDocument();
    const newest = screen.getByText('Newest Project');
    const middle = screen.getByText('Middle Project');
    const older = screen.getByText('Older Project');

    expect(
      newest.compareDocumentPosition(middle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      middle.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

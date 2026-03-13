import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';
import ProjectInfoDialog from './ProjectInfoDialog';
import { useProjectStore, useUIStore } from '../../stores';

const initialProjectState = useProjectStore.getState();
const initialUiState = useUIStore.getState();

function resetStores() {
  useProjectStore.setState(
    {
      ...initialProjectState,
      projects: [],
      activeProjectId: null,
      activeProject: null,
      tasks: [],
      dependencies: [],
      resources: [],
      assignments: [],
      loading: false,
      error: null,
      selectedTaskIds: new Set(),
    },
    true,
  );

  useUIStore.setState(
    {
      ...initialUiState,
      openDialog: 'none',
      dialogPayload: null,
      collapsedIds: new Set(),
      snackbar: null,
    },
    true,
  );
}

describe('DeleteConfirmationDialog', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    cleanup();
    resetStores();
  });

  it('opens from Project Information and deletes through the project store action', async () => {
    const deleteProject = vi.fn().mockResolvedValue(undefined);

    useProjectStore.setState({
      activeProjectId: 'project-1',
      activeProject: {
        id: 'project-1',
        name: 'Prefab Local Copy',
        revision: 0,
        startDate: '2026-03-01T00:00:00.000Z',
        finishDate: null,
        defaultCalendarId: 'calendar-1',
        scheduleFrom: 'start',
        statusDate: null,
        stratusLocalMetadataVersion: 1,
        projectType: null,
        sector: null,
        region: null,
        stratusProjectId: null,
        stratusModelId: null,
        stratusPackageWhere: null,
        stratusLastPullAt: null,
        stratusLastPushAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
      deleteProject,
    });
    useUIStore.setState({ openDialog: 'projectInfo', dialogPayload: null });

    render(
      <>
        <ProjectInfoDialog />
        <DeleteConfirmationDialog />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Project' }));

    expect(
      await screen.findByText(
        /Nothing is deleted in Stratus under any circumstance/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not change Stratus exclusions or settings/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Delete Project' })[0]!,
    );

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith('project-1');
    });
  });

  it('shows the generic local-only warning for non-Stratus tasks', () => {
    useProjectStore.setState({
      deleteTasks: vi.fn().mockResolvedValue(undefined),
    });
    useUIStore.setState({
      openDialog: 'deleteConfirm',
      dialogPayload: {
        kind: 'tasks',
        tasks: [
          {
            id: 'task-1',
            name: 'Local Task',
            hasStratusSync: false,
          },
        ],
      },
    });

    render(<DeleteConfirmationDialog />);

    expect(
      screen.getByText(
        /This only deletes the selected tasks locally in ScheduleSync\. Nothing is deleted in Stratus\./i,
      ),
    ).toBeInTheDocument();
  });

  it('shows the Stratus-specific local-only warning when linked tasks are selected', async () => {
    const deleteTasks = vi.fn().mockResolvedValue(undefined);

    useProjectStore.setState({
      deleteTasks,
    });
    useUIStore.setState({
      openDialog: 'deleteConfirm',
      dialogPayload: {
        kind: 'tasks',
        tasks: [
          {
            id: 'task-1',
            name: 'Linked Package',
            hasStratusSync: true,
          },
          {
            id: 'task-2',
            name: 'Assembly Child',
            hasStratusSync: false,
          },
        ],
      },
    });

    render(<DeleteConfirmationDialog />);

    expect(
      screen.getByText(
        /future Stratus Quick Pull or Full Refresh may recreate linked items/i,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete 2 Tasks' }));

    await waitFor(() => {
      expect(deleteTasks).toHaveBeenCalledWith(['task-1', 'task-2']);
    });
  });
});

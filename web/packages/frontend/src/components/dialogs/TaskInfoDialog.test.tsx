import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi, type ProjectSnapshotResponse } from '../../api/client';
import { queryClient } from '../../queryClient';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { resetProjectQueuesForTesting } from '../../stores/useProjectStore';
import TaskInfoDialog from './TaskInfoDialog';

vi.mock('../ai/AiSuggestButton', () => ({
  default: () => null,
}));

const initialProjectState = useProjectStore.getState();
const initialUiState = useUIStore.getState();

function createSnapshot(name: string, revision = 1): ProjectSnapshotResponse {
  return {
    detailLevel: 'full',
    revision,
    project: {
      id: 'project-1',
      name: 'Project 1',
      revision,
      startDate: '2026-03-12T00:00:00.000Z',
      finishDate: null,
      projectType: null,
      sector: null,
      region: null,
      stratusProjectId: null,
      stratusModelId: null,
      stratusPackageWhere: null,
      stratusLastPullAt: null,
      stratusLastPushAt: null,
      createdAt: '2026-03-12T00:00:00.000Z',
      updatedAt: '2026-03-12T00:00:00.000Z',
      defaultCalendarId: '__default__',
      scheduleFrom: 'start',
      statusDate: null,
      stratusLocalMetadataVersion: 1,
    },
    taskBounds: {
      start: '2026-03-12T00:00:00.000Z',
      finish: '2026-03-13T00:00:00.000Z',
    },
    tasks: [
      {
        id: 'task-1',
        detailLevel: 'full',
        projectId: 'project-1',
        wbsCode: '1',
        outlineLevel: 0,
        parentId: null,
        name,
        type: 'task',
        durationMinutes: 480,
        start: '2026-03-12T00:00:00.000Z',
        finish: '2026-03-13T00:00:00.000Z',
        constraintType: 0,
        constraintDate: null,
        calendarId: null,
        percentComplete: 0,
        isManuallyScheduled: false,
        isCritical: false,
        totalSlackMinutes: 0,
        freeSlackMinutes: 0,
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        deadline: null,
        notes: 'Original notes',
        externalKey: null,
        isNameManagedByStratus: false,
        sortOrder: 0,
        stratusSync: null,
        stratusStatus: null,
        fixedCost: null,
        fixedCostAccrual: null,
        cost: null,
        actualCost: null,
        remainingCost: null,
        work: null,
        actualWork: null,
        remainingWork: null,
        actualStart: null,
        actualFinish: null,
        actualDurationMinutes: null,
        remainingDuration: null,
        bcws: null,
        bcwp: null,
        acwp: null,
      },
    ],
    dependencies: [],
    resources: [],
    assignments: [],
  };
}

function resetStores(): void {
  useProjectStore.setState(
    {
      ...initialProjectState,
      projects: [],
      activeProjectId: null,
      activeProject: null,
      taskBounds: null,
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
}

function seedState(snapshot: ProjectSnapshotResponse): void {
  queryClient.clear();
  queryClient.setQueryData(['projects', 'snapshot', snapshot.project.id, 'full'], snapshot);
  queryClient.setQueryData(['projects', 'snapshot', snapshot.project.id, 'shell'], snapshot);

  useProjectStore.setState({
    activeProjectId: snapshot.project.id,
    activeProject: snapshot.project,
    taskBounds: snapshot.taskBounds,
    tasks: snapshot.tasks,
    dependencies: snapshot.dependencies,
    resources: snapshot.resources,
    assignments: snapshot.assignments,
    loading: false,
    error: null,
  });

  useUIStore.setState({
    openDialog: 'taskInfo',
    dialogPayload: snapshot.tasks[0],
  });
}

describe('TaskInfoDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetProjectQueuesForTesting();
    resetStores();
    seedState(createSnapshot('Original task'));
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    resetProjectQueuesForTesting();
    resetStores();
  });

  it('closes after save even when snapshot revalidation is still pending', async () => {
    const updatedTask = createSnapshot('Updated task', 2).tasks[0]!;
    const invalidatePromise = new Promise<void>(() => {});

    vi.spyOn(tasksApi, 'update').mockResolvedValueOnce({
      revision: 2,
      task: updatedTask,
    });
    vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(
      invalidatePromise as ReturnType<typeof queryClient.invalidateQueries>,
    );

    render(
      <QueryClientProvider client={queryClient}>
        <TaskInfoDialog />
      </QueryClientProvider>,
    );

    expect(await screen.findByDisplayValue('Original task')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Task Name'), {
      target: { value: 'Updated task' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(useUIStore.getState().openDialog).toBe('none');
    });

    expect(tasksApi.update).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().tasks[0]?.name).toBe('Updated task');
  });

  it('renders Stratus-managed task names as read-only', async () => {
    seedState({
      ...createSnapshot('Imported task'),
      tasks: [
        {
          ...createSnapshot('Imported task').tasks[0]!,
          isNameManagedByStratus: true,
          stratusStatus: {
            sourceType: 'package',
            trackingStatusId: 'status-1',
            trackingStatusName: 'Ready',
          },
        },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TaskInfoDialog />
      </QueryClientProvider>,
    );

    const nameField = await screen.findByLabelText('Task Name');
    expect(nameField).toBeDisabled();
    expect(
      screen.getByText('Task name is managed by Stratus and is read-only here.'),
    ).toBeInTheDocument();
  });
});

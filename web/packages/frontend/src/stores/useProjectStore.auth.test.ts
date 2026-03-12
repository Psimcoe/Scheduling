import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, tasksApi, type ProjectSnapshotResponse } from '../api/client';
import { queryClient } from '../queryClient';
import {
  resetProjectQueuesForTesting,
  resumeProjectQueuesAfterAuth,
  useProjectStore,
} from './useProjectStore';

function createSnapshot(name: string, revision = 1): ProjectSnapshotResponse {
  return {
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
    },
    tasks: [
      {
        id: 'task-1',
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
        notes: null,
        externalKey: null,
        sortOrder: 0,
        stratusSync: null,
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

function seedProjectState(snapshot: ProjectSnapshotResponse): void {
  queryClient.clear();
  queryClient.setQueryData(['projects', 'snapshot', snapshot.project.id], snapshot);
  useProjectStore.setState({
    projects: [],
    loadingProjects: false,
    activeProjectId: snapshot.project.id,
    activeProject: snapshot.project,
    tasks: snapshot.tasks,
    dependencies: snapshot.dependencies,
    resources: snapshot.resources,
    assignments: snapshot.assignments,
    loading: false,
    error: null,
    selectedTaskIds: new Set(),
    pendingActions: {},
  });
}

describe('useProjectStore auth queue handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetProjectQueuesForTesting();
    seedProjectState(createSnapshot('Original task'));
  });

  afterEach(() => {
    queryClient.clear();
    resetProjectQueuesForTesting();
  });

  it('pauses and resumes optimistic mutations after a 401 response', async () => {
    const updatedSnapshot = createSnapshot('Updated task', 2);
    const updateSpy = vi
      .spyOn(tasksApi, 'update')
      .mockRejectedValueOnce(
        new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.'),
      )
      .mockResolvedValueOnce({
        revision: 2,
        snapshot: updatedSnapshot,
        task: updatedSnapshot.tasks[0],
      });

    let settled = false;
    const pendingUpdate = useProjectStore
      .getState()
      .updateTask('task-1', { name: 'Updated task' })
      .finally(() => {
        settled = true;
      });

    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    expect(settled).toBe(false);
    expect(useProjectStore.getState().tasks[0]?.name).toBe('Original task');

    await resumeProjectQueuesAfterAuth();
    await pendingUpdate;

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(useProjectStore.getState().tasks[0]?.name).toBe('Updated task');
  });

  it('rolls back optimistic changes and rejects on a 403 response', async () => {
    vi.spyOn(tasksApi, 'update').mockRejectedValueOnce(
      new ApiError(403, 'FORBIDDEN', 'You do not have permission to access this resource.'),
    );

    await expect(
      useProjectStore.getState().updateTask('task-1', { name: 'Blocked update' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    expect(useProjectStore.getState().tasks[0]?.name).toBe('Original task');
  });
});

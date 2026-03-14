import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, projectsApi, tasksApi, type ProjectSnapshotResponse } from '../api/client';
import { projectQueryKeys } from '../data/projectQueries';
import { queryClient } from '../queryClient';
import {
  resetProjectQueuesForTesting,
  resumeProjectQueuesAfterAuth,
  useProjectStore,
} from './useProjectStore';

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
        notes: null,
        externalKey: null,
        isNameManagedByStratus: false,
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
  queryClient.setQueryData(
    ['projects', 'snapshot', snapshot.project.id, snapshot.detailLevel],
    snapshot,
  );
  queryClient.setQueryData(
    ['projects', 'snapshot', snapshot.project.id, 'shell'],
    snapshot,
  );
  useProjectStore.setState({
    projects: [],
    loadingProjects: false,
    activeProjectId: snapshot.project.id,
    activeProject: snapshot.project,
    taskBounds: snapshot.taskBounds,
    tasks: snapshot.tasks,
    dependencies: snapshot.dependencies,
    resources: snapshot.resources,
    assignments: snapshot.assignments,
    loading: false,
    error: null,
    selectedTaskIds: new Set(),
    pendingActions: {},
    scheduleJobs: {},
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

  it('applies compact task update responses without waiting for snapshot invalidation', async () => {
    const invalidatePromise = new Promise<void>(() => {});
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockReturnValue(invalidatePromise as ReturnType<typeof queryClient.invalidateQueries>);
    const updatedTask = createSnapshot('Updated task', 2).tasks[0]!;

    vi.spyOn(tasksApi, 'update').mockResolvedValueOnce({
      revision: 2,
      task: updatedTask,
    });

    await useProjectStore.getState().updateTask('task-1', { name: 'Updated task' });

    expect(useProjectStore.getState().tasks[0]?.name).toBe('Updated task');
    expect(
      queryClient.getQueryData(projectQueryKeys.taskDetail('project-1', 'task-1')),
    ).toEqual(updatedTask);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectQueryKeys.snapshotBase('project-1'),
    });
  });

  it('does not reapply optimistic create snapshots when the bridge syncs cached data', async () => {
    const neverSettles = new Promise<never>(() => {});
    vi.spyOn(tasksApi, 'create').mockReturnValueOnce(neverSettles);

    void useProjectStore.getState().createTask({ name: 'Queued task' });

    await vi.waitFor(() => {
      expect(useProjectStore.getState().tasks).toHaveLength(2);
    });

    const optimisticSnapshot = queryClient.getQueryData<ProjectSnapshotResponse>(
      projectQueryKeys.snapshot('project-1', 'full'),
    );

    expect(optimisticSnapshot?.tasks).toHaveLength(2);

    useProjectStore.getState().syncSnapshot(optimisticSnapshot!);

    expect(useProjectStore.getState().tasks).toHaveLength(2);
    expect(
      useProjectStore.getState().tasks.filter((task) => task.name === 'Queued task'),
    ).toHaveLength(1);
  });

  it('hydrates the target project from cache immediately on project switch', async () => {
    const nextSnapshotBase = createSnapshot('Project 2 task', 3);
    const nextSnapshot = {
      ...nextSnapshotBase,
      project: {
        ...nextSnapshotBase.project,
        id: 'project-2',
        name: 'Project 2',
      },
      tasks: [
        {
          ...nextSnapshotBase.tasks[0]!,
          id: 'task-2',
          projectId: 'project-2',
          name: 'Project 2 task',
        },
      ],
    } satisfies ProjectSnapshotResponse;

    queryClient.setQueryData(projectQueryKeys.snapshot('project-2', 'shell'), nextSnapshot);
    vi.spyOn(tasksApi, 'update').mockReset();
    vi.spyOn(projectsApi, 'snapshot').mockResolvedValueOnce(nextSnapshot);

    const switchPromise = useProjectStore.getState().setActiveProject('project-2');

    expect(useProjectStore.getState().activeProjectId).toBe('project-2');
    expect(useProjectStore.getState().activeProject?.id).toBe('project-2');
    expect(useProjectStore.getState().tasks[0]?.projectId).toBe('project-2');
    expect(useProjectStore.getState().tasks[0]?.name).toBe('Project 2 task');
    await switchPromise;
  });

  it('ignores stale snapshots that would move the project backward', () => {
    seedProjectState(createSnapshot('Current task', 2));

    useProjectStore.getState().syncSnapshot(createSnapshot('Stale task', 1));

    expect(useProjectStore.getState().tasks[0]?.name).toBe('Current task');
    expect(useProjectStore.getState().activeProject?.revision).toBe(2);
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

import type { ProjectSnapshotResponse, SnapshotDetailLevel } from '../api';
import { queryClient } from '../queryClient';
import { projectQueryKeys } from './projectQueries';

function resolveSnapshotKeyOrder(
  projectId: string,
  preferredDetailLevel: SnapshotDetailLevel,
) {
  if (preferredDetailLevel === 'full') {
    return [
      projectQueryKeys.snapshot(projectId, 'full'),
      projectQueryKeys.snapshot(projectId, 'shell'),
    ] as const;
  }

  return [
    projectQueryKeys.snapshot(projectId, 'shell'),
    projectQueryKeys.snapshot(projectId, 'full'),
  ] as const;
}

export function getCachedProjectSnapshot(
  projectId: string,
  preferredDetailLevel: SnapshotDetailLevel = 'shell',
): ProjectSnapshotResponse | null {
  for (const key of resolveSnapshotKeyOrder(projectId, preferredDetailLevel)) {
    const snapshot = queryClient.getQueryData<ProjectSnapshotResponse>(key);
    if (snapshot) {
      return snapshot;
    }
  }

  return null;
}

export function setCachedProjectSnapshot(
  projectId: string,
  snapshot: ProjectSnapshotResponse,
): void {
  queryClient.setQueryData(
    projectQueryKeys.snapshot(projectId, snapshot.detailLevel),
    snapshot,
  );

  if (snapshot.detailLevel === 'full') {
    queryClient.setQueryData(projectQueryKeys.snapshot(projectId, 'shell'), snapshot);
  }
}

export function removeCachedProjectSnapshots(projectId: string): void {
  queryClient.removeQueries({ queryKey: projectQueryKeys.snapshotBase(projectId) });
}

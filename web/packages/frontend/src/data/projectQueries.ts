import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  projectsApi,
  type ProjectSnapshotResponse,
  type ProjectSummaryResponse,
  type SnapshotDetailLevel,
} from '../api';

export const projectQueryKeys = {
  all: ['projects'] as const,
  list: () => ['projects', 'list'] as const,
  snapshotBase: (projectId: string) => ['projects', 'snapshot', projectId] as const,
  snapshot: (projectId: string, detailLevel: SnapshotDetailLevel) =>
    ['projects', 'snapshot', projectId, detailLevel] as const,
  taskDetail: (projectId: string, taskId: string) =>
    ['projects', 'task', projectId, taskId] as const,
};

export function useProjectsQuery() {
  return useQuery<ProjectSummaryResponse[]>({
    queryKey: projectQueryKeys.list(),
    queryFn: () => projectsApi.list(),
  });
}

export function useProjectsQueryEnabled(enabled: boolean) {
  return useQuery<ProjectSummaryResponse[]>({
    queryKey: projectQueryKeys.list(),
    queryFn: () => projectsApi.list(),
    enabled,
  });
}

export function useProjectSnapshotQuery(
  projectId: string | null,
  enabled = true,
  detailLevel: SnapshotDetailLevel = 'full',
) {
  return useQuery<ProjectSnapshotResponse>({
    queryKey: projectId
      ? projectQueryKeys.snapshot(projectId, detailLevel)
      : ['projects', 'snapshot', 'idle', detailLevel],
    queryFn: () => projectsApi.snapshot(projectId!, detailLevel),
    enabled: !!projectId && enabled,
    placeholderData: keepPreviousData,
  });
}

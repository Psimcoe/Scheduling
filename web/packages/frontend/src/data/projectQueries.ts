import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { projectsApi, type ProjectSnapshotResponse, type ProjectSummaryResponse } from '../api';

export const projectQueryKeys = {
  all: ['projects'] as const,
  list: () => ['projects', 'list'] as const,
  snapshot: (projectId: string) => ['projects', 'snapshot', projectId] as const,
};

export function useProjectsQuery() {
  return useQuery<ProjectSummaryResponse[]>({
    queryKey: projectQueryKeys.list(),
    queryFn: () => projectsApi.list(),
  });
}

export function useProjectSnapshotQuery(projectId: string | null) {
  return useQuery<ProjectSnapshotResponse>({
    queryKey: projectId ? projectQueryKeys.snapshot(projectId) : ['projects', 'snapshot', 'idle'],
    queryFn: () => projectsApi.snapshot(projectId!),
    enabled: !!projectId,
    placeholderData: keepPreviousData,
  });
}

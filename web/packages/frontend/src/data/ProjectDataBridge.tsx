import { useEffect } from 'react';
import { useProjectStore } from '../stores';
import { useAuthStore } from '../stores/useAuthStore';
import { useProjectSnapshotQuery, useProjectsQueryEnabled } from './projectQueries';

export default function ProjectDataBridge() {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const syncProjects = useProjectStore((state) => state.syncProjects);
  const syncSnapshot = useProjectStore((state) => state.syncSnapshot);
  const clearActiveProjectData = useProjectStore((state) => state.clearActiveProjectData);
  const setProjectLoading = useProjectStore((state) => state.setProjectLoading);
  const setProjectError = useProjectStore((state) => state.setProjectError);
  const authStatus = useAuthStore((state) => state.status);
  const queriesEnabled = authStatus === 'authenticated';

  const projectsQuery = useProjectsQueryEnabled(queriesEnabled);
  const snapshotQuery = useProjectSnapshotQuery(activeProjectId, queriesEnabled);

  useEffect(() => {
    syncProjects(
      projectsQuery.data ?? [],
      projectsQuery.isLoading || projectsQuery.isFetching,
      projectsQuery.error instanceof Error ? projectsQuery.error.message : null,
    );
  }, [
    projectsQuery.data,
    projectsQuery.error,
    projectsQuery.isFetching,
    projectsQuery.isLoading,
    syncProjects,
  ]);

  useEffect(() => {
    if (!activeProjectId) {
      clearActiveProjectData();
      return;
    }

    setProjectLoading(snapshotQuery.isLoading || snapshotQuery.isFetching);

    if (snapshotQuery.error instanceof Error) {
      setProjectError(snapshotQuery.error.message);
      return;
    }

    if (snapshotQuery.data) {
      syncSnapshot(snapshotQuery.data);
      return;
    }

    setProjectError(null);
  }, [
    activeProjectId,
    clearActiveProjectData,
    setProjectError,
    setProjectLoading,
    snapshotQuery.data,
    snapshotQuery.error,
    snapshotQuery.isFetching,
    snapshotQuery.isLoading,
    syncSnapshot,
  ]);

  return null;
}

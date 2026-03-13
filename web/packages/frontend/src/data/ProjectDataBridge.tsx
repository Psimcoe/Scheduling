import { useEffect, useMemo } from 'react';
import { useProjectStore } from '../stores';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import { resolveSnapshotDetailLevel } from './projectSnapshotDetail';
import { useProjectSnapshotQuery, useProjectsQueryEnabled } from './projectQueries';

export default function ProjectDataBridge() {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const syncProjects = useProjectStore((state) => state.syncProjects);
  const syncSnapshot = useProjectStore((state) => state.syncSnapshot);
  const clearActiveProjectData = useProjectStore((state) => state.clearActiveProjectData);
  const setProjectLoading = useProjectStore((state) => state.setProjectLoading);
  const setProjectError = useProjectStore((state) => state.setProjectError);
  const authStatus = useAuthStore((state) => state.status);
  const activeView = useUIStore((state) => state.activeView);
  const openDialog = useUIStore((state) => state.openDialog);
  const columns = useUIStore((state) => state.columns);
  const filters = useUIStore((state) => state.filters);
  const sortCriteria = useUIStore((state) => state.sortCriteria);
  const groupBy = useUIStore((state) => state.groupBy);
  const queriesEnabled = authStatus === 'authenticated';
  const visibleColumns = useMemo(
    () => columns.filter((column) => column.visible).map((column) => column.id),
    [columns],
  );
  const snapshotDetailLevel = resolveSnapshotDetailLevel({
    activeView,
    openDialog,
    visibleColumns,
    filters,
    sortCriteria,
    groupBy,
  });

  const projectsQuery = useProjectsQueryEnabled(queriesEnabled);
  const snapshotQuery = useProjectSnapshotQuery(
    activeProjectId,
    queriesEnabled,
    snapshotDetailLevel,
  );

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
    snapshotDetailLevel,
    syncSnapshot,
  ]);

  return null;
}

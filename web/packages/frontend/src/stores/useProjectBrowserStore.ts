import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ProjectBrowserTab = 'local' | 'stratus';
export type LocalProjectSourceFilter = 'all' | 'manual' | 'stratus-linked';
export type ProjectBrowserLocalSortField =
  | 'name'
  | 'source'
  | 'projectType'
  | 'sector'
  | 'region'
  | 'startDate'
  | 'finishDate'
  | 'updatedAt'
  | 'stratusLastPullAt'
  | 'stratusLastPushAt';

export interface ProjectBrowserLocalSort {
  field: ProjectBrowserLocalSortField;
  direction: 'asc' | 'desc';
}

interface PersistedProjectBrowserState {
  pinnedProjectIds: string[];
  recentProjectIds: string[];
  lastOpenedTab: ProjectBrowserTab;
  localSearch: string;
  localSourceFilter: LocalProjectSourceFilter;
  localProjectTypeFilter: string;
  localSectorFilter: string;
  localRegionFilter: string;
  localSort: ProjectBrowserLocalSort;
}

interface ProjectBrowserState extends PersistedProjectBrowserState {
  setLastOpenedTab: (tab: ProjectBrowserTab) => void;
  setLocalSearch: (value: string) => void;
  setLocalSourceFilter: (value: LocalProjectSourceFilter) => void;
  setLocalProjectTypeFilter: (value: string) => void;
  setLocalSectorFilter: (value: string) => void;
  setLocalRegionFilter: (value: string) => void;
  setLocalSort: (value: ProjectBrowserLocalSort) => void;
  resetLocalFilters: () => void;
  togglePinnedProject: (projectId: string) => void;
  markProjectOpened: (projectId: string) => void;
}

export const PROJECT_BROWSER_STORAGE_KEY = 'schedulesync.project-browser';

const MAX_RECENT_PROJECTS = 12;

const defaultPersistedState: PersistedProjectBrowserState = {
  pinnedProjectIds: [],
  recentProjectIds: [],
  lastOpenedTab: 'local',
  localSearch: '',
  localSourceFilter: 'all',
  localProjectTypeFilter: '',
  localSectorFilter: '',
  localRegionFilter: '',
  localSort: {
    field: 'updatedAt',
    direction: 'desc',
  },
};

export const useProjectBrowserStore = create<ProjectBrowserState>()(
  persist(
    (set) => ({
      ...defaultPersistedState,
      setLastOpenedTab: (lastOpenedTab) => set({ lastOpenedTab }),
      setLocalSearch: (localSearch) => set({ localSearch }),
      setLocalSourceFilter: (localSourceFilter) => set({ localSourceFilter }),
      setLocalProjectTypeFilter: (localProjectTypeFilter) =>
        set({ localProjectTypeFilter }),
      setLocalSectorFilter: (localSectorFilter) => set({ localSectorFilter }),
      setLocalRegionFilter: (localRegionFilter) => set({ localRegionFilter }),
      setLocalSort: (localSort) => set({ localSort }),
      resetLocalFilters: () =>
        set({
          localSearch: '',
          localSourceFilter: 'all',
          localProjectTypeFilter: '',
          localSectorFilter: '',
          localRegionFilter: '',
        }),
      togglePinnedProject: (projectId) =>
        set((state) => {
          const pinnedProjectIds = state.pinnedProjectIds.includes(projectId)
            ? state.pinnedProjectIds.filter((candidate) => candidate !== projectId)
            : [projectId, ...state.pinnedProjectIds.filter((candidate) => candidate !== projectId)];

          return { pinnedProjectIds };
        }),
      markProjectOpened: (projectId) =>
        set((state) => ({
          recentProjectIds: [
            projectId,
            ...state.recentProjectIds.filter((candidate) => candidate !== projectId),
          ].slice(0, MAX_RECENT_PROJECTS),
        })),
    }),
    {
      name: PROJECT_BROWSER_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pinnedProjectIds: state.pinnedProjectIds,
        recentProjectIds: state.recentProjectIds,
        lastOpenedTab: state.lastOpenedTab,
        localSearch: state.localSearch,
        localSourceFilter: state.localSourceFilter,
        localProjectTypeFilter: state.localProjectTypeFilter,
        localSectorFilter: state.localSectorFilter,
        localRegionFilter: state.localRegionFilter,
        localSort: state.localSort,
      }),
    },
  ),
);

export function resetProjectBrowserStoreForTesting(): void {
  useProjectBrowserStore.setState(defaultPersistedState);
  window.localStorage.removeItem(PROJECT_BROWSER_STORAGE_KEY);
}

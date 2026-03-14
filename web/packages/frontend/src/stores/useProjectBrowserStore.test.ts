import { beforeEach, describe, expect, it } from 'vitest';
import {
  resetProjectBrowserStoreForTesting,
  useProjectBrowserStore,
} from './useProjectBrowserStore';

describe('useProjectBrowserStore', () => {
  beforeEach(() => {
    resetProjectBrowserStoreForTesting();
  });

  it('toggles pinned projects and preserves newest pins first', () => {
    useProjectBrowserStore.getState().togglePinnedProject('project-a');
    useProjectBrowserStore.getState().togglePinnedProject('project-b');

    expect(useProjectBrowserStore.getState().pinnedProjectIds).toEqual([
      'project-b',
      'project-a',
    ]);

    useProjectBrowserStore.getState().togglePinnedProject('project-a');
    expect(useProjectBrowserStore.getState().pinnedProjectIds).toEqual(['project-b']);
  });

  it('tracks recent projects in most-recent-first order', () => {
    useProjectBrowserStore.getState().markProjectOpened('project-a');
    useProjectBrowserStore.getState().markProjectOpened('project-b');
    useProjectBrowserStore.getState().markProjectOpened('project-a');

    expect(useProjectBrowserStore.getState().recentProjectIds).toEqual([
      'project-a',
      'project-b',
    ]);
  });
});

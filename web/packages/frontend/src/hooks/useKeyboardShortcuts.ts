/**
 * useKeyboardShortcuts - global keyboard shortcut handler for core task actions.
 */

import { useCallback, useEffect } from 'react';
import { useProjectStore, useUIStore } from '../stores';

export function useKeyboardShortcuts() {
  const createTask = useProjectStore((state) => state.createTask);
  const batchUpdateTasks = useProjectStore((state) => state.batchUpdateTasks);
  const selectedTaskIds = useProjectStore((state) => state.selectedTaskIds);
  const tasks = useProjectStore((state) => state.tasks);
  const openDialogWith = useUIStore((state) => state.openDialogWith);
  const openDeleteConfirm = useUIStore((state) => state.openDeleteConfirm);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const tagName = (event.target as HTMLElement)?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return;
      }
      if ((event.target as HTMLElement)?.isContentEditable) {
        return;
      }

      const ctrl = event.ctrlKey || event.metaKey;
      const shift = event.shiftKey;
      const ids = Array.from(selectedTaskIds);

      if (event.key === 'Delete' && ids.length > 0) {
        event.preventDefault();
        const selectedTasks = ids
          .map((id) => tasks.find((task) => task.id === id))
          .filter((task): task is (typeof tasks)[number] => Boolean(task));
        if (selectedTasks.length > 0) {
          openDeleteConfirm({
            kind: 'tasks',
            tasks: selectedTasks.map((task) => ({
              id: task.id,
              name: task.name,
              hasStratusSync: Boolean(task.stratusSync),
            })),
          });
        }
        return;
      }

      if (event.key === 'Insert') {
        event.preventDefault();
        void createTask({ name: 'New Task' });
        return;
      }

      if (event.key === 'Enter' && !ctrl && ids.length === 1) {
        event.preventDefault();
        const task = tasks.find((candidate) => candidate.id === ids[0]);
        if (task) {
          openDialogWith('taskInfo', task);
        }
        return;
      }

      if (ctrl && !shift && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        const updates = ids.flatMap((id) => {
          const task = tasks.find((candidate) => candidate.id === id);
          return task ? [{ id, data: { outlineLevel: task.outlineLevel + 1 } }] : [];
        });
        if (updates.length > 0) {
          void batchUpdateTasks(updates);
        }
        return;
      }

      if (ctrl && shift && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        const updates = ids.flatMap((id) => {
          const task = tasks.find((candidate) => candidate.id === id);
          if (task && task.outlineLevel > 0) {
            return [{ id, data: { outlineLevel: task.outlineLevel - 1 } }];
          }
          return [];
        });
        if (updates.length > 0) {
          void batchUpdateTasks(updates);
        }
      }
    },
    [batchUpdateTasks, createTask, openDeleteConfirm, openDialogWith, selectedTaskIds, tasks],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

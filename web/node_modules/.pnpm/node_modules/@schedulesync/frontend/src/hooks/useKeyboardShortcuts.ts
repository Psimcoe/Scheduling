/**
 * useKeyboardShortcuts — global keyboard shortcut handler.
 *
 * Handles Delete, Ctrl+Z (undo), Ctrl+Y (redo), Ctrl+I (indent),
 * Ctrl+Shift+I (outdent), Insert (new task).
 */

import { useEffect, useCallback } from 'react';
import { useProjectStore, useUIStore } from '../stores';

export function useKeyboardShortcuts() {
  const deleteTask = useProjectStore((s) => s.deleteTask);
  const createTask = useProjectStore((s) => s.createTask);
  const updateTask = useProjectStore((s) => s.updateTask);
  const selectedTaskIds = useProjectStore((s) => s.selectedTaskIds);
  const tasks = useProjectStore((s) => s.tasks);
  const openDialogWith = useUIStore((s) => s.openDialogWith);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const ids = Array.from(selectedTaskIds);

      // Delete — remove selected task(s)
      if (e.key === 'Delete' && ids.length > 0) {
        e.preventDefault();
        ids.forEach((id) => deleteTask(id));
        return;
      }

      // Insert — add new task
      if (e.key === 'Insert') {
        e.preventDefault();
        createTask({ name: 'New Task' });
        return;
      }

      // Enter — open task info for single selected task
      if (e.key === 'Enter' && !ctrl && ids.length === 1) {
        e.preventDefault();
        const task = tasks.find((t) => t.id === ids[0]);
        if (task) openDialogWith('taskInfo', task);
        return;
      }

      // Ctrl+I — indent
      if (ctrl && !shift && e.key === 'i') {
        e.preventDefault();
        ids.forEach((id) => {
          const task = tasks.find((t) => t.id === id);
          if (task) updateTask(id, { outlineLevel: task.outlineLevel + 1 });
        });
        return;
      }

      // Ctrl+Shift+I — outdent
      if (ctrl && shift && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
        ids.forEach((id) => {
          const task = tasks.find((t) => t.id === id);
          if (task && task.outlineLevel > 0) {
            updateTask(id, { outlineLevel: task.outlineLevel - 1 });
          }
        });
        return;
      }
    },
    [selectedTaskIds, tasks, deleteTask, createTask, updateTask, openDialogWith],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

import React, { Suspense, lazy } from 'react';
import { useUIStore, type DialogType } from '../../stores';

const dialogComponents: Partial<Record<DialogType, React.LazyExoticComponent<React.ComponentType>>> = {
  deleteConfirm: lazy(() => import('./DeleteConfirmationDialog')),
  projectInfo: lazy(() => import('./ProjectInfoDialog')),
  taskInfo: lazy(() => import('./TaskInfoDialog')),
  calendar: lazy(() => import('./CalendarDialog')),
  baselineCapture: lazy(() => import('./BaselineCaptureDialog')),
  importPreview: lazy(() => import('./ImportPreviewDialog')),
  filter: lazy(() => import('./FilterDialog')),
  sort: lazy(() => import('./SortDialog')),
  groupBy: lazy(() => import('./GroupByDialog')),
  customFields: lazy(() => import('./CustomFieldsDialog')),
  undoHistory: lazy(() => import('./UndoHistoryDialog')),
  newProject: lazy(() => import('./NewProjectDialog')),
  projectBrowser: lazy(() => import('./ProjectBrowserDialog')),
  columnChooser: lazy(() => import('./ColumnChooserDialog')),
  barStyles: lazy(() => import('./BarStylesDialog')),
  findReplace: lazy(() => import('./FindReplaceDialog')),
  printPreview: lazy(() => import('./PrintPreviewDialog')),
  projectStatistics: lazy(() => import('./ProjectStatisticsDialog')),
  resourceInfo: lazy(() => import('./ResourceInfoDialog')),
  bulkImport: lazy(() => import('./BulkImportDialog')),
  leveling: lazy(() => import('./LevelingDialog')),
  aiSettings: lazy(() => import('./AiSettingsDialog')),
  recurringTask: lazy(() => import('./RecurringTaskDialog')),
  stratusSettings: lazy(() => import('./StratusSettingsDialog')),
  stratusProjectImport: lazy(() => import('./ProjectBrowserDialog')),
  stratusPullPreview: lazy(() => import('./StratusPullPreviewDialog')),
  stratusRefreshFromPrefabPreview: lazy(() => import('./StratusRefreshFromPrefabPreviewDialog')),
  stratusSyncToPrefabPreview: lazy(() => import('./StratusSyncToPrefabPreviewDialog')),
  stratusPushPreview: lazy(() => import('./StratusPushPreviewDialog')),
};

const DialogHost: React.FC = () => {
  const openDialog = useUIStore((state) => state.openDialog);
  const ActiveDialog = openDialog === 'none' ? null : dialogComponents[openDialog];

  if (!ActiveDialog) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <ActiveDialog />
    </Suspense>
  );
};

export default DialogHost;

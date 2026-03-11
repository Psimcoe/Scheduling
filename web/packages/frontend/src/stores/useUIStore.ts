/**
 * UI store — manages view state (zoom, scroll, dialogs, sidebar, etc.)
 */

import { create } from 'zustand';

export type GanttZoom = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type ViewType =
  | 'gantt'
  | 'networkDiagram'
  | 'resourceSheet'
  | 'resourceUsage'
  | 'taskUsage'
  | 'calendar'
  | 'trackingGantt'
  | 'reporting'
  | 'taskSheet'
  | 'resourceGraph'
  | 'teamPlanner'
  | 'timeline';

export type RibbonTab = 'task' | 'resource' | 'project' | 'view' | 'format';

export type DialogType =
  | 'none'
  | 'projectInfo'
  | 'taskInfo'
  | 'calendar'
  | 'resource'
  | 'baselineCapture'
  | 'importPreview'
  | 'importMspdi'
  | 'filter'
  | 'sort'
  | 'groupBy'
  | 'customFields'
  | 'undoHistory'
  | 'newProject'
  | 'columnChooser'
  | 'barStyles'
  | 'findReplace'
  | 'printPreview'
  | 'projectStatistics'
  | 'resourceInfo'
  | 'bulkImport'
  | 'leveling'
  | 'aiSettings'
  | 'recurringTask'
  | 'stratusSettings'
  | 'stratusProjectImport'
  | 'stratusPullPreview'
  | 'stratusPushPreview';

export interface SortCriteria {
  field: string;
  direction: 'asc' | 'desc';
}

export interface FilterCriteria {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'between';
  value: unknown;
  value2?: unknown; // for 'between'
}

export interface GroupByOption {
  field: string;
  direction: 'asc' | 'desc';
}

export type TaskColumnId =
  | 'rowNum' | 'name' | 'duration' | 'start' | 'finish' | 'percentComplete'
  | 'cost' | 'fixedCost' | 'actualCost' | 'remainingCost'
  | 'work' | 'actualWork' | 'remainingWork'
  | 'bcws' | 'bcwp' | 'acwp'
  | 'totalSlack' | 'freeSlack' | 'deadline' | 'constraintType'
  | 'wbsCode' | 'resourceNames' | 'predecessors';

export interface ColumnDef {
  id: TaskColumnId;
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  visible: boolean;
}

export interface BarStyleEntry {
  id: string;
  name: string;
  showFor: string;
  barColor: string;
  barShape: string;
  barPattern: string;
  startShape: string;
  endShape: string;
  progressColor: string;
}

/** Shared row height between grid and Gantt (px). */
export const ROW_HEIGHT = 28;

export const DEFAULT_BAR_STYLES: BarStyleEntry[] = [
  { id: '1', name: 'Normal', showFor: 'task', barColor: '#4694E4', barShape: 'bar', barPattern: 'solid', startShape: 'none', endShape: 'none', progressColor: '#005A9E' },
  { id: '2', name: 'Critical', showFor: 'critical', barColor: '#D32F2F', barShape: 'bar', barPattern: 'solid', startShape: 'none', endShape: 'none', progressColor: '#B71C1C' },
  { id: '3', name: 'Milestone', showFor: 'milestone', barColor: '#333333', barShape: 'diamond', barPattern: 'solid', startShape: 'none', endShape: 'none', progressColor: '#333333' },
  { id: '4', name: 'Summary', showFor: 'summary', barColor: '#333333', barShape: 'bar', barPattern: 'solid', startShape: 'bracket', endShape: 'bracket', progressColor: '#444444' },
  { id: '5', name: 'Progress', showFor: 'progress', barColor: '#1B6B3A', barShape: 'bar', barPattern: 'solid', startShape: 'none', endShape: 'none', progressColor: '#1B6B3A' },
];

export const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: 'rowNum', label: '#', width: 40, align: 'center', visible: true },
  { id: 'name', label: 'Task Name', width: 240, visible: true },
  { id: 'duration', label: 'Duration', width: 80, align: 'right', visible: true },
  { id: 'start', label: 'Start', width: 100, visible: true },
  { id: 'finish', label: 'Finish', width: 100, visible: true },
  { id: 'percentComplete', label: '% Done', width: 60, align: 'right', visible: true },
  { id: 'predecessors', label: 'Predecessors', width: 120, visible: false },
  { id: 'resourceNames', label: 'Resource Names', width: 140, visible: false },
  { id: 'cost', label: 'Cost', width: 90, align: 'right', visible: false },
  { id: 'fixedCost', label: 'Fixed Cost', width: 90, align: 'right', visible: false },
  { id: 'actualCost', label: 'Actual Cost', width: 90, align: 'right', visible: false },
  { id: 'remainingCost', label: 'Remaining Cost', width: 100, align: 'right', visible: false },
  { id: 'work', label: 'Work', width: 80, align: 'right', visible: false },
  { id: 'actualWork', label: 'Actual Work', width: 90, align: 'right', visible: false },
  { id: 'remainingWork', label: 'Remaining Work', width: 100, align: 'right', visible: false },
  { id: 'bcws', label: 'BCWS', width: 80, align: 'right', visible: false },
  { id: 'bcwp', label: 'BCWP', width: 80, align: 'right', visible: false },
  { id: 'acwp', label: 'ACWP', width: 80, align: 'right', visible: false },
  { id: 'totalSlack', label: 'Total Slack', width: 80, align: 'right', visible: false },
  { id: 'freeSlack', label: 'Free Slack', width: 80, align: 'right', visible: false },
  { id: 'deadline', label: 'Deadline', width: 100, visible: false },
  { id: 'constraintType', label: 'Constraint', width: 100, visible: false },
  { id: 'wbsCode', label: 'WBS', width: 80, visible: false },
];

interface UIState {
  // View
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;

  // Ribbon
  activeRibbonTab: RibbonTab;
  setActiveRibbonTab: (tab: RibbonTab) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Gantt
  ganttZoom: GanttZoom;
  setGanttZoom: (zoom: GanttZoom) => void;
  ganttScrollDate: string | null;
  scrollGanttTo: (date: string) => void;
  showBaseline: number | null; // baseline index to overlay
  setShowBaseline: (index: number | null) => void;

  // Grid
  gridSplitPercent: number;
  setGridSplitPercent: (pct: number) => void;
  showCriticalPath: boolean;
  toggleCriticalPath: () => void;

  // Collapse state (shared between grid & gantt)
  collapsedIds: Set<string>;
  toggleCollapsed: (taskId: string) => void;

  // Dialogs
  openDialog: DialogType;
  dialogPayload: unknown;
  openDialogWith: (type: DialogType, payload?: unknown) => void;
  closeDialog: () => void;

  // Filtering, sorting & grouping
  filters: FilterCriteria[];
  setFilters: (filters: FilterCriteria[]) => void;
  sortCriteria: SortCriteria[];
  setSortCriteria: (sorts: SortCriteria[]) => void;
  groupBy: GroupByOption | null;
  setGroupBy: (group: GroupByOption | null) => void;

  // Snackbar
  snackbar: { message: string; severity: 'success' | 'info' | 'warning' | 'error' } | null;
  showSnackbar: (
    message: string,
    severity?: 'success' | 'info' | 'warning' | 'error',
  ) => void;
  clearSnackbar: () => void;

  // Columns
  columns: ColumnDef[];
  setColumns: (cols: ColumnDef[]) => void;
  toggleColumn: (id: TaskColumnId) => void;

  // Bar styles
  barStyles: BarStyleEntry[];
  setBarStyles: (styles: BarStyleEntry[]) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'gantt',
  setActiveView: (view) => set({ activeView: view }),

  activeRibbonTab: 'task',
  setActiveRibbonTab: (tab) => set({ activeRibbonTab: tab }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  ganttZoom: 'week',
  setGanttZoom: (zoom) => set({ ganttZoom: zoom }),
  ganttScrollDate: null,
  scrollGanttTo: (date) => set({ ganttScrollDate: date }),
  showBaseline: null,
  setShowBaseline: (index) => set({ showBaseline: index }),

  gridSplitPercent: 50,
  setGridSplitPercent: (pct) => set({ gridSplitPercent: pct }),
  showCriticalPath: false,
  toggleCriticalPath: () =>
    set((s) => ({ showCriticalPath: !s.showCriticalPath })),

  collapsedIds: new Set<string>(),
  toggleCollapsed: (taskId) =>
    set((s) => {
      const next = new Set(s.collapsedIds);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return { collapsedIds: next };
    }),

  openDialog: 'none',
  dialogPayload: null,
  openDialogWith: (type, payload) =>
    set({ openDialog: type, dialogPayload: payload ?? null }),
  closeDialog: () => set({ openDialog: 'none', dialogPayload: null }),

  filters: [],
  setFilters: (filters) => set({ filters }),
  sortCriteria: [],
  setSortCriteria: (sortCriteria) => set({ sortCriteria }),
  groupBy: null,
  setGroupBy: (group) => set({ groupBy: group }),

  snackbar: null,
  showSnackbar: (message, severity = 'info') =>
    set({ snackbar: { message, severity } }),
  clearSnackbar: () => set({ snackbar: null }),

  columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
  setColumns: (cols) => set({ columns: cols }),
  toggleColumn: (id) =>
    set((s) => ({
      columns: s.columns.map((c) =>
        c.id === id ? { ...c, visible: !c.visible } : c,
      ),
    })),

  barStyles: DEFAULT_BAR_STYLES.map((s) => ({ ...s })),
  setBarStyles: (styles) => set({ barStyles: styles }),
}));

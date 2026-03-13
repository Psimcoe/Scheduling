import type { SnapshotDetailLevel } from '../api';
import type {
  DialogType,
  FilterCriteria,
  GroupByOption,
  SortCriteria,
  TaskColumnId,
  ViewType,
} from '../stores/useUIStore';

const DETAIL_COLUMN_IDS = new Set<TaskColumnId>([
  'cost',
  'fixedCost',
  'actualCost',
  'remainingCost',
  'work',
  'actualWork',
  'remainingWork',
  'bcws',
  'bcwp',
  'acwp',
]);

const DETAIL_FIELD_IDS = new Set<string>([
  'notes',
  ...DETAIL_COLUMN_IDS,
]);

function hasDetailFilter(filters: FilterCriteria[]): boolean {
  return filters.some((filter) => DETAIL_FIELD_IDS.has(filter.field));
}

function hasDetailSort(sortCriteria: SortCriteria[]): boolean {
  return sortCriteria.some((sort) => DETAIL_FIELD_IDS.has(sort.field));
}

function hasDetailGrouping(groupBy: GroupByOption | null): boolean {
  return groupBy !== null && DETAIL_FIELD_IDS.has(groupBy.field);
}

export function resolveSnapshotDetailLevel(options: {
  activeView: ViewType;
  openDialog: DialogType;
  visibleColumns: TaskColumnId[];
  filters: FilterCriteria[];
  sortCriteria: SortCriteria[];
  groupBy: GroupByOption | null;
}): SnapshotDetailLevel {
  if (options.activeView === 'reporting') {
    return 'full';
  }

  if (options.openDialog === 'findReplace') {
    return 'full';
  }

  if (options.visibleColumns.some((columnId) => DETAIL_COLUMN_IDS.has(columnId))) {
    return 'full';
  }

  if (hasDetailFilter(options.filters) || hasDetailSort(options.sortCriteria)) {
    return 'full';
  }

  if (hasDetailGrouping(options.groupBy)) {
    return 'full';
  }

  return 'shell';
}

import type {
  ProjectSummaryResponse,
  StratusProjectImportApplyResponse,
  StratusProjectImportPreviewRow,
} from '../api/client';
import type {
  LocalProjectSourceFilter,
  ProjectBrowserLocalSort,
} from '../stores/useProjectBrowserStore';

export type LocalProjectSource = 'manual' | 'stratus-linked';

export interface LocalProjectBrowserRow extends ProjectSummaryResponse {
  source: LocalProjectSource;
}

interface LocalProjectFilterOptions {
  search: string;
  sourceFilter: LocalProjectSourceFilter;
  projectTypeFilter: string;
  sectorFilter: string;
  regionFilter: string;
}

interface QuickAccessProjects {
  pinned: LocalProjectBrowserRow[];
  recent: LocalProjectBrowserRow[];
  fallback: LocalProjectBrowserRow[];
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const stratusActionPriority: Record<StratusProjectImportPreviewRow['action'], number> = {
  create: 0,
  update: 1,
  skip: 2,
  exclude: 3,
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function formatComparableProjectLabel(project: Pick<ProjectSummaryResponse, 'name'>): string {
  return project.name.trim();
}

function compareNullableStrings(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftValue = left?.trim() ?? '';
  const rightValue = right?.trim() ?? '';
  return collator.compare(leftValue, rightValue);
}

function compareNullableDates(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }

  return left.localeCompare(right);
}

export function classifyProjectSource(
  project: Pick<ProjectSummaryResponse, 'stratusProjectId' | 'stratusModelId'>,
): LocalProjectSource {
  return project.stratusProjectId || project.stratusModelId
    ? 'stratus-linked'
    : 'manual';
}

export function buildLocalProjectBrowserRows(
  projects: ProjectSummaryResponse[],
): LocalProjectBrowserRow[] {
  return projects.map((project) => ({
    ...project,
    source: classifyProjectSource(project),
  }));
}

export function filterLocalProjectRows(
  rows: LocalProjectBrowserRow[],
  filters: LocalProjectFilterOptions,
): LocalProjectBrowserRow[] {
  const search = normalizeText(filters.search);

  return rows.filter((row) => {
    if (filters.sourceFilter !== 'all' && row.source !== filters.sourceFilter) {
      return false;
    }
    if (
      filters.projectTypeFilter &&
      (row.projectType ?? '') !== filters.projectTypeFilter
    ) {
      return false;
    }
    if (filters.sectorFilter && (row.sector ?? '') !== filters.sectorFilter) {
      return false;
    }
    if (filters.regionFilter && (row.region ?? '') !== filters.regionFilter) {
      return false;
    }
    if (!search) {
      return true;
    }

    return [
      row.name,
      row.stratusProjectId,
      row.stratusModelId,
      row.projectType,
      row.sector,
      row.region,
    ].some((value) => normalizeText(value).includes(search));
  });
}

export function sortLocalProjectRows(
  rows: LocalProjectBrowserRow[],
  sort: ProjectBrowserLocalSort,
): LocalProjectBrowserRow[] {
  const direction = sort.direction === 'asc' ? 1 : -1;

  return [...rows].sort((left, right) => {
    let comparison = 0;

    switch (sort.field) {
      case 'name':
        comparison = collator.compare(
          formatComparableProjectLabel(left),
          formatComparableProjectLabel(right),
        );
        break;
      case 'source':
        comparison = compareNullableStrings(left.source, right.source);
        break;
      case 'projectType':
        comparison = compareNullableStrings(left.projectType, right.projectType);
        break;
      case 'sector':
        comparison = compareNullableStrings(left.sector, right.sector);
        break;
      case 'region':
        comparison = compareNullableStrings(left.region, right.region);
        break;
      case 'startDate':
        comparison = compareNullableDates(left.startDate, right.startDate);
        break;
      case 'finishDate':
        comparison = compareNullableDates(left.finishDate, right.finishDate);
        break;
      case 'stratusLastPullAt':
        comparison = compareNullableDates(left.stratusLastPullAt, right.stratusLastPullAt);
        break;
      case 'stratusLastPushAt':
        comparison = compareNullableDates(left.stratusLastPushAt, right.stratusLastPushAt);
        break;
      case 'updatedAt':
      default:
        comparison = compareNullableDates(left.updatedAt, right.updatedAt);
        break;
    }

    if (comparison !== 0) {
      return comparison * direction;
    }

    return collator.compare(left.name, right.name);
  });
}

export function deriveFacetOptions(
  rows: LocalProjectBrowserRow[],
  field: 'projectType' | 'sector' | 'region',
): string[] {
  return [...new Set(rows.map((row) => row[field]).filter(Boolean))]
    .map((value) => value!.trim())
    .sort(collator.compare);
}

export function buildQuickAccessProjects(
  projects: ProjectSummaryResponse[],
  pinnedProjectIds: readonly string[],
  recentProjectIds: readonly string[],
): QuickAccessProjects {
  const projectRows = buildLocalProjectBrowserRows(projects);
  const projectById = new Map(projectRows.map((project) => [project.id, project]));
  const pinned = pinnedProjectIds
    .map((projectId) => projectById.get(projectId) ?? null)
    .filter((project): project is LocalProjectBrowserRow => Boolean(project));
  const pinnedIds = new Set(pinned.map((project) => project.id));
  const recent = recentProjectIds
    .filter((projectId) => !pinnedIds.has(projectId))
    .map((projectId) => projectById.get(projectId) ?? null)
    .filter((project): project is LocalProjectBrowserRow => Boolean(project));

  return {
    pinned,
    recent,
    fallback:
      pinned.length === 0 && recent.length === 0
        ? sortLocalProjectRows(projectRows, {
            field: 'updatedAt',
            direction: 'desc',
          }).slice(0, 12)
        : [],
  };
}

export function filterStratusProjectPreviewRows(
  rows: StratusProjectImportPreviewRow[],
  search: string,
  actionFilter: 'all' | StratusProjectImportPreviewRow['action'],
  warningsOnly: boolean,
): StratusProjectImportPreviewRow[] {
  const normalizedSearch = normalizeText(search);

  return rows.filter((row) => {
    if (actionFilter !== 'all' && row.action !== actionFilter) {
      return false;
    }
    if (warningsOnly && row.warnings.length === 0) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }

    return [
      row.projectNumber,
      row.projectName,
      row.localProjectName,
      row.stratusProjectId,
    ].some((value) => normalizeText(value).includes(normalizedSearch));
  });
}

export function sortStratusProjectPreviewRows(
  rows: StratusProjectImportPreviewRow[],
): StratusProjectImportPreviewRow[] {
  return [...rows].sort((left, right) => {
    const priorityComparison =
      stratusActionPriority[left.action] - stratusActionPriority[right.action];
    if (priorityComparison !== 0) {
      return priorityComparison;
    }

    const projectLabelComparison = compareNullableStrings(
      left.projectNumber || left.projectName || left.stratusProjectId,
      right.projectNumber || right.projectName || right.stratusProjectId,
    );
    if (projectLabelComparison !== 0) {
      return projectLabelComparison;
    }

    return compareNullableStrings(left.projectName, right.projectName);
  });
}

export function selectImportedProjectId(
  result: StratusProjectImportApplyResponse | null,
): string | null {
  if (!result) {
    return null;
  }

  return (
    result.rows.find(
      (row) =>
        (row.action === 'created' || row.action === 'updated') &&
        typeof row.localProjectId === 'string',
    )?.localProjectId ?? null
  );
}

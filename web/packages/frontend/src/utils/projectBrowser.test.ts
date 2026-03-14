import { describe, expect, it } from 'vitest';
import type {
  ProjectSummaryResponse,
  StratusProjectImportApplyResponse,
  StratusProjectImportPreviewRow,
} from '../api/client';
import {
  buildQuickAccessProjects,
  filterLocalProjectRows,
  filterStratusProjectPreviewRows,
  selectImportedProjectId,
  sortLocalProjectRows,
  sortStratusProjectPreviewRows,
} from './projectBrowser';
import type { LocalProjectBrowserRow } from './projectBrowser';

function createProject(overrides: Partial<ProjectSummaryResponse>): ProjectSummaryResponse {
  return {
    id: 'project-1',
    name: 'Alpha Project',
    revision: 1,
    startDate: '2026-03-01T00:00:00.000Z',
    finishDate: null,
    projectType: null,
    sector: null,
    region: null,
    stratusProjectId: null,
    stratusModelId: null,
    stratusPackageWhere: null,
    stratusLastPullAt: null,
    stratusLastPushAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function createPreviewRow(
  overrides: Partial<StratusProjectImportPreviewRow>,
): StratusProjectImportPreviewRow {
  return {
    action: 'skip',
    stratusProjectId: 'stratus-1',
    projectNumber: '1001',
    projectName: 'Alpha Project',
    localProjectId: null,
    localProjectName: null,
    warnings: [],
    mappedProject: {
      name: 'Alpha Project',
      startDate: '2026-03-01T00:00:00.000Z',
      finishDate: null,
      projectType: null,
      sector: null,
      region: null,
    },
    ...overrides,
  };
}

describe('projectBrowser utilities', () => {
  it('filters and sorts local rows across search and facets', () => {
    const rows: LocalProjectBrowserRow[] = [
      createProject({
        id: 'manual-1',
        name: 'Manual Tower',
        projectType: 'Tower',
        sector: 'Residential',
        region: 'East',
        updatedAt: '2026-03-02T00:00:00.000Z',
      }),
      createProject({
        id: 'linked-1',
        name: 'Stratus Hospital',
        projectType: 'Healthcare',
        sector: 'Medical',
        region: 'West',
        stratusProjectId: 'stratus-77',
        updatedAt: '2026-03-04T00:00:00.000Z',
      }),
    ].map((project) => ({
      ...project,
      source: project.stratusProjectId ? 'stratus-linked' : 'manual',
    }));

    const filtered = filterLocalProjectRows(rows, {
      search: 'hospital',
      sourceFilter: 'stratus-linked',
      projectTypeFilter: 'Healthcare',
      sectorFilter: 'Medical',
      regionFilter: 'West',
    });
    const sorted = sortLocalProjectRows(filtered, {
      field: 'updatedAt',
      direction: 'desc',
    });

    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.id).toBe('linked-1');
  });

  it('builds pinned, recent, and fallback quick-access groups', () => {
    const projects = [
      createProject({ id: 'a', name: 'A', updatedAt: '2026-03-01T00:00:00.000Z' }),
      createProject({ id: 'b', name: 'B', updatedAt: '2026-03-03T00:00:00.000Z' }),
      createProject({ id: 'c', name: 'C', updatedAt: '2026-03-02T00:00:00.000Z' }),
    ];

    const withPins = buildQuickAccessProjects(projects, ['c'], ['b', 'a']);
    expect(withPins.pinned.map((project) => project.id)).toEqual(['c']);
    expect(withPins.recent.map((project) => project.id)).toEqual(['b', 'a']);
    expect(withPins.fallback).toHaveLength(0);

    const fallbackOnly = buildQuickAccessProjects(projects, [], []);
    expect(fallbackOnly.fallback.map((project) => project.id)).toEqual(['b', 'c', 'a']);
  });

  it('filters and sorts Stratus preview rows by action and warnings', () => {
    const rows = [
      createPreviewRow({
        action: 'skip',
        stratusProjectId: 's-skip',
        projectNumber: '1003',
      }),
      createPreviewRow({
        action: 'create',
        stratusProjectId: 's-create',
        projectNumber: '1001',
        warnings: ['Missing region'],
      }),
      createPreviewRow({
        action: 'update',
        stratusProjectId: 's-update',
        projectNumber: '1002',
        localProjectName: 'Existing local',
      }),
    ];

    const filtered = filterStratusProjectPreviewRows(rows, '100', 'all', false);
    expect(sortStratusProjectPreviewRows(filtered).map((row) => row.stratusProjectId)).toEqual([
      's-create',
      's-update',
      's-skip',
    ]);

    const warningsOnly = filterStratusProjectPreviewRows(rows, '', 'all', true);
    expect(warningsOnly.map((row) => row.stratusProjectId)).toEqual(['s-create']);
  });

  it('selects the first created or updated local project after import', () => {
    const result: StratusProjectImportApplyResponse = {
      rows: [
        {
          action: 'skipped',
          stratusProjectId: 'skip-1',
          projectNumber: '1001',
          projectName: 'Skip',
          localProjectId: null,
          localProjectName: null,
          message: null,
        },
        {
          action: 'created',
          stratusProjectId: 'create-1',
          projectNumber: '1002',
          projectName: 'Create',
          localProjectId: 'local-22',
          localProjectName: 'Created Local',
          message: null,
        },
      ],
      sourceInfo: {
        source: 'stratusApi',
        fallbackUsed: false,
        message: null,
        warnings: [],
        freshness: null,
        trackingStart: null,
        packageReportName: null,
        assemblyReportName: null,
        isFullRebuild: false,
      },
      summary: {
        processed: 2,
        created: 1,
        updated: 0,
        skipped: 1,
        excluded: 0,
        failed: 0,
      },
      meta: {
        skippedUnchangedPackages: 0,
        undefinedPackageCount: 0,
        orphanAssemblyCount: 0,
        durationMs: 100,
      },
    };

    expect(selectImportedProjectId(result)).toBe('local-22');
  });
});

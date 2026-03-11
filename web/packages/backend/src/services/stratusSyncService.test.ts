import { describe, expect, it } from 'vitest';
import {
  buildProjectImportPreviewRows,
  buildPullPreviewRows,
  buildPushPreviewRows,
} from './stratusSyncService.js';

describe('stratusSyncService', () => {
  it('marks active Stratus projects for create, update, or skip', () => {
    const rows = buildProjectImportPreviewRows(
      [
        {
          id: 'stratus-1',
          number: '1001',
          name: 'Warehouse Expansion',
          status: 'Active',
          category: 'Industrial',
          phase: 'Prefab',
          description: null,
          city: 'Boston',
          state: 'MA',
          startDate: '2026-03-01T00:00:00.000Z',
          finishDate: '2026-04-01T00:00:00.000Z',
          rawProject: {},
        },
        {
          id: 'stratus-2',
          number: '1002',
          name: 'Hospital Tower',
          status: 'Active',
          category: 'Healthcare',
          phase: 'Field',
          description: null,
          city: 'Chicago',
          state: 'IL',
          startDate: '2026-05-01T00:00:00.000Z',
          finishDate: '2026-07-01T00:00:00.000Z',
          rawProject: {},
        },
      ],
      [
        {
          id: 'local-1',
          name: '1001 - Warehouse Expansion',
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          finishDate: new Date('2026-04-01T00:00:00.000Z'),
          minutesPerDay: 480,
          projectType: 'Industrial',
          sector: 'Prefab',
          region: 'Boston, MA',
          stratusProjectId: 'stratus-1',
        },
        {
          id: 'local-2',
          name: 'Old Name',
          startDate: new Date('2026-05-01T00:00:00.000Z'),
          finishDate: new Date('2026-06-01T00:00:00.000Z'),
          minutesPerDay: 480,
          projectType: 'Healthcare',
          sector: 'Field',
          region: 'Chicago, IL',
          stratusProjectId: 'stratus-2',
        },
      ],
    );

    expect(rows[0]?.action).toBe('skip');
    expect(rows[1]?.action).toBe('update');
    expect(rows[1]?.mappedProject.name).toBe('1002 - Hospital Tower');
  });

  it('skips package pull rows when external key matching is ambiguous and groups assemblies under packages', () => {
    const rows = buildPullPreviewRows(
      [
        {
          package: {
            id: 'pkg-1',
            projectId: 'stratus-project',
            modelId: 'model-1',
            packageNumber: 'PKG-1',
            packageName: 'Package 1',
            trackingStatusId: 'track-1',
            trackingStatusName: 'Ready to Ship',
            externalKey: '1001-PKG-1',
            normalizedFields: {
              'STRATUS.Field.Project Name Override': 'Package 1',
              'STRATUS.Package.Description': 'Desc',
              'STRATUS.Package.Notes': 'Notes',
              'STRATUS.Package.TrackingStatus': 'Ready to Ship',
              'STRATUS.Package.Status': 'Ready to Ship',
              'Work Days (Reference)': '2',
              'STRATUS.Field.SMC_Package Start Date': '2026-03-01T00:00:00.000Z',
              'STRATUS.Field.SMC_Package Estimated Finish Date': '2026-03-03T00:00:00.000Z',
              'STRATUS.Package.RequiredDT': '2026-03-04T00:00:00.000Z',
            },
            rawPackage: {},
          },
          assemblies: [
            {
              id: 'asm-1',
              packageId: 'pkg-1',
              projectId: 'stratus-project',
              modelId: 'model-1',
              name: 'Assembly A',
              externalKey: '1001-PKG-1::assembly:asm-1',
              trackingStatusId: 'track-1',
              trackingStatusName: 'Ready to Ship',
              notes: 'Assembly note',
              rawAssembly: {},
            },
          ],
        },
      ],
      [
        { id: 'task-1', name: 'Task A', externalKey: '1001-PKG-1', parentId: null, sortOrder: 0, stratusSync: null },
        { id: 'task-2', name: 'Task B', externalKey: '1001-PKG-1', parentId: null, sortOrder: 1, stratusSync: null },
      ],
      480,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('skip');
    expect(rows[0]?.warnings[0]).toContain('matches multiple tasks');
    expect(rows[0]?.assemblyCount).toBe(1);
    expect(rows[0]?.assemblyRows[0]?.action).toBe('skip');
  });

  it('includes only changed linked tasks in push preview rows', () => {
    const rows = buildPushPreviewRows([
      {
        id: 'task-1',
        projectId: 'project-1',
        parentId: null,
        wbsCode: '',
        outlineLevel: 0,
        name: 'Linked package task',
        type: 'summary',
        durationMinutes: 960,
        start: new Date('2026-03-05T00:00:00.000Z'),
        finish: new Date('2026-03-07T00:00:00.000Z'),
        constraintType: 0,
        constraintDate: null,
        calendarId: null,
        percentComplete: 0,
        isManuallyScheduled: false,
        isCritical: false,
        totalSlackMinutes: 0,
        freeSlackMinutes: 0,
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        deadline: new Date('2026-03-08T00:00:00.000Z'),
        notes: '',
        externalKey: '1001-PKG-1',
        sortOrder: 0,
        actualStart: null,
        actualFinish: null,
        actualDurationMinutes: 0,
        actualWork: 0,
        actualCost: 0,
        remainingDuration: 0,
        remainingWork: 0,
        remainingCost: 0,
        fixedCost: 0,
        fixedCostAccrual: 'prorated',
        cost: 0,
        work: 0,
        taskMode: 'fixedUnits',
        isEffortDriven: false,
        isActive: true,
        bcws: 0,
        bcwp: 0,
        acwp: 0,
        physicalPercentComplete: 0,
        sv: 0,
        cv: 0,
        spi: 0,
        cpi: 0,
        eac: 0,
        vac: 0,
        isSplit: false,
        isRecurring: false,
        recurringPattern: null,
        hyperlink: '',
        hyperlinkAddress: '',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        stratusSync: {
          id: 'sync-1',
          taskId: 'task-1',
          localProjectId: 'project-1',
          packageId: 'pkg-1',
          projectId: 'stratus-project-1',
          modelId: 'model-1',
          externalKey: '1001-PKG-1',
          packageNumber: 'PKG-1',
          packageName: 'Package 1',
          trackingStatusId: 'track-1',
          trackingStatusName: 'Ready to Ship',
          rawPackageJson: '{}',
          lastPulledAt: new Date('2026-03-01T00:00:00.000Z'),
          lastPushedAt: null,
          syncedStartSignature: '2026-03-01',
          syncedFinishSignature: '2026-03-03',
          syncedDeadlineSignature: '2026-03-08',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('push');
    expect(rows[0]?.changes).toEqual([
      { field: 'start', from: '2026-03-01', to: '2026-03-05' },
      { field: 'finish', from: '2026-03-03', to: '2026-03-07' },
    ]);
  });
});

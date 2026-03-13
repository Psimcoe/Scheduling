import { describe, expect, it } from 'vitest';
import { resolveSnapshotDetailLevel } from './projectSnapshotDetail';

describe('resolveSnapshotDetailLevel', () => {
  it('uses shell snapshots for the default gantt surface', () => {
    expect(
      resolveSnapshotDetailLevel({
        activeView: 'gantt',
        openDialog: 'none',
        visibleColumns: ['name', 'start', 'finish'],
        filters: [],
        sortCriteria: [],
        groupBy: null,
      }),
    ).toBe('shell');
  });

  it('promotes to full snapshots for reporting', () => {
    expect(
      resolveSnapshotDetailLevel({
        activeView: 'reporting',
        openDialog: 'none',
        visibleColumns: ['name'],
        filters: [],
        sortCriteria: [],
        groupBy: null,
      }),
    ).toBe('full');
  });

  it('promotes to full snapshots when hidden detail fields become active', () => {
    expect(
      resolveSnapshotDetailLevel({
        activeView: 'taskSheet',
        openDialog: 'none',
        visibleColumns: ['name', 'actualCost'],
        filters: [],
        sortCriteria: [],
        groupBy: null,
      }),
    ).toBe('full');

    expect(
      resolveSnapshotDetailLevel({
        activeView: 'gantt',
        openDialog: 'findReplace',
        visibleColumns: ['name'],
        filters: [],
        sortCriteria: [],
        groupBy: null,
      }),
    ).toBe('full');
  });
});

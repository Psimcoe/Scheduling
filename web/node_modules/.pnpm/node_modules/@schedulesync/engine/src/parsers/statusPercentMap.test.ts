/**
 * StatusPercentMap tests — ported from C# StatusPercentMapTests.
 */

import { describe, it, expect } from 'vitest';
import { resolveStatus, getAllStatusMappings } from '@schedulesync/engine';

describe('StatusPercentMap', () => {
  // Known statuses from the TS implementation
  it.each([
    ['New Item', 0],
    ['Design Stage', 5],
    ['CLASH', 5],
    ['Pre-Fab Engineering', 5],
    ['Engineering', 10],
    ['Engineering Started', 10],
    ['Engineering Review', 15],
    ['Engineering Complete', 20],
    ['Pending Submittal', 25],
    ['Submitted', 30],
    ['Submittal Review', 35],
    ['Approved', 40],
    ['Approved As Noted', 40],
    ['Released to Fabrication', 50],
    ['Material Ordered', 55],
    ['Material Received', 60],
    ['Fabrication Queue', 65],
    ['Fabrication Started', 70],
    ['Fabrication In Progress', 75],
    ['Issued for Fabrication', 80],
    ['Fabrication Review', 85],
    ['Fabrication Complete', 90],
    ['Ready to Ship', 92],
    ['Shipped', 95],
    ['Shipped to Jobsite', 100],
    ['Delivered', 100],
    ['Installed', 100],
    ['On Site', 100],
    ['Complete', 100],
    ['Closed', 100],
    ['Cancelled', 0],
  ])('resolve "%s" → %d', (status, expected) => {
    expect(resolveStatus(status)).toBe(expected);
  });

  it('resolve is case-insensitive', () => {
    expect(resolveStatus('issued for fabrication')).toBe(80);
    expect(resolveStatus('ISSUED FOR FABRICATION')).toBe(80);
    expect(resolveStatus('Issued For Fabrication')).toBe(80);
  });

  it('resolve trims whitespace', () => {
    expect(resolveStatus('  New Item  ')).toBe(0);
    expect(resolveStatus('  Fabrication Complete\t')).toBe(90);
  });

  it('resolve unknown status returns null', () => {
    expect(resolveStatus('Unknown Status')).toBeNull();
    expect(resolveStatus('Random Text')).toBeNull();
  });

  it('resolve null or empty returns null', () => {
    expect(resolveStatus(null)).toBeNull();
    expect(resolveStatus('')).toBeNull();
    expect(resolveStatus('   ')).toBeNull();
  });

  it('getAll returns non-empty map', () => {
    const all = getAllStatusMappings();
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(30);
  });
});

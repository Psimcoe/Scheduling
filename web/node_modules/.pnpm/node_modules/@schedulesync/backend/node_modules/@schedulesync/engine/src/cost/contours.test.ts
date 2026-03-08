import { describe, it, expect } from 'vitest';
import { distributeWork, getContourWeights } from '../cost/contours.js';
import { WorkContour } from '../types.js';

describe('getContourWeights', () => {
  it('returns 10 weights for flat contour', () => {
    const w = getContourWeights(WorkContour.Flat);
    expect(w).toHaveLength(10);
    expect(w.every((v) => v === 0.1)).toBe(true);
  });

  it('bell contour peaks in the middle', () => {
    const w = getContourWeights(WorkContour.Bell);
    // Middle value (index 4) should be the max
    const maxVal = Math.max(...w);
    expect(w[4]).toBe(maxVal);
  });

  it('front loaded has highest weight first', () => {
    const w = getContourWeights(WorkContour.FrontLoaded);
    expect(w[0]).toBeGreaterThan(w[8]);
  });

  it('back loaded has highest weight near the end', () => {
    const w = getContourWeights(WorkContour.BackLoaded);
    expect(w[8]).toBeGreaterThan(w[0]);
  });
});

describe('distributeWork', () => {
  it('distributes flat work evenly across periods', () => {
    const periods = distributeWork(
      WorkContour.Flat,
      1000,
      '2025-01-06T00:00:00Z',
      '2025-01-17T00:00:00Z',
      10,
    );

    expect(periods).toHaveLength(10);
    const totalWork = periods.reduce((s, p) => s + p.work, 0);
    expect(totalWork).toBeCloseTo(1000, 1);

    // All periods should have roughly equal work for flat
    for (const p of periods) {
      expect(p.work).toBeCloseTo(100, 1);
    }
  });

  it('returns single period when span is zero', () => {
    const periods = distributeWork(
      WorkContour.Flat,
      500,
      '2025-01-06T00:00:00Z',
      '2025-01-06T00:00:00Z',
    );

    expect(periods).toHaveLength(1);
    expect(periods[0].work).toBe(500);
  });

  it('returns single period when totalWork is zero', () => {
    const periods = distributeWork(
      WorkContour.Bell,
      0,
      '2025-01-06T00:00:00Z',
      '2025-01-17T00:00:00Z',
    );

    expect(periods).toHaveLength(1);
    expect(periods[0].work).toBe(0);
  });

  it('total distributed work matches input for bell contour', () => {
    const periods = distributeWork(
      WorkContour.Bell,
      2400,
      '2025-01-06T00:00:00Z',
      '2025-01-17T00:00:00Z',
      10,
    );

    const totalWork = periods.reduce((s, p) => s + p.work, 0);
    expect(totalWork).toBeCloseTo(2400, 1);
  });

  it('compresses when fewer periods than profile length', () => {
    const periods = distributeWork(
      WorkContour.FrontLoaded,
      600,
      '2025-01-06T00:00:00Z',
      '2025-01-09T00:00:00Z',
      3,
    );

    expect(periods).toHaveLength(3);
    // Front loaded: first period should have more work
    expect(periods[0].work).toBeGreaterThan(periods[2].work);
  });
});

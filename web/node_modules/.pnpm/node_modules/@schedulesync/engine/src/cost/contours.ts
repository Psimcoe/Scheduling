/**
 * Work Contour Distribution — distributes total work across time periods
 * according to predefined contour profiles.
 *
 * MS Project contours shape how work is distributed across an assignment's
 * duration. Each contour is defined as a normalized weight curve.
 */

import type { WorkContour } from '../types.js';

/**
 * Percentage weight profiles for each contour type.
 * Each array sums to 1.0 and represents the distribution
 * across 10 equal time periods of the assignment duration.
 */
const CONTOUR_PROFILES: Record<WorkContour, number[]> = {
  flat:        [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10],
  backLoaded:  [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.10],
  frontLoaded: [0.18, 0.16, 0.14, 0.12, 0.10, 0.08, 0.06, 0.04, 0.02, 0.10],
  bell:        [0.04, 0.08, 0.12, 0.16, 0.20, 0.16, 0.12, 0.08, 0.04, 0.00],
  turtle:      [0.04, 0.08, 0.14, 0.14, 0.14, 0.14, 0.14, 0.08, 0.06, 0.04],
  earlyPeak:   [0.08, 0.16, 0.24, 0.16, 0.10, 0.08, 0.06, 0.04, 0.04, 0.04],
  latePeak:    [0.04, 0.04, 0.04, 0.06, 0.08, 0.10, 0.16, 0.24, 0.16, 0.08],
  doublePeak:  [0.06, 0.12, 0.16, 0.08, 0.06, 0.06, 0.08, 0.16, 0.12, 0.10],
};

export interface TimePeriod {
  start: string;   // ISO date
  end: string;     // ISO date
  work: number;    // minutes of work in this period
  percentOfTotal: number;
}

/**
 * Distribute total work across time periods according to the contour profile.
 *
 * @param contour - The work contour type
 * @param totalWork - Total work in minutes
 * @param startDate - Assignment start date (ISO)
 * @param endDate - Assignment end date (ISO)
 * @param periods - Number of period buckets (default: 10)
 */
export function distributeWork(
  contour: WorkContour,
  totalWork: number,
  startDate: string,
  endDate: string,
  periods = 10,
): TimePeriod[] {
  const profile = CONTOUR_PROFILES[contour] ?? CONTOUR_PROFILES.flat;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const span = end - start;

  if (span <= 0 || totalWork <= 0) {
    return [{
      start: startDate,
      end: endDate,
      work: totalWork,
      percentOfTotal: 1,
    }];
  }

  // If fewer periods than profile length, compress
  const bucketCount = Math.min(periods, profile.length);
  const bucketSpan = span / bucketCount;

  // Re-normalize profile to bucket count
  const weights: number[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const profileIdx = Math.floor((i / bucketCount) * profile.length);
    weights.push(profile[profileIdx]);
  }
  const weightSum = weights.reduce((s, w) => s + w, 0);

  return weights.map((w, i) => {
    const pct = weightSum > 0 ? w / weightSum : 1 / bucketCount;
    return {
      start: new Date(start + i * bucketSpan).toISOString(),
      end: new Date(start + (i + 1) * bucketSpan).toISOString(),
      work: totalWork * pct,
      percentOfTotal: pct,
    };
  });
}

/**
 * Get the contour profile weights (normalized to sum 1.0).
 */
export function getContourWeights(contour: WorkContour): number[] {
  return [...(CONTOUR_PROFILES[contour] ?? CONTOUR_PROFILES.flat)];
}

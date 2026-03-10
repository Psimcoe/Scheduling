import { describe, expect, it } from 'vitest';
import { aggregateDurationSamples, buildTaskSignature } from './aiLearningService.js';

describe('aiLearningService', () => {
  it('weights stronger correction evidence toward the recommended duration', () => {
    const result = aggregateDurationSamples([
      { days: 2, weight: 1 },
      { days: 5, weight: 4 },
    ]);

    expect(result.recommendedDays).toBe(4.5);
    expect(result.avgDays).toBe(4.4);
    expect(result.minDays).toBe(2);
    expect(result.maxDays).toBe(5);
  });

  it('builds stable task signatures with normalized task types', () => {
    expect(buildTaskSignature('Install roof membrane level 2', 'milestone')).toBe(
      'milestone:install roof membrane',
    );
    expect(buildTaskSignature('The Phase 1 Task', 'task')).toBe('general-task');
  });
});

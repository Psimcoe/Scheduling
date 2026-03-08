import { describe, it, expect } from 'vitest';
import { evaluateIndicator, INDICATOR_ICONS } from '../fields/graphicalIndicators.js';
import type { GraphicalIndicatorConfig, IndicatorRule } from '../types.js';

function makeConfig(
  rules: IndicatorRule[],
  overrides?: Partial<GraphicalIndicatorConfig>,
): GraphicalIndicatorConfig {
  return {
    rules,
    showForSummary: true,
    showForProject: true,
    ...overrides,
  };
}

describe('evaluateIndicator', () => {
  it('matches eq rule', () => {
    const config = makeConfig([
      { operator: 'eq', values: [100], color: 'green', icon: 'greenCircle' },
    ]);
    const result = evaluateIndicator(100, config);
    expect(result.matched).toBe(true);
    expect(result.color).toBe('green');
  });

  it('matches gt rule', () => {
    const config = makeConfig([
      { operator: 'gt', values: [50], color: 'green', icon: 'greenCircle' },
    ]);
    expect(evaluateIndicator(75, config).matched).toBe(true);
    expect(evaluateIndicator(50, config).matched).toBe(false);
    expect(evaluateIndicator(25, config).matched).toBe(false);
  });

  it('matches between rule', () => {
    const config = makeConfig([
      { operator: 'between', values: [10, 90], color: 'yellow', icon: 'yellowCircle' },
    ]);
    expect(evaluateIndicator(50, config).matched).toBe(true);
    expect(evaluateIndicator(5, config).matched).toBe(false);
    expect(evaluateIndicator(95, config).matched).toBe(false);
  });

  it('matches contains rule', () => {
    const config = makeConfig([
      { operator: 'contains', values: ['critical'], color: 'red', icon: 'redCircle' },
    ]);
    expect(evaluateIndicator('Critical Path Task', config).matched).toBe(true);
    expect(evaluateIndicator('Normal Task', config).matched).toBe(false);
  });

  it('returns first matching rule', () => {
    const config = makeConfig([
      { operator: 'gte', values: [80], color: 'green', icon: 'greenCircle' },
      { operator: 'gte', values: [50], color: 'yellow', icon: 'yellowCircle' },
      { operator: 'lt', values: [50], color: 'red', icon: 'redCircle' },
    ]);

    expect(evaluateIndicator(90, config).color).toBe('green');
    expect(evaluateIndicator(60, config).color).toBe('yellow');
    expect(evaluateIndicator(30, config).color).toBe('red');
  });

  it('returns no match when no rules match', () => {
    const config = makeConfig([
      { operator: 'eq', values: [999], color: 'green', icon: 'greenCircle' },
    ]);
    expect(evaluateIndicator(0, config).matched).toBe(false);
  });

  it('hides from summary when showForSummary=false', () => {
    const config = makeConfig(
      [{ operator: 'gt', values: [0], color: 'green', icon: 'greenCircle' }],
      { showForSummary: false },
    );
    expect(evaluateIndicator(50, config, true).matched).toBe(false);
    expect(evaluateIndicator(50, config, false).matched).toBe(true);
  });

  it('hides from project summary when showForProject=false', () => {
    const config = makeConfig(
      [{ operator: 'gt', values: [0], color: 'green', icon: 'greenCircle' }],
      { showForProject: false },
    );
    expect(evaluateIndicator(50, config, false, true).matched).toBe(false);
    expect(evaluateIndicator(50, config, false, false).matched).toBe(true);
  });
});

describe('INDICATOR_ICONS', () => {
  it('has standard traffic light icons', () => {
    expect(INDICATOR_ICONS.greenCircle).toBe('🟢');
    expect(INDICATOR_ICONS.yellowCircle).toBe('🟡');
    expect(INDICATOR_ICONS.redCircle).toBe('🔴');
  });
});

import { describe, it, expect } from 'vitest';
import { compileFormula, evaluateFormula } from '../fields/formulaEvaluator.js';

function evalExpr(expr: string, task: Record<string, unknown> = {}): unknown {
  const ast = compileFormula(expr);
  return evaluateFormula(ast, task);
}

describe('formulaEvaluator', () => {
  describe('arithmetic', () => {
    it('adds two numbers', () => {
      expect(evalExpr('2 + 3')).toBe(5);
    });

    it('respects operator precedence', () => {
      expect(evalExpr('2 + 3 * 4')).toBe(14);
    });

    it('handles parentheses', () => {
      expect(evalExpr('(2 + 3) * 4')).toBe(20);
    });

    it('divides', () => {
      expect(evalExpr('10 / 4')).toBe(2.5);
    });

    it('safe divide by zero returns 0', () => {
      expect(evalExpr('10 / 0')).toBe(0);
    });

    it('handles negative numbers via unary', () => {
      expect(evalExpr('-5 + 3')).toBe(-2);
    });
  });

  describe('comparisons', () => {
    it('greater than', () => {
      expect(evalExpr('5 > 3')).toBe(true);
    });

    it('less than', () => {
      expect(evalExpr('2 < 1')).toBe(false);
    });

    it('equality', () => {
      expect(evalExpr('5 == 5')).toBe(true);
    });

    it('inequality', () => {
      expect(evalExpr('5 != 3')).toBe(true);
    });
  });

  describe('logical operators', () => {
    it('AND', () => {
      expect(evalExpr('1 && 1')).toBe(true);
      expect(evalExpr('1 && 0')).toBe(false);
    });

    it('OR', () => {
      expect(evalExpr('0 || 1')).toBe(true);
      expect(evalExpr('0 || 0')).toBe(false);
    });

    it('NOT', () => {
      expect(evalExpr('!0')).toBe(true);
      expect(evalExpr('!1')).toBe(false);
    });
  });

  describe('ternary', () => {
    it('evaluates true branch', () => {
      expect(evalExpr('1 ? 10 : 20')).toBe(10);
    });

    it('evaluates false branch', () => {
      expect(evalExpr('0 ? 10 : 20')).toBe(20);
    });
  });

  describe('string operations', () => {
    it('concatenates strings with +', () => {
      expect(evalExpr('"hello" + " world"')).toBe('hello world');
    });

    it('string literals', () => {
      expect(evalExpr('"test"')).toBe('test');
    });
  });

  describe('field references', () => {
    it('reads [Duration] field', () => {
      expect(evalExpr('[Duration] * 2', { durationMinutes: 480 })).toBe(960);
    });

    it('reads [% Complete] field', () => {
      expect(evalExpr('[% Complete]', { percentComplete: 75 })).toBe(75);
    });

    it('reads [Cost] field', () => {
      expect(evalExpr('[Cost] + 100', { cost: 500 })).toBe(600);
    });

    it('returns 0 for unknown field', () => {
      expect(evalExpr('[Unknown]', {})).toBe(0);
    });
  });

  describe('built-in functions', () => {
    it('IIf returns correct branch', () => {
      expect(evalExpr('IIf([Cost] > 100, "over", "under")', { cost: 200 })).toBe('over');
      expect(evalExpr('IIf([Cost] > 100, "over", "under")', { cost: 50 })).toBe('under');
    });

    it('Abs returns absolute value', () => {
      expect(evalExpr('Abs(-42)')).toBe(42);
    });

    it('Int truncates', () => {
      expect(evalExpr('Int(3.7)')).toBe(3);
    });

    it('Round rounds to given digits', () => {
      expect(evalExpr('Round(3.456, 2)')).toBe(3.46);
    });

    it('Round without digits rounds to integer', () => {
      expect(evalExpr('Round(3.6)')).toBe(4);
    });

    it('Max and Min', () => {
      expect(evalExpr('Max(1, 5, 3)')).toBe(5);
      expect(evalExpr('Min(1, 5, 3)')).toBe(1);
    });

    it('Len returns string length', () => {
      expect(evalExpr('Len("hello")')).toBe(5);
    });

    it('Upper/Lower case', () => {
      expect(evalExpr('Upper("hello")')).toBe('HELLO');
      expect(evalExpr('Lower("HELLO")')).toBe('hello');
    });

    it('Val parses number from string', () => {
      expect(evalExpr('Val("42.5")')).toBe(42.5);
    });

    it('Switch selects matching value', () => {
      expect(evalExpr('Switch(2, 1, "a", 2, "b", "default")')).toBe('b');
    });

    it('Switch returns default when no match', () => {
      expect(evalExpr('Switch(5, 1, "a", 2, "b", "default")')).toBe('default');
    });
  });

  describe('complex expressions', () => {
    it('cost variance formula', () => {
      const task = { cost: 1000, actualCost: 800 };
      expect(evalExpr('[Cost] - [Actual Cost]', task)).toBe(200);
    });

    it('conditional status', () => {
      const task = { percentComplete: 100 };
      expect(evalExpr('IIf([% Complete] == 100, "Done", "In Progress")', task)).toBe('Done');
    });
  });
});

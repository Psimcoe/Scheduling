import { describe, expect, it } from 'vitest';
import { isPackageTask } from './taskClassification';

describe('isPackageTask', () => {
  it('treats summary tasks as packages', () => {
    expect(
      isPackageTask({
        type: 'summary',
        externalKey: null,
        stratusSync: null,
      }),
    ).toBe(true);
  });

  it('treats canonical Stratus package tasks as packages', () => {
    expect(
      isPackageTask({
        type: 'task',
        externalKey: 'FAB-0940',
        stratusSync: { packageId: 'pkg-0940' },
      }),
    ).toBe(true);
  });

  it('treats legacy imported package rows as packages even without Stratus sync metadata', () => {
    expect(
      isPackageTask({
        type: 'task',
        externalKey: '410932NGK-0938',
        stratusSync: null,
      }),
    ).toBe(true);
  });

  it('does not treat assemblies as packages', () => {
    expect(
      isPackageTask({
        type: 'task',
        externalKey: '410932NGK-0938::assembly:asm-1',
        stratusSync: null,
      }),
    ).toBe(false);
  });

  it('does not treat plain local tasks as packages', () => {
    expect(
      isPackageTask({
        type: 'task',
        externalKey: null,
        stratusSync: null,
      }),
    ).toBe(false);
  });
});

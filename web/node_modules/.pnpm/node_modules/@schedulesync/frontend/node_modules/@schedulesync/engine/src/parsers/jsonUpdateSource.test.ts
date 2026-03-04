/**
 * JsonUpdateSource tests — ported from C# JsonUpdateSourceTests.
 */

import { describe, it, expect } from 'vitest';
import { JsonUpdateSource } from '@schedulesync/engine';

describe('JsonUpdateSource', () => {
  const source = new JsonUpdateSource();

  it('parse empty content returns error', () => {
    const result = source.parse('');
    expect(result.success).toBe(false);
  });

  it('parse non-array returns error', () => {
    const result = source.parse('{"uniqueId": 1}');
    expect(result.success).toBe(false);
    expect(result.errors[0].message.toLowerCase()).toContain('array');
  });

  it('parse invalid JSON returns error', () => {
    const result = source.parse('[{bad json}]');
    expect(result.success).toBe(false);
  });

  it('parse valid single object returns update', () => {
    const json = JSON.stringify([{
      uniqueId: 123,
      newStart: '2026-03-10T06:00:00',
      newFinish: '2026-03-12T14:00:00',
      allowConstraintOverride: false,
      notesAppend: 'Pulled in per field request',
    }]);

    const result = source.parse(json);
    expect(result.success).toBe(true);
    expect(result.updates).toHaveLength(1);

    const u = result.updates[0];
    expect(u.uniqueId).toBe(123);
    expect(u.newStart).toBeTruthy();
    expect(u.newFinish).toBeTruthy();
    expect(u.allowConstraintOverride).toBe(false);
    expect(u.notesAppend).toBe('Pulled in per field request');
  });

  it('parse case-insensitive properties', () => {
    const json = JSON.stringify([{ UNIQUEID: 42, NEWSTART: '2026-06-01' }]);
    const result = source.parse(json);
    expect(result.success).toBe(true);
    expect(result.updates[0].uniqueId).toBe(42);
  });

  it('parse multiple objects returns all', () => {
    const json = JSON.stringify([{ uniqueId: 1 }, { uniqueId: 2 }]);
    const result = source.parse(json);
    expect(result.success).toBe(true);
    expect(result.updates).toHaveLength(2);
  });

  it('parse invalid uniqueId returns error', () => {
    const json = JSON.stringify([{ uniqueId: 'not-a-number' }]);
    const result = source.parse(json);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('parse all fields', () => {
    const json = JSON.stringify([{
      uniqueId: 10,
      externalKey: 'EK-1',
      name: 'Task A',
      newStart: '2026-01-01',
      newFinish: '2026-01-05',
      newDurationMinutes: 480.0,
      newPercentComplete: 50,
      newConstraintType: 1,
      newConstraintDate: '2026-01-01',
      notesAppend: 'A note',
      allowConstraintOverride: true,
    }]);

    const result = source.parse(json);
    expect(result.success).toBe(true);

    const u = result.updates[0];
    expect(u.uniqueId).toBe(10);
    expect(u.externalKey).toBe('EK-1');
    expect(u.name).toBe('Task A');
    expect(u.newDurationMinutes).toBe(480);
    expect(u.newPercentComplete).toBe(50);
    expect(u.newConstraintType).toBe(1);
    expect(u.allowConstraintOverride).toBe(true);
  });

  it('parse non-object elements returns errors', () => {
    const json = '[1, 2, 3]';
    const result = source.parse(json);
    expect(result.errors).toHaveLength(3);
  });

  it('parse externalKey only is valid', () => {
    const json = JSON.stringify([{ externalKey: 'WBS-100', newFinish: '2026-04-01' }]);
    const result = source.parse(json);
    expect(result.success).toBe(true);
    expect(result.updates[0].externalKey).toBe('WBS-100');
    expect(result.updates[0].uniqueId).toBeNull();
  });
});

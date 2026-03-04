/**
 * CsvUpdateSource tests — ported from C# CsvUpdateSourceTests.
 */

import { describe, it, expect } from 'vitest';
import { CsvUpdateSource } from '@schedulesync/engine';

describe('CsvUpdateSource', () => {
  const source = new CsvUpdateSource();

  it('parse empty content returns error', () => {
    const result = source.parse('');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('parse header only returns error', () => {
    const result = source.parse('UniqueId,NewStart\n');
    expect(result.success).toBe(false);
  });

  it('parse valid single row returns update', () => {
    const csv =
      'UniqueId,NewStart,NewFinish,AllowConstraintOverride,NotesAppend\n' +
      '123,2026-03-10T06:00:00,2026-03-12T14:00:00,false,"Pulled in per field request"\n';
    const result = source.parse(csv);
    expect(result.success).toBe(true);
    expect(result.updates).toHaveLength(1);

    const u = result.updates[0];
    expect(u.uniqueId).toBe(123);
    expect(u.newStart).toBeTruthy();
    expect(u.newFinish).toBeTruthy();
    expect(u.allowConstraintOverride).toBe(false);
    expect(u.notesAppend).toBe('Pulled in per field request');
  });

  it('parse multiple rows returns all updates', () => {
    const csv =
      'UniqueId,NewStart\n' +
      '1,2026-03-10\n' +
      '2,2026-03-11\n';
    const result = source.parse(csv);
    expect(result.success).toBe(true);
    expect(result.updates).toHaveLength(2);
  });

  it('parse case-insensitive headers', () => {
    const csv = 'uniqueid,NEWSTART\n42,2026-06-01\n';
    const result = source.parse(csv);
    expect(result.success).toBe(true);
    expect(result.updates[0].uniqueId).toBe(42);
  });

  it('parse invalid UniqueId returns error', () => {
    const csv = 'UniqueId,NewStart\nabc,2026-03-10\n';
    const result = source.parse(csv);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].fieldName).toBe('UniqueId');
  });

  it('parse invalid date returns error', () => {
    const csv = 'UniqueId,NewStart\n1,not-a-date\n';
    const result = source.parse(csv);
    expect(result.success).toBe(false);
    expect(result.errors[0].fieldName).toBe('NewStart');
  });

  it('parse ExternalKey', () => {
    const csv = 'ExternalKey,NewFinish\nWBS-100,2026-04-01\n';
    const result = source.parse(csv);
    expect(result.success).toBe(true);
    expect(result.updates[0].externalKey).toBe('WBS-100');
  });

  it('parse quoted field with comma', () => {
    const csv = 'UniqueId,NotesAppend\n1,"Note with, comma"\n';
    const result = source.parse(csv);
    expect(result.success).toBe(true);
    expect(result.updates[0].notesAppend).toBe('Note with, comma');
  });

  it('parse all fields', () => {
    const csv =
      'UniqueId,ExternalKey,Name,NewStart,NewFinish,NewDurationMinutes,NewPercentComplete,' +
      'NewConstraintType,NewConstraintDate,NotesAppend,AllowConstraintOverride\n' +
      '10,EK-1,Task A,2026-01-01,2026-01-05,480,50,1,2026-01-01,Some note,true\n';
    const result = source.parse(csv);
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
});

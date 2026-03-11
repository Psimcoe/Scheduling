import { describe, expect, it } from 'vitest';
import {
  normalizeStratusAssembly,
  normalizeStratusPackage,
  normalizeStratusProject,
  resolveFieldIdsFromDefinitions,
} from './stratusApi.js';

describe('stratusApi', () => {
  it('resolves company field ids from exact Stratus field names', () => {
    const result = resolveFieldIdsFromDefinitions(
      [
        { id: 'field-start', name: 'STRATUS.Field.SMC_Package Start Date', displayName: null },
        { id: 'field-finish', name: 'STRATUS.Field.SMC_Package Estimated Finish Date', displayName: null },
      ],
      {},
    );

    expect(result.canPush).toBe(true);
    expect(result.startFieldId).toBe('field-start');
    expect(result.finishFieldId).toBe('field-finish');
  });

  it('resolves company field ids when the STRATUS.Field prefix is omitted', () => {
    const result = resolveFieldIdsFromDefinitions(
      [
        { id: 'field-start', name: 'SMC_Package Start Date', displayName: null },
        { id: 'field-finish', name: 'SMC_Package Estimated Finish Date', displayName: 'Estimated Finish Date' },
      ],
      {},
    );

    expect(result.canPush).toBe(true);
    expect(result.startFieldId).toBe('field-start');
    expect(result.finishFieldId).toBe('field-finish');
  });

  it('normalizes requested Stratus package fields from top-level data and fieldNameToValueMap', () => {
    const normalized = normalizeStratusPackage(
      {
        id: 'pkg-1',
        projectId: 'stratus-project-1',
        modelId: 'model-1',
        number: 'P-100',
        name: 'Package 100',
        qrCodeUrl: 'https://example.test/qr',
        requiredDT: '2026-03-10T00:00:00.000Z',
        startDT: '2026-03-01T00:00:00.000Z',
        statusName: 'Fabrication Complete',
        currentTrackingStatusId: 'track-1',
        fieldNameToValueMap: {
          'STRATUS.Field.Project Number': '1001',
          'STRATUS.Field.Project Name Override': 'Override Package Name',
          'Work Days (Reference)': '4.5',
          'STRATUS.Field.SMC_Package Start Date': '2026-03-03T00:00:00.000Z',
          'STRATUS.Field.SMC_Package Estimated Finish Date': '2026-03-07T00:00:00.000Z',
          'STRATUS.Package.Notes': 'Shop ready',
        },
      },
      480,
    );

    expect(normalized.externalKey).toBe('1001-P-100');
    expect(normalized.normalizedFields['STRATUS.Field.Project Number']).toBe('1001');
    expect(normalized.normalizedFields['STRATUS.Package.QRCode']).toContain('/qr');
    expect(normalized.normalizedFields['STRATUS.Package.RequiredDT']).toBe('2026-03-10T00:00:00.000Z');
    expect(normalized.normalizedFields['STRATUS.Field.SMC_Package Start Date']).toBe('2026-03-03T00:00:00.000Z');
    expect(normalized.trackingStatusId).toBe('track-1');
    expect(normalized.trackingStatusName).toBe('Fabrication Complete');
  });

  it('normalizes Stratus project and assembly records for import and grouping', () => {
    const project = normalizeStratusProject({
      id: 'proj-1',
      number: '1001',
      name: 'Warehouse Expansion',
      statusName: 'Active',
      category: 'Industrial',
      phase: 'Prefab',
      city: 'Boston',
      state: 'MA',
      targetStartDate: '2026-03-01T00:00:00.000Z',
      targetEndDate: '2026-04-01T00:00:00.000Z',
    });
    const assembly = normalizeStratusAssembly('pkg-1', '1001-PKG-1', {
      id: 'asm-1',
      projectId: 'proj-1',
      modelId: 'model-1',
      nameLabel: 'Assembly A',
      currentTrackingStatusId: 'track-1',
      currentTrackingStatusName: 'Ready to Ship',
      qrCodeUrl: 'https://example.test/asm-1',
      notes: [{ text: 'Assembly note' }],
    });

    expect(project.startDate).toBe('2026-03-01T00:00:00.000Z');
    expect(project.finishDate).toBe('2026-04-01T00:00:00.000Z');
    expect(assembly.externalKey).toBe('1001-PKG-1::assembly:asm-1');
    expect(assembly.trackingStatusName).toBe('Ready to Ship');
    expect(assembly.notes).toContain('Assembly note');
  });
});

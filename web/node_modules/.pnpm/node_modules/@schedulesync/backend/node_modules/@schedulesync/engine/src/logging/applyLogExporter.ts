/**
 * Apply log exporter — ported from C# ApplyLogExporter.
 * Exports an ApplyResult to CSV or JSON for audit logging.
 */

import type { ApplyResult } from '../types.js';

/**
 * Escape a CSV field value: wrap in quotes if it contains commas, quotes, or newlines.
 */
function escapeCsv(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Export an ApplyResult to CSV format.
 */
export function toCsv(result: ApplyResult): string {
  const lines: string[] = [];

  // Header
  lines.push('UniqueId,ExternalKey,TaskName,Status,ChangesApplied,Message');

  for (const detail of result.details) {
    const fields = [
      detail.uniqueId?.toString() ?? '',
      escapeCsv(detail.externalKey ?? ''),
      escapeCsv(detail.taskName),
      detail.status,
      detail.changesApplied.toString(),
      escapeCsv(detail.message),
    ];
    lines.push(fields.join(','));
  }

  return lines.join('\n');
}

/**
 * Export an ApplyResult to JSON format (pretty-printed).
 */
export function toJson(result: ApplyResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * STRATUS CSV update source — ported from C# StratusCsvUpdateSource.
 * Maps STRATUS Packages Dashboard columns to TaskUpdate fields.
 */

import type { IUpdateSource, ParseResult, TaskUpdate, ParseError } from '../types.js';
import { createParseResult } from '../types.js';
import { parseCsvLine, readLines } from './csvParserHelper.js';
import { resolveStatus } from './statusPercentMap.js';

const MINUTES_PER_WORK_DAY = 480;

function makeEmptyUpdate(): TaskUpdate {
  return {
    externalKey: null,
    uniqueId: null,
    name: null,
    newStart: null,
    newFinish: null,
    newDurationMinutes: null,
    newPercentComplete: null,
    newConstraintType: null,
    newConstraintDate: null,
    newDeadline: null,
    notesAppend: null,
    allowConstraintOverride: false,
    isNew: true, // Stratus tasks are new by default
    metadata: {},
  };
}

/**
 * Attempt to parse a date string using multiple formats.
 * Tries ISO first, then US date formats (M/d/yyyy etc.).
 */
function tryParseDate(value: string): Date | null {
  if (!value || value.trim() === '') return null;

  // Try native Date parsing first (handles ISO and many formats)
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d;

  // Try US date formats: M/d/yyyy, MM/dd/yyyy, M-d-yyyy, MM-dd-yyyy
  const usPatterns = [
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  ];

  for (const pattern of usPatterns) {
    const match = value.match(pattern);
    if (match) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      const hour = match[4] ? parseInt(match[4], 10) : 0;
      const minute = match[5] ? parseInt(match[5], 10) : 0;
      const second = match[6] ? parseInt(match[6], 10) : 0;
      const result = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
      if (!isNaN(result.getTime())) return result;
    }
  }

  return null;
}

/**
 * Detect whether a CSV header line is in STRATUS format.
 * Returns true if headers contain distinctive STRATUS column names.
 */
export function isStratusFormat(headerLine: string | null | undefined): boolean {
  if (!headerLine) return false;
  const lower = headerLine.toLowerCase();
  return (
    lower.includes('prefab build start date') ||
    lower.includes('stratus.package.id') ||
    lower.includes('cost code number')
  );
}

export class StratusCsvUpdateSource implements IUpdateSource {
  parse(content: string): ParseResult {
    const updates: TaskUpdate[] = [];
    const errors: ParseError[] = [];

    const lines = readLines(content);
    if (lines.length === 0) {
      errors.push({ rowNumber: null, fieldName: null, message: 'Content is empty.' });
      return createParseResult(updates, errors);
    }

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());

    // Build column index map
    const colIndex = new Map<string, number>();
    for (let i = 0; i < headers.length; i++) {
      colIndex.set(headers[i], i);
    }

    if (lines.length <= 1) {
      errors.push({ rowNumber: null, fieldName: null, message: 'No data rows found.' });
      return createParseResult(updates, errors);
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;

      const fields = parseCsvLine(line);
      const rowNum = i + 1;
      const update = makeEmptyUpdate();

      const getField = (name: string): string =>
        fields[colIndex.get(name) ?? -1]?.trim() ?? '';

      // Number (required)
      const number = getField('number');
      if (!number) {
        errors.push({
          rowNumber: rowNum,
          fieldName: 'Number',
          message: 'Missing required Number field.',
        });
        continue;
      }

      // Project Number: prefer "project number override", fallback "project number"
      let projectNumber = getField('project number override');
      if (!projectNumber) {
        projectNumber = getField('project number');
      }

      // Composite external key: "ProjectNumber-Number"
      update.externalKey = projectNumber ? `${projectNumber}-${number}` : number;

      // Name
      update.name = getField('name') || null;

      // Metadata
      if (projectNumber) update.metadata['ProjectNumber'] = projectNumber;
      const location = getField('location');
      if (location) update.metadata['Location'] = location;
      const categoryType = getField('category type');
      if (categoryType) update.metadata['CategoryType'] = categoryType;
      const costCodeCategory = getField('cost code category');
      if (costCodeCategory) update.metadata['CostCodeCategory'] = costCodeCategory;
      const costCodeNumber = getField('cost code number');
      if (costCodeNumber) update.metadata['CostCodeNumber'] = costCodeNumber;

      // STRATUS.Package.Id — try "stratus.package.id" first, fallback to "id"
      let packageId = getField('stratus.package.id');
      if (!packageId) packageId = getField('id');
      if (packageId) update.metadata['StratusPackageId'] = packageId;

      // Dates
      const startStr = getField('prefab build start date');
      if (startStr) {
        const d = tryParseDate(startStr);
        if (d) {
          update.newStart = d.toISOString();
        } else {
          errors.push({ rowNumber: rowNum, fieldName: 'Prefab Build Start Date', message: `Invalid date: ${startStr}` });
        }
      }

      const finishStr = getField('prefab build finish date');
      if (finishStr) {
        const d = tryParseDate(finishStr);
        if (d) {
          update.newFinish = d.toISOString();
        } else {
          errors.push({ rowNumber: rowNum, fieldName: 'Prefab Build Finish Date', message: `Invalid date: ${finishStr}` });
        }
      }

      // Work Days (Reference) → duration in minutes
      const workDaysStr = getField('work days (reference)');
      if (workDaysStr) {
        const v = parseFloat(workDaysStr);
        if (!isNaN(v) && isFinite(v)) {
          update.newDurationMinutes = v * MINUTES_PER_WORK_DAY;
        } else {
          errors.push({
            rowNumber: rowNum,
            fieldName: 'Work Days (Reference)',
            message: `Invalid numeric value: ${workDaysStr}`,
          });
          continue;
        }
      }

      // Required → Deadline
      const requiredStr = getField('required');
      if (requiredStr) {
        const d = tryParseDate(requiredStr);
        if (d) update.newDeadline = d.toISOString();
      }

      // Status → PercentComplete
      const statusStr = getField('status');
      if (statusStr) {
        const pct = resolveStatus(statusStr);
        if (pct !== null) {
          update.newPercentComplete = pct;
        } else {
          errors.push({
            rowNumber: rowNum,
            fieldName: 'Status',
            message: `Unrecognized status: ${statusStr}`,
          });
        }
      }

      // Notes = Description + Notes joined with \n
      const description = getField('description');
      const notes = getField('notes');
      const parts: string[] = [];
      if (description) parts.push(description);
      if (notes) parts.push(notes);
      if (parts.length > 0) {
        update.notesAppend = parts.join('\n');
      }

      updates.push(update);
    }

    return createParseResult(updates, errors);
  }
}

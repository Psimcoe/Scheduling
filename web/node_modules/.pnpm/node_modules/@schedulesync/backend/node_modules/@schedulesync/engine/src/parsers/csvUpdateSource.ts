/**
 * CSV update source — ported from C# CsvUpdateSource.
 * Case-insensitive column matching.
 */

import type { IUpdateSource, ParseResult, TaskUpdate, ParseError } from '../types.js';
import { createParseResult } from '../types.js';
import { parseCsvLine, readLines } from './csvParserHelper.js';

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
    isNew: false,
    metadata: {},
  };
}

export class CsvUpdateSource implements IUpdateSource {
  parse(content: string): ParseResult {
    const updates: TaskUpdate[] = [];
    const errors: ParseError[] = [];

    const lines = readLines(content);
    if (lines.length === 0) {
      errors.push({ rowNumber: null, fieldName: null, message: 'Content is empty.' });
      return createParseResult(updates, errors);
    }

    // Parse header
    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());

    if (lines.length <= 1) {
      errors.push({ rowNumber: null, fieldName: null, message: 'No data rows found.' });
      return createParseResult(updates, errors);
    }

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;

      const fields = parseCsvLine(line);
      const rowNum = i + 1;
      const update = makeEmptyUpdate();
      let hasError = false;

      for (let col = 0; col < headers.length && col < fields.length; col++) {
        const header = headers[col];
        const value = fields[col];
        if (value === '') continue;

        try {
          switch (header) {
            case 'uniqueid': {
              const v = parseInt(value, 10);
              if (isNaN(v)) {
                errors.push({ rowNumber: rowNum, fieldName: 'UniqueId', message: `Invalid integer: ${value}` });
                hasError = true;
              } else {
                update.uniqueId = v;
              }
              break;
            }
            case 'externalkey':
              update.externalKey = value;
              break;
            case 'name':
              update.name = value;
              break;
            case 'newstart': {
              const d = new Date(value);
              if (isNaN(d.getTime())) {
                errors.push({ rowNumber: rowNum, fieldName: 'NewStart', message: `Invalid date: ${value}` });
                hasError = true;
              } else {
                update.newStart = d.toISOString();
              }
              break;
            }
            case 'newfinish': {
              const d = new Date(value);
              if (isNaN(d.getTime())) {
                errors.push({ rowNumber: rowNum, fieldName: 'NewFinish', message: `Invalid date: ${value}` });
                hasError = true;
              } else {
                update.newFinish = d.toISOString();
              }
              break;
            }
            case 'newdurationminutes': {
              const v = parseFloat(value);
              if (isNaN(v)) {
                errors.push({ rowNumber: rowNum, fieldName: 'NewDurationMinutes', message: `Invalid number: ${value}` });
                hasError = true;
              } else {
                update.newDurationMinutes = v;
              }
              break;
            }
            case 'newpercentcomplete': {
              const v = parseInt(value, 10);
              if (isNaN(v)) {
                errors.push({ rowNumber: rowNum, fieldName: 'NewPercentComplete', message: `Invalid integer: ${value}` });
                hasError = true;
              } else {
                update.newPercentComplete = v;
              }
              break;
            }
            case 'newconstrainttype': {
              const v = parseInt(value, 10);
              if (isNaN(v)) {
                errors.push({ rowNumber: rowNum, fieldName: 'NewConstraintType', message: `Invalid integer: ${value}` });
                hasError = true;
              } else {
                update.newConstraintType = v;
              }
              break;
            }
            case 'newconstraintdate': {
              const d = new Date(value);
              if (isNaN(d.getTime())) {
                errors.push({ rowNumber: rowNum, fieldName: 'NewConstraintDate', message: `Invalid date: ${value}` });
                hasError = true;
              } else {
                update.newConstraintDate = d.toISOString();
              }
              break;
            }
            case 'notesappend':
              update.notesAppend = value;
              break;
            case 'allowconstraintoverride':
              update.allowConstraintOverride =
                value.toLowerCase() === 'true' || value === '1';
              break;
          }
        } catch {
          errors.push({
            rowNumber: rowNum,
            fieldName: header,
            message: `Unexpected error parsing field value: ${value}`,
          });
          hasError = true;
        }
      }

      // Only include rows without errors (matches C# behaviour)
      if (!hasError) {
        updates.push(update);
      }
    }

    return createParseResult(updates, errors);
  }
}

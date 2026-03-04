/**
 * CSV parser helper — ported from C# CsvParserHelper.
 * Handles quoted fields and escaped quotes.
 */

/**
 * Parse a single CSV line into an array of field values.
 * Handles:
 * - Quoted fields (comma inside quotes)
 * - Escaped quotes ("" inside quoted field)
 * - Whitespace trimming
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === ',') {
        fields.push(current.trim());
        current = '';
        i++;
        continue;
      }
      current += ch;
      i++;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Read all lines from a multi-line string.
 * Handles \r\n and \n line endings. Strips empty trailing lines.
 */
export function readLines(content: string): string[] {
  const lines = content.split(/\r?\n/);
  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines;
}

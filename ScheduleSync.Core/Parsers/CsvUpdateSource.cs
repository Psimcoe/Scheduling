using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using ScheduleSync.Core.Interfaces;
using ScheduleSync.Core.Models;

namespace ScheduleSync.Core.Parsers
{
    /// <summary>
    /// Parses task updates from CSV content. Column names are matched case-insensitively.
    /// </summary>
    public class CsvUpdateSource : IUpdateSource
    {
        public ParseResult Parse(string content)
        {
            var result = new ParseResult();
            if (string.IsNullOrWhiteSpace(content))
            {
                result.Errors.Add(new ParseError(null, null, "CSV content is empty."));
                return result;
            }

            var lines = CsvParserHelper.ReadLines(content);
            if (lines.Count < 2)
            {
                result.Errors.Add(new ParseError(null, null, "CSV must contain a header row and at least one data row."));
                return result;
            }

            var headers = CsvParserHelper.ParseCsvLine(lines[0])
                .Select(h => h.Trim().ToLowerInvariant())
                .ToList();

            for (int i = 1; i < lines.Count; i++)
            {
                if (string.IsNullOrWhiteSpace(lines[i])) continue;

                int rowNumber = i + 1;
                var fields = CsvParserHelper.ParseCsvLine(lines[i]);

                if (fields.Count != headers.Count)
                {
                    result.Errors.Add(new ParseError(rowNumber, null,
                        $"Row has {fields.Count} fields but header has {headers.Count}."));
                    continue;
                }

                var lookup = new Dictionary<string, string>();
                for (int j = 0; j < headers.Count; j++)
                {
                    lookup[headers[j]] = fields[j].Trim();
                }

                var update = new TaskUpdate();
                bool hasError = false;

                // UniqueId
                if (TryGetValue(lookup, "uniqueid", out var uidStr) && !string.IsNullOrEmpty(uidStr))
                {
                    if (int.TryParse(uidStr, out var uid))
                        update.UniqueId = uid;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "UniqueId", $"Invalid integer: '{uidStr}'."));
                        hasError = true;
                    }
                }

                // ExternalKey
                if (TryGetValue(lookup, "externalkey", out var ek))
                    update.ExternalKey = string.IsNullOrEmpty(ek) ? null : ek;

                // Name
                if (TryGetValue(lookup, "name", out var name))
                    update.Name = string.IsNullOrEmpty(name) ? null : name;

                // NewStart
                if (TryGetValue(lookup, "newstart", out var nsStr) && !string.IsNullOrEmpty(nsStr))
                {
                    if (DateTime.TryParse(nsStr, out var ns))
                        update.NewStart = ns;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "NewStart", $"Invalid date: '{nsStr}'."));
                        hasError = true;
                    }
                }

                // NewFinish
                if (TryGetValue(lookup, "newfinish", out var nfStr) && !string.IsNullOrEmpty(nfStr))
                {
                    if (DateTime.TryParse(nfStr, out var nf))
                        update.NewFinish = nf;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "NewFinish", $"Invalid date: '{nfStr}'."));
                        hasError = true;
                    }
                }

                // NewDurationMinutes
                if (TryGetValue(lookup, "newdurationminutes", out var ndStr) && !string.IsNullOrEmpty(ndStr))
                {
                    if (double.TryParse(ndStr, out var nd))
                        update.NewDurationMinutes = nd;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "NewDurationMinutes", $"Invalid number: '{ndStr}'."));
                        hasError = true;
                    }
                }

                // NewPercentComplete
                if (TryGetValue(lookup, "newpercentcomplete", out var npcStr) && !string.IsNullOrEmpty(npcStr))
                {
                    if (int.TryParse(npcStr, out var npc))
                        update.NewPercentComplete = npc;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "NewPercentComplete", $"Invalid integer: '{npcStr}'."));
                        hasError = true;
                    }
                }

                // NewConstraintType
                if (TryGetValue(lookup, "newconstrainttype", out var nctStr) && !string.IsNullOrEmpty(nctStr))
                {
                    if (int.TryParse(nctStr, out var nct))
                        update.NewConstraintType = nct;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "NewConstraintType", $"Invalid integer: '{nctStr}'."));
                        hasError = true;
                    }
                }

                // NewConstraintDate
                if (TryGetValue(lookup, "newconstraintdate", out var ncdStr) && !string.IsNullOrEmpty(ncdStr))
                {
                    if (DateTime.TryParse(ncdStr, out var ncd))
                        update.NewConstraintDate = ncd;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "NewConstraintDate", $"Invalid date: '{ncdStr}'."));
                        hasError = true;
                    }
                }

                // NotesAppend
                if (TryGetValue(lookup, "notesappend", out var notes))
                    update.NotesAppend = string.IsNullOrEmpty(notes) ? null : notes;

                // AllowConstraintOverride
                if (TryGetValue(lookup, "allowconstraintoverride", out var acoStr) && !string.IsNullOrEmpty(acoStr))
                {
                    if (bool.TryParse(acoStr, out var aco))
                        update.AllowConstraintOverride = aco;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "AllowConstraintOverride", $"Invalid boolean: '{acoStr}'."));
                        hasError = true;
                    }
                }

                if (!hasError)
                    result.Updates.Add(update);
            }

            return result;
        }

        private static bool TryGetValue(Dictionary<string, string> dict, string key, out string value)
        {
            return dict.TryGetValue(key, out value);
        }

        /// <summary>Simple CSV line parser that respects quoted fields. Delegates to <see cref="CsvParserHelper"/>.</summary>
        public static List<string> ParseCsvLine(string line) => CsvParserHelper.ParseCsvLine(line);
    }
}

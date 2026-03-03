using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using ScheduleSync.Core.Interfaces;
using ScheduleSync.Core.Mapping;
using ScheduleSync.Core.Models;

namespace ScheduleSync.Core.Parsers
{
    /// <summary>
    /// Parses task updates from a STRATUS Packages Dashboard CSV export.
    /// Maps STRATUS-specific column names to <see cref="TaskUpdate"/> fields
    /// and resolves fabrication status to percent-complete via <see cref="StatusPercentMap"/>.
    /// </summary>
    /// <remarks>
    /// Expected columns (case-insensitive):
    ///   Number, Name, Project Number Override (fallback: Project Number),
    ///   Prefab Build Start Date, Prefab Build Finish Date,
    ///   Work Days (Reference), Required, Status, Notes,
    ///   Location, Description, Cost Code Category, Category Type,
    ///   STRATUS.Package.Id
    /// </remarks>
    public class StratusCsvUpdateSource : IUpdateSource
    {
        /// <summary>Minutes per work day (8-hour day).</summary>
        public const int MinutesPerWorkDay = 480;

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

                var lookup = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (int j = 0; j < headers.Count; j++)
                {
                    lookup[headers[j]] = fields[j].Trim();
                }

                var update = new TaskUpdate();
                bool hasError = false;

                // ── Composite external key: ProjectNumber-PackageNumber ──
                string projectNumber = GetFirstNonEmpty(lookup, "project number override", "project number");
                string packageNumber = GetValue(lookup, "number");

                if (string.IsNullOrEmpty(packageNumber))
                {
                    result.Errors.Add(new ParseError(rowNumber, "Number",
                        "Package Number is required for external key."));
                    hasError = true;
                }
                else
                {
                    update.ExternalKey = string.IsNullOrEmpty(projectNumber)
                        ? packageNumber
                        : $"{projectNumber}-{packageNumber}";
                }

                // ── Name ──
                update.Name = GetValue(lookup, "name");

                // ── Prefab Build Start Date → NewStart ──
                if (TryGetDate(lookup, "prefab build start date", rowNumber, result, out var startDate))
                    update.NewStart = startDate;

                // ── Prefab Build Finish Date → NewFinish ──
                if (TryGetDate(lookup, "prefab build finish date", rowNumber, result, out var finishDate))
                    update.NewFinish = finishDate;

                // ── Work Days (Reference) → NewDurationMinutes ──
                string workDaysStr = GetValue(lookup, "work days (reference)");
                if (!string.IsNullOrEmpty(workDaysStr))
                {
                    if (double.TryParse(workDaysStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var workDays))
                    {
                        update.NewDurationMinutes = workDays * MinutesPerWorkDay;
                    }
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "Work Days (Reference)",
                            $"Invalid number: '{workDaysStr}'."));
                        hasError = true;
                    }
                }

                // ── Required → NewDeadline ──
                if (TryGetDate(lookup, "required", rowNumber, result, out var deadline))
                    update.NewDeadline = deadline;

                // ── Status → NewPercentComplete ──
                string status = GetValue(lookup, "status");
                if (!string.IsNullOrEmpty(status))
                {
                    var pct = StatusPercentMap.Resolve(status);
                    if (pct.HasValue)
                    {
                        update.NewPercentComplete = pct.Value;
                    }
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "Status",
                            $"Unrecognized status: '{status}'. Percent complete will not be set."));
                        // Non-fatal: don't set hasError, just warn via parse errors
                    }
                }

                // ── Notes + Description → NotesAppend ──
                string notes = GetValue(lookup, "notes");
                string description = GetValue(lookup, "description");
                var notesParts = new List<string>();
                if (!string.IsNullOrEmpty(description)) notesParts.Add(description);
                if (!string.IsNullOrEmpty(notes)) notesParts.Add(notes);
                if (notesParts.Count > 0)
                    update.NotesAppend = string.Join("\n", notesParts);

                // ── Metadata for hierarchy and categorization ──
                if (!string.IsNullOrEmpty(projectNumber))
                    update.Metadata["ProjectNumber"] = projectNumber;

                string location = GetValue(lookup, "location");
                if (!string.IsNullOrEmpty(location))
                    update.Metadata["Location"] = location;

                string categoryType = GetValue(lookup, "category type");
                if (!string.IsNullOrEmpty(categoryType))
                    update.Metadata["CategoryType"] = categoryType;

                string costCodeCategory = GetValue(lookup, "cost code category");
                if (!string.IsNullOrEmpty(costCodeCategory))
                    update.Metadata["CostCodeCategory"] = costCodeCategory;

                string costCodeNumber = GetValue(lookup, "cost code number");
                if (!string.IsNullOrEmpty(costCodeNumber))
                    update.Metadata["CostCodeNumber"] = costCodeNumber;

                string stratusId = GetValue(lookup, "stratus.package.id");
                if (string.IsNullOrEmpty(stratusId))
                    stratusId = GetValue(lookup, "id");
                if (!string.IsNullOrEmpty(stratusId))
                    update.Metadata["StratusPackageId"] = stratusId;

                if (!hasError)
                    result.Updates.Add(update);
            }

            return result;
        }

        /// <summary>
        /// Detects whether a CSV header row belongs to a STRATUS Packages Dashboard export.
        /// </summary>
        public static bool IsStratusFormat(string headerLine)
        {
            if (string.IsNullOrWhiteSpace(headerLine))
                return false;

            var headers = CsvParserHelper.ParseCsvLine(headerLine)
                .Select(h => h.Trim().ToLowerInvariant())
                .ToList();

            // Check for characteristic STRATUS columns
            return headers.Contains("prefab build start date")
                || headers.Contains("stratus.package.id")
                || headers.Contains("cost code number");
        }

        #region Helpers

        private static string GetValue(Dictionary<string, string> lookup, string key)
        {
            return lookup.TryGetValue(key, out var val) ? (string.IsNullOrEmpty(val) ? null : val) : null;
        }

        private static string GetFirstNonEmpty(Dictionary<string, string> lookup, params string[] keys)
        {
            foreach (var key in keys)
            {
                var val = GetValue(lookup, key);
                if (!string.IsNullOrEmpty(val))
                    return val;
            }
            return null;
        }

        private static bool TryGetDate(
            Dictionary<string, string> lookup, string key, int rowNumber,
            ParseResult result, out DateTime date)
        {
            date = default;
            if (!lookup.TryGetValue(key, out var str) || string.IsNullOrEmpty(str?.Trim()))
                return false;

            str = str.Trim();
            if (DateTime.TryParse(str, CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
                return true;

            // Try US date formats commonly used in STRATUS exports
            if (DateTime.TryParseExact(str,
                new[] { "M/d/yyyy", "MM/dd/yyyy", "M/d/yyyy h:mm tt", "MM/dd/yyyy hh:mm tt" },
                CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
                return true;

            result.Errors.Add(new ParseError(rowNumber, key, $"Invalid date: '{str}'."));
            return false;
        }

        #endregion
    }
}

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using ScheduleSync.Core.Parsers;

namespace ScheduleSync.Desktop.Services
{
    using Models;

    /// <summary>
    /// Loads Prefab Packages CSV (MS Project export format) and matches tasks to crew rules.
    /// </summary>
    public static class CrewMatcher
    {
        /// <summary>
        /// Parses the MS Project-exported Prefab Packages CSV into PrefabTask objects.
        /// Reuses CsvParserHelper from ScheduleSync.Core for robust CSV field splitting.
        /// </summary>
        public static List<PrefabTask> LoadCsv(string csvContent)
        {
            var tasks = new List<PrefabTask>();
            var lines = CsvParserHelper.ReadLines(csvContent);
            if (lines.Count < 2) return tasks;

            var headers = CsvParserHelper.ParseCsvLine(lines[0])
                .Select(h => h.Trim())
                .ToList();

            // Build header index map
            var idx = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < headers.Count; i++)
                idx[headers[i]] = i;

            for (int r = 1; r < lines.Count; r++)
            {
                if (string.IsNullOrWhiteSpace(lines[r])) continue;
                var fields = CsvParserHelper.ParseCsvLine(lines[r]);

                var t = new PrefabTask
                {
                    Id = GetInt(fields, idx, "ID"),
                    TaskMode = Get(fields, idx, "Task_Mode"),
                    TaskName = Get(fields, idx, "Task_Name"),
                    StartDate = Get(fields, idx, "Start_Date"),
                    FinishDate = Get(fields, idx, "Finish_Date"),
                    LateStart = Get(fields, idx, "Late_Start"),
                    LateFinish = Get(fields, idx, "Late_Finish"),
                    FreeSlack = Get(fields, idx, "Free_Slack"),
                    TotalSlack = Get(fields, idx, "Total_Slack"),
                    Description = Get(fields, idx, "Packages_Description_"),
                    CategoryType = Get(fields, idx, "Packages_CategoryType_"),
                    Location = Get(fields, idx, "Packages_Location_"),
                    Detailer = Get(fields, idx, "Packages_Detailer_"),
                    ProjectNumber = Get(fields, idx, "Packages_ProjectNumber_"),
                    PackageNumber = Get(fields, idx, "Packages_Number_"),
                    CostCodeCategory = Get(fields, idx, "Packages_CostCodeCategory_"),
                    Status = Get(fields, idx, "Packages_Status__"),
                };
                tasks.Add(t);
            }

            return tasks;
        }

        /// <summary>
        /// Applies crew rules to tasks. Each task is matched by ProjectNumber + CategoryType.
        /// If a rule has no CategoryType, it matches by ProjectNumber alone.
        /// </summary>
        public static (List<CrewGroup> Assigned, List<PrefabTask> Unassigned) Match(
            List<PrefabTask> tasks, List<CrewRule> rules)
        {
            foreach (var task in tasks)
            {
                foreach (var rule in rules)
                {
                    if (string.IsNullOrEmpty(rule.ProjectNumber)) continue;

                    bool projMatch = string.Equals(task.ProjectNumber, rule.ProjectNumber,
                        StringComparison.OrdinalIgnoreCase);
                    if (!projMatch) continue;

                    if (!string.IsNullOrEmpty(rule.CategoryType))
                    {
                        if (!string.Equals(task.CategoryType, rule.CategoryType,
                            StringComparison.OrdinalIgnoreCase))
                            continue;
                    }

                    task.CrewAssignment = rule.Crew;
                    task.CrewNotes = rule.Notes;
                    break; // first match wins
                }
            }

            var assigned = tasks
                .Where(t => !string.IsNullOrEmpty(t.CrewAssignment))
                .GroupBy(t => t.CrewAssignment)
                .Select(g => new CrewGroup
                {
                    Crew = g.Key,
                    Notes = g.First().CrewNotes,
                    Tasks = g.OrderBy(t => t.StartDate).ToList()
                })
                .OrderBy(g => g.Crew)
                .ToList();

            var unassigned = tasks
                .Where(t => string.IsNullOrEmpty(t.CrewAssignment))
                .OrderBy(t => t.Id)
                .ToList();

            return (assigned, unassigned);
        }

        /// <summary>
        /// Exports the crew-assigned tasks to a new CSV with Crew_Assignment and Crew_Notes columns.
        /// </summary>
        public static string ExportCsv(List<PrefabTask> allTasks)
        {
            var sb = new StringBuilder();
            sb.AppendLine("ID,Task_Name,Start_Date,Finish_Date,Packages_CategoryType_,Packages_ProjectNumber_,Packages_Location_,Packages_Status__,Crew_Assignment,Crew_Notes");

            foreach (var t in allTasks.OrderBy(t => t.Id))
            {
                sb.AppendLine(string.Join(",",
                    Escape(t.Id.ToString()),
                    Escape(t.TaskName),
                    Escape(t.StartDate),
                    Escape(t.FinishDate),
                    Escape(t.CategoryType),
                    Escape(t.ProjectNumber),
                    Escape(t.Location),
                    Escape(t.Status),
                    Escape(t.CrewAssignment),
                    Escape(t.CrewNotes)));
            }

            return sb.ToString();
        }

        private static string Escape(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
                return "\"" + value.Replace("\"", "\"\"") + "\"";
            return value;
        }

        private static string Get(List<string> fields, Dictionary<string, int> idx, string col)
        {
            if (idx.TryGetValue(col, out int i) && i < fields.Count)
                return fields[i].Trim();
            return string.Empty;
        }

        private static int GetInt(List<string> fields, Dictionary<string, int> idx, string col)
        {
            var s = Get(fields, idx, col);
            return int.TryParse(s, out int v) ? v : 0;
        }
    }
}

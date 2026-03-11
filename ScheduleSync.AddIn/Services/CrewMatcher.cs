using ScheduleSync.AddIn.Models;
using ScheduleSync.Core.Parsers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace ScheduleSync.AddIn.Services
{
    public static class CrewMatcher
    {
        public static List<PrefabTask> LoadCsv(string csvContent)
        {
            var tasks = new List<PrefabTask>();
            var lines = CsvParserHelper.ReadLines(csvContent);
            if (lines.Count < 2) return tasks;

            var headers = CsvParserHelper.ParseCsvLine(lines[0])
                .Select(h => h.Trim())
                .ToList();

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

        public static List<PrefabTask> LoadAssignedCsv(string csvContent)
        {
            var tasks = new List<PrefabTask>();
            var lines = CsvParserHelper.ReadLines(csvContent);
            if (lines.Count < 2) return tasks;

            var headers = CsvParserHelper.ParseCsvLine(lines[0])
                .Select(h => h.Trim())
                .ToList();

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
                    CrewAssignment = Get(fields, idx, "Crew_Assignment"),
                    CrewNotes = Get(fields, idx, "Crew_Notes"),
                };
                tasks.Add(t);
            }
            return tasks;
        }

        public static (List<CrewGroup> Assigned, List<PrefabTask> Unassigned) Match(
            List<PrefabTask> tasks, List<CrewRule> rules)
        {
            var exactLookup = new Dictionary<string, CrewRule>(StringComparer.OrdinalIgnoreCase);
            var projectOnlyLookup = new Dictionary<string, CrewRule>(StringComparer.OrdinalIgnoreCase);

            foreach (var rule in rules)
            {
                if (string.IsNullOrEmpty(rule.ProjectNumber)) continue;

                if (!string.IsNullOrEmpty(rule.CategoryType))
                {
                    var key = $"{rule.ProjectNumber}|{rule.CategoryType}";
                    if (!exactLookup.ContainsKey(key))
                        exactLookup[key] = rule;
                }
                else
                {
                    if (!projectOnlyLookup.ContainsKey(rule.ProjectNumber))
                        projectOnlyLookup[rule.ProjectNumber] = rule;
                }
            }

            foreach (var task in tasks)
            {
                var exactKey = $"{task.ProjectNumber}|{task.CategoryType}";
                CrewRule rule;
                if (exactLookup.TryGetValue(exactKey, out rule))
                {
                    task.CrewAssignment = rule.Crew;
                    task.CrewNotes = rule.Notes;
                    continue;
                }
                if (projectOnlyLookup.TryGetValue(task.ProjectNumber, out rule))
                {
                    task.CrewAssignment = rule.Crew;
                    task.CrewNotes = rule.Notes;
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

        public static string ExportCsv(List<PrefabTask> allTasks)
        {
            var sb = new StringBuilder(allTasks.Count * 120);
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
            if (value.Contains(",") || value.Contains("\"") || value.Contains("\n"))
                return "\"" + value.Replace("\"", "\"\"") + "\"";
            return value;
        }

        private static string Get(List<string> fields, Dictionary<string, int> idx, string col)
        {
            int i;
            if (idx.TryGetValue(col, out i) && i < fields.Count)
                return fields[i].Trim();
            return string.Empty;
        }

        private static int GetInt(List<string> fields, Dictionary<string, int> idx, string col)
        {
            var s = Get(fields, idx, col);
            int v;
            return int.TryParse(s, out v) ? v : 0;
        }
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace ScheduleSync.AddIn.Services
{
    public static class PatternMemory
    {
        private static readonly string MemoryDir =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                         "ScheduleSync", "memory");

        private static readonly string PatternsFile = Path.Combine(MemoryDir, "patterns.json");

        public static PatternStore Load()
        {
            try
            {
                if (File.Exists(PatternsFile))
                {
                    var json = File.ReadAllText(PatternsFile);
                    return JsonSerializer.Deserialize<PatternStore>(json) ?? new PatternStore();
                }
            }
            catch { }
            return new PatternStore();
        }

        public static void Save(PatternStore store)
        {
            Directory.CreateDirectory(MemoryDir);
            var json = JsonSerializer.Serialize(store, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(PatternsFile, json);
        }

        public static void RecordConfirmedRules(
            PatternStore store,
            IEnumerable<ConfirmedAssignment> assignments)
        {
            foreach (var a in assignments)
            {
                var existing = store.Rules.FirstOrDefault(r =>
                    string.Equals(r.Crew, a.Crew, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(r.ProjectNumber, a.ProjectNumber, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(r.CategoryType, a.CategoryType, StringComparison.OrdinalIgnoreCase));

                if (existing != null)
                {
                    existing.TimesConfirmed++;
                    existing.LastSeen = DateTime.UtcNow;
                    if (!string.IsNullOrEmpty(a.Notes) && !existing.Notes.Contains(a.Notes))
                        existing.Notes = (existing.Notes + "; " + a.Notes).TrimStart(';', ' ');
                }
                else
                {
                    store.Rules.Add(new LearnedRule
                    {
                        Crew = a.Crew,
                        ProjectNumber = a.ProjectNumber,
                        CategoryType = a.CategoryType,
                        Notes = a.Notes ?? string.Empty,
                        MatchMode = string.IsNullOrEmpty(a.CategoryType) ? "ProjectOnly" : "ProjectCategory",
                        TimesConfirmed = 1,
                        FirstSeen = DateTime.UtcNow,
                        LastSeen = DateTime.UtcNow
                    });
                }
            }

            if (store.Rules.Count > 500)
            {
                store.Rules = store.Rules
                    .OrderByDescending(r => r.TimesConfirmed)
                    .ThenByDescending(r => r.LastSeen)
                    .Take(500)
                    .ToList();
            }

            Save(store);
        }

        public static string BuildPromptContext(PatternStore store, int maxRules = 60)
        {
            if (store.Rules.Count == 0)
                return string.Empty;

            var topRules = store.Rules
                .OrderByDescending(r => r.TimesConfirmed)
                .ThenByDescending(r => r.LastSeen)
                .Take(maxRules);

            var lines = new List<string>
            {
                "LEARNED PATTERNS FROM PREVIOUS SESSIONS (use these as strong priors):"
            };

            foreach (var r in topRules)
            {
                var cat = r.CategoryType ?? "*";
                var proj = r.ProjectNumber ?? "(any)";
                var mode = r.MatchMode == "ProjectOnly" ? " [matches ALL categories on this project]" : "";
                var freq = r.TimesConfirmed > 1 ? string.Format(" (confirmed {0}x)", r.TimesConfirmed) : "";
                lines.Add(string.Format("  - {0} -> {1} / {2}{3}{4}", r.Crew, proj, cat, mode, freq));
                if (!string.IsNullOrEmpty(r.Notes))
                    lines.Add(string.Format("    Notes: {0}", r.Notes));
            }

            return string.Join("\n", lines);
        }
    }

    public class PatternStore
    {
        public List<LearnedRule> Rules { get; set; } = new List<LearnedRule>();
        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    }

    public class LearnedRule
    {
        public string Crew { get; set; } = string.Empty;
        public string ProjectNumber { get; set; }
        public string CategoryType { get; set; }
        public string Notes { get; set; } = string.Empty;
        public string MatchMode { get; set; } = "ProjectCategory";
        public int TimesConfirmed { get; set; } = 1;
        public DateTime FirstSeen { get; set; } = DateTime.UtcNow;
        public DateTime LastSeen { get; set; } = DateTime.UtcNow;
    }

    public class ConfirmedAssignment
    {
        public string Crew { get; set; } = string.Empty;
        public string ProjectNumber { get; set; }
        public string CategoryType { get; set; }
        public string Notes { get; set; }
    }
}

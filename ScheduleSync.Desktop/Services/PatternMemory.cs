using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace ScheduleSync.Desktop.Services
{
    /// <summary>
    /// Persists confirmed crew-assignment patterns to disk so the AI can learn
    /// from every successful run.  Each time the user accepts a match result,
    /// the confirmed rules and (optionally) the original email fingerprint are
    /// recorded.  On the next run, these historical patterns are injected into
    /// the LLM prompts to improve accuracy.
    /// </summary>
    public static class PatternMemory
    {
        private static readonly string MemoryDir =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                         "ScheduleSync", "memory");

        private static readonly string PatternsFile = Path.Combine(MemoryDir, "patterns.json");

        // ── Public API ──────────────────────────────────────────────────────

        /// <summary>Load all stored patterns from disk.</summary>
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
            catch
            {
                // Corrupted file — start fresh
            }
            return new PatternStore();
        }

        /// <summary>Persist the pattern store to disk.</summary>
        public static void Save(PatternStore store)
        {
            Directory.CreateDirectory(MemoryDir);
            var json = JsonSerializer.Serialize(store, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(PatternsFile, json);
        }

        /// <summary>
        /// Record confirmed crew rules from a successful match session.
        /// Merges with existing patterns — rules that already exist have their
        /// <see cref="LearnedRule.TimesConfirmed"/> counter incremented.
        /// </summary>
        public static void RecordConfirmedRules(
            PatternStore store,
            IEnumerable<ConfirmedAssignment> assignments,
            string? emailSnippet = null)
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
                        existing.Notes = $"{existing.Notes}; {a.Notes}".TrimStart(';', ' ');
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

            // Trim the store if it ever grows excessively (keep top 500 by confirmation count)
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

        /// <summary>
        /// Build a compact text summary of the top learned patterns, suitable
        /// for injection into an LLM system prompt.
        /// </summary>
        public static string BuildPromptContext(PatternStore store, int maxRules = 60)
        {
            if (store.Rules.Count == 0)
                return string.Empty;

            // Rank by confirmation count * recency, take top N
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
                var freq = r.TimesConfirmed > 1 ? $" (confirmed {r.TimesConfirmed}x)" : "";
                lines.Add($"  - {r.Crew} -> {proj} / {cat}{mode}{freq}");
                if (!string.IsNullOrEmpty(r.Notes))
                    lines.Add($"    Notes: {r.Notes}");
            }

            return string.Join("\n", lines);
        }
    }

    // ── Models ──────────────────────────────────────────────────────────────

    /// <summary>Root container for all learned patterns.</summary>
    public class PatternStore
    {
        public List<LearnedRule> Rules { get; set; } = new();
        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    }

    /// <summary>A crew-to-project/category rule confirmed by the user.</summary>
    public class LearnedRule
    {
        public string Crew { get; set; } = string.Empty;
        public string? ProjectNumber { get; set; }
        public string? CategoryType { get; set; }
        public string Notes { get; set; } = string.Empty;

        /// <summary>"ProjectCategory" or "ProjectOnly"</summary>
        public string MatchMode { get; set; } = "ProjectCategory";

        /// <summary>How many times this exact rule has been confirmed across sessions.</summary>
        public int TimesConfirmed { get; set; } = 1;

        public DateTime FirstSeen { get; set; } = DateTime.UtcNow;
        public DateTime LastSeen { get; set; } = DateTime.UtcNow;
    }

    /// <summary>Input DTO for recording a confirmed assignment.</summary>
    public class ConfirmedAssignment
    {
        public string Crew { get; set; } = string.Empty;
        public string? ProjectNumber { get; set; }
        public string? CategoryType { get; set; }
        public string? Notes { get; set; }
    }
}

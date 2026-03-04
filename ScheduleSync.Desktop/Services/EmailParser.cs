using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace ScheduleSync.Desktop.Services
{
    using Models;

    /// <summary>
    /// Parses foreman email text to extract crew assignment rules.
    /// Looks for patterns like:
    ///   "Worker Name - Packages[ProjectNumber]: XXXXX Packages[CategoryType]: YY notes..."
    /// </summary>
    public static class EmailParser
    {
        // Matches lines starting with a name, followed by assignment details
        private static readonly Regex LinePattern = new(
            @"^\s*(?<crew>[A-Za-z][A-Za-z /.']+?)\s*[-–]\s*(?<body>.+)$",
            RegexOptions.Multiline | RegexOptions.Compiled);

        private static readonly Regex ProjectPattern = new(
            @"Packages\[ProjectNumber\]\s*:\s*(?<proj>\S+)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex CategoryPattern = new(
            @"Packages\[CategoryType\]\s*:\s*(?<cat>[A-Z]{2,4})\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public static List<CrewRule> Parse(string emailText)
        {
            var rules = new List<CrewRule>();
            if (string.IsNullOrWhiteSpace(emailText))
                return rules;

            // Normalize line breaks
            emailText = emailText.Replace("\r\n", "\n").Replace("\r", "\n");

            // Split into logical blocks: each starts with a name followed by " - " or "- "
            var matches = LinePattern.Matches(emailText);

            foreach (Match m in matches)
            {
                var crew = m.Groups["crew"].Value.Trim();
                var body = m.Groups["body"].Value.Trim();

                // Skip header lines (the email metadata)
                if (crew.Equals("Paul", StringComparison.OrdinalIgnoreCase) ||
                    crew.Equals("James Campbell", StringComparison.OrdinalIgnoreCase) ||
                    crew.Equals("to me", StringComparison.OrdinalIgnoreCase))
                    continue;

                // A single line can contain multiple project/category pairs
                // e.g. Glenn/Ali does LGT for 680122SCC but might peel to DE
                var projMatches = ProjectPattern.Matches(body);
                var catMatches = CategoryPattern.Matches(body);

                if (projMatches.Count == 0)
                {
                    // No structured data, just notes
                    rules.Add(new CrewRule
                    {
                        Crew = crew,
                        Notes = body
                    });
                    continue;
                }

                // Pair up project numbers with their nearest category
                for (int i = 0; i < projMatches.Count; i++)
                {
                    var proj = projMatches[i].Groups["proj"].Value.Trim();

                    // Find the category that follows this project reference
                    string? cat = null;
                    int projEnd = projMatches[i].Index + projMatches[i].Length;
                    int nextProjStart = (i + 1 < projMatches.Count) ? projMatches[i + 1].Index : body.Length;

                    foreach (Match cm in catMatches)
                    {
                        if (cm.Index >= projEnd && cm.Index < nextProjStart)
                        {
                            cat = cm.Groups["cat"].Value.Trim().ToUpperInvariant();
                            break;
                        }
                    }

                    // Extract notes: text after the category (or project) until next project
                    string notes = ExtractNotes(body, projEnd, nextProjStart, cat != null ? CategoryPattern : null);

                    rules.Add(new CrewRule
                    {
                        Crew = crew,
                        ProjectNumber = proj,
                        CategoryType = cat,
                        Notes = notes
                    });
                }
            }

            return rules;
        }

        private static string ExtractNotes(string body, int afterProject, int beforeNext, Regex? catPattern)
        {
            if (afterProject >= beforeNext || afterProject >= body.Length)
                return string.Empty;

            var segment = body.Substring(afterProject, beforeNext - afterProject).Trim();

            // Remove the category tag from the segment if present
            if (catPattern != null)
                segment = catPattern.Replace(segment, "").Trim();

            // Clean up leading/trailing punctuation
            segment = segment.Trim(' ', ',', ';', '-', '(', ')');
            return segment;
        }
    }
}

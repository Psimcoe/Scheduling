using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using ScheduleSync.AddIn.Models;

namespace ScheduleSync.AddIn.Services
{
    public static class EmailParser
    {
        private static readonly Regex LinePattern = new Regex(
            @"^\s*(?<crew>[A-Za-z][A-Za-z /.']+?)\s*[-\u2013]\s*(?<body>.+)$",
            RegexOptions.Multiline | RegexOptions.Compiled);

        private static readonly Regex ProjectPattern = new Regex(
            @"Packages\[ProjectNumber\]\s*:\s*(?<proj>\S+)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex CategoryPattern = new Regex(
            @"Packages\[CategoryType\]\s*:\s*(?<cat>[A-Z]{2,4})\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public static List<CrewRule> Parse(string emailText)
        {
            var rules = new List<CrewRule>();
            if (string.IsNullOrWhiteSpace(emailText))
                return rules;

            emailText = emailText.Replace("\r\n", "\n").Replace("\r", "\n");
            var matches = LinePattern.Matches(emailText);

            foreach (Match m in matches)
            {
                var crew = m.Groups["crew"].Value.Trim();
                var body = m.Groups["body"].Value.Trim();

                if (crew.Equals("Paul", StringComparison.OrdinalIgnoreCase) ||
                    crew.Equals("James Campbell", StringComparison.OrdinalIgnoreCase) ||
                    crew.Equals("to me", StringComparison.OrdinalIgnoreCase))
                    continue;

                var projMatches = ProjectPattern.Matches(body);
                var catMatches = CategoryPattern.Matches(body);

                if (projMatches.Count == 0)
                {
                    rules.Add(new CrewRule { Crew = crew, Notes = body });
                    continue;
                }

                for (int i = 0; i < projMatches.Count; i++)
                {
                    var proj = projMatches[i].Groups["proj"].Value.Trim();
                    string cat = null;
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

        private static string ExtractNotes(string body, int afterProject, int beforeNext, Regex catPattern)
        {
            if (afterProject >= beforeNext || afterProject >= body.Length)
                return string.Empty;

            var segment = body.Substring(afterProject, beforeNext - afterProject).Trim();
            if (catPattern != null)
                segment = catPattern.Replace(segment, "").Trim();
            segment = segment.Trim(' ', ',', ';', '-', '(', ')');
            return segment;
        }
    }
}

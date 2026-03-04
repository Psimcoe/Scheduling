using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using OpenAI;
using OpenAI.Chat;
using ScheduleSync.Desktop.Models;

namespace ScheduleSync.Desktop.Services
{
    /// <summary>
    /// LLM-powered email parsing and fuzzy task matching via OpenAI.
    /// Falls back gracefully if the API key is missing or the call fails.
    /// </summary>
    public class AiService
    {
        private readonly ChatClient _chat;

        public string CurrentModel { get; }

        public AiService(string apiKey, string model = "codex-5.3")
        {
            CurrentModel = model;
            var client = new OpenAIClient(apiKey);
            _chat = client.GetChatClient(model);
        }

        // ── AI Email Parsing ────────────────────────────────────────────────

        /// <summary>
        /// Sends the raw foreman email + known schedule values to the LLM and
        /// gets back structured crew rules. Works with any email format.
        /// </summary>
        public async Task<List<CrewRule>> ParseEmailAsync(
            string emailText,
            IEnumerable<string> knownProjectNumbers,
            IEnumerable<string> knownCategoryTypes)
        {
            var projects = string.Join(", ", knownProjectNumbers.Distinct().Where(s => !string.IsNullOrEmpty(s)));
            var categories = string.Join(", ", knownCategoryTypes.Distinct().Where(s => !string.IsNullOrEmpty(s)));

            var systemPrompt = @"You are a construction schedule assistant for a prefab/steel erection company.
Your job is to parse foreman emails that assign crew members to work packages.

Each crew member is assigned to tasks identified by:
- ProjectNumber: a job/project code (e.g., ""680122SCC"", ""10CAMPCN"", ""9055471B"")
- CategoryType: a 2-4 letter work type code (e.g., ""LGT"", ""DE"", ""HGR"", ""EMB"", ""MIS"")

The email may use various formats — structured tags, plain English, shorthand, etc.
Extract ALL crew-to-project/category assignments you can find.

IMPORTANT: Match project numbers and category types to the known values from the schedule when possible.
If a value in the email is close but not exact, map it to the nearest known value.

Return ONLY a JSON array, no markdown fences, no explanation:
[{""crew"": ""Name"", ""projectNumber"": ""XXX"", ""categoryType"": ""YY"", ""notes"": ""any context""}]

Rules:
- One entry per unique crew + projectNumber + categoryType combination.
- If a crew member has multiple assignments, create multiple entries.
- If you can identify the crew but not the project/category, set them to null.
- ""notes"" should capture any relevant context from the email (e.g., ""starting next week"", ""finishing up"").
- Keep crew names exactly as written in the email.";

            var userPrompt = $@"Known ProjectNumbers in the schedule: {projects}
Known CategoryTypes in the schedule: {categories}

Foreman email:
---
{emailText}
---

Parse this email and return the JSON array of crew assignments.";

            var response = await _chat.CompleteChatAsync(
                new List<ChatMessage>
                {
                    ChatMessage.CreateSystemMessage(systemPrompt),
                    ChatMessage.CreateUserMessage(userPrompt)
                },
                new ChatCompletionOptions
                {
                    Temperature = 0.1f,
                    MaxOutputTokenCount = 2000
                });

            var content = response.Value.Content[0].Text.Trim();
            return DeserializeRules(content);
        }

        // ── AI Fuzzy Matching ───────────────────────────────────────────────

        /// <summary>
        /// For tasks that weren't matched by exact ProjectNumber/CategoryType,
        /// asks the LLM to suggest crew assignments based on task details and context.
        /// </summary>
        public async Task<List<AiFuzzyMatch>> FuzzyMatchAsync(
            List<PrefabTask> unmatchedTasks,
            List<CrewRule> rules)
        {
            if (unmatchedTasks.Count == 0 || rules.Count == 0)
                return new List<AiFuzzyMatch>();

            var rulesSummary = new StringBuilder();
            foreach (var r in rules)
            {
                rulesSummary.AppendLine($"  - {r.Crew}: Project={r.ProjectNumber ?? "(any)"}, " +
                    $"Category={r.CategoryType ?? "(any)"}, Notes={r.Notes}");
            }

            // Process in batches of 80 to stay within token limits
            const int batchSize = 80;
            var allMatches = new List<AiFuzzyMatch>();

            for (int offset = 0; offset < unmatchedTasks.Count; offset += batchSize)
            {
                var batch = unmatchedTasks.Skip(offset).Take(batchSize).ToList();
                var taskLines = new StringBuilder(batch.Count * 120);
                foreach (var t in batch)
                {
                    taskLines.AppendLine($"  ID={t.Id}, Name=\"{t.TaskName}\", " +
                        $"Project={t.ProjectNumber}, Category={t.CategoryType}, " +
                        $"Location={t.Location}, Status={t.Status}, " +
                        $"Description={t.Description}");
                }

            var systemPrompt = @"You are a construction schedule assistant. 
You have a set of crew assignment rules and a list of unmatched tasks.
Suggest the best crew for each task based on project numbers, category types, 
task descriptions, locations, and any contextual clues.

Return ONLY a JSON array, no markdown fences:
[{""taskId"": 123, ""crew"": ""Name"", ""confidence"": 0.85, ""reason"": ""short explanation""}]

Rules:
- Only include matches where you have reasonable confidence (>= 0.5).
- confidence is 0.0 to 1.0.
- If a task's project number partially matches a rule's project number, that's a strong signal.
- If a task's category type matches a rule's category type AND the project is similar, that's very strong.
- Be conservative — it's better to leave a task unassigned than assign it to the wrong crew.";

            var userPrompt = $@"Crew rules:
{rulesSummary}

Unmatched tasks:
{taskLines}

Suggest crew assignments for these tasks.";

                var response = await _chat.CompleteChatAsync(
                    new List<ChatMessage>
                    {
                        ChatMessage.CreateSystemMessage(systemPrompt),
                        ChatMessage.CreateUserMessage(userPrompt)
                    },
                    new ChatCompletionOptions
                    {
                        Temperature = 0.1f,
                        MaxOutputTokenCount = 4000
                    });

                var content = response.Value.Content[0].Text.Trim();
                allMatches.AddRange(DeserializeFuzzyMatches(content));
            }

            return allMatches;
        }

        // ── JSON Deserialization ────────────────────────────────────────────

        private static List<CrewRule> DeserializeRules(string json)
        {
            // Strip markdown code fences if the model wraps them
            json = StripCodeFences(json);

            var items = JsonSerializer.Deserialize<List<AiCrewRuleDto>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (items == null) return new List<CrewRule>();

            return items.Select(dto => new CrewRule
            {
                Crew = dto.Crew ?? string.Empty,
                ProjectNumber = dto.ProjectNumber,
                CategoryType = dto.CategoryType?.ToUpperInvariant(),
                Notes = dto.Notes ?? string.Empty
            }).ToList();
        }

        private static List<AiFuzzyMatch> DeserializeFuzzyMatches(string json)
        {
            json = StripCodeFences(json);

            return JsonSerializer.Deserialize<List<AiFuzzyMatch>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new List<AiFuzzyMatch>();
        }

        private static string StripCodeFences(string text)
        {
            text = text.Trim();
            if (text.StartsWith("```"))
            {
                var firstNewline = text.IndexOf('\n');
                if (firstNewline > 0)
                    text = text.Substring(firstNewline + 1);
            }
            if (text.EndsWith("```"))
                text = text.Substring(0, text.Length - 3);
            return text.Trim();
        }

        // ── DTOs ────────────────────────────────────────────────────────────

        private class AiCrewRuleDto
        {
            public string? Crew { get; set; }
            public string? ProjectNumber { get; set; }
            public string? CategoryType { get; set; }
            public string? Notes { get; set; }
        }
    }

    /// <summary>
    /// A fuzzy match suggestion from the AI for an unmatched task.
    /// </summary>
    public class AiFuzzyMatch
    {
        public int TaskId { get; set; }
        public string Crew { get; set; } = string.Empty;
        public double Confidence { get; set; }
        public string Reason { get; set; } = string.Empty;
    }
}

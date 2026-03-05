using System;
using System.ClientModel;
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
    /// Supported AI providers.
    /// </summary>
    public enum AiProvider
    {
        OpenAI,
        Gemini
    }

    /// <summary>
    /// LLM-powered email parsing and fuzzy task matching via OpenAI or Google Gemini.
    /// Falls back gracefully if the API key is missing or the call fails.
    /// Injects learned patterns from <see cref="PatternMemory"/> to improve over time.
    /// </summary>
    public class AiService
    {
        private static readonly Uri GeminiEndpoint =
            new Uri("https://generativelanguage.googleapis.com/v1beta/openai/");

        private readonly ChatClient _chat;
        private readonly PatternStore _memory;
        private readonly string _memoryContext;

        public string CurrentModel { get; }
        public AiProvider Provider { get; }

        public AiService(string apiKey, string model = "codex-5.3",
            AiProvider provider = AiProvider.OpenAI)
            : this(apiKey, model, provider, PatternMemory.Load())
        {
        }

        public AiService(string apiKey, string model, AiProvider provider, PatternStore memory)
        {
            CurrentModel = model;
            Provider = provider;

            OpenAIClient client;
            if (provider == AiProvider.Gemini)
            {
                var options = new OpenAIClientOptions { Endpoint = GeminiEndpoint };
                client = new OpenAIClient(new ApiKeyCredential(apiKey), options);
            }
            else
            {
                client = new OpenAIClient(apiKey);
            }

            _chat = client.GetChatClient(model);
            _memory = memory;
            _memoryContext = PatternMemory.BuildPromptContext(_memory);
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
- CategoryType: a 2-4 letter work type code (e.g., ""LGT"", ""DE"", ""HGR"", ""EMB"", ""MIS"", ""CND"", ""BRS"", ""IW"")

The email may use various formats — structured tags, plain English, shorthand, etc.
Extract ALL crew-to-project/category assignments you can find.

IMPORTANT MATCHING HEURISTICS — apply these domain-specific rules:
1. A crew member can have MULTIPLE assignments (different projects or different category types on the same project). Create a separate entry for EACH unique combination.
2. If a crew member is mentioned for a project with NO specific category type, they cover ALL categories on that project. In the output, set categoryType to null for these — they are ""project-only"" matchers.
3. Sometimes one person does one category type and that same person + a partner do a different category under the same project. Create separate rules for each combination (e.g., 'Glenn/Ali -> 680122SCC/LGT' AND 'Glenn -> 680122SCC/DE').
4. A single crew member can be assigned to the SAME category type across MULTIPLE projects (e.g., 'Mike M. -> 200020TUR/BRS' AND 'Mike M. -> 120048TUR/BRS'). Create one entry per project.
5. Watch for contextual notes that imply priority or urgency (""HOT"", ""cannot stop"", ""finishing up"", ""starting next week""). Capture these in the notes field.
6. If two crew members are paired (""Dan/Jon"", ""Shubert/Noah""), keep the compound name as-is.
7. Match project numbers and category types to the KNOWN values from the schedule whenever possible. If a value in the email is close but not exact, map it to the nearest known value.

Return ONLY a JSON array, no markdown fences, no explanation:
[{""crew"": ""Name"", ""projectNumber"": ""XXX"", ""categoryType"": ""YY"", ""notes"": ""any context""}]

Rules:
- One entry per unique crew + projectNumber + categoryType combination.
- If a crew member has multiple assignments, create multiple entries.
- If you can identify the crew but not the project/category, set them to null.
- ""notes"" should capture any relevant context from the email (e.g., ""starting next week"", ""finishing up"").
- Keep crew names exactly as written in the email.";

            // Inject learned patterns if available
            var memoryBlock = string.IsNullOrEmpty(_memoryContext) ? "" :
                $"\n\n{_memoryContext}\n\nThe above patterns were confirmed in previous sessions. " +
                "Use them as strong priors when interpreting ambiguous assignments. " +
                "If the email contradicts a learned pattern (e.g., a crew moved to a new project), follow the email.";

            var userPrompt = $@"Known ProjectNumbers in the schedule: {projects}
Known CategoryTypes in the schedule: {categories}
{memoryBlock}

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

            var systemPrompt = @"You are a construction schedule assistant for a prefab/steel erection company.
You have a set of crew assignment rules and a list of unmatched tasks.
Suggest the best crew for each task based on project numbers, category types, 
task descriptions, locations, and any contextual clues.

Return ONLY a JSON array, no markdown fences:
[{""taskId"": 123, ""crew"": ""Name"", ""confidence"": 0.85, ""reason"": ""short explanation""}]

MATCHING HEURISTICS:
- If a task's projectNumber exactly matches a rule's projectNumber AND the rule has no categoryType (project-only rule), that crew covers ALL categories on that project. Confidence >= 0.9.
- If a task's projectNumber AND categoryType both match, that's an exact hit. Confidence >= 0.95.
- If only the projectNumber matches but category differs, the crew MAY still be relevant if they are the only crew on that project. Confidence ~0.6-0.7.
- Partial projectNumber matches (e.g., '320001' appearing inside '320001TUR') are a strong signal.
- Pay attention to Location and Description fields — they may disambiguate similar projects.
- Some crews handle the same categoryType across multiple projects (e.g., BRS, LGT). If a rule lists a crew for categoryType X on one project, they may also handle X on a related project.
- Be conservative — it's better to leave a task unassigned than assign it to the wrong crew. Only include matches with confidence >= 0.5.";

            // Inject learned patterns into fuzzy matching context
            var memoryBlock = string.IsNullOrEmpty(_memoryContext) ? "" :
                $"\n\nHistorical patterns (confirmed in previous sessions — use as strong priors):\n{_memoryContext}\n";

            var userPrompt = $@"Crew rules (from current email):
{rulesSummary}
{memoryBlock}
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

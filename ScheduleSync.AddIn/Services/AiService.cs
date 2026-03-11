using OpenAI;
using OpenAI.Chat;
using ScheduleSync.AddIn.Models;
using System;
using System.ClientModel;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace ScheduleSync.AddIn.Services
{
    public enum AiProvider
    {
        OpenAI,
        Gemini
    }

    public class AiService
    {
        private static readonly Uri GeminiEndpoint =
            new Uri("https://generativelanguage.googleapis.com/v1beta/openai/");

        private readonly ChatClient _chat;
        private readonly string _memoryContext;

        public string CurrentModel { get; }
        public AiProvider Provider { get; }

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
            _memoryContext = PatternMemory.BuildPromptContext(memory);
        }

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

IMPORTANT MATCHING HEURISTICS:
1. A crew member can have MULTIPLE assignments. Create a separate entry for EACH unique combination.
2. If no category type is mentioned, set categoryType to null (project-only matcher).
3. Paired crew members (""Dan/Jon"") keep the compound name as-is.
4. Match project numbers and category types to the KNOWN values from the schedule.

Return ONLY a JSON array, no markdown fences:
[{""crew"": ""Name"", ""projectNumber"": ""XXX"", ""categoryType"": ""YY"", ""notes"": ""any context""}]";

            var memoryBlock = string.IsNullOrEmpty(_memoryContext) ? "" :
                "\n\n" + _memoryContext + "\n\nUse these as strong priors. Follow the email if it contradicts.";

            var userPrompt = string.Format(
                "Known ProjectNumbers: {0}\nKnown CategoryTypes: {1}\n{2}\n\nForeman email:\n---\n{3}\n---\n\nParse and return the JSON array.",
                projects, categories, memoryBlock, emailText);

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

        public async Task<List<AiFuzzyMatch>> FuzzyMatchAsync(
            List<PrefabTask> unmatchedTasks,
            List<CrewRule> rules)
        {
            if (unmatchedTasks.Count == 0 || rules.Count == 0)
                return new List<AiFuzzyMatch>();

            var rulesSummary = new StringBuilder();
            foreach (var r in rules)
            {
                rulesSummary.AppendLine(string.Format("  - {0}: Project={1}, Category={2}, Notes={3}",
                    r.Crew, r.ProjectNumber ?? "(any)", r.CategoryType ?? "(any)", r.Notes));
            }

            const int batchSize = 80;
            var allMatches = new List<AiFuzzyMatch>();

            for (int offset = 0; offset < unmatchedTasks.Count; offset += batchSize)
            {
                var batch = unmatchedTasks.Skip(offset).Take(batchSize).ToList();
                var taskLines = new StringBuilder(batch.Count * 120);
                foreach (var t in batch)
                {
                    taskLines.AppendLine(string.Format("  ID={0}, Name=\"{1}\", Project={2}, Category={3}, Status={4}",
                        t.Id, t.TaskName, t.ProjectNumber, t.CategoryType, t.Status));
                }

                var systemPrompt = @"You are a construction schedule assistant.
Suggest the best crew for each task. Return ONLY a JSON array:
[{""taskId"": 123, ""crew"": ""Name"", ""confidence"": 0.85, ""reason"": ""short explanation""}]
Only include matches with confidence >= 0.5. Be conservative.";

                var memoryBlock = string.IsNullOrEmpty(_memoryContext) ? "" :
                    "\n\nHistorical patterns:\n" + _memoryContext + "\n";

                var userPrompt = string.Format("Crew rules:\n{0}\n{1}\nUnmatched tasks:\n{2}\n\nSuggest assignments.",
                    rulesSummary, memoryBlock, taskLines);

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

        private static List<CrewRule> DeserializeRules(string json)
        {
            json = StripCodeFences(json);
            var items = JsonSerializer.Deserialize<List<AiCrewRuleDto>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (items == null) return new List<CrewRule>();
            return items.Select(dto => new CrewRule
            {
                Crew = dto.Crew ?? string.Empty,
                ProjectNumber = dto.ProjectNumber,
                CategoryType = dto.CategoryType != null ? dto.CategoryType.ToUpperInvariant() : null,
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
                var nl = text.IndexOf('\n');
                if (nl > 0) text = text.Substring(nl + 1);
            }
            if (text.EndsWith("```"))
                text = text.Substring(0, text.Length - 3);
            return text.Trim();
        }

        private class AiCrewRuleDto
        {
            public string Crew { get; set; }
            public string ProjectNumber { get; set; }
            public string CategoryType { get; set; }
            public string Notes { get; set; }
        }
    }

    public class AiFuzzyMatch
    {
        public int TaskId { get; set; }
        public string Crew { get; set; } = string.Empty;
        public double Confidence { get; set; }
        public string Reason { get; set; } = string.Empty;
    }
}

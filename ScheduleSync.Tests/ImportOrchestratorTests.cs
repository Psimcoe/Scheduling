using ScheduleSync.Core;
using ScheduleSync.Core.Interfaces;
using ScheduleSync.Core.Models;

namespace ScheduleSync.Tests
{
    public class ImportOrchestratorTests
    {
        #region Mock Adapter

        /// <summary>
        /// Simple in-memory mock of IProjectAdapter for testing the orchestrator logic.
        /// </summary>
        private class MockProjectAdapter : IProjectAdapter
        {
            private readonly Dictionary<int, TaskSnapshot> _tasks = new Dictionary<int, TaskSnapshot>();
            private readonly Dictionary<string, TaskSnapshot> _byKey = new Dictionary<string, TaskSnapshot>(StringComparer.OrdinalIgnoreCase);
            private int _nextUniqueId = 1000;

            public List<TaskSnapshot> CreatedTasks { get; } = new List<TaskSnapshot>();
            public List<TaskSnapshot> CreatedSummaries { get; } = new List<TaskSnapshot>();

            public void AddExistingTask(TaskSnapshot snap, string externalKey = null)
            {
                _tasks[snap.UniqueId] = snap;
                if (!string.IsNullOrEmpty(externalKey))
                {
                    snap.ExternalKey = externalKey;
                    _byKey[externalKey] = snap;
                }
            }

            public IEnumerable<TaskSnapshot> GetAllTasks() => _tasks.Values;

            public TaskSnapshot GetTaskByUniqueId(int uniqueId) =>
                _tasks.TryGetValue(uniqueId, out var snap) ? snap : null;

            public TaskSnapshot GetTaskByExternalKey(string key, string fieldName) =>
                _byKey.TryGetValue(key, out var snap) ? snap : null;

            public ApplyResult ApplyUpdates(IEnumerable<TaskDiff> diffs, ApplyOptions options)
            {
                var result = new ApplyResult();
                foreach (var diff in diffs)
                {
                    result.TotalProcessed++;
                    if (diff.IsBlocked)
                    {
                        result.Skipped++;
                        result.Details.Add(new TaskApplyDetail
                        {
                            UniqueId = diff.UniqueId,
                            TaskName = diff.TaskName,
                            Status = TaskApplyStatus.Skipped,
                            Message = "Blocked"
                        });
                    }
                    else if (diff.Changes == ChangeFlags.None)
                    {
                        result.Skipped++;
                        result.Details.Add(new TaskApplyDetail
                        {
                            UniqueId = diff.UniqueId,
                            TaskName = diff.TaskName,
                            Status = TaskApplyStatus.Skipped,
                            Message = "No changes"
                        });
                    }
                    else
                    {
                        result.Applied++;
                        result.Details.Add(new TaskApplyDetail
                        {
                            UniqueId = diff.UniqueId,
                            TaskName = diff.TaskName,
                            Status = TaskApplyStatus.Applied,
                            ChangesApplied = diff.Changes,
                            Message = "Applied"
                        });
                    }
                }
                return result;
            }

            public TaskSnapshot CreateTask(TaskUpdate update, ApplyOptions options, int? parentUniqueId = null)
            {
                var snap = new TaskSnapshot
                {
                    UniqueId = _nextUniqueId++,
                    Name = update.Name ?? $"Task-{update.ExternalKey}",
                    Start = update.NewStart ?? DateTime.Today,
                    Finish = update.NewFinish ?? DateTime.Today.AddDays(1),
                    DurationMinutes = update.NewDurationMinutes ?? 480,
                    PercentComplete = update.NewPercentComplete ?? 0,
                    ExternalKey = update.ExternalKey
                };
                _tasks[snap.UniqueId] = snap;
                if (!string.IsNullOrEmpty(update.ExternalKey))
                    _byKey[update.ExternalKey] = snap;
                CreatedTasks.Add(snap);
                return snap;
            }

            public TaskSnapshot FindOrCreateSummaryTask(string name, int? parentUniqueId = null)
            {
                // Check if we already created one
                var existing = CreatedSummaries.FirstOrDefault(s =>
                    string.Equals(s.Name, name, StringComparison.OrdinalIgnoreCase));
                if (existing != null) return existing;

                var snap = new TaskSnapshot
                {
                    UniqueId = _nextUniqueId++,
                    Name = name,
                    IsSummary = true,
                    Start = DateTime.Today,
                    Finish = DateTime.Today
                };
                _tasks[snap.UniqueId] = snap;
                CreatedSummaries.Add(snap);
                return snap;
            }

            public void SetDeadline(int uniqueId, DateTime deadline)
            {
                if (_tasks.TryGetValue(uniqueId, out var snap))
                    snap.Deadline = deadline;
            }

            public void SetCustomTextField(int uniqueId, string fieldName, string value)
            {
                if (_tasks.TryGetValue(uniqueId, out var snap))
                    snap.ExternalKey = value;
            }
        }

        #endregion

        [Fact]
        public void ComputeDiffs_MatchedTask_NotBlocked()
        {
            var adapter = new MockProjectAdapter();
            adapter.AddExistingTask(new TaskSnapshot
            {
                UniqueId = 1,
                Name = "Existing Task",
                Start = new DateTime(2026, 1, 1),
                Finish = new DateTime(2026, 3, 1),
                DurationMinutes = 2400
            }, "PRJ-0100");

            var orchestrator = new ImportOrchestrator(adapter);
            var updates = new List<TaskUpdate>
            {
                new TaskUpdate
                {
                    ExternalKey = "PRJ-0100",
                    Name = "Existing Task",
                    NewStart = new DateTime(2026, 2, 1)
                }
            };

            var diffs = orchestrator.ComputeDiffs(updates);
            Assert.Single(diffs);
            Assert.False(diffs[0].IsBlocked);
            Assert.False(diffs[0].IsNewTask);
            Assert.True(diffs[0].Changes.HasFlag(ChangeFlags.Start));
        }

        [Fact]
        public void ComputeDiffs_UnmatchedTask_MarkedAsNew_WhenCreationAllowed()
        {
            var adapter = new MockProjectAdapter();
            var options = new ApplyOptions { AllowTaskCreation = true };
            var orchestrator = new ImportOrchestrator(adapter, options);

            var updates = new List<TaskUpdate>
            {
                new TaskUpdate
                {
                    ExternalKey = "NOMATCH-0100",
                    Name = "New Task",
                    NewStart = new DateTime(2026, 3, 1),
                    NewFinish = new DateTime(2026, 3, 5)
                }
            };

            var diffs = orchestrator.ComputeDiffs(updates);
            Assert.Single(diffs);
            Assert.True(diffs[0].IsNewTask);
            Assert.False(diffs[0].IsBlocked);
        }

        [Fact]
        public void ComputeDiffs_UnmatchedTask_Blocked_WhenCreationDisallowed()
        {
            var adapter = new MockProjectAdapter();
            var options = new ApplyOptions { AllowTaskCreation = false };
            var orchestrator = new ImportOrchestrator(adapter, options);

            var updates = new List<TaskUpdate>
            {
                new TaskUpdate
                {
                    ExternalKey = "NOMATCH-0100",
                    Name = "New Task",
                    NewStart = new DateTime(2026, 3, 1)
                }
            };

            var diffs = orchestrator.ComputeDiffs(updates);
            Assert.Single(diffs);
            Assert.True(diffs[0].IsBlocked);
            Assert.False(diffs[0].IsNewTask);
        }

        [Fact]
        public void Apply_NewTasks_CreatesWithHierarchy()
        {
            var adapter = new MockProjectAdapter();
            var options = new ApplyOptions { AllowTaskCreation = true };
            var orchestrator = new ImportOrchestrator(adapter, options);

            var updates = new List<TaskUpdate>
            {
                CreateStratusUpdate("PRJ001-0100", "Task A", "PRJ001", "LEVEL 37"),
                CreateStratusUpdate("PRJ001-0101", "Task B", "PRJ001", "LEVEL 37"),
                CreateStratusUpdate("PRJ001-0200", "Task C", "PRJ001", "LEVEL 38"),
            };

            var diffs = orchestrator.ComputeDiffs(updates);
            Assert.Equal(3, diffs.Count);
            Assert.All(diffs, d => Assert.True(d.IsNewTask));

            var result = orchestrator.Apply(diffs);
            Assert.Equal(3, result.Applied);
            Assert.Equal(3, result.TotalProcessed);
            Assert.Equal(0, result.Failed);

            // Should have created: 1 project summary + 2 location summaries = 3 summaries
            Assert.Equal(3, adapter.CreatedSummaries.Count);
            Assert.Contains(adapter.CreatedSummaries, s => s.Name == "PRJ001");
            Assert.Contains(adapter.CreatedSummaries, s => s.Name == "LEVEL 37");
            Assert.Contains(adapter.CreatedSummaries, s => s.Name == "LEVEL 38");

            // 3 work tasks
            Assert.Equal(3, adapter.CreatedTasks.Count);
        }

        [Fact]
        public void Apply_MixedNewAndExisting_HandlesBoth()
        {
            var adapter = new MockProjectAdapter();
            adapter.AddExistingTask(new TaskSnapshot
            {
                UniqueId = 1,
                Name = "Existing Task",
                Start = new DateTime(2026, 1, 1),
                Finish = new DateTime(2026, 3, 1),
                DurationMinutes = 2400
            }, "PRJ001-0050");

            var options = new ApplyOptions { AllowTaskCreation = true };
            var orchestrator = new ImportOrchestrator(adapter, options);

            var updates = new List<TaskUpdate>
            {
                // This one matches an existing task
                new TaskUpdate
                {
                    ExternalKey = "PRJ001-0050",
                    Name = "Existing Task",
                    NewStart = new DateTime(2026, 2, 1)
                },
                // This one is new
                CreateStratusUpdate("PRJ001-0100", "New Task", "PRJ001", "LEVEL 37"),
            };

            var diffs = orchestrator.ComputeDiffs(updates);
            Assert.Equal(2, diffs.Count);

            var existingDiff = diffs.First(d => !d.IsNewTask);
            var newDiff = diffs.First(d => d.IsNewTask);
            Assert.False(existingDiff.IsBlocked);
            Assert.False(newDiff.IsBlocked);

            var result = orchestrator.Apply(diffs);
            Assert.Equal(2, result.Applied);
            Assert.Equal(0, result.Failed);
        }

        [Fact]
        public void Apply_NewTaskWithDeadline_SetsDeadline()
        {
            var adapter = new MockProjectAdapter();
            var options = new ApplyOptions { AllowTaskCreation = true };
            var orchestrator = new ImportOrchestrator(adapter, options);

            var update = CreateStratusUpdate("PRJ001-0100", "Task A", "PRJ001", "LEVEL 37");
            update.NewDeadline = new DateTime(2026, 4, 1);

            var diffs = orchestrator.ComputeDiffs(new[] { update });
            var result = orchestrator.Apply(diffs);

            Assert.Equal(1, result.Applied);
            // The mock adapter stores deadline on the snapshot
            var created = adapter.CreatedTasks.Single();
            Assert.Equal(new DateTime(2026, 4, 1), created.Deadline);
        }

        [Fact]
        public void BuildHierarchyPlan_GroupsByProjectAndLocation()
        {
            var updates = new List<TaskUpdate>
            {
                CreateStratusUpdate("P1-001", "T1", "P1", "LOC-A"),
                CreateStratusUpdate("P1-002", "T2", "P1", "LOC-A"),
                CreateStratusUpdate("P1-003", "T3", "P1", "LOC-B"),
                CreateStratusUpdate("P2-001", "T4", "P2", "LOC-C"),
            };

            var plan = ImportOrchestrator.BuildHierarchyPlan(updates);

            Assert.Equal(2, plan.Count);

            var p1 = plan.First(p => p.Name == "P1");
            Assert.Equal(3, p1.TaskCount);
            Assert.Equal(2, p1.Children.Count);
            Assert.Contains(p1.Children, c => c.Name == "LOC-A" && c.TaskCount == 2);
            Assert.Contains(p1.Children, c => c.Name == "LOC-B" && c.TaskCount == 1);

            var p2 = plan.First(p => p.Name == "P2");
            Assert.Equal(1, p2.TaskCount);
        }

        [Fact]
        public void BuildHierarchyPlan_TasksWithoutProject_Grouped()
        {
            var updates = new List<TaskUpdate>
            {
                new TaskUpdate { ExternalKey = "0100", Name = "Orphan Task" }
            };

            var plan = ImportOrchestrator.BuildHierarchyPlan(updates);
            Assert.Single(plan);
            Assert.Equal("(No Project Number)", plan[0].Name);
            Assert.Equal(1, plan[0].TaskCount);
        }

        #region Helpers

        private static TaskUpdate CreateStratusUpdate(
            string externalKey, string name, string projectNumber, string location)
        {
            var update = new TaskUpdate
            {
                ExternalKey = externalKey,
                Name = name,
                NewStart = new DateTime(2026, 3, 1),
                NewFinish = new DateTime(2026, 3, 5),
                NewDurationMinutes = 3 * 480
            };

            if (!string.IsNullOrEmpty(projectNumber))
                update.Metadata["ProjectNumber"] = projectNumber;
            if (!string.IsNullOrEmpty(location))
                update.Metadata["Location"] = location;

            return update;
        }

        #endregion
    }
}

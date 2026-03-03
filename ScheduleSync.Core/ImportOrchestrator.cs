using System;
using System.Collections.Generic;
using System.Linq;
using ScheduleSync.Core.Diff;
using ScheduleSync.Core.Interfaces;
using ScheduleSync.Core.Models;

namespace ScheduleSync.Core
{
    /// <summary>
    /// Coordinates the full import workflow: parse → resolve/match → hierarchy → diff → apply.
    /// Handles both update-only and create-new-task scenarios, including
    /// building summary-task hierarchy (ProjectNumber → Location).
    /// </summary>
    public class ImportOrchestrator
    {
        private readonly IProjectAdapter _adapter;
        private readonly ApplyOptions _options;

        public ImportOrchestrator(IProjectAdapter adapter, ApplyOptions options = null)
        {
            _adapter = adapter ?? throw new ArgumentNullException(nameof(adapter));
            _options = options ?? new ApplyOptions();
        }

        /// <summary>
        /// Resolve updates against the active project and compute diffs.
        /// For STRATUS imports, this also marks unmatched rows as new tasks
        /// and groups them by ProjectNumber → Location for hierarchy creation.
        /// </summary>
        /// <param name="updates">Parsed task updates from any source.</param>
        /// <returns>List of diffs ready for preview and/or apply.</returns>
        public List<TaskDiff> ComputeDiffs(IEnumerable<TaskUpdate> updates)
        {
            return DiffEngine.ComputeDiffs(
                updates,
                ResolveTask,
                _options.AllowTaskCreation);
        }

        /// <summary>
        /// Apply diffs to the active project.
        /// For new tasks, creates hierarchy (ProjectNumber → Location) and inserts work tasks underneath.
        /// For existing tasks, applies field changes as usual.
        /// </summary>
        public ApplyResult Apply(List<TaskDiff> diffs)
        {
            // Separate new-task diffs and update-only diffs
            var newTaskDiffs = diffs.Where(d => d.IsNewTask && !d.IsBlocked).ToList();
            var updateDiffs = diffs.Where(d => !d.IsNewTask).ToList();
            var blockedNewDiffs = diffs.Where(d => d.IsNewTask && d.IsBlocked).ToList();

            var result = new ApplyResult();

            // Phase 1: Create hierarchy and new tasks
            if (newTaskDiffs.Count > 0)
            {
                var createResult = CreateTasksWithHierarchy(newTaskDiffs);
                MergeResults(result, createResult);
            }

            // Phase 2: Apply updates to existing tasks
            if (updateDiffs.Count > 0)
            {
                var updateResult = _adapter.ApplyUpdates(updateDiffs, _options);
                MergeResults(result, updateResult);
            }

            // Phase 3: Record blocked new tasks
            foreach (var blocked in blockedNewDiffs)
            {
                result.TotalProcessed++;
                result.Skipped++;
                result.Details.Add(new TaskApplyDetail
                {
                    UniqueId = null,
                    ExternalKey = blocked.Update.ExternalKey,
                    TaskName = blocked.TaskName,
                    Status = TaskApplyStatus.Skipped,
                    Message = string.Join("; ", blocked.Warnings.Select(w => w.Message))
                });
            }

            return result;
        }

        /// <summary>
        /// Build hierarchy groups from updates and return a summary of the planned structure.
        /// Useful for preview display.
        /// </summary>
        public static List<HierarchyGroup> BuildHierarchyPlan(IEnumerable<TaskUpdate> updates)
        {
            var groups = new List<HierarchyGroup>();

            var byProject = updates
                .Where(u => u.Metadata.ContainsKey("ProjectNumber"))
                .GroupBy(u => u.Metadata["ProjectNumber"], StringComparer.OrdinalIgnoreCase);

            foreach (var projectGroup in byProject)
            {
                var pg = new HierarchyGroup
                {
                    Name = projectGroup.Key,
                    Level = 1,
                    Children = new List<HierarchyGroup>()
                };

                var byLocation = projectGroup
                    .Where(u => u.Metadata.ContainsKey("Location"))
                    .GroupBy(u => u.Metadata["Location"], StringComparer.OrdinalIgnoreCase);

                foreach (var locationGroup in byLocation)
                {
                    pg.Children.Add(new HierarchyGroup
                    {
                        Name = locationGroup.Key,
                        Level = 2,
                        TaskCount = locationGroup.Count()
                    });
                }

                // Tasks without a Location go directly under the project
                var noLocation = projectGroup.Where(u => !u.Metadata.ContainsKey("Location")).ToList();
                if (noLocation.Count > 0)
                {
                    pg.Children.Add(new HierarchyGroup
                    {
                        Name = "(No Location)",
                        Level = 2,
                        TaskCount = noLocation.Count
                    });
                }

                pg.TaskCount = projectGroup.Count();
                groups.Add(pg);
            }

            // Tasks without a project number
            var noProject = updates.Where(u => !u.Metadata.ContainsKey("ProjectNumber")).ToList();
            if (noProject.Count > 0)
            {
                groups.Add(new HierarchyGroup
                {
                    Name = "(No Project Number)",
                    Level = 1,
                    TaskCount = noProject.Count
                });
            }

            return groups;
        }

        #region Private Helpers

        private TaskSnapshot ResolveTask(TaskUpdate update)
        {
            // Try UniqueID first
            if (update.UniqueId.HasValue)
            {
                var snap = _adapter.GetTaskByUniqueId(update.UniqueId.Value);
                if (snap != null) return snap;
            }

            // Try external key
            if (!string.IsNullOrEmpty(update.ExternalKey))
            {
                return _adapter.GetTaskByExternalKey(update.ExternalKey, _options.ExternalKeyFieldName);
            }

            return null;
        }

        private ApplyResult CreateTasksWithHierarchy(List<TaskDiff> newTaskDiffs)
        {
            var result = new ApplyResult();

            // Cache for created summary tasks: "ProjectNumber" → UniqueId, "ProjectNumber|Location" → UniqueId
            var summaryCache = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            // Group by ProjectNumber → Location
            var grouped = newTaskDiffs
                .GroupBy(d => d.Update.Metadata.TryGetValue("ProjectNumber", out var pn) ? pn : "")
                .OrderBy(g => g.Key);

            foreach (var projectGroup in grouped)
            {
                int? projectSummaryId = null;

                // Create project-level summary task (if project number is set)
                if (!string.IsNullOrEmpty(projectGroup.Key))
                {
                    var cacheKey = projectGroup.Key;
                    if (!summaryCache.TryGetValue(cacheKey, out var cachedId))
                    {
                        try
                        {
                            var summary = _adapter.FindOrCreateSummaryTask(projectGroup.Key);
                            cachedId = summary.UniqueId;
                            summaryCache[cacheKey] = cachedId;
                        }
                        catch (Exception ex)
                        {
                            // If we can't create the summary, still try to create tasks at root
                            result.Details.Add(new TaskApplyDetail
                            {
                                TaskName = projectGroup.Key,
                                Status = TaskApplyStatus.Failed,
                                Message = $"Failed to create project summary: {ex.Message}"
                            });
                            result.Failed++;
                            continue;
                        }
                    }
                    projectSummaryId = cachedId;
                }

                // Sub-group by Location
                var byLocation = projectGroup
                    .GroupBy(d => d.Update.Metadata.TryGetValue("Location", out var loc) ? loc : "")
                    .OrderBy(g => g.Key);

                foreach (var locationGroup in byLocation)
                {
                    int? locationSummaryId = projectSummaryId;

                    // Create location-level summary task (if location is set)
                    if (!string.IsNullOrEmpty(locationGroup.Key))
                    {
                        var cacheKey = $"{projectGroup.Key}|{locationGroup.Key}";
                        if (!summaryCache.TryGetValue(cacheKey, out var cachedLocId))
                        {
                            try
                            {
                                var locSummary = _adapter.FindOrCreateSummaryTask(
                                    locationGroup.Key, projectSummaryId);
                                cachedLocId = locSummary.UniqueId;
                                summaryCache[cacheKey] = cachedLocId;
                            }
                            catch (Exception ex)
                            {
                                result.Details.Add(new TaskApplyDetail
                                {
                                    TaskName = locationGroup.Key,
                                    Status = TaskApplyStatus.Failed,
                                    Message = $"Failed to create location summary: {ex.Message}"
                                });
                                result.Failed++;
                                continue;
                            }
                        }
                        locationSummaryId = cachedLocId;
                    }

                    // Create work tasks under the location summary
                    foreach (var diff in locationGroup)
                    {
                        result.TotalProcessed++;
                        try
                        {
                            var snapshot = _adapter.CreateTask(diff.Update, _options, locationSummaryId);

                            // Set deadline if present
                            if (diff.Update.NewDeadline.HasValue)
                                _adapter.SetDeadline(snapshot.UniqueId, diff.Update.NewDeadline.Value);

                            result.Applied++;
                            result.Details.Add(new TaskApplyDetail
                            {
                                UniqueId = snapshot.UniqueId,
                                ExternalKey = diff.Update.ExternalKey,
                                TaskName = snapshot.Name,
                                Status = TaskApplyStatus.Applied,
                                ChangesApplied = diff.Changes,
                                Message = "Created new task."
                            });
                        }
                        catch (Exception ex)
                        {
                            result.Failed++;
                            result.Details.Add(new TaskApplyDetail
                            {
                                ExternalKey = diff.Update.ExternalKey,
                                TaskName = diff.Update.Name ?? "(unknown)",
                                Status = TaskApplyStatus.Failed,
                                Message = $"Failed to create task: {ex.Message}"
                            });
                        }
                    }
                }
            }

            return result;
        }

        private static void MergeResults(ApplyResult target, ApplyResult source)
        {
            target.TotalProcessed += source.TotalProcessed;
            target.Applied += source.Applied;
            target.Skipped += source.Skipped;
            target.Failed += source.Failed;
            target.Details.AddRange(source.Details);
        }

        #endregion
    }

    /// <summary>
    /// Represents a node in the hierarchy plan (for preview display).
    /// </summary>
    public class HierarchyGroup
    {
        public string Name { get; set; }
        public int Level { get; set; }
        public int TaskCount { get; set; }
        public List<HierarchyGroup> Children { get; set; } = new List<HierarchyGroup>();
    }
}

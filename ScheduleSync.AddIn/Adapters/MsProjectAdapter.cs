using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using ScheduleSync.Core.Interfaces;
using ScheduleSync.Core.Models;

namespace ScheduleSync.AddIn.Adapters
{
    /// <summary>
    /// Implements <see cref="IProjectAdapter"/> using the Microsoft Project COM object model
    /// via late-bound <c>dynamic</c> calls. This avoids a compile-time dependency on the
    /// interop assemblies — the add-in builds without MS Project installed.
    /// </summary>
    /// <remarks>
    /// COM HARDENING NOTES (learned from production debugging):
    /// <list type="bullet">
    ///   <item>Set <c>DisplayAlerts = false</c> before batch operations to suppress modal dialogs.</item>
    ///   <item>After <c>FileNew()</c>, <c>ActiveProject</c> may be null briefly.
    ///         Fallback: <c>Projects.Item(Projects.Count)</c>.</item>
    ///   <item>NEVER use <c>OutlineIndent()</c> — it bases indentation on the preceding row.
    ///         Always set <c>task.OutlineLevel</c> explicitly (1 = root, parent + 1 = child).</item>
    ///   <item>Set <c>task.Manual = false</c> after <c>Tasks.Add()</c> to force auto-scheduling.</item>
    ///   <item>MS Project auto-adjusts dates that fall on non-working days. This is expected, not an error.</item>
    /// </list>
    /// </remarks>
    public class MsProjectAdapter : IProjectAdapter
    {
        private readonly dynamic _app;

        public MsProjectAdapter(dynamic app)
        {
            _app = app ?? throw new ArgumentNullException(nameof(app));
        }

        /// <summary>
        /// Creates an adapter using the static <see cref="Connect.ProjectApp"/> reference
        /// (set when the COM add-in connects to MS Project).
        /// </summary>
        public MsProjectAdapter()
        {
            _app = Connect.ProjectApp;
            if (_app == null)
                throw new InvalidOperationException("MS Project application not available. Is the add-in loaded?");
        }

        public IEnumerable<TaskSnapshot> GetAllTasks()
        {
            var project = GetActiveProject();
            var results = new List<TaskSnapshot>();
            foreach (dynamic task in project.Tasks)
            {
                if (task == null) continue; // blank rows in Project
                results.Add(MapToSnapshot(task));
            }
            return results;
        }

        public TaskSnapshot GetTaskByUniqueId(int uniqueId)
        {
            var project = GetActiveProject();
            try
            {
                dynamic task = project.Tasks.UniqueID[uniqueId];
                return task != null ? MapToSnapshot(task) : null;
            }
            catch (COMException)
            {
                return null;
            }
        }

        public TaskSnapshot GetTaskByExternalKey(string key, string fieldName)
        {
            var project = GetActiveProject();
            int fieldId = FieldNameToId(fieldName);

            foreach (dynamic task in project.Tasks)
            {
                if (task == null) continue;
                string value = (string)task.GetField(fieldId);
                if (string.Equals(value, key, StringComparison.OrdinalIgnoreCase))
                    return MapToSnapshot(task);
            }
            return null;
        }

        public ApplyResult ApplyUpdates(IEnumerable<TaskDiff> diffs, ApplyOptions options)
        {
            var result = new ApplyResult();
            _app.DisplayAlerts = false;

            _app.OpenUndoTransaction(options.UndoTransactionLabel);
            try
            {
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
                            Message = string.Join("; ", diff.Warnings.Select(w => w.Message))
                        });
                        continue;
                    }

                    if (diff.Changes == ChangeFlags.None && !diff.IsNewTask)
                    {
                        result.Skipped++;
                        result.Details.Add(new TaskApplyDetail
                        {
                            UniqueId = diff.UniqueId,
                            TaskName = diff.TaskName,
                            Status = TaskApplyStatus.Skipped,
                            Message = "No changes detected."
                        });
                        continue;
                    }

                    try
                    {
                        if (diff.IsNewTask)
                        {
                            var snapshot = CreateTask(diff.Update, options);
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
                        else
                        {
                            dynamic task = _app.ActiveProject.Tasks.UniqueID[diff.UniqueId];
                            ApplyTaskChanges(task, diff, options);
                            result.Applied++;
                            result.Details.Add(new TaskApplyDetail
                            {
                                UniqueId = diff.UniqueId,
                                ExternalKey = diff.Update.ExternalKey,
                                TaskName = diff.TaskName,
                                Status = TaskApplyStatus.Applied,
                                ChangesApplied = diff.Changes,
                                Message = "Applied successfully."
                            });
                        }
                    }
                    catch (Exception ex)
                    {
                        result.Failed++;
                        result.Details.Add(new TaskApplyDetail
                        {
                            UniqueId = diff.UniqueId,
                            TaskName = diff.TaskName,
                            Status = TaskApplyStatus.Failed,
                            Message = "COM error: " + ex.Message
                        });
                    }
                }
            }
            finally
            {
                _app.CloseUndoTransaction();
                _app.DisplayAlerts = true;
            }

            return result;
        }

        public TaskSnapshot CreateTask(TaskUpdate update, ApplyOptions options, int? parentUniqueId = null)
        {
            var project = GetActiveProject();
            string name = update.Name ?? "Task-" + update.ExternalKey;

            dynamic newTask = project.Tasks.Add(name);
            newTask.Manual = false;  // Force auto-scheduled

            // CRITICAL: Always set OutlineLevel explicitly.
            // Never use OutlineIndent() — it bases indentation on the preceding row,
            // which cascades incorrectly when creating multiple siblings in sequence.
            if (parentUniqueId.HasValue)
            {
                dynamic parentTask = project.Tasks.UniqueID[parentUniqueId.Value];
                newTask.OutlineLevel = (short)((int)parentTask.OutlineLevel + 1);
            }
            else
            {
                newTask.OutlineLevel = (short)1;
            }

            // Set schedule fields (Project may adjust dates to next working day — expected)
            if (update.NewStart.HasValue)
                newTask.Start = update.NewStart.Value;
            if (update.NewFinish.HasValue)
                newTask.Finish = update.NewFinish.Value;
            if (update.NewDurationMinutes.HasValue)
                newTask.Duration = (int)update.NewDurationMinutes.Value;
            if (update.NewPercentComplete.HasValue)
                newTask.PercentComplete = (short)update.NewPercentComplete.Value;
            if (update.NewDeadline.HasValue)
                newTask.Deadline = update.NewDeadline.Value;

            // Set external key in custom text field
            if (!string.IsNullOrEmpty(update.ExternalKey))
                newTask.SetField(FieldNameToId(options.ExternalKeyFieldName), update.ExternalKey);

            // Notes
            if (!string.IsNullOrEmpty(update.NotesAppend))
                newTask.Notes = update.NotesAppend;

            return MapToSnapshot(newTask);
        }

        public TaskSnapshot FindOrCreateSummaryTask(string name, int? parentUniqueId = null)
        {
            var project = GetActiveProject();

            // Search existing tasks for a summary task with the given name at the right level
            foreach (dynamic task in project.Tasks)
            {
                if (task == null) continue;
                if ((bool)task.Summary && string.Equals((string)task.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    if (parentUniqueId == null && (int)task.OutlineLevel == 1)
                        return MapToSnapshot(task);
                    if (parentUniqueId.HasValue)
                    {
                        dynamic parent = project.Tasks.UniqueID[parentUniqueId.Value];
                        dynamic outlineParent = task.OutlineParent;
                        if (outlineParent != null && (int)outlineParent.UniqueID == (int)parent.UniqueID)
                            return MapToSnapshot(task);
                    }
                }
            }

            // Not found — create it
            dynamic newTask = project.Tasks.Add(name);
            newTask.Manual = false;  // Force auto-scheduled

            if (parentUniqueId.HasValue)
            {
                dynamic parentTask = project.Tasks.UniqueID[parentUniqueId.Value];
                newTask.OutlineLevel = (short)((int)parentTask.OutlineLevel + 1);
            }
            else
            {
                newTask.OutlineLevel = (short)1;
            }

            return MapToSnapshot(newTask);
        }

        public void SetDeadline(int uniqueId, DateTime deadline)
        {
            var project = GetActiveProject();
            dynamic task = project.Tasks.UniqueID[uniqueId];
            task.Deadline = deadline;
        }

        public void SetCustomTextField(int uniqueId, string fieldName, string value)
        {
            var project = GetActiveProject();
            dynamic task = project.Tasks.UniqueID[uniqueId];
            task.SetField(FieldNameToId(fieldName), value);
        }

        #region Private Helpers

        private static void ApplyTaskChanges(dynamic task, TaskDiff diff, ApplyOptions options)
        {
            var update = diff.Update;

            // Set Duration BEFORE Start/Finish to avoid auto-schedule conflicts
            // (Project recalculates Finish from Start+Duration; setting Duration after
            //  Start/Finish may override what you just set.)
            if (update.NewDurationMinutes.HasValue)
                task.Duration = (int)update.NewDurationMinutes.Value;

            if (update.NewStart.HasValue)
                task.Start = update.NewStart.Value;

            if (update.NewFinish.HasValue)
                task.Finish = update.NewFinish.Value;

            if (update.NewPercentComplete.HasValue)
                task.PercentComplete = (short)update.NewPercentComplete.Value;

            if (update.NewConstraintType.HasValue)
                task.ConstraintType = update.NewConstraintType.Value;

            if (update.NewConstraintDate.HasValue)
                task.ConstraintDate = update.NewConstraintDate.Value;

            if (update.NewDeadline.HasValue)
                task.Deadline = update.NewDeadline.Value;

            if (!string.IsNullOrEmpty(update.NotesAppend))
                task.Notes = ((string)task.Notes ?? "") + "\n" + update.NotesAppend;

            // Update external key if provided (for re-sync idempotency)
            if (!string.IsNullOrEmpty(update.ExternalKey))
                task.SetField(FieldNameToId(options.ExternalKeyFieldName), update.ExternalKey);
        }

        /// <summary>
        /// Gets the active project with fallback to Projects collection.
        /// ActiveProject may be null briefly after FileNew().
        /// </summary>
        private dynamic GetActiveProject()
        {
            dynamic project = _app.ActiveProject;
            if (project == null && (int)_app.Projects.Count > 0)
                project = _app.Projects.Item(_app.Projects.Count);
            if (project == null)
                throw new InvalidOperationException("No active project. Open or create a project first.");
            return project;
        }

        private static TaskSnapshot MapToSnapshot(dynamic task)
        {
            return new TaskSnapshot
            {
                UniqueId = (int)task.UniqueID,
                Name = (string)task.Name,
                Start = (DateTime)task.Start,
                Finish = (DateTime)task.Finish,
                DurationMinutes = (double)task.Duration,
                PercentComplete = (int)task.PercentComplete,
                ConstraintType = (int)task.ConstraintType,
                ConstraintDate = task.ConstraintDate != null ? (DateTime?)task.ConstraintDate : null,
                Deadline = task.Deadline is DateTime d ? d : (DateTime?)null,
                IsSummary = (bool)task.Summary,
                IsManuallyScheduled = (bool)task.Manual,
                Notes = (string)task.Notes
            };
        }

        /// <summary>
        /// Maps a field name like "Text30" to the corresponding PjField integer constant.
        /// PjField enum values follow the pattern: pjTaskText1 = 188743731, pjTaskText30 = 188744760.
        /// We use a lookup table for the commonly used Text fields.
        /// </summary>
        private static int FieldNameToId(string fieldName)
        {
            // PjField constants for task text fields (from MS Project COM type library)
            var textFields = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                { "Text1", 188743731 }, { "Text2", 188743734 }, { "Text3", 188743737 },
                { "Text4", 188743740 }, { "Text5", 188743743 }, { "Text6", 188743746 },
                { "Text7", 188743747 }, { "Text8", 188743748 }, { "Text9", 188743749 },
                { "Text10", 188743750 }, { "Text11", 188743997 }, { "Text12", 188743998 },
                { "Text13", 188743999 }, { "Text14", 188744000 }, { "Text15", 188744001 },
                { "Text16", 188744002 }, { "Text17", 188744003 }, { "Text18", 188744004 },
                { "Text19", 188744005 }, { "Text20", 188744006 }, { "Text21", 188744007 },
                { "Text22", 188744008 }, { "Text23", 188744009 }, { "Text24", 188744010 },
                { "Text25", 188744011 }, { "Text26", 188744012 }, { "Text27", 188744013 },
                { "Text28", 188744014 }, { "Text29", 188744015 }, { "Text30", 188744016 }
            };

            if (textFields.TryGetValue(fieldName, out int id))
                return id;
            throw new ArgumentException("Unknown field name: " + fieldName);
        }

        #endregion
    }
}

using System;
using System.Collections.Generic;
using System.Linq;
using ScheduleSync.Core.Interfaces;
using ScheduleSync.Core.Models;

// Requires: Microsoft.Office.Interop.MSProject
// using MSProject = Microsoft.Office.Interop.MSProject;

namespace ScheduleSync.AddIn.Adapters
{
    /// <summary>
    /// Implements <see cref="IProjectAdapter"/> using the Microsoft Project COM object model.
    /// All calls go through the active project in the running MS Project instance.
    /// </summary>
    /// <remarks>
    /// <para>This file will not compile without the MS Project interop assemblies.</para>
    /// <para>
    /// COM HARDENING NOTES (learned from production debugging):
    /// <list type="bullet">
    ///   <item>Set <c>_app.DisplayAlerts = false</c> before batch operations to suppress modal dialogs.</item>
    ///   <item>After <c>FileNew()</c>, <c>ActiveProject</c> may be null briefly.
    ///         Fallback: <c>_app.Projects.Item(_app.Projects.Count)</c>.</item>
    ///   <item>NEVER use <c>OutlineIndent()</c> — it bases indentation on the preceding row.
    ///         Always set <c>task.OutlineLevel</c> explicitly (1 = root, parent + 1 = child).</item>
    ///   <item>Set <c>task.Manual = false</c> after <c>Tasks.Add()</c> to force auto-scheduling.</item>
    ///   <item>MS Project auto-adjusts dates that fall on non-working days. This is expected, not an error.</item>
    /// </list>
    /// </para>
    /// </remarks>
    public class MsProjectAdapter : IProjectAdapter
    {
        // private readonly MSProject.Application _app;

        // public MsProjectAdapter(MSProject.Application app)
        // {
        //     _app = app ?? throw new ArgumentNullException(nameof(app));
        //     // Suppress modal dialogs during batch operations
        //     // _app.DisplayAlerts = false;
        // }

        public IEnumerable<TaskSnapshot> GetAllTasks()
        {
            // var project = _app.ActiveProject;
            // if (project == null) yield break;
            //
            // foreach (MSProject.Task task in project.Tasks)
            // {
            //     if (task == null) continue; // blank rows in Project
            //     yield return MapToSnapshot(task);
            // }
            throw new NotImplementedException("Requires MS Project interop assemblies.");
        }

        public TaskSnapshot GetTaskByUniqueId(int uniqueId)
        {
            // var project = _app.ActiveProject;
            // if (project == null) return null;
            //
            // try
            // {
            //     MSProject.Task task = project.Tasks.UniqueID[uniqueId];
            //     return task != null ? MapToSnapshot(task) : null;
            // }
            // catch (System.Runtime.InteropServices.COMException)
            // {
            //     return null;
            // }
            throw new NotImplementedException("Requires MS Project interop assemblies.");
        }

        public TaskSnapshot GetTaskByExternalKey(string key, string fieldName)
        {
            // var project = _app.ActiveProject;
            // if (project == null) return null;
            //
            // foreach (MSProject.Task task in project.Tasks)
            // {
            //     if (task == null) continue;
            //     string value = (string)task.GetField(FieldNameToId(fieldName));
            //     if (string.Equals(value, key, StringComparison.OrdinalIgnoreCase))
            //         return MapToSnapshot(task);
            // }
            // return null;
            throw new NotImplementedException("Requires MS Project interop assemblies.");
        }

        public ApplyResult ApplyUpdates(IEnumerable<TaskDiff> diffs, ApplyOptions options)
        {
            var result = new ApplyResult();

            // _app.OpenUndoTransaction(options.UndoTransactionLabel);
            // try
            // {
            //     foreach (var diff in diffs)
            //     {
            //         result.TotalProcessed++;
            //
            //         if (diff.IsBlocked)
            //         {
            //             result.Skipped++;
            //             result.Details.Add(new TaskApplyDetail
            //             {
            //                 UniqueId = diff.UniqueId,
            //                 TaskName = diff.TaskName,
            //                 Status = TaskApplyStatus.Skipped,
            //                 Message = string.Join("; ", diff.Warnings.Select(w => w.Message))
            //             });
            //             continue;
            //         }
            //
            //         if (diff.Changes == ChangeFlags.None && !diff.IsNewTask)
            //         {
            //             result.Skipped++;
            //             result.Details.Add(new TaskApplyDetail
            //             {
            //                 UniqueId = diff.UniqueId,
            //                 TaskName = diff.TaskName,
            //                 Status = TaskApplyStatus.Skipped,
            //                 Message = "No changes detected."
            //             });
            //             continue;
            //         }
            //
            //         try
            //         {
            //             if (diff.IsNewTask)
            //             {
            //                 // New task creation is handled by the ImportOrchestrator
            //                 // which calls CreateTask with the appropriate parent.
            //                 // If we reach here directly, create at root level.
            //                 var snapshot = CreateTask(diff.Update, options);
            //                 result.Applied++;
            //                 result.Details.Add(new TaskApplyDetail
            //                 {
            //                     UniqueId = snapshot.UniqueId,
            //                     ExternalKey = diff.Update.ExternalKey,
            //                     TaskName = snapshot.Name,
            //                     Status = TaskApplyStatus.Applied,
            //                     ChangesApplied = diff.Changes,
            //                     Message = "Created new task."
            //                 });
            //             }
            //             else
            //             {
            //                 var task = _app.ActiveProject.Tasks.UniqueID[diff.UniqueId];
            //                 ApplyTaskChanges(task, diff, options);
            //                 result.Applied++;
            //                 result.Details.Add(new TaskApplyDetail
            //                 {
            //                     UniqueId = diff.UniqueId,
            //                     ExternalKey = diff.Update.ExternalKey,
            //                     TaskName = diff.TaskName,
            //                     Status = TaskApplyStatus.Applied,
            //                     ChangesApplied = diff.Changes,
            //                     Message = "Applied successfully."
            //                 });
            //             }
            //         }
            //         catch (Exception ex)
            //         {
            //             result.Failed++;
            //             result.Details.Add(new TaskApplyDetail
            //             {
            //                 UniqueId = diff.UniqueId,
            //                 TaskName = diff.TaskName,
            //                 Status = TaskApplyStatus.Failed,
            //                 Message = $"COM error: {ex.Message}"
            //             });
            //         }
            //     }
            // }
            // finally
            // {
            //     _app.CloseUndoTransaction();
            // }

            throw new NotImplementedException("Requires MS Project interop assemblies.");
        }

        public TaskSnapshot CreateTask(TaskUpdate update, ApplyOptions options, int? parentUniqueId = null)
        {
            // var project = _app.ActiveProject;
            // string name = update.Name ?? $"Task-{update.ExternalKey}";
            //
            // MSProject.Task newTask = project.Tasks.Add(name);
            // newTask.Manual = false;  // Force auto-scheduled
            //
            // // CRITICAL: Always set OutlineLevel explicitly.
            // // Never use OutlineIndent() — it bases indentation on the preceding row,
            // // which cascades incorrectly when creating multiple siblings in sequence.
            // if (parentUniqueId.HasValue)
            // {
            //     var parentTask = project.Tasks.UniqueID[parentUniqueId.Value];
            //     newTask.OutlineLevel = (short)(parentTask.OutlineLevel + 1);
            // }
            // else
            // {
            //     newTask.OutlineLevel = 1;  // Explicit root level
            // }
            //
            // // Set schedule fields (Project may adjust dates to next working day — expected)
            // if (update.NewStart.HasValue)
            //     newTask.Start = update.NewStart.Value;
            // if (update.NewFinish.HasValue)
            //     newTask.Finish = update.NewFinish.Value;
            // if (update.NewDurationMinutes.HasValue)
            //     newTask.Duration = (int)update.NewDurationMinutes.Value;
            // if (update.NewPercentComplete.HasValue)
            //     newTask.PercentComplete = (short)update.NewPercentComplete.Value;
            // if (update.NewDeadline.HasValue)
            //     newTask.Deadline = update.NewDeadline.Value;
            //
            // // Set external key in custom text field
            // if (!string.IsNullOrEmpty(update.ExternalKey))
            //     newTask.SetField(FieldNameToId(options.ExternalKeyFieldName), update.ExternalKey);
            //
            // // Notes
            // if (!string.IsNullOrEmpty(update.NotesAppend))
            //     newTask.Notes = update.NotesAppend;
            //
            // return MapToSnapshot(newTask);
            throw new NotImplementedException("Requires MS Project interop assemblies.");
        }

        public TaskSnapshot FindOrCreateSummaryTask(string name, int? parentUniqueId = null)
        {
            // var project = _app.ActiveProject;
            //
            // // Search existing tasks for a summary task with the given name at the right level
            // foreach (MSProject.Task task in project.Tasks)
            // {
            //     if (task == null) continue;
            //     if (task.Summary && string.Equals(task.Name, name, StringComparison.OrdinalIgnoreCase))
            //     {
            //         if (parentUniqueId == null && task.OutlineLevel == 1)
            //             return MapToSnapshot(task);
            //         if (parentUniqueId.HasValue)
            //         {
            //             var parent = project.Tasks.UniqueID[parentUniqueId.Value];
            //             if (task.OutlineParent?.UniqueID == parent.UniqueID)
            //                 return MapToSnapshot(task);
            //         }
            //     }
            // }
            //
            // // Not found — create it
            // MSProject.Task newTask = project.Tasks.Add(name);
            // newTask.Manual = false;  // Force auto-scheduled
            //
            // // CRITICAL: Always set OutlineLevel explicitly.
            // // Never use OutlineIndent() — it cascades incorrectly.
            // if (parentUniqueId.HasValue)
            // {
            //     var parentTask = project.Tasks.UniqueID[parentUniqueId.Value];
            //     newTask.OutlineLevel = (short)(parentTask.OutlineLevel + 1);
            // }
            // else
            // {
            //     newTask.OutlineLevel = 1;  // Top-level summary
            // }
            //
            // // Note: task becomes Summary automatically once children are added beneath it.
            // return MapToSnapshot(newTask);
            throw new NotImplementedException("Requires MS Project interop assemblies.");
        }

        public void SetDeadline(int uniqueId, DateTime deadline)
        {
            // var task = _app.ActiveProject.Tasks.UniqueID[uniqueId];
            // task.Deadline = deadline;
            throw new NotImplementedException("Requires MS Project interop assemblies.");
        }

        public void SetCustomTextField(int uniqueId, string fieldName, string value)
        {
            // var task = _app.ActiveProject.Tasks.UniqueID[uniqueId];
            // task.SetField(FieldNameToId(fieldName), value);
            throw new NotImplementedException("Requires MS Project interop assemblies.");
        }

        // private static void ApplyTaskChanges(MSProject.Task task, TaskDiff diff, ApplyOptions options)
        // {
        //     var update = diff.Update;
        //
        //     // Set Duration BEFORE Start/Finish to avoid auto-schedule conflicts
        //     // (Project recalculates Finish from Start+Duration; setting Duration after
        //     //  Start/Finish may override what you just set.)
        //     if (update.NewDurationMinutes.HasValue)
        //         task.Duration = (int)update.NewDurationMinutes.Value;  // Duration is in minutes (480 = 1 day)
        //
        //     if (update.NewStart.HasValue)
        //         task.Start = update.NewStart.Value;
        //
        //     if (update.NewFinish.HasValue)
        //         task.Finish = update.NewFinish.Value;
        //
        //     if (update.NewPercentComplete.HasValue)
        //         task.PercentComplete = (short)update.NewPercentComplete.Value;
        //
        //     if (update.NewConstraintType.HasValue)
        //         task.ConstraintType = (MSProject.PjConstraint)update.NewConstraintType.Value;
        //
        //     if (update.NewConstraintDate.HasValue)
        //         task.ConstraintDate = update.NewConstraintDate.Value;
        //
        //     if (update.NewDeadline.HasValue)
        //         task.Deadline = update.NewDeadline.Value;
        //
        //     if (!string.IsNullOrEmpty(update.NotesAppend))
        //         task.Notes = (task.Notes ?? "") + "\n" + update.NotesAppend;
        //
        //     // Update external key if provided (for re-sync idempotency)
        //     if (!string.IsNullOrEmpty(update.ExternalKey))
        //         task.SetField(FieldNameToId(options.ExternalKeyFieldName), update.ExternalKey);
        // }

        // /// <summary>
        // /// Gets the active project with fallback to Projects collection.
        // /// ActiveProject may be null briefly after FileNew().
        // /// </summary>
        // private MSProject.Project GetActiveProject()
        // {
        //     var project = _app.ActiveProject;
        //     if (project == null && _app.Projects.Count > 0)
        //         project = _app.Projects.Item(_app.Projects.Count);
        //     if (project == null)
        //         throw new InvalidOperationException("No active project. Open or create a project first.");
        //     return project;
        // }

        // private static TaskSnapshot MapToSnapshot(MSProject.Task task)
        // {
        //     return new TaskSnapshot
        //     {
        //         UniqueId = task.UniqueID,
        //         Name = task.Name,
        //         Start = (DateTime)task.Start,
        //         Finish = (DateTime)task.Finish,
        //         DurationMinutes = (double)task.Duration,
        //         PercentComplete = task.PercentComplete,
        //         ConstraintType = (int)task.ConstraintType,
        //         ConstraintDate = task.ConstraintDate != null ? (DateTime?)task.ConstraintDate : null,
        //         Deadline = task.Deadline is DateTime d ? d : (DateTime?)null,
        //         IsSummary = task.Summary,
        //         IsManuallyScheduled = task.Manual,
        //         Notes = task.Notes
        //     };
        // }

        // private static MSProject.PjField FieldNameToId(string fieldName)
        // {
        //     // Map "Text30" → PjField.pjTaskText30, etc.
        //     if (Enum.TryParse("pjTask" + fieldName, out MSProject.PjField field))
        //         return field;
        //     throw new ArgumentException($"Unknown field name: {fieldName}");
        // }
    }
}

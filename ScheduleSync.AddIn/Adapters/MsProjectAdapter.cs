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
    /// This file will not compile without the MS Project interop assemblies.
    /// It is provided as the reference implementation for the VSTO add-in.
    /// </remarks>
    public class MsProjectAdapter : IProjectAdapter
    {
        // private readonly MSProject.Application _app;

        // public MsProjectAdapter(MSProject.Application app)
        // {
        //     _app = app ?? throw new ArgumentNullException(nameof(app));
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
            //     // The Tasks collection supports access by UniqueID
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
            // Iterate all tasks, comparing the custom text field value.
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
            //         if (diff.Changes == ChangeFlags.None)
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
            //             var task = _app.ActiveProject.Tasks.UniqueID[diff.UniqueId];
            //             ApplyTaskChanges(task, diff);
            //             result.Applied++;
            //             result.Details.Add(new TaskApplyDetail
            //             {
            //                 UniqueId = diff.UniqueId,
            //                 TaskName = diff.TaskName,
            //                 Status = TaskApplyStatus.Applied,
            //                 ChangesApplied = diff.Changes,
            //                 Message = "Applied successfully."
            //             });
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

        // private static void ApplyTaskChanges(MSProject.Task task, TaskDiff diff)
        // {
        //     var update = diff.Update;
        //
        //     if (update.NewStart.HasValue)
        //         task.Start = update.NewStart.Value;
        //
        //     if (update.NewFinish.HasValue)
        //         task.Finish = update.NewFinish.Value;
        //
        //     if (update.NewDurationMinutes.HasValue)
        //         task.Duration = (int)update.NewDurationMinutes.Value;  // Duration is in minutes
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
        //     if (!string.IsNullOrEmpty(update.NotesAppend))
        //         task.Notes = (task.Notes ?? "") + "\n" + update.NotesAppend;
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

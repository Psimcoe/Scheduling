using ScheduleSync.Core.Models;
using System;
using System.Collections.Generic;

namespace ScheduleSync.Core.Interfaces
{
    /// <summary>
    /// Abstraction over the Microsoft Project object model.
    /// Implemented by the VSTO add-in; can be mocked for testing.
    /// </summary>
    public interface IProjectAdapter
    {
        /// <summary>Get snapshots of all tasks in the active project.</summary>
        IEnumerable<TaskSnapshot> GetAllTasks();

        /// <summary>Find a task by its UniqueID.</summary>
        TaskSnapshot GetTaskByUniqueId(int uniqueId);

        /// <summary>Find a task by a value stored in a custom text field.</summary>
        TaskSnapshot GetTaskByExternalKey(string key, string fieldName);

        /// <summary>
        /// Apply the given updates to the active project.
        /// The implementation should wrap changes in a single undo transaction.
        /// </summary>
        ApplyResult ApplyUpdates(IEnumerable<TaskDiff> diffs, ApplyOptions options);

        /// <summary>
        /// Create a new task in the active project and return its snapshot.
        /// The task is created under the specified parent (or at root if parentUniqueId is null).
        /// </summary>
        /// <remarks>
        /// IMPORTANT: Implementations MUST set <c>OutlineLevel</c> explicitly on the new task
        /// (parent.OutlineLevel + 1). Do NOT use <c>OutlineIndent()</c> — it bases indentation
        /// on the preceding row, which cascades incorrectly when creating multiple siblings.
        /// 
        /// Dates set via COM may be adjusted to the next working day by Project's auto-scheduler.
        /// This is expected behavior, not an error. The returned snapshot reflects the adjusted values.
        /// </remarks>
        TaskSnapshot CreateTask(TaskUpdate update, ApplyOptions options, int? parentUniqueId = null);

        /// <summary>
        /// Find an existing summary task by name under the given parent, or create one if not found.
        /// Returns the snapshot of the found/created summary task.
        /// </summary>
        /// <remarks>
        /// IMPORTANT: Set <c>OutlineLevel</c> explicitly on newly created summary tasks.
        /// Level 1 for root summaries (parentUniqueId == null), parent.OutlineLevel + 1 otherwise.
        /// Never use <c>OutlineIndent()</c>.
        /// </remarks>
        TaskSnapshot FindOrCreateSummaryTask(string name, int? parentUniqueId = null);

        /// <summary>
        /// Set the Deadline field on a task.
        /// </summary>
        void SetDeadline(int uniqueId, DateTime deadline);

        /// <summary>
        /// Write a value to a custom text field on a task.
        /// </summary>
        void SetCustomTextField(int uniqueId, string fieldName, string value);
    }
}

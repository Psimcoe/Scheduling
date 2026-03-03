using System;
using System.Collections.Generic;
using ScheduleSync.Core.Models;

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
        TaskSnapshot CreateTask(TaskUpdate update, ApplyOptions options, int? parentUniqueId = null);

        /// <summary>
        /// Find an existing summary task by name under the given parent, or create one if not found.
        /// Returns the snapshot of the found/created summary task.
        /// </summary>
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

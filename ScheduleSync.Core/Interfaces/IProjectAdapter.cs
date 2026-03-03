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
    }
}

using System;
using System.Collections.Generic;

namespace ScheduleSync.Core.Models
{
    /// <summary>
    /// Represents the computed difference between the current task state and the proposed update.
    /// </summary>
    public class TaskDiff
    {
        public int UniqueId { get; set; }
        public string TaskName { get; set; }

        public TaskSnapshot Before { get; set; }
        public TaskUpdate Update { get; set; }

        /// <summary>Flags indicating which fields would change.</summary>
        public ChangeFlags Changes { get; set; }

        /// <summary>Validation warnings (non-blocking unless severity is Error).</summary>
        public List<ValidationMessage> Warnings { get; set; } = new List<ValidationMessage>();

        /// <summary>True if this diff should be skipped (blocked by validation).</summary>
        public bool IsBlocked { get; set; }

        /// <summary>True if this diff represents a new task to be created.</summary>
        public bool IsNewTask { get; set; }
    }

    [Flags]
    public enum ChangeFlags
    {
        None = 0,
        Start = 1,
        Finish = 2,
        Duration = 4,
        PercentComplete = 8,
        ConstraintType = 16,
        ConstraintDate = 32,
        Notes = 64,
        Deadline = 128
    }

    public class ValidationMessage
    {
        public ValidationSeverity Severity { get; set; }
        public string Message { get; set; }

        public ValidationMessage() { }

        public ValidationMessage(ValidationSeverity severity, string message)
        {
            Severity = severity;
            Message = message;
        }
    }

    public enum ValidationSeverity
    {
        Info,
        Warning,
        Error
    }
}

using System;

namespace ScheduleSync.Core.Models
{
    /// <summary>
    /// A point-in-time snapshot of task field values (the "before" state).
    /// </summary>
    public class TaskSnapshot
    {
        public int UniqueId { get; set; }
        public string Name { get; set; }
        public string ExternalKey { get; set; }

        public DateTime Start { get; set; }
        public DateTime Finish { get; set; }

        /// <summary>Duration in minutes.</summary>
        public double DurationMinutes { get; set; }

        public int PercentComplete { get; set; }

        /// <summary>Constraint type as integer (maps to PjConstraint enum).</summary>
        public int ConstraintType { get; set; }

        public DateTime? ConstraintDate { get; set; }

        /// <summary>True if the task is a summary (parent) task.</summary>
        public bool IsSummary { get; set; }

        /// <summary>True if the task is manually scheduled.</summary>
        public bool IsManuallyScheduled { get; set; }

        public string Notes { get; set; }
    }
}
